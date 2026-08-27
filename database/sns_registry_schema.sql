-- ============================================================================
-- S&S Registry (Single & Sole Source) — schema for sns_registry_db
--
-- Idempotent: safe to re-run. Applied by `npm run sns:db:init`, which also
-- creates the database if it does not exist and seeds reference data.
--
-- Two concerns live here:
--   1. Access control — who may open the tool and in what role/countries.
--      Mirrors the catalog_access_requests pattern (one row per user,
--      upserted on re-request, reviewed from the platform /admin console).
--   2. Registry data — the records themselves, their scope, and their audit
--      trail, plus the reference data (taxonomy/countries/segments/reasons)
--      that the New Record wizard picks from.
-- ============================================================================

/* ─── Access requests ─────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS sns_access_requests (
  user_email          TEXT PRIMARY KEY,
  display_name        TEXT,
  job_title           TEXT,
  status              TEXT NOT NULL DEFAULT 'Pending',
  requested_role      TEXT NOT NULL,
  approved_role       TEXT,
  requested_countries TEXT[] NOT NULL DEFAULT '{}',
  approved_countries  TEXT[] NOT NULL DEFAULT '{}',
  reason              TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT
);

CREATE INDEX IF NOT EXISTS sns_access_requests_status_idx
  ON sns_access_requests (status);

/* ─── Reference data ──────────────────────────────────────────── */

-- Taxonomy is a fixed four-level tree: category › sub-category › family ›
-- commodity. Deletes cascade down so removing a category from the admin
-- console cannot leave orphaned branches.

CREATE TABLE IF NOT EXISTS sns_category (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  spend_type TEXT NOT NULL CHECK (spend_type IN ('Direct', 'Indirect')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sns_sub_category (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES sns_category (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS sns_family (
  id              SERIAL PRIMARY KEY,
  sub_category_id INTEGER NOT NULL REFERENCES sns_sub_category (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (sub_category_id, name)
);

CREATE TABLE IF NOT EXISTS sns_commodity (
  id         SERIAL PRIMARY KEY,
  family_id  INTEGER NOT NULL REFERENCES sns_family (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (family_id, name)
);

-- `code` is the three-letter token that appears inside issued Registry IDs
-- (SGL-KWT-2026-0001), so it must never change once records reference it.
CREATE TABLE IF NOT EXISTS sns_country (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sns_segment (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sns_reason (
  id             SERIAL PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification IN ('SGL', 'SOL')),
  name           TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (classification, name)
);

/* ─── Registry records ────────────────────────────────────────── */

-- `rid` is the internal surrogate key used for navigation and joins.
-- `registry_id` is the human-facing ID, issued only at Level 2 sign-off —
-- NULL until then, which is why it cannot serve as the primary key.
CREATE TABLE IF NOT EXISTS sns_record (
  rid            SERIAL PRIMARY KEY,
  registry_id    TEXT UNIQUE,
  classification TEXT NOT NULL CHECK (classification IN ('SGL', 'SOL')),
  country        TEXT NOT NULL,
  scope_level    TEXT NOT NULL CHECK (scope_level IN ('Family', 'Commodity')),
  supplier_id    TEXT NOT NULL DEFAULT '',
  supplier_name  TEXT NOT NULL DEFAULT '',
  reason         TEXT NOT NULL DEFAULT '',
  justification  TEXT NOT NULL DEFAULT '',
  base_status    TEXT NOT NULL DEFAULT 'Draft'
                 CHECK (base_status IN ('Draft', 'Pending Level 1', 'Pending Level 2',
                                        'Active', 'Extended', 'Expired', 'Rejected')),
  spend          BIGINT NOT NULL DEFAULT 0,
  po_count       INTEGER NOT NULL DEFAULT 0,
  evidence       TEXT NOT NULL DEFAULT 'No attachment',
  issue_date     DATE,
  expiry_date    DATE,
  requestor      TEXT NOT NULL DEFAULT '',
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sns_record_country_idx ON sns_record (country);
CREATE INDEX IF NOT EXISTS sns_record_status_idx  ON sns_record (base_status);
CREATE INDEX IF NOT EXISTS sns_record_expiry_idx  ON sns_record (expiry_date);

-- Scope nodes are stored as denormalised text, not FKs into the taxonomy
-- tables. A record is a compliance artefact: it must keep the scope exactly
-- as it read at submission, even if an admin later renames or deletes that
-- branch of the taxonomy.
CREATE TABLE IF NOT EXISTS sns_record_node (
  id           SERIAL PRIMARY KEY,
  record_rid   INTEGER NOT NULL REFERENCES sns_record (rid) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  family       TEXT NOT NULL,
  commodity    TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sns_record_node_record_idx
  ON sns_record_node (record_rid);

CREATE TABLE IF NOT EXISTS sns_record_segment (
  id         SERIAL PRIMARY KEY,
  record_rid INTEGER NOT NULL REFERENCES sns_record (rid) ON DELETE CASCADE,
  segment    TEXT NOT NULL,
  UNIQUE (record_rid, segment)
);

CREATE INDEX IF NOT EXISTS sns_record_segment_record_idx
  ON sns_record_segment (record_rid);

-- Append-only audit trail. Every status transition writes one row.
CREATE TABLE IF NOT EXISTS sns_record_history (
  id         SERIAL PRIMARY KEY,
  record_rid INTEGER NOT NULL REFERENCES sns_record (rid) ON DELETE CASCADE,
  step       TEXT NOT NULL,
  actor      TEXT NOT NULL DEFAULT '',
  actor_email TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sns_record_history_record_idx
  ON sns_record_history (record_rid, id);
