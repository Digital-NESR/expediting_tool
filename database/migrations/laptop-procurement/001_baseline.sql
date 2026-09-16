/*
 * laptop-procurement — 001 baseline
 *
 * The schema as it stood on the day migrations were adopted for this database. Every statement
 * below is lifted verbatim from the runtime DDL that used to run on the request path: the
 * `ensureLaptop*` memos in src/lib/laptop-procurement/schema.ts and `ensureCostCenterSchema` in
 * src/lib/laptopCostCenters.server.ts, which re-ran on the first request every serverless
 * instance served.
 *
 * It is idempotent by construction. Every statement is `IF NOT EXISTS` / `ADD COLUMN IF NOT
 * EXISTS`, and the one constraint change drops before it adds — exactly as it was when it ran on
 * every cold start. That is what makes this safe to apply to the already-live database, where all
 * of it is already in place: applying this baseline there records the version and changes nothing.
 *
 * This is a baseline, NOT a from-scratch schema. `laptop_requests`, `laptop_permissions` and
 * `laptop_approver_matrix` are older than the runtime DDL — they were created directly against the
 * database and never had a CREATE in the code — so the ALTERs below assume they already exist. On
 * an empty database this file fails on the first ALTER. Creating those three tables is a separate
 * job from adopting migrations and is deliberately not attempted here.
 *
 * Seed data is not part of this file. The cost-centre tables are created below; their ~2,300 rows
 * are loaded by scripts/seed-laptop-cost-centers.mjs, which stays a separate script — migrations
 * carry structure, not reference content that admins then edit at /admin/laptop.
 *
 * Runs inside a transaction: nothing here is one of the statements Postgres refuses to run in one.
 */

/* ── Approver matrix ───────────────────────────────────────────────────────────
   laptop_approver_matrix predates this app's incremental-migration pattern (its
   it_manager_2_* columns were added directly against the DB, not via code) — these two are the
   first ADD COLUMNs it ever got from the application side. */

ALTER TABLE laptop_approver_matrix ADD COLUMN IF NOT EXISTS it_manager_3_name TEXT;
ALTER TABLE laptop_approver_matrix ADD COLUMN IF NOT EXISTS it_manager_3_email TEXT;

/* ── Permissions: the role CHECK constraint ────────────────────────────────────
   laptop_permissions.role has a DB-level CHECK constraint enumerating every allowed value. It
   does not auto-follow the LaptopPermissionRole union in the TypeScript, so a role added there
   has to be added here too, or every save of a row with that role fails at the DB with a
   check-violation.

   The list is why this is a DROP/ADD rather than a plain ADD: widening an existing CHECK means
   replacing it. Reading the list left to right is reading the history —

     'Requester', 'Analyst', 'Read Only'    the original three. 'Analyst' and 'Read Only' are
                                            legacy: this app no longer issues either, but rows
                                            carrying them still exist, so they cannot be dropped
                                            from the constraint without orphaning that data.
     'IT Manager', 'Country Manager',       the approval chain, added with the approver matrix.
     'IT Director', 'Supply Chain Director'
     'Admin'                                added with the admin console.
     'Viewer'                               added last, and the reason this DDL existed at all —
                                            saving a Viewer permission row was failing at the DB
                                            until the constraint was widened to admit it. */

ALTER TABLE laptop_permissions DROP CONSTRAINT IF EXISTS laptop_permissions_role_check;
ALTER TABLE laptop_permissions ADD CONSTRAINT laptop_permissions_role_check
  CHECK (role IN ('Requester', 'Analyst', 'Read Only', 'IT Manager', 'Country Manager', 'IT Director', 'Supply Chain Director', 'Admin', 'Viewer'));

/* ── Delegation ────────────────────────────────────────────────────────────────
   The ADD COLUMNs after the CREATE are not redundant: they carry the table forward for databases
   that already had the original four-column version before starts_at / stage / country existed. */

CREATE TABLE IF NOT EXISTS laptop_delegations (
  id SERIAL PRIMARY KEY,
  delegator_email TEXT NOT NULL,
  delegator_name TEXT,
  delegate_email TEXT NOT NULL,
  delegate_name TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

-- Role-based delegation: which specific approver-matrix slot (stage + country) is being handed
-- over, rather than delegating everything the delegator happens to hold. Nullable only because
-- pre-existing rows predate these columns.
ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegate ON laptop_delegations (LOWER(delegate_email));
CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegator ON laptop_delegations (LOWER(delegator_email));

/* ── Reference number: backstop unique index ───────────────────────────────────
   So even a writer that skips the advisory lock (an older instance mid-deploy, a hand-run INSERT)
   cannot land a duplicate reference_number.

   At runtime this index was created only after checking the existing data was clean: references
   were reused once historically (see LAPTOP_REFERENCE_FLOOR), and a leftover duplicate from that
   era was logged for manual repair rather than allowed to fail the cold start on every request.
   As a migration that guard is gone on purpose. The live database is already past it — the index
   exists there, so this statement does nothing. If a database still carries duplicates, this
   migration fails loudly at deploy, which is the right place to find out; de-duplicate the
   references and re-run. */

CREATE UNIQUE INDEX IF NOT EXISTS idx_laptop_requests_reference_number ON laptop_requests (reference_number);

/* ── Request decision columns ──────────────────────────────────────────────────
   One per approval stage: IT Manager, Country Manager, IT Director, Supply Chain Director. */

ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS itm_decision TEXT;
ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS cm_decision TEXT;
ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS itd_decision TEXT;
ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS scd_decision TEXT;

/* ── Access requests ───────────────────────────────────────────────────────────
   At runtime these two ran through a wrapper that swallowed 23505 / 42P07 / 42710 — the codes two
   instances racing to create the same object hand the loser. A migration holds an advisory lock
   and runs once, so there is no race to swallow. */

CREATE TABLE IF NOT EXISTS laptop_access_requests (
  user_email TEXT PRIMARY KEY,
  display_name TEXT,
  job_title TEXT,
  department TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revoked')),
  requested_role TEXT NOT NULL DEFAULT 'Requester',
  approved_role TEXT,
  country TEXT,
  segment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_laptop_access_requests_status ON laptop_access_requests (status);

/* ── Cost centres ──────────────────────────────────────────────────────────────
   Three tables replacing what used to be two generated JSON files built from a spreadsheet that
   was never committed. Structure only: the rows are loaded by scripts/seed-laptop-cost-centers.mjs
   and thereafter edited at /admin/laptop?section=cost-centers.

   The departments unique index is keyed on (company_code, LOWER(department)) because the request
   form's lookup is case-insensitive: two departments differing only in case would make the
   cost-centre auto-fill ambiguous. */

CREATE TABLE IF NOT EXISTS laptop_cost_center_companies (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS laptop_cost_center_departments (
  id           SERIAL PRIMARY KEY,
  company_code TEXT NOT NULL
               REFERENCES laptop_cost_center_companies (code)
               ON UPDATE CASCADE ON DELETE CASCADE,
  department   TEXT NOT NULL,
  cost_center  TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT
);

CREATE TABLE IF NOT EXISTS laptop_cost_center_country_map (
  requestor_country TEXT NOT NULL,
  mapped_country    TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (requestor_country, mapped_country)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lcc_departments_company_dept
  ON laptop_cost_center_departments (company_code, LOWER(department));

CREATE INDEX IF NOT EXISTS idx_lcc_departments_company
  ON laptop_cost_center_departments (company_code);

CREATE INDEX IF NOT EXISTS idx_lcc_companies_country
  ON laptop_cost_center_companies (country);
