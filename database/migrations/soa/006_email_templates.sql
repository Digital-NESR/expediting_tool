-- Editable outreach templates, the country AP mailbox, and the SOA format workbook.
--
-- The statement request used to exist only inside whatever n8n would eventually render. A champion
-- could not read it, let alone change it, and the wording is the part they are accountable for --
-- it names them, it names their AP mailbox, and it sets the date after which a silent vendor is
-- treated as reconciled. So the template lives here, seeded from the approved bilingual text, and
-- the champion edits their own country's copy.

-- The mailbox the vendor is told to reply to. Taken from the "AP Group Emails" sheet of the
-- SOA Format workbook. EOS DMCC, Chad and Congo have no row there, so they stay NULL and the
-- Outreach screen refuses to send until somebody fills them in -- a blank reply-to address in a
-- letter to an external vendor is worse than a blocked send.
ALTER TABLE countries ADD COLUMN IF NOT EXISTS ap_email TEXT;

UPDATE countries AS c SET ap_email = v.email
  FROM (VALUES
    ('SA',  'invoices.ksa@nesr.com'),
    ('EOS', 'Payable.EOS@nesr.com'),
    ('OM',  'ap.finance.oman@gulfenergy-int.com'),
    ('DZ',  'Payable.algeria@nesr.com'),
    -- The sheet lists a second Kuwait mailbox, financeteam.kuwait@cpvenkuwait.com, against the
    -- CPVEN entity. NESR Kuwait is the default; a champion can change it.
    ('KW',  'financeteam.kuwait@nesr.com'),
    ('AUH', 'finance.auh@nesr.com'),
    ('EG',  'Payable.Egypt@nesr.com'),
    ('IQ',  'Payable.iraq@nesr.com'),
    ('HQ',  'accountspayable.dubai@nesr.com'),
    ('LY',  'Payable.Libya@nesr.com'),
    ('QA',  'Payable.qatar@nesr.com'),
    ('ID',  'Payable.Indonesia@nesr.com'),
    ('JO',  'financeteam.kuwait@nesr.com'),
    ('IN',  'Payable.India@nesr.com'),
    ('YE',  'ap.finance.oman@gulfenergy-int.com')
  ) AS v(id, email)
 WHERE c.id = v.id AND c.ap_email IS NULL;

-- One row per country, plus one row with a NULL country holding the global default that a country
-- inherits until its champion saves an edit. NULL cannot sit in a primary key, so scope uniqueness
-- is a unique index over COALESCE -- the same shape the access grants use.
CREATE TABLE IF NOT EXISTS soa_email_templates (
  id          SERIAL PRIMARY KEY,
  country_id  TEXT REFERENCES countries(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS soa_email_templates_scope
  ON soa_email_templates (COALESCE(country_id, '*'));

-- The workbook every vendor is told to fill in. Stored here rather than inside the n8n workflow so
-- the format can be replaced without editing the automation, and so the file that went out with a
-- given request is auditable. Bytes in the database, like soa_submissions: the same reasoning
-- applies -- a request that cites an attachment has to be able to produce it.
CREATE TABLE IF NOT EXISTS soa_attachments (
  id           SERIAL PRIMARY KEY,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content      BYTEA NOT NULL,
  byte_size    INTEGER NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by  TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Exactly one attachment is current at a time; older ones stay for the audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS soa_attachments_one_active
  ON soa_attachments (active) WHERE active;

-- Per-vendor recipient edits, stored as deltas rather than as a frozen address list.
--
-- The addresses themselves keep coming from the supplier directory (the AVL union the SAP supplier
-- master) on every send, so a vendor who updates their AP mailbox upstream is picked up without
-- anyone re-importing. What is stored here is only what a champion changed: an address they added
-- by hand, or one they removed. Both survive the cycle -- a champion who tracked down the right
-- contact should not have to do it again next quarter, and one who deleted a dead mailbox should
-- not have it pulled back in.
--
-- Resolved TO = (directory + added) - suppressed - anything @nesr.com. Internal addresses are
-- dropped because they belong to colleagues, not to the vendor, and the letter opens "Dear Valued
-- Business Partner".
CREATE TABLE IF NOT EXISTS vendor_contact_overrides (
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('added', 'suppressed')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendor_id, email)
);

-- Lower-cased on the way in, so the key is the address rather than its spelling.
CREATE INDEX IF NOT EXISTS vendor_contact_overrides_vendor ON vendor_contact_overrides (vendor_id);
