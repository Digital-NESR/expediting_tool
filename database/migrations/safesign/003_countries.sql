-- SafeSign is run per country, the same way SOA Consolidation is: a sender belongs to one or more
-- countries and sees and sends only for those; an admin sees every country and picks one.
--
-- The supplier library now comes from SourceGuide's supplier_avl (the SAP vendor master). A row in
-- ss_vendors is "this supplier is in this country's library"; `vendor_code` is the SAP supplier
-- code. Its TO addresses are read live from supplier_avl.email, and ss_vendor_contacts holds only
-- what the team changed on top: extra TO or CC addresses, and master addresses hidden for this
-- country (kind 'hidden').

CREATE TABLE IF NOT EXISTS ss_countries (
  id             VARCHAR(8)  PRIMARY KEY,
  name           TEXT        NOT NULL,
  -- How historic_spend (SourceGuide) spells the country, for "bought from in this country".
  spend_country  TEXT,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  active         BOOLEAN     NOT NULL DEFAULT TRUE
);

-- The same codes SourceGuide uses (sg_countries), so sg_supplier_matrix can be joined on them.
INSERT INTO ss_countries (id, name, spend_country, sort_order) VALUES
  ('SA',  'Saudi Arabia', 'KSA',        1),
  ('AUH', 'Abu Dhabi',    'UAE',        2),
  ('HQ',  'HQ Dubai',     'HQ Dubai',   3),
  ('EOS', 'EOS Jafza',    'EOS JAFZA',  4),
  ('KW',  'Kuwait',       'Kuwait',     5),
  ('OM',  'Oman',         'Oman',       6),
  ('IQ',  'Iraq',         'Iraq',       7),
  ('EG',  'Egypt',        'Egypt',      8),
  ('DZ',  'Algeria',      'Algeria',    9),
  ('LY',  'Libya',        'Libya',     10),
  ('IN',  'India',        'India',     11),
  ('ID',  'Indonesia',    'Indonesia', 12)
ON CONFLICT (id) DO NOTHING;

-- Who may send for which country. Replaces ss_users: a sender with no country could see nothing.
CREATE TABLE IF NOT EXISTS ss_country_users (
  email       TEXT        NOT NULL,
  name        TEXT,
  country_id  VARCHAR(8)  NOT NULL REFERENCES ss_countries(id),
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (email, country_id)
);
CREATE INDEX IF NOT EXISTS ss_country_users_country ON ss_country_users (country_id);

-- The pilot is Saudi Arabia, so anyone already given access, and everything made so far, is Saudi.
INSERT INTO ss_country_users (email, name, country_id, created_by, created_at)
SELECT LOWER(email), name, 'SA', created_by, created_at FROM ss_users
ON CONFLICT DO NOTHING;
DROP TABLE IF EXISTS ss_users;

ALTER TABLE ss_communications ADD COLUMN IF NOT EXISTS country_id VARCHAR(8) REFERENCES ss_countries(id);
UPDATE ss_communications SET country_id = 'SA' WHERE country_id IS NULL;
ALTER TABLE ss_communications ALTER COLUMN country_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ss_communications_country ON ss_communications (country_id);

ALTER TABLE ss_vendors ADD COLUMN IF NOT EXISTS country_id VARCHAR(8) REFERENCES ss_countries(id);
UPDATE ss_vendors SET country_id = 'SA' WHERE country_id IS NULL;
ALTER TABLE ss_vendors ALTER COLUMN country_id SET NOT NULL;
DROP INDEX IF EXISTS ss_vendors_name;
CREATE INDEX IF NOT EXISTS ss_vendors_country ON ss_vendors (country_id);
CREATE UNIQUE INDEX IF NOT EXISTS ss_vendors_country_code
  ON ss_vendors (country_id, vendor_code) WHERE vendor_code IS NOT NULL;

ALTER TABLE ss_vendor_contacts DROP CONSTRAINT IF EXISTS ss_vendor_contacts_kind_check;
ALTER TABLE ss_vendor_contacts
  ADD CONSTRAINT ss_vendor_contacts_kind_check CHECK (kind IN ('to', 'cc', 'hidden'));
ALTER TABLE ss_vendor_contacts ADD COLUMN IF NOT EXISTS added_by TEXT;
