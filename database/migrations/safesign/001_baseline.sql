-- SafeSign (QHSE communications to suppliers).
--
-- Who does what:
--   admin     ADMIN_EMAILS / SAFESIGN_ADMIN_EMAILS. Everything a manager can do, plus who
--             else may use the tool.
--   manager   A row in ss_users. Keeps the vendor library and topics, sends communications,
--             reminds suppliers and reviews action plans.
--   viewer    A row in ss_users. Reads the dashboards and exports.
--   supplier  No account. Reaches one request through the link in their email, and proves they
--             can read an address the request went to with a one-time code.
--
-- A communication is one send: a topic, a message, the documents, the kind of response wanted,
-- and a deadline. It opens one request per supplier. Documents do not expire; a new document is a
-- new communication.

CREATE TABLE IF NOT EXISTS ss_users (
  email       TEXT        PRIMARY KEY,
  name        TEXT,
  role        TEXT        NOT NULL CHECK (role IN ('manager', 'viewer')),
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ss_topics (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_topics_name ON ss_topics (LOWER(name));

-- The vendor library. `category` is the category of work Nora groups suppliers by, free text so
-- a new category needs no migration; the pages offer the existing ones as suggestions.
CREATE TABLE IF NOT EXISTS ss_vendors (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'General',
  vendor_code TEXT,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_vendors_name ON ss_vendors (LOWER(name));

-- Who at a vendor is emailed. `kind` = 'to' receives the request; 'cc' is copied. Every address
-- here can also ask for the one-time code, because the request went to it.
CREATE TABLE IF NOT EXISTS ss_vendor_contacts (
  id          BIGSERIAL   PRIMARY KEY,
  vendor_id   BIGINT      NOT NULL REFERENCES ss_vendors(id) ON DELETE CASCADE,
  name        TEXT,
  email       TEXT        NOT NULL,
  kind        TEXT        NOT NULL DEFAULT 'to' CHECK (kind IN ('to', 'cc')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_vendor_contacts_email
  ON ss_vendor_contacts (vendor_id, LOWER(email));

CREATE TABLE IF NOT EXISTS ss_communications (
  id                   BIGSERIAL   PRIMARY KEY,
  topic_id             BIGINT      NOT NULL REFERENCES ss_topics(id),
  title                TEXT        NOT NULL,
  message              TEXT        NOT NULL DEFAULT '',
  -- What the supplier has to do:
  --   acknowledge       tick and confirm, with name and job title
  --   sign_letter       draw a signature in the browser; a signed copy of the letter is produced
  --   upload_signed     download the letter, sign it, upload the scan
  --   submit_documents  upload files
  --   action_plan       upload a plan that NESR accepts or sends back for changes
  response_type        TEXT        NOT NULL
                       CHECK (response_type IN ('acknowledge', 'sign_letter', 'upload_signed',
                                                'submit_documents', 'action_plan')),
  -- Extra files the supplier may (or must) attach on top of the response itself.
  attachments          TEXT        NOT NULL DEFAULT 'none'
                       CHECK (attachments IN ('none', 'optional', 'required')),
  deadline             DATE        NOT NULL,
  -- Reminders: on each of these days before the deadline, then every `overdue_every_days` once
  -- it has passed. 0 turns the overdue chase off.
  remind_days_before   INTEGER[]   NOT NULL DEFAULT '{3,1}',
  overdue_every_days   INTEGER     NOT NULL DEFAULT 2 CHECK (overdue_every_days >= 0),
  status               TEXT        NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'closed')),
  created_by           TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at              TIMESTAMPTZ,
  sent_by              TEXT,
  closed_at            TIMESTAMPTZ,
  closed_by            TEXT
);
CREATE INDEX IF NOT EXISTS ss_communications_topic ON ss_communications (topic_id);

-- What NESR sends. `is_letter` marks the cover letter a supplier signs; for the signing response
-- types exactly one document should carry it (the first PDF is used if none does).
CREATE TABLE IF NOT EXISTS ss_documents (
  id                BIGSERIAL   PRIMARY KEY,
  communication_id  BIGINT      NOT NULL REFERENCES ss_communications(id) ON DELETE CASCADE,
  filename          TEXT        NOT NULL,
  mime              TEXT        NOT NULL,
  size_bytes        INTEGER     NOT NULL,
  data              BYTEA       NOT NULL,
  is_letter         BOOLEAN     NOT NULL DEFAULT FALSE,
  uploaded_by       TEXT        NOT NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ss_documents_communication ON ss_documents (communication_id);

-- One per supplier per communication. One response closes it for the whole supplier; who gave
-- it is recorded on the row and in ss_events.
CREATE TABLE IF NOT EXISTS ss_requests (
  id                 BIGSERIAL   PRIMARY KEY,
  communication_id   BIGINT      NOT NULL REFERENCES ss_communications(id) ON DELETE CASCADE,
  vendor_id          BIGINT      NOT NULL REFERENCES ss_vendors(id),
  token              UUID        NOT NULL DEFAULT gen_random_uuid(),
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed', 'under_review', 'changes_requested')),
  -- The addresses it actually went to, frozen at send time so a later edit of the vendor's
  -- contacts neither strands nor widens who may answer.
  sent_to            TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  sent_cc            TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  sent_at            TIMESTAMPTZ,
  responded_at       TIMESTAMPTZ,
  responded_email    TEXT,
  responded_name     TEXT,
  responded_title    TEXT,
  responded_ip       TEXT,
  response_comment   TEXT,
  completed_at       TIMESTAMPTZ,
  last_reminded_at   TIMESTAMPTZ,
  reminder_count     INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (communication_id, vendor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_requests_token ON ss_requests (token);
CREATE INDEX IF NOT EXISTS ss_requests_vendor ON ss_requests (vendor_id);

-- What the supplier sends back. Versions are kept: a plan sent back for changes and uploaded
-- again is a new `round`, never an overwrite.
CREATE TABLE IF NOT EXISTS ss_response_files (
  id           BIGSERIAL   PRIMARY KEY,
  request_id   BIGINT      NOT NULL REFERENCES ss_requests(id) ON DELETE CASCADE,
  round        INTEGER     NOT NULL DEFAULT 1,
  kind         TEXT        NOT NULL CHECK (kind IN ('signed_letter', 'plan', 'document', 'supporting')),
  filename     TEXT        NOT NULL,
  mime         TEXT        NOT NULL,
  size_bytes   INTEGER     NOT NULL,
  data         BYTEA       NOT NULL,
  uploaded_by  TEXT        NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ss_response_files_request ON ss_response_files (request_id);

-- The audit trail: every send, reminder, code, response and review, with who and when.
CREATE TABLE IF NOT EXISTS ss_events (
  id          BIGSERIAL   PRIMARY KEY,
  request_id  BIGINT      REFERENCES ss_requests(id) ON DELETE CASCADE,
  communication_id BIGINT REFERENCES ss_communications(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  actor       TEXT        NOT NULL,
  detail      JSONB       NOT NULL DEFAULT '{}'::JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ss_events_request ON ss_events (request_id, at DESC);

-- One-time codes, the same mechanism as rrsm_access_codes.
CREATE TABLE IF NOT EXISTS ss_access_codes (
  id                  BIGSERIAL   PRIMARY KEY,
  request_id          BIGINT      NOT NULL REFERENCES ss_requests(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL,
  code_hash           TEXT        NOT NULL,
  attempts            INTEGER     NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ NOT NULL,
  consumed_at         TIMESTAMPTZ,
  session_token       UUID,
  session_expires_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ss_access_codes_request ON ss_access_codes (request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ss_access_codes_session
  ON ss_access_codes (session_token) WHERE session_token IS NOT NULL;

-- A starting set of topics, taken from the documents Nora shared. Editable in the tool.
INSERT INTO ss_topics (name, description, created_by) VALUES
  ('Medical & Emergency', 'Medical evacuation protocol, emergency flowcharts', 'migration'),
  ('Site Access & RFID', 'Access control, RFID card policy', 'migration'),
  ('Workforce', 'Workforce and personnel requirements', 'migration'),
  ('Operations', 'Operational procedures and requirements', 'migration')
ON CONFLICT DO NOTHING;
