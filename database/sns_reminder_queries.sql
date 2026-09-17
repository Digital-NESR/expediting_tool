-- ============================================================================
-- S&S Registry — the two queries the n8n reminder workflow runs.
--
-- Mirrors the TI-TE reminder workflow:
--
--   Schedule Trigger → [1] fetch due → If → Split Out → Loop Over Items
--                    → Code (build message) → Send → Code → [2] mark sent
--
-- n8n owns the schedule, the sending and the logging. The app only reads
-- sns_notification_log back to render the Notifications panel on a record.
-- Nothing here goes through an app endpoint, so there is no Vercel Cron and no
-- session middleware in the way.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- [1] "Execute a SQL query" — every record owed a reminder today.
--
-- Returns AT MOST ONE ROW PER RECORD: the single rung the record stands on
-- today. A record ignored for a month gets the warning that describes where it
-- actually is, not a burst of eight. Rungs it walked past are simply never
-- written, and the app's Notifications panel reads that absence as "missed".
--
-- Safe to run repeatedly — the NOT EXISTS against sns_notification_log means a
-- rung already sent for this cycle never comes back.
-- ─────────────────────────────────────────────────────────────────────────────

WITH live AS (
  SELECT
    r.rid,
    COALESCE(r.registry_id, 'Draft #' || r.rid) AS registry_id,
    r.classification,
    r.country,
    r.supplier_id,
    r.supplier_name,
    r.expiry_date,
    (r.expiry_date - CURRENT_DATE)              AS days_left,
    COALESCE(r.created_by, '')                  AS requestor_email
  FROM sns_record r
  -- Closed records are excluded here, and that is the whole point of closing:
  -- it is what stops the reminders. Draft and pending records have no Registry
  -- ID to chase.
  WHERE r.expiry_date IS NOT NULL
    AND r.base_status IN ('Active', 'Extended', 'Expired')
),
rung AS (
  SELECT
    l.*,
    CASE
      -- Before expiry: the tightest threshold the record has fallen below.
      -- At 6 days left the thresholds still standing are 60/30/14/7, and 7 is
      -- the one that describes today.
      WHEN l.days_left >= 0 THEN (
        SELECT MIN(d)
          FROM unnest(ARRAY[60, 30, 14, 7, 5, 3, 2, 1, 0]) AS d
         WHERE d >= l.days_left
      )
      -- Past expiry with the day-of notice never sent: that goes first, even
      -- late. It is the one that says "this is now non-compliant", and the
      -- weekly chasers only read correctly as follow-ups to it.
      WHEN NOT EXISTS (
        SELECT 1 FROM sns_notification_log n
         WHERE n.record_rid   = l.rid
           AND n.cycle_expiry = l.expiry_date
           AND n.days_before_expiry = 0
      ) THEN 0
      -- Otherwise the weekly chaser for the week it is now in: -7, -14, -21…
      -- Integer division truncates, so days 1–6 past expiry fall through to
      -- NULL and stay quiet until the first full week is up.
      WHEN l.days_left <= -7 THEN -7 * ((-l.days_left) / 7)
      ELSE NULL
    END AS days_before_expiry
  FROM live l
)
SELECT
  g.rid,
  g.registry_id,
  g.classification,
  CASE g.classification WHEN 'SGL' THEN 'Single-Source' ELSE 'Sole-Source' END AS classification_label,
  g.country,
  g.country_code,
  g.supplier_id,
  g.supplier_name,
  g.expiry_date,
  g.days_left,
  g.days_before_expiry,
  g.requestor_email,

  -- Scope, as the record reads it — denormalised text, so it is whatever was
  -- true at sign-off even if the taxonomy has moved since.
  COALESCE((
    SELECT string_agg(COALESCE(NULLIF(n.commodity, ''), n.family), ', ' ORDER BY n.sort_order, n.id)
      FROM sns_record_node n WHERE n.record_rid = g.rid
  ), '') AS scope,

  -- Everyone who has touched the record: whoever raised it, and each validator.
  COALESCE((
    SELECT array_agg(DISTINCT lower(h.actor_email))
      FROM sns_record_history h
     WHERE h.record_rid = g.rid AND COALESCE(h.actor_email, '') <> ''
  ), '{}') AS stakeholder_emails,

  -- The two approvers who would have to act on a renewal.
  -- Joined on the country CODE, not the display name: names are editable
  -- reference data and a rename must not orphan the approver.
  (SELECT cm.manager_email FROM sns_country_manager cm
    WHERE cm.country_code = g.country_code AND cm.active LIMIT 1) AS level1_email,
  (SELECT cm.manager_name  FROM sns_country_manager cm
    WHERE cm.country_code = g.country_code AND cm.active LIMIT 1) AS level1_name,

  -- Category managers for any category the record touches, plus every Supply
  -- Chain Director (category IS NULL), who can sign off anything.
  COALESCE((
    SELECT array_agg(DISTINCT gm.manager_email)
      FROM sns_category_manager gm
     WHERE gm.active
       AND (gm.category IS NULL
            OR gm.category IN (SELECT n.category FROM sns_record_node n WHERE n.record_rid = g.rid))
  ), '{}') AS level2_emails,

  -- Named in the mail so the reader can see what is already on file.
  COALESCE((
    SELECT array_agg(d.document_name ORDER BY d.id)
      FROM sns_record_document d
     WHERE d.record_rid = g.rid AND d.kind = 'review'
  ), '{}') AS review_documents

FROM rung g
WHERE g.days_before_expiry IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sns_notification_log n
     WHERE n.record_rid   = g.rid
       AND n.cycle_expiry = g.expiry_date
       AND n.days_before_expiry = g.days_before_expiry
  )
ORDER BY g.days_left;


-- ─────────────────────────────────────────────────────────────────────────────
-- [2] "Execute a SQL query1" — record that the mail went out.
--
-- Runs once per item, after the send node. ON CONFLICT DO NOTHING makes a
-- re-run harmless: the unique index on
-- (record_rid, cycle_expiry, days_before_expiry) is what guarantees a rung is
-- never sent twice.
--
-- `cycle_expiry` MUST be the expiry_date that came out of query [1], not
-- CURRENT_DATE and not a freshly read expiry. It is what ties the log row to
-- this twelve-month cycle, so that renewing the record starts the ladder over
-- instead of leaving every rung permanently suppressed.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO sns_notification_log
  (record_rid, days_before_expiry, cycle_expiry, status, recipients)
VALUES
  ($1, $2, $3, 'sent', $4)
ON CONFLICT (record_rid, cycle_expiry, days_before_expiry) DO NOTHING;

-- In n8n's Postgres node the parameters come from the item, e.g.
--   $1 = {{ $json.rid }}
--   $2 = {{ $json.days_before_expiry }}
--   $3 = {{ $json.expiry_date }}
--   $4 = {{ JSON.stringify($json.recipients) }}  -- a text[] literal, e.g. {a@x,b@y}
--
-- To log a failed send instead, pass 'failed' for status. The app's
-- Notifications panel only treats 'sent' as sent, so a failed row shows the
-- attempt without claiming delivery — and, because the row exists, that rung
-- will not be retried. Omit the insert entirely if you would rather it retry
-- on the next run.
