/*
 * tite — 001 baseline
 *
 * The schema as it stood on the day migrations were adopted for this database. Both statements
 * below are lifted verbatim from the runtime DDL that used to run on the request path:
 * `ensureTiteActivityLogSchema()` in src/lib/tite-documents.ts, a hand-rolled
 * `let activityLogSchemaReady` memo that re-ran on the first TI-TE write every serverless
 * instance served, and that had to be awaited BEFORE any transaction opened because a failing
 * ALTER inside one would abort the whole unit of work.
 *
 * It is idempotent by construction — `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`,
 * exactly as they were when they ran on every cold start — so applying this file to the
 * already-live nesr_tite_db, where both are already in place, records the version and changes
 * nothing. That is what makes it safe to adopt on a database that is already serving traffic.
 * Nothing here was rewritten or tidied up on the way across: a difference between this file and
 * the live database would be a bug, not an improvement.
 *
 * This is a baseline, NOT a from-scratch schema. The TI-TE tables — `shipments`,
 * `shipment_documents`, `shipment_activity_log` — are older than this app's runtime DDL and were
 * created directly against the database, so their CREATEs do not live in this repo and are not
 * reconstructed here. The ALTER below assumes `shipment_activity_log` already exists; on an empty
 * database this file fails on it.
 *
 * `shipment_documents.file_content` is BYTEA — document bytes stored in the row. The audit tracks
 * that separately as a storage problem wanting a blob store; it is not addressed here, and this
 * baseline deliberately does not restate or change that table.
 *
 * Runs inside a transaction: `CREATE INDEX` without CONCURRENTLY is transactional, and nothing
 * else here is one of the statements Postgres refuses to run in one.
 */

/* ── shipment_activity_log: stable identity on log rows ────────────────────────
   `shipment_activity_log.performed_by` is a free-text display name. Keying the
   recent-activity feed on it breaks the moment someone is renamed in Azure AD,
   and leaks one colleague's activity to another of the same name. The email is
   the stable identity, so it is stored alongside.
--------------------------------------------------------------------------- */

ALTER TABLE shipment_activity_log ADD COLUMN IF NOT EXISTS performed_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_shipment_activity_log_email
  ON shipment_activity_log (performed_by_email, performed_at DESC);
