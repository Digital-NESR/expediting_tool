-- RRSM 012: recurrent services (annual contracts, subscriptions, AMCs), HQ Dubai first.
--
-- Decisions (user, 23 Nov 2026):
--   * A separate area from the monthly rentals. Each country switches the two modules on or off
--     (rentals_enabled / recurrent_enabled); HQ Dubai runs recurrent services only.
--   * The renewal runs requester first, then buyer: reminders at 90, 60, 30, 14, 7 and 0 days
--     before expiry go to the service's requester-validator, who answers renew / renew with
--     changes (free text) / cancel; the buyer then updates the record and the new PO and expiry.
--   * Requester-validators log in with a new 'requester' role and see only their own services.
--   * Buyers and admins add, edit and remove services. Billing is not part of the tool, but the
--     annual value may be recorded.
--   * Attachments per service: contract, quotation, other (BYTEA, the pattern already in use).

ALTER TABLE rrsm_countries
  ADD COLUMN IF NOT EXISTS rentals_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recurrent_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- The new role. The CHECK is replaced rather than altered: Postgres cannot widen one in place.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'rrsm_users' AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE rrsm_users DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE rrsm_users
  ADD CONSTRAINT rrsm_users_role_check CHECK (role IN ('buyer', 'ops', 'admin', 'requester'));

CREATE TABLE IF NOT EXISTS rrsm_recurrent_services (
  id                     SERIAL PRIMARY KEY,
  country_code           TEXT NOT NULL REFERENCES rrsm_countries(code),
  description            TEXT NOT NULL,
  service_name           TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  renewal_period         TEXT NOT NULL DEFAULT 'yearly',
  po_renewal_period      TEXT,
  department             TEXT,
  contract_expiry        DATE,
  last_po_number         TEXT,
  last_po_valid_till     DATE,
  -- Not a foreign key to rrsm_suppliers: some vendors here are not in SAP at all ("PBS-Oman").
  supplier_code          TEXT,
  supplier_name          TEXT,
  supplier_contact_name  TEXT,
  supplier_contact_email TEXT,
  requester_name         TEXT,
  requester_email        TEXT,
  buyer_name             TEXT,
  buyer_email            TEXT,
  approver               TEXT,
  request_type           TEXT,
  annual_value           NUMERIC(16, 2),
  currency               TEXT,
  comments               TEXT,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rrsm_recurrent_country ON rrsm_recurrent_services (country_code);
CREATE INDEX IF NOT EXISTS rrsm_recurrent_requester ON rrsm_recurrent_services (lower(requester_email));

-- One renewal per service per expiry date it addresses. Opened when the service comes within 90
-- days of expiry (or is already past it), closed by the buyer recording the outcome.
CREATE TABLE IF NOT EXISTS rrsm_recurrent_renewals (
  id               SERIAL PRIMARY KEY,
  service_id       INTEGER NOT NULL REFERENCES rrsm_recurrent_services(id) ON DELETE CASCADE,
  due_on           DATE NOT NULL,
  decision         TEXT CHECK (decision IN ('renew', 'renew_changes', 'cancel')),
  decision_note    TEXT,
  decided_by       TEXT,
  decided_at       TIMESTAMPTZ,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by     TEXT,
  completed_at     TIMESTAMPTZ,
  new_po_number    TEXT,
  new_expiry       DATE,
  reminders_sent   INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  last_reminded_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_id, due_on)
);

CREATE TABLE IF NOT EXISTS rrsm_recurrent_documents (
  id           SERIAL PRIMARY KEY,
  service_id   INTEGER NOT NULL REFERENCES rrsm_recurrent_services(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('contract', 'quotation', 'other')),
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  content      BYTEA NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rrsm_recurrent_documents_service ON rrsm_recurrent_documents (service_id);

-- Every change to a service, every decision and every renewal, with who. No foreign key, so the
-- record that a service existed outlives its deletion.
CREATE TABLE IF NOT EXISTS rrsm_recurrent_log (
  id          BIGSERIAL PRIMARY KEY,
  service_id  INTEGER,
  country_code TEXT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  changes     JSONB NOT NULL DEFAULT '{}'::JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rrsm_recurrent_log_service ON rrsm_recurrent_log (service_id, created_at DESC);
