-- Annual renewals.
--
-- A rental or recurrent service runs on a contract that ends, and the question "do we extend
-- this?" arrives once a year per line rather than once a month. The monthly cycle cannot carry
-- it: a cycle line is about one month, and a renewal is a decision about the next twelve.

/* ─── when a line's contract runs out ─────────────────────────────────────────────────────── */

-- Distinct from off_hire_date, which records that something HAS stopped. This is when the
-- agreement behind it expires, which is a date known in advance and the whole basis of the
-- reminder schedule. Nullable: plenty of the register is on standing arrangements with no end
-- date, and those simply never come up for renewal.
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS contract_ends_on DATE;

-- The two people the design notifies when a renewal falls due. Held per line because they are a
-- property of the service, not of the country: the person who asked for a crane is not the
-- person who asked for the accommodation.
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS requester_email TEXT;
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS owner_email     TEXT;

-- Finding what is due is the one query this whole flow turns on, and it runs over the register
-- rather than over a cycle, so it gets an index of its own. Partial, because most lines have no
-- end date at all and none of them are ever due.
CREATE INDEX IF NOT EXISTS rrsm_service_lines_contract_end
  ON rrsm_service_lines (country_code, contract_ends_on)
  WHERE contract_ends_on IS NOT NULL AND active;

/* ─── the decision ───────────────────────────────────────────────────────────────────────── */

-- One row per line per renewal, opened when the line comes into the reminder window.
--
-- A row rather than a column on the service line, because the history is the point: a line
-- renewed three times has three decisions behind it, each with its own reasoning, and squashing
-- them into "last renewed" loses the one thing anybody looks back for.
--
-- `due_on` is copied from the line rather than joined at read time. The contract date can be
-- edited after a renewal is raised, and a renewal is about the date it was raised against --
-- otherwise last year's decision silently re-describes itself against this year's date.
CREATE TABLE IF NOT EXISTS rrsm_renewals (
  id              SERIAL PRIMARY KEY,
  service_line_id INTEGER NOT NULL REFERENCES rrsm_service_lines(id) ON DELETE CASCADE,
  due_on          DATE NOT NULL,

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'extended', 'scope_change', 'not_extended')),

  -- What the decision was based on, frozen at the moment it was taken: the design puts twelve
  -- months of utilisation in front of the decider, and a decision read back later should show
  -- the figures that were on screen, not today's.
  months_used     INTEGER,
  qty_total       NUMERIC(14, 2),

  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  note            TEXT,

  -- The new end date when extended. Null for a refusal, and for a scope change that has not been
  -- re-dated yet.
  extends_to      DATE,

  -- Which reminders have gone out. An array rather than a count so a resend of the 60-day notice
  -- cannot masquerade as the 30-day one.
  reminders_sent  INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  last_reminder_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One open renewal per line per date. A second would mean two people deciding the same thing.
  UNIQUE (service_line_id, due_on)
);

CREATE INDEX IF NOT EXISTS rrsm_renewals_pending
  ON rrsm_renewals (due_on) WHERE status = 'pending';
