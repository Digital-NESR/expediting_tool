/*
 * Who put the file there: the supplier, or a champion on their behalf.
 *
 * The distinction has existed in the code since the supplier portal was built — `storeStatement`
 * takes a `selfService` flag and both call sites set it — but it was only ever spent on the
 * wording of an evidence-log line and then thrown away. The submission row itself could not say
 * how it arrived, so the consolidated workbook could not tell AP either, and "did this supplier
 * answer us, or did our champion chase it up and file it for them" is exactly what AP wants to
 * know when a balance is queried.
 *
 * Three routes, and this column plus `kind` describe all of them:
 *   supplier_portal + workbook  — the happy path, the supplier filled the template themselves
 *   champion       + workbook   — the champion filed the spreadsheet for them
 *   champion       + email      — the champion filed the correspondence instead
 * and a vendor can now hold one of each kind at once, so champion + both is the fourth.
 *
 * ── The backfill ───────────────────────────────────────────────────────────
 * A supplier uploads through a tokenised link and authenticates with a one-time code sent to
 * their own address, so `uploaded_by` is the supplier's contact. A champion is a NESR user and is
 * therefore in `country_users`. That rule splits the existing 394 rows 308/86.
 *
 * Checked against an independent witness before being relied on: `evidence_log` recorded the same
 * distinction in prose all along ('SOA uploaded by supplier' against 'SOA received'), and it
 * counts 308 supplier uploads. The two agree exactly, which is why this is a backfill rather than
 * a guess left as NULL.
 */
ALTER TABLE soa_submissions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20);

UPDATE soa_submissions s
   SET source = 'champion'
 WHERE s.source IS NULL
   AND EXISTS (
     SELECT 1 FROM country_users cu WHERE LOWER(cu.email) = LOWER(s.uploaded_by)
   );

/* Everything else came in through the portal: the only other way a row gets here is a supplier
   following their own link, and `uploaded_by` is then the address the one-time code went to. */
UPDATE soa_submissions
   SET source = 'supplier_portal'
 WHERE source IS NULL;

ALTER TABLE soa_submissions
  ALTER COLUMN source SET DEFAULT 'champion';

/* Reads are "the current submissions for this entry", and the workbook now asks for them by kind
   as well, so the index carries both. */
CREATE INDEX IF NOT EXISTS idx_soa_submissions_entry_kind
  ON soa_submissions (vendor_cycle_entry_id, kind)
  WHERE superseded_at IS NULL;
