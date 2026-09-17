-- ============================================================================
-- S&S Registry — named approvers, supplier master, attachments, reminder log.
--
-- Everything here is additive and IF NOT EXISTS: the tables were first applied
-- by hand against sns_registry_db before this migration existed, so on that
-- database this runs as a no-op and simply records itself. On a fresh database
-- it creates them outright.
-- ============================================================================


/* --- Approvers -------------------------------------------------------------

   Two populations, kept apart because they are keyed differently and
   maintained by different people:

     Level 1  one Country Supply Chain Manager per country.
     Level 2  a manager per spend category, OR a Supply Chain Director who can
              sign off anything.

   Both store the approver's email as the identity. Names and titles are
   display-only; the email is what is matched against the signed-in user, so
   changing it reassigns the role.                                           */

-- Keyed on sns_country.code, not the display name, for the same reason
-- sns_record.country_code exists: names are editable reference data and must
-- not be able to orphan an approver by being renamed.
--
-- One database already has this table from a hand-applied version that keyed on
-- the display name. Convert it in place rather than dropping it, so the
-- approvers already loaded there survive. The block is a no-op everywhere else.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'sns_country_manager'
       AND column_name  = 'country'
  ) THEN
    ALTER TABLE sns_country_manager ADD COLUMN IF NOT EXISTS country_code TEXT;

    UPDATE sns_country_manager m
       SET country_code = c.code
      FROM sns_country c
     WHERE c.name = m.country
       AND m.country_code IS NULL;

    -- A row whose country name no longer resolves has no identity to convert
    -- to, and an approver attached to nothing cannot route anything.
    DELETE FROM sns_country_manager WHERE country_code IS NULL;

    ALTER TABLE sns_country_manager DROP COLUMN country;
    ALTER TABLE sns_country_manager ALTER COLUMN country_code SET NOT NULL;
  END IF;
END $$;

-- No foreign key to sns_country(code) on purpose: the converted table above
-- would not have one, and a constraint present on fresh databases but absent on
-- converted ones is worse than none at all. The app resolves codes from
-- sns_country, and the unique index below is what the upsert relies on.
CREATE TABLE IF NOT EXISTS sns_country_manager (
  id            SERIAL PRIMARY KEY,
  country_code  TEXT NOT NULL,
  manager_name  TEXT NOT NULL DEFAULT '',
  manager_email TEXT NOT NULL,
  manager_title TEXT NOT NULL DEFAULT 'Country Supply Chain Manager',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS sns_country_manager_code_key
  ON sns_country_manager (country_code);

CREATE INDEX IF NOT EXISTS sns_country_manager_email_idx
  ON sns_country_manager (LOWER(manager_email));

-- `category` is the category NAME as it appears in sg_commodities.category,
-- stored as text rather than a foreign key because that table lives in another
-- database. NULL means "Supply Chain Director" — an approver who can sign off
-- any record regardless of its categories.
CREATE TABLE IF NOT EXISTS sns_category_manager (
  id            SERIAL PRIMARY KEY,
  category      TEXT,
  manager_name  TEXT NOT NULL DEFAULT '',
  manager_email TEXT NOT NULL,
  manager_title TEXT NOT NULL DEFAULT 'Category Manager',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One manager per category. A partial index, because NULL never equals NULL in
-- a plain UNIQUE and directors would otherwise be barred from duplicating —
-- which is intended: more than one Supply Chain Director may exist.
CREATE UNIQUE INDEX IF NOT EXISTS sns_category_manager_category_key
  ON sns_category_manager (category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS sns_category_manager_email_idx
  ON sns_category_manager (LOWER(manager_email));


/* --- Supplier master -------------------------------------------------------

   Supplier used to be two free-text columns on sns_record. It is promoted to
   its own table because closing a supplier account is a supplier-level act,
   not a record-level one: it has to stop the renewal reminders on every record
   naming that supplier at once.

   sns_record keeps its denormalised supplier_id / supplier_name. A record is a
   compliance artefact and must read the way it read at sign-off, even if the
   supplier is later renamed here.                                           */

CREATE TABLE IF NOT EXISTS sns_supplier (
  sap_id        TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed')),
  closed_at     TIMESTAMPTZ,
  closed_by     TEXT,
  closed_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sns_supplier_status_idx ON sns_supplier (status);


/* --- Attachments -----------------------------------------------------------

   Bytes live in the row, matching how catalog and ProcureGuard documents are
   stored. The registry holds a handful of small files per record, and keeping
   them here puts them behind the same permission check and inside the same
   backup as the record itself.

   `kind` separates the two points in the lifecycle at which a file arrives:
     evidence  attached in the wizard, supporting the original justification.
     review    attached at renewal, supporting another 12 months.
   The renewal reminders list the latter.                                    */

CREATE TABLE IF NOT EXISTS sns_record_document (
  id                SERIAL PRIMARY KEY,
  record_rid        INTEGER NOT NULL REFERENCES sns_record (rid) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'evidence' CHECK (kind IN ('evidence', 'review')),
  document_name     TEXT NOT NULL,
  original_name     TEXT,
  file_type         TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size         INTEGER NOT NULL DEFAULT 0,
  file_content      BYTEA NOT NULL,
  uploaded_by_name  TEXT NOT NULL DEFAULT '',
  uploaded_by_email TEXT NOT NULL DEFAULT '',
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sns_record_document_record_idx
  ON sns_record_document (record_rid, kind, id);


/* --- Expiry reminder log ---------------------------------------------------

   One row per reminder actually sent. Written by the n8n reminder workflow,
   read by the app to render the Expiry Reminders panel on a record — the same
   split TI-TE uses between notification_log and its shipment detail screen.

   The app does NOT send these. n8n runs on its own schedule, queries this
   database directly for what is due, sends, and writes back here. Nothing goes
   through an app endpoint, which is deliberate: a scheduler carries no session
   cookie, and src/proxy.ts refuses any unauthenticated request under the api
   path. (Spelling that path with a wildcard here would open a nested block
   comment -- Postgres nests them, unlike C -- and swallow the rest of the
   file.)

   `days_before_expiry` is the rung, as an integer so the workflow's SQL can do
   arithmetic on it:
     60, 30, 14, 7, 5, 3, 2, 1   the eight pre-expiry warnings
     0                           the expiry date itself
     -7, -14, -21, …             weekly chasers, as days past expiry

   `cycle_expiry` is the record's expiry_date at the moment of sending, and it
   is what makes the ladder repeat. Renewing moves expiry_date twelve months
   out, which is a new cycle, so every rung becomes eligible again under the
   new date rather than staying permanently suppressed.

   There is deliberately no "suppressed" state. A rung a dormant record walked
   past is simply never written, and the UI reads its absence plus the calendar
   as "missed" — the same way TI-TE's badges do.                             */

CREATE TABLE IF NOT EXISTS sns_notification_log (
  id                 SERIAL PRIMARY KEY,
  record_rid         INTEGER NOT NULL REFERENCES sns_record (rid) ON DELETE CASCADE,
  days_before_expiry INTEGER NOT NULL,
  cycle_expiry       DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'sent',
  recipients         TEXT[] NOT NULL DEFAULT '{}',
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The idempotency guarantee: the workflow may run any number of times a day,
-- and re-run after a failure, without ever double-sending a rung.
CREATE UNIQUE INDEX IF NOT EXISTS sns_notification_log_once
  ON sns_notification_log (record_rid, cycle_expiry, days_before_expiry);

CREATE INDEX IF NOT EXISTS sns_notification_log_record_idx
  ON sns_notification_log (record_rid, sent_at DESC);


/* --- Record lifecycle columns ---------------------------------------------- */

-- Closing the supplier account retires the record without deleting it, and is
-- what the reminders offer as the alternative to renewing. A closed record is
-- excluded from the reminder query, so this is what stops the emails.
ALTER TABLE sns_record ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ;
ALTER TABLE sns_record ADD COLUMN IF NOT EXISTS closed_by     TEXT;
ALTER TABLE sns_record ADD COLUMN IF NOT EXISTS closed_reason TEXT;

-- Renewal count, for the audit trail and the dashboard. Distinct from
-- base_status = 'Extended', which only says what the most recent outcome was.
ALTER TABLE sns_record ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0;

-- 'Closed' joins the status set. The constraint is dropped and recreated
-- because there is no ADD CONSTRAINT IF NOT EXISTS; widening it can never fail
-- against existing rows.
ALTER TABLE sns_record DROP CONSTRAINT IF EXISTS sns_record_base_status_check;
ALTER TABLE sns_record ADD CONSTRAINT sns_record_base_status_check
  CHECK (base_status IN ('Draft', 'Pending Level 1', 'Pending Level 2',
                         'Active', 'Extended', 'Expired', 'Rejected', 'Closed'));
