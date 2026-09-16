/*
 * catalog-manager — baseline schema.
 *
 * This is the schema as it stood on the day migrations were adopted, lifted verbatim from the
 * runtime DDL that used to live in `initCatalogManagerSchema()` in src/app/actions/catalog-manager.ts
 * and re-run on every serverless cold start behind a hand-rolled `let schemaPromise` memo.
 *
 * It is idempotent by construction: every statement is `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`,
 * exactly as it was when it ran on every boot, so applying this file to the already-live
 * catalog_manager_db is a no-op. That is what makes it safe to adopt on a database that already
 * has this schema. Nothing here was "tidied up" on the way across — a difference between this file
 * and the live database would be a bug, not an improvement.
 *
 * Two statements are not `CREATE`/`ALTER` and are here deliberately, because they were part of the
 * same boot-time bootstrap and the schema is wrong without them:
 *
 *  - the `setval` that parks catalog_entry_code_seq above the highest code already in the table;
 *  - the trigram block, which was wrapped in try/catch in TypeScript (pg_trgm is best-effort). It
 *    is wrapped in a DO ... EXCEPTION block here so it keeps that best-effort behaviour: a role
 *    without rights to create the extension degrades PIR search to a sequential scan, as before,
 *    instead of failing the whole migration. The subtransaction the block opens absorbs the error
 *    without poisoning the outer migration transaction.
 *
 * This file runs inside a transaction — nothing in it is one of the forms Postgres refuses there.
 *
 * Reference/master data (currencies, countries, UoMs, the spend taxonomy, service activities, the
 * default approval threshold, and the supplier directory copied from the expediting DB) is NOT in
 * here. It is seeded from TypeScript constants and a cross-database read at runtime, so it is data,
 * not schema, and it stays where it was.
 */

/* ---------------------------------------------------------------------------
   Master data tables. Mirrors the ERD: country / currency / unit_of_measure /
   spend_category / spend_subcategory / app_user / supplier / catalog_entry /
   rate_version / entry_document / approval_decision / audit_log + country_approver.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS currency (
  code VARCHAR(3) PRIMARY KEY,
  decimals SMALLINT NOT NULL DEFAULT 2,
  usd_rate NUMERIC(14,6) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS country (
  code VARCHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  default_currency VARCHAR(3),
  flag TEXT,
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS unit_of_measure (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS spend_category (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'Indirect',
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS spend_subcategory (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES spend_category(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS app_user (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  country_code VARCHAR(2),
  role TEXT NOT NULL DEFAULT 'Viewer'
);

CREATE TABLE IF NOT EXISTS supplier (
  id SERIAL PRIMARY KEY,
  vendor_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  accountable_manager TEXT
);

CREATE TABLE IF NOT EXISTS catalog_entry (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  country_code VARCHAR(2) NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES supplier(id),
  category_id INTEGER REFERENCES spend_category(id),
  subcategory_id INTEGER REFERENCES spend_subcategory(id),
  uom_id INTEGER REFERENCES unit_of_measure(id),
  spend_type TEXT,
  family TEXT,
  commodity TEXT,
  unspsc_code TEXT,
  item_name TEXT NOT NULL,
  description TEXT,
  sirion_contract_id TEXT,
  sirion_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  tier_label TEXT NOT NULL DEFAULT 'Tier 1 — Auto',
  current_version_no INTEGER NOT NULL DEFAULT 1,
  manager TEXT,
  approver_name TEXT,
  approval_comment TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_by TEXT,
  modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Entry codes (CAT-nnnn) come from a sequence, not SELECT MAX(...)+1: two concurrent creates (or
-- two people importing at once) used to read the same max and mint the same code, and one request
-- died on the unique key. nextval is atomic and never hands the same number out twice.
CREATE SEQUENCE IF NOT EXISTS catalog_entry_code_seq START WITH 1040;

-- Park the sequence above the highest code already in the table. Safe to re-run on every boot:
-- it takes the GREATEST of (highest existing code, where the sequence already is, the 1039 floor),
-- so it can only ever move forwards — never back onto a number that has already been handed out.
SELECT setval('catalog_entry_code_seq', GREATEST(
    (SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 0) FROM catalog_entry WHERE code ~ '^CAT-[0-9]+$'),
    (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM catalog_entry_code_seq),
    1039
  ), TRUE);

CREATE TABLE IF NOT EXISTS rate_version (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  unit_price NUMERIC(16,3) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  effective_date DATE NOT NULL,
  expiry_date DATE,
  change_reason TEXT,
  modified_by TEXT,
  modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entry_id, version_no)
);

CREATE TABLE IF NOT EXISTS entry_document (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  doc_type TEXT,
  size_label TEXT
);

CREATE TABLE IF NOT EXISTS approval_decision (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  decided_by TEXT,
  decision TEXT NOT NULL,
  tier SMALLINT NOT NULL DEFAULT 2,
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  user_name TEXT,
  detail TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- People who approve for certain countries, linked to app_user.
CREATE TABLE IF NOT EXISTS country_approver (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL,
  spend_category_id INTEGER REFERENCES spend_category(id),
  tier SMALLINT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- partial unique: one row per (user, country, category) — NULL category treated as "all".
CREATE UNIQUE INDEX IF NOT EXISTS country_approver_uniq
  ON country_approver (user_id, country_code, COALESCE(spend_category_id, 0));

-- Self-service role-upgrade requests, reviewed from the platform /admin console (mirrors the
-- procure_guard_access_requests pattern: one row per user, upserted on re-request).
CREATE TABLE IF NOT EXISTS catalog_access_requests (
  user_email TEXT PRIMARY KEY,
  display_name TEXT,
  job_title TEXT,
  country_code VARCHAR(2),
  status TEXT NOT NULL DEFAULT 'Pending',
  requested_role TEXT NOT NULL,
  approved_role TEXT,
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- Audit trail records the AUTHENTICATED actor's email alongside the (spoofable) display name.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Logistics fields (added later): Incoterms 2020 code + supplier lead time in days.
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS incoterms TEXT;
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS incoterms_location TEXT;
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;

-- Real uploaded proof-of-agreement files are stored inline as a data URL (local-first).
ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS data_url TEXT;
ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Approval thresholds — a global default plus optional per-country / per-category overrides.
CREATE TABLE IF NOT EXISTS approval_threshold (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(2),
  spend_category_id INTEGER REFERENCES spend_category(id),
  threshold_usd NUMERIC(16,2) NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_threshold_uniq
  ON approval_threshold (COALESCE(country_code, ''), COALESCE(spend_category_id, 0));

-- SAP service-activity reference list (every service in the system).
CREATE TABLE IF NOT EXISTS service_activity (
  activity_number TEXT PRIMARY KEY,
  short_text TEXT NOT NULL,
  base_uom TEXT
);

-- Supplier directory — the SAP supplier master, owned by the catalog DB (seeded once
-- from the expediting DB, then queried locally so runtime never depends on that DB).
CREATE TABLE IF NOT EXISTS supplier_directory (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emails TEXT,
  additional_email TEXT
);

CREATE INDEX IF NOT EXISTS supplier_directory_name_idx ON supplier_directory (LOWER(name));

-- PIR / Inventory catalog — a READ-ONLY mirror of SAP Purchasing Info Records, loaded by an
-- external n8n job (Power BI → truncate + insert). The app never writes to this table.
CREATE TABLE IF NOT EXISTS pir_catalog (
  info_record_number TEXT,
  product_number TEXT,
  material_description TEXT,
  material_group TEXT,
  suppliers_account_number TEXT,
  supplier_name TEXT,
  purchasing_organization TEXT,
  purchase_org_description TEXT,
  purchasing_group TEXT,
  plant TEXT,
  country TEXT,
  order_unit TEXT,
  base_unit_of_measure TEXT,
  numerator_for_conversion NUMERIC,
  unit_price NUMERIC,
  currency_key TEXT,
  standard_qty NUMERIC,
  planned_delivery_time_days NUMERIC,
  overdelivery_tolerance_limit NUMERIC,
  shipping_instructions TEXT,
  minimum_remaining_shelf_life NUMERIC,
  incoterms TEXT,
  incoterms_location_1 TEXT,
  valid_days NUMERIC,
  valid_till_expiry_date TEXT,
  expiring_in TEXT,
  status TEXT,
  deletion_flag TEXT,
  material_supplier TEXT,
  material_supplier_org TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perf indexes for the read-heavy PIR mirror. TRUNCATE (used by the n8n loader) keeps indexes,
-- so these survive the nightly reload. btree covers the list sort + exact-match filters; the
-- trigram GIN indexes below make the dashboard's ILIKE '%…%' search fast (a plain btree can't).
CREATE INDEX IF NOT EXISTS pir_supplier_idx ON pir_catalog (supplier_name);
CREATE INDEX IF NOT EXISTS pir_product_idx ON pir_catalog (product_number);
CREATE INDEX IF NOT EXISTS pir_country_idx ON pir_catalog (country);
CREATE INDEX IF NOT EXISTS pir_synced_idx ON pir_catalog (synced_at);

-- Durable material-name store. pir_catalog is TRUNCATEd + reloaded nightly by n8n, and some
-- mornings the SUPPLYCHAIN lookup returns blank descriptions (Power BI not fully refreshed at
-- load time) — which used to wipe good names. This table accumulates every non-blank name we
-- have ever seen (keyed by product number) and is NEVER truncated, so reads can fall back to the
-- last-known-good name when a reload brings a material in without one.
CREATE TABLE IF NOT EXISTS pir_name_cache (
  product_number TEXT PRIMARY KEY,
  material_description TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram search indexes. These need pg_trgm, and creating an extension needs a privilege the
-- application role does not always have — so this was best-effort in the code it came from, and
-- it stays best-effort here. The DO block's EXCEPTION handler opens a subtransaction, so a role
-- that cannot install pg_trgm falls back to btree-only (PIR search still works, it just scans)
-- rather than failing the whole migration.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS pir_desc_trgm ON pir_catalog USING gin (material_description gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS pir_supplier_trgm ON pir_catalog USING gin (supplier_name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS pir_product_trgm ON pir_catalog USING gin (product_number gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%) — PIR search falls back to a sequential scan', SQLERRM;
END
$$;
