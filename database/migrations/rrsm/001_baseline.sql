-- RRSM — Rental & Recurrent Services Management. The first tables.
--
-- Built from the approved design in design/rrsm/ and from the 745-row Kuwait sample the mockups
-- render from, which is one row per rented asset per month and is the grain everything below is
-- shaped around. Two statements the process maps make outright are load-bearing here:
--
--   1. The cycle runs the 25th to the 25th, PER COUNTRY, and the operating model (shared-support
--      plant vs segment-based services) is set per service line -- not per country, not per
--      supplier.
--   2. At the Ops validation step the portal captures UTILISATION -- headcount, units, days --
--      and never value. Supplier timesheets and invoices stay with Supply Chain. Rates and PO
--      values exist here because the buyer screens need them; nothing Ops is asked to confirm
--      touches them.
--
-- Deliberately NOT in this baseline: annual renewals, and any write-back to SAP. The PO number
-- is a column a buyer types, because that is what the portal does today.

/* ─── Where it runs ──────────────────────────────────────────────────────────────────────── */

-- NESR's operating countries, and the switch that phases the rollout.
--
-- The same nineteen Catalog Manager seeds, by the same codes, so a country means one thing across
-- the two tools. Note that two of them are not countries in the atlas sense and are left exactly
-- as they are: `HQ` is HQ Dubai and `EO` is EOS. That is also why the UAE is not split -- `AE` is
-- the UAE operating entity and `HQ` is Dubai head office, so switching on `AE` is switching on
-- Abu Dhabi without needing a finer unit.
--
-- `live` is the phasing switch and every row starts FALSE, including the first country to go
-- live. Turning a country on is an act with a date and a person behind it, and that belongs in
-- the /admin editor where it is logged, not in a migration that runs itself on deploy.
CREATE TABLE IF NOT EXISTS rrsm_countries (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL,                    -- rates and PO values are held in it
  flag       TEXT,
  live       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rrsm_countries (code, name, currency, flag, sort_order) VALUES
  ('DZ', 'Algeria',                    'USD', '🇩🇿', 10),
  ('BH', 'Bahrain',                    'BHD', '🇧🇭', 20),
  ('TD', 'Chad',                       'USD', '🇹🇩', 30),
  ('CG', 'Congo',                      'USD', '🇨🇬', 40),
  ('EG', 'Egypt',                      'USD', '🇪🇬', 50),
  ('EO', 'EOS',                        'USD', '🌐', 60),
  ('HQ', 'HQ Dubai',                   'AED', '🇦🇪', 70),
  ('IN', 'India',                      'USD', '🇮🇳', 80),
  ('ID', 'Indonesia',                  'USD', '🇮🇩', 90),
  ('IQ', 'Iraq',                       'USD', '🇮🇶', 100),
  ('JO', 'Jordan',                     'USD', '🇯🇴', 110),
  ('KW', 'Kuwait',                     'KWD', '🇰🇼', 120),
  ('LY', 'Libya',                      'USD', '🇱🇾', 130),
  ('MY', 'Malaysia',                   'USD', '🇲🇾', 140),
  ('OM', 'Oman',                       'OMR', '🇴🇲', 150),
  ('QA', 'Qatar',                      'QAR', '🇶🇦', 160),
  ('SA', 'Saudi Arabia (KSA)',         'SAR', '🇸🇦', 170),
  ('AE', 'United Arab Emirates (UAE)', 'AED', '🇦🇪', 180),
  ('YE', 'Yemen',                      'USD', '🇾🇪', 190)
ON CONFLICT (code) DO NOTHING;

/* ─── What is being counted ──────────────────────────────────────────────────────────────── */

-- How a service line's utilisation is measured.
--
-- A table rather than a CHECK constraint, because this set is known to be incomplete: the sample
-- data is all monthly vehicle hire, the process maps say "headcount, units and days", and
-- accommodation will be counted by headcount. More scopes arrive as the tool is built, and each
-- one should be an INSERT an admin can make rather than a migration and a deploy.
CREATE TABLE IF NOT EXISTS rrsm_uoms (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  -- What one unit means when a cycle line is filled from a full month, which is the design's
  -- "Fill empty with full month" button. NULL where that makes no sense.
  per_month  NUMERIC(10, 2),
  sort_order INTEGER NOT NULL DEFAULT 100,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO rrsm_uoms (code, label, per_month, sort_order) VALUES
  ('month',     'Month',     1,    10),
  ('day',       'Day',       30,   20),
  ('hour',      'Hour',      NULL, 30),
  ('headcount', 'Headcount', NULL, 40),
  ('unit',      'Unit',      NULL, 50)
ON CONFLICT (code) DO NOTHING;

/* ─── Who may do what ────────────────────────────────────────────────────────────────────── */

-- Buyers, Ops validators and central admins.
--
-- The source of truth for permissions, the way ProcureGuard's `recipients` table is: this is the
-- table the /admin editor writes, and nothing derives a role from anywhere else. Suppliers are
-- NOT here -- they never hold a NESR account and reach the portal by link; see
-- `rrsm_access_codes`.
--
-- A row is one person in one country, so somebody covering the UAE and Kuwait has two rows. That
-- reads worse than an array and behaves better: it is what an admin screen can edit a line at a
-- time, and it is what a foreign key can point at.
CREATE TABLE IF NOT EXISTS rrsm_users (
  id           SERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('buyer', 'ops', 'admin')),
  country_code TEXT NOT NULL REFERENCES rrsm_countries(code) ON DELETE CASCADE,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  added_by     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, role, country_code)
);

CREATE INDEX IF NOT EXISTS rrsm_users_email ON rrsm_users (lower(email)) WHERE active;

/* ─── The register ───────────────────────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS rrsm_suppliers (
  code           TEXT PRIMARY KEY,             -- SAP vendor code, unpadded
  name           TEXT NOT NULL,
  -- Where the monthly submission link is sent. An array because the sample shows one supplier
  -- serving several segments, and the person who returns the sheet is not always the person on
  -- the contract.
  contact_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One rented asset, or one recurrent service, standing between cycles.
--
-- The columns of the sample extract that do not change month to month live here; what changes
-- monthly is in `rrsm_cycle_lines`. `rate` is the CURRENT agreed rate and is copied onto a cycle
-- line when that line is opened, so a rate renegotiated in March does not silently restate
-- January's approved costs.
CREATE TABLE IF NOT EXISTS rrsm_service_lines (
  id               SERIAL PRIMARY KEY,
  country_code     TEXT NOT NULL REFERENCES rrsm_countries(code),
  supplier_code    TEXT NOT NULL REFERENCES rrsm_suppliers(code),

  -- 'CPVEN_CT', 'NPS_CMT' in the sample: the segment the cost lands on.
  segment          TEXT NOT NULL,
  cost_center      TEXT NOT NULL,              -- 'C541110101'
  cost_center_name TEXT,                       -- '1154- CT-CPVEN -KWT'

  description      TEXT NOT NULL,              -- 'CT-TOYOTA PRADO -23X70474'
  asset_ref        TEXT,                       -- '23X70474' — plate or serial; blank for a service

  -- The SAP service master number, which the Kuwait workbooks carry on every row and the
  -- mockups do not show at all. It is what actually groups a line by kind: 310000000011 is
  -- vehicle hire, 330000000001 staff house rental, 330000000004 security guards, 450000000003
  -- GPS tracking. Nullable because a line can exist before anyone has looked the number up.
  service_number   TEXT,

  -- Which operating model this line runs under. Per line by design.
  operating_model  TEXT NOT NULL
                   CHECK (operating_model IN ('shared_support', 'segment_based')),

  uom              TEXT NOT NULL DEFAULT 'month' REFERENCES rrsm_uoms(code),
  rate             NUMERIC(14, 3),             -- current agreed rate, in the country's currency
  payment_terms    TEXT,                       -- 'NT30'

  starts_on        DATE,
  -- Set when the asset goes off hire. A line is kept rather than deleted: last month's cycle
  -- still refers to it, and the off-hire date is itself the answer to "when did this stop".
  off_hire_date    DATE,
  active           BOOLEAN NOT NULL DEFAULT TRUE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrsm_service_lines_country
  ON rrsm_service_lines (country_code, supplier_code) WHERE active;
CREATE INDEX IF NOT EXISTS rrsm_service_lines_asset
  ON rrsm_service_lines (country_code, asset_ref);
CREATE INDEX IF NOT EXISTS rrsm_service_lines_service_number
  ON rrsm_service_lines (service_number) WHERE service_number IS NOT NULL;

/* ─── The monthly cycle ──────────────────────────────────────────────────────────────────── */

-- One 25th-to-25th period in one country.
--
-- Per country, not global: the rollout is phased, so Kuwait can be mid-cycle while a country that
-- has not gone live has no cycle at all.
--
-- `period` is the month the cycle is NAMED after, stored as its first day so it sorts and
-- compares as a date. `opens_on`/`closes_on` are stored rather than computed: the 25th is the
-- rule, and a cutoff that moves for a public holiday is the reason a rule needs a column.
CREATE TABLE IF NOT EXISTS rrsm_cycles (
  id           SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL REFERENCES rrsm_countries(code),
  period       DATE NOT NULL,
  opens_on     DATE NOT NULL,
  closes_on    DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'open', 'validation', 'closed')),
  opened_at    TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, period)
);

-- The grain: one service line in one cycle. This is the row the sample extract is made of.
--
-- `value` is generated rather than typed. The sample has a value column that is always qty x
-- rate, and a third place to write that number is a third place for it to disagree.
--
-- `stage` is the portal's own workflow and `erp_status` mirrors SAP; see the note on each. Ops
-- moves a line to `validated`; `returned` is the "Back to Buyer / Back to Ops validator /
-- Supplier" path in the design, and `returned_to` says which.
CREATE TABLE IF NOT EXISTS rrsm_cycle_lines (
  id              SERIAL PRIMARY KEY,
  cycle_id        INTEGER NOT NULL REFERENCES rrsm_cycles(id) ON DELETE CASCADE,
  service_line_id INTEGER NOT NULL REFERENCES rrsm_service_lines(id),

  -- What the supplier claims, and what Ops confirms. Utilisation only, in the line's own UoM.
  qty             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  planned_qty     NUMERIC(12, 2),
  -- Copied from the register when the line opens, so a later rate change cannot restate it.
  rate            NUMERIC(14, 3),
  value           NUMERIC(16, 3) GENERATED ALWAYS AS (qty * COALESCE(rate, 0)) STORED,

  -- WHERE THE LINE IS IN THE PORTAL. Ends at `closed`; it does not track the PO through SAP.
  stage           TEXT NOT NULL DEFAULT 'awaiting_supplier'
                  CHECK (stage IN ('awaiting_supplier', 'submitted', 'validated',
                                   'returned', 'closed')),
  returned_to     TEXT CHECK (returned_to IN ('buyer', 'ops', 'supplier')),

  -- WHERE THE LINE IS IN SAP, mirrored in by hand.
  --
  -- A second column rather than more values on `stage`, because the two answer different
  -- questions and move independently: a line can be closed in the portal and still be sitting
  -- at "PO under approval" in SAP. The Kuwait workbooks prove the vocabulary -- across ~1,500
  -- rows the STATUS column holds PR under approval, Approved, PO under approval, Pending GRN,
  -- GRN Completed and Cancelled, and nothing else except casing drift, one typo
  -- ("PO Under Apporval") and a stray number. Normalised here so none of that survives import.
  erp_status      TEXT CHECK (erp_status IN ('pr_under_approval', 'approved',
                                             'po_under_approval', 'pending_grn',
                                             'grn_completed', 'cancelled')),

  -- Typed by the buyer. There is no ERP integration yet; when there is, these three stop being
  -- hand-maintained and this comment is the thing to delete.
  pr_number       TEXT,
  po_number       TEXT,

  remarks         TEXT,

  submitted_by    TEXT,                        -- the supplier address that was verified
  submitted_at    TIMESTAMPTZ,
  validated_by    TEXT,                        -- NESR email
  validated_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, service_line_id)
);

CREATE INDEX IF NOT EXISTS rrsm_cycle_lines_stage ON rrsm_cycle_lines (cycle_id, stage);
CREATE INDEX IF NOT EXISTS rrsm_cycle_lines_po ON rrsm_cycle_lines (po_number)
  WHERE po_number IS NOT NULL;

/* ─── How a supplier gets in ─────────────────────────────────────────────────────────────── */

-- One-time codes for the supplier submission page.
--
-- Deliberately the same mechanism as `soa_upload_codes`, because the problem is the same one: the
-- link identifies a supplier and a cycle, it does not prove who is holding it, and anyone the
-- mail was forwarded to has the same URL. So the holder proves they can read one of the addresses
-- the mail actually went to.
--
-- The code is never stored. A row holds its SHA-256, so a reader of this table cannot use what
-- they find. `attempts` caps guessing, `expires_at` is checked server-side rather than trusted
-- from a countdown on the page, and `consumed_at` makes a code single-use. Rate limiting on
-- issuing sits on `created_at`: without it the page is a way to send someone else's inbox an
-- unbounded number of emails.
CREATE TABLE IF NOT EXISTS rrsm_access_codes (
  id            SERIAL PRIMARY KEY,
  cycle_id      INTEGER NOT NULL REFERENCES rrsm_cycles(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL REFERENCES rrsm_suppliers(code) ON DELETE CASCADE,

  email         TEXT NOT NULL,                 -- which address it went to, so a submission has an author
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,

  -- Held by the browser once a code is accepted, so a verified session outlives the short code
  -- window without keeping the code itself alive.
  session_token      UUID,
  session_expires_at TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrsm_access_codes_lookup
  ON rrsm_access_codes (cycle_id, supplier_code, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rrsm_access_codes_session
  ON rrsm_access_codes (session_token) WHERE session_token IS NOT NULL;

/* ─── Audit ──────────────────────────────────────────────────────────────────────────────── */

-- Every stage change, with who and why.
--
-- Separate from the row it describes, because `rrsm_cycle_lines.stage` answers "where is this
-- now" and an auditor's question is "who moved it, when, and what did they say". Keeping only the
-- current stage loses the second one permanently.
CREATE TABLE IF NOT EXISTS rrsm_activity_log (
  id            BIGSERIAL PRIMARY KEY,
  cycle_line_id INTEGER REFERENCES rrsm_cycle_lines(id) ON DELETE CASCADE,
  cycle_id      INTEGER REFERENCES rrsm_cycles(id) ON DELETE CASCADE,
  actor         TEXT NOT NULL,                 -- NESR email, or the supplier address that verified
  action        TEXT NOT NULL,                 -- 'submitted', 'validated', 'returned', 'po_recorded'
  from_stage    TEXT,
  to_stage      TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrsm_activity_log_line
  ON rrsm_activity_log (cycle_line_id, created_at DESC);
