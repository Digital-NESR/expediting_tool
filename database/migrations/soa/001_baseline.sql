/*
 * soa_consolidation — baseline schema.
 *
 * Unlike the other 001 baselines in this folder, this one was not lifted out of runtime DDL. The
 * schema already existed on the server, designed before the tool was wired up, and this file is a
 * faithful transcription of it so that the structure lives in the repo rather than only in the
 * database. It is written with `IF NOT EXISTS` throughout, so applying it to the server it was
 * transcribed from is a no-op — which is exactly how it was verified.
 *
 * The model, in one paragraph: a `cycle` is a reporting period (a quarter) and carries its own
 * thresholds, so changing the coverage target next quarter does not rewrite history. Each country
 * runs that cycle independently — `country_cycles` — and within it each in-scope vendor gets one
 * `vendor_cycle_entries` row carrying the amount being confirmed and where the chase has got to.
 * `supplier_po_extract` is the snapshot of PO data the scope was drawn from, kept per cycle so the
 * numbers a champion saw can be reproduced later. `evidence_log` is append-only and is the point
 * of the whole exercise: an auditor asking "did you chase this vendor twice" needs an answer.
 *
 * PO figures are NOT stored here beyond that snapshot. They come from `historic_spend` in
 * sourceguide_db — GRN'd lines, goods actually received, which is what a statement of account is
 * reconciled against.
 */

/* ── Enums ──────────────────────────────────────────────────────────────────
   Postgres has no CREATE TYPE IF NOT EXISTS, so each is guarded by a catalogue
   lookup. A plain IF, not an exception handler: handlers open a subtransaction,
   and a later migration adding a value to one of these could not then run in the
   same transaction. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'country_cycle_status') THEN
    CREATE TYPE country_cycle_status AS ENUM (
      'not_started', 'in_progress', 'requests_sent', 'reminders_sent', 'consolidating', 'handed_off'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_cycle_status') THEN
    CREATE TYPE vendor_cycle_status AS ENUM ('requested', 'reminded', 'received', 'non_responder');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'soa_user_role') THEN
    CREATE TYPE soa_user_role AS ENUM ('champion', 'manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_type') THEN
    CREATE TYPE evidence_type AS ENUM ('info', 'upload', 'reminder', 'scope', 'email', 'handoff');
  END IF;
END
$$;

/* ── Cycles ─────────────────────────────────────────────────────────────────
   The thresholds are columns rather than constants because they are policy, and
   policy changes. SOP NESR-SC-01-GR2PAY currently sets 70% quarterly and 95% at
   year end, with vendors in scope above $250,000 of receipted spend. */
CREATE TABLE IF NOT EXISTS cycles (
  id                    BIGSERIAL PRIMARY KEY,
  label                 VARCHAR(20)  NOT NULL UNIQUE,
  period_start          DATE         NOT NULL,
  period_end            DATE         NOT NULL,
  submission_deadline   DATE         NOT NULL,
  coverage_target_pct   NUMERIC      NOT NULL DEFAULT 70,
  year_end_target_pct   NUMERIC      NOT NULL DEFAULT 95,
  vendor_threshold_usd  NUMERIC      NOT NULL DEFAULT 250000,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/* ── Countries ──────────────────────────────────────────────────────────────
   Seeded in 003 from the distinct countries present in historic_spend, using
   SourceGuide's country codes where one exists. */
CREATE TABLE IF NOT EXISTS countries (
  id          VARCHAR(8)   PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/* One country's run at one cycle. The unique constraint is what makes a country's
   progress a single fact rather than something to be reconciled across rows. */
CREATE TABLE IF NOT EXISTS country_cycles (
  id             BIGSERIAL PRIMARY KEY,
  cycle_id       BIGINT               NOT NULL REFERENCES cycles(id),
  country_id     VARCHAR(8)           NOT NULL REFERENCES countries(id),
  status         country_cycle_status NOT NULL DEFAULT 'not_started',
  handed_off_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, country_id)
);

/* Who may do what, per country. The primary key spans all three columns, so one
   person can hold a role in several countries and a country can have several
   champions. 002 relaxes country_id to allow a grant that spans every country. */
CREATE TABLE IF NOT EXISTS country_users (
  email       VARCHAR(200)  NOT NULL,
  name        VARCHAR(150)  NOT NULL,
  country_id  VARCHAR(8)    NOT NULL REFERENCES countries(id),
  role        soa_user_role NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (email, country_id, role)
);
CREATE INDEX IF NOT EXISTS idx_country_users_country ON country_users (country_id);

/* A vendor as this tool knows it. `vendor_no` is the SAP supplier code, which in
   historic_spend is confusingly held in the column named `supplier` (that table's
   `supplier` and `supplier_id` labels are swapped at source). */
CREATE TABLE IF NOT EXISTS vendors (
  id                BIGSERIAL PRIMARY KEY,
  country_id        VARCHAR(8)   NOT NULL REFERENCES countries(id),
  vendor_no         VARCHAR(30)  NOT NULL,
  name              VARCHAR(200) NOT NULL,
  default_currency  VARCHAR(3)   NOT NULL DEFAULT 'USD',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (country_id, vendor_no)
);
CREATE INDEX IF NOT EXISTS idx_vendors_country ON vendors (country_id);

/* One vendor's chase within one country's cycle: the amount being confirmed, and
   how far the correspondence has got. The three timestamps are the evidence the
   SOP asks for — that a request went out, that a reminder followed it in the
   10-14 day window, and when the statement came back. */
CREATE TABLE IF NOT EXISTS vendor_cycle_entries (
  id                BIGSERIAL PRIMARY KEY,
  country_cycle_id  BIGINT              NOT NULL REFERENCES country_cycles(id),
  vendor_id         BIGINT              NOT NULL REFERENCES vendors(id),
  open_po_amount    NUMERIC             NOT NULL,
  currency          VARCHAR(3)          NOT NULL DEFAULT 'USD',
  status            vendor_cycle_status NOT NULL DEFAULT 'requested',
  requested_at      TIMESTAMPTZ,
  reminded_at       TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  invoice_count     INTEGER             NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  UNIQUE (country_cycle_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_vendor_cycle_entries_country_cycle
  ON vendor_cycle_entries (country_cycle_id);
CREATE INDEX IF NOT EXISTS idx_vendor_cycle_entries_status
  ON vendor_cycle_entries (country_cycle_id, status);

/* The statement a vendor sent back. `file_url` is the original design; 002 adds
   the bytes alongside it so the file is served from an authenticated route like
   every other document in this app. */
CREATE TABLE IF NOT EXISTS soa_submissions (
  id                      BIGSERIAL PRIMARY KEY,
  vendor_cycle_entry_id   BIGINT       NOT NULL REFERENCES vendor_cycle_entries(id),
  file_name               VARCHAR(255) NOT NULL,
  file_url                TEXT         NOT NULL,
  uploaded_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  validated               BOOLEAN      NOT NULL DEFAULT FALSE,
  detected_invoice_count  INTEGER,
  detected_currency       VARCHAR(3),
  accepted_at             TIMESTAMPTZ,
  accepted_by             VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_soa_submissions_entry
  ON soa_submissions (vendor_cycle_entry_id);

/* The PO snapshot a cycle's scope was drawn from, one row per supplier per
   country. Kept so the figures a champion acted on can be reproduced months
   later, when historic_spend has moved on. */
CREATE TABLE IF NOT EXISTS supplier_po_extract (
  id             BIGSERIAL PRIMARY KEY,
  cycle_id       BIGINT       NOT NULL REFERENCES cycles(id),
  supplier_id    VARCHAR(20)  NOT NULL,
  supplier_name  VARCHAR(200) NOT NULL,
  po_country     VARCHAR(100) NOT NULL,
  pos_value      NUMERIC      NOT NULL,
  sap_email_ids  TEXT,
  extracted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, supplier_id, po_country)
);
CREATE INDEX IF NOT EXISTS idx_supplier_po_extract_cycle_country
  ON supplier_po_extract (cycle_id, po_country);

/* Append-only. Nothing in this table is ever updated or deleted: it is the answer
   to "prove you chased them", and a trail that can be edited proves nothing. */
CREATE TABLE IF NOT EXISTS evidence_log (
  id                     BIGSERIAL PRIMARY KEY,
  country_cycle_id       BIGINT        NOT NULL REFERENCES country_cycles(id),
  vendor_cycle_entry_id  BIGINT        REFERENCES vendor_cycle_entries(id),
  type                   evidence_type NOT NULL,
  action                 VARCHAR(150)  NOT NULL,
  actor                  VARCHAR(200)  NOT NULL,
  detail                 TEXT          NOT NULL,
  occurred_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_log_country_cycle
  ON evidence_log (country_cycle_id, occurred_at DESC);
