/*
 * default — 001 baseline
 *
 * The schema as it stood on the day migrations were adopted for this database. Every statement
 * below is lifted verbatim from the runtime DDL that used to run on the request path:
 *
 *  - `ensureActiveExpeditingColumns()` in src/lib/po-expediting-schema.ts — seven ALTERs behind a
 *    hand-rolled `let activeExpeditingColumnsEnsured` memo, re-run on the first analytics,
 *    dispatch, reconciliation or supplier-portal request every serverless instance served;
 *  - the `DDL` constant in src/lib/user-photo.ts, run by an `ensureTable()` memo before the first
 *    avatar read or write of each process.
 *
 * It is idempotent by construction. Every statement is `IF NOT EXISTS` / `ADD COLUMN IF NOT
 * EXISTS`, exactly as it was when it ran on every cold start, so applying this file to the
 * already-live database — where all of it is already in place — records the version and changes
 * nothing. That is what makes it safe to adopt on a database that is already serving traffic.
 * Nothing here was rewritten or tidied up on the way across: a difference between this file and
 * the live database would be a bug, not an improvement.
 *
 * This is a baseline, NOT a from-scratch schema. `active_expediting` is older than the runtime
 * DDL — it was created directly against the database and never had a CREATE in the code — so the
 * ALTERs below assume it already exists. On an empty database this file fails on the first ALTER.
 * Writing a CREATE for that table is a separate job from adopting migrations and is deliberately
 * not attempted here.
 *
 * The two groups below came from two independent lazy memos with no ordering between them; they
 * touch different tables, so the order they appear in here is presentational only.
 *
 * Runs inside a transaction: nothing here is one of the statements Postgres refuses to run in one.
 */

/* ── active_expediting: analytics source of record ─────────────────────────────
   Columns `active_expediting` needs in order to be the analytics source of record.

   `sap_open_po_master` is truncated and reloaded nightly by n8n with ONLY the POs
   that are still open, so every analytics query that INNER JOINed it silently lost
   each expedited line whose PO had since closed — completed work vanished from the
   totals, the supplier breakdowns and the response-rate denominators. The fix is to
   snapshot the line's descriptive and quantitative fields at dispatch time (the same
   way `supplier_name` / `supplier_id` already were) and read those in analytics,
   LEFT JOINing the master only where genuinely live data is wanted.
--------------------------------------------------------------------------- */

-- Dispatch-time snapshot of sap_open_po_master, mirroring that table's types.
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS p_group TEXT;
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS item_description TEXT;
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS open_qty NUMERIC;
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS open_po_value_usd NUMERIC;

-- The ORIGINAL SAP delivery date at dispatch — not the supplier's revised
-- `new_delivery_date`, which already lives on this table.
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- When the SUPPLIER responded. Never touched by buyer edits: the response-time charts
-- used to read `updated_at`, which `saveBuyerComment` also bumps, so every buyer note
-- made the supplier look faster than it was. `responded_at` is written ONLY by
-- `submitSupplierUpdates`; `updated_at` stays a generic audit column.
ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

/* ── Profile photo store ───────────────────────────────────────────────────────
   The Microsoft Graph avatar used to be inlined into the session JWT as a base64
   data: URI. NextAuth encrypts the JWT into a cookie, so that one field added
   several kilobytes to EVERY request (and to every proxy decrypt). The bytes now
   live here and are served by /api/me/photo, which the session points at instead;
   the token carries a single boolean.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS user_photos (
  email        TEXT PRIMARY KEY,
  photo        BYTEA NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
