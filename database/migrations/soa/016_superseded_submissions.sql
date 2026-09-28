-- A supplier who re-sends a corrected statement must not be counted twice.
--
-- Nothing marked a resend as replacing what came before, and the consolidated workbook selects
-- every parsed line for the country. So a supplier who spotted a mistake and sent the file again,
-- which is the ordinary thing for a supplier to do, put every one of their invoices into the file
-- AP works from twice, and doubled their own outstanding total in it.
--
-- Superseded rather than deleted. The first file a supplier sent is evidence of what they first
-- claimed, and the point of this tool is that an auditor can still see it. It is kept, and marked,
-- and left out of the arithmetic.
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- Repair what the missing rule already let through: every statement for an entry except its
-- newest. Ordered by (uploaded_at, id) so two uploads inside the same second still have exactly
-- one survivor, rather than both being kept and the double count surviving the fix.
UPDATE soa_submissions s
   SET superseded_at = NOW()
 WHERE s.superseded_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM soa_submissions n
      WHERE n.vendor_cycle_entry_id = s.vendor_cycle_entry_id
        AND (n.uploaded_at, n.id) > (s.uploaded_at, s.id)
   );

-- Every read that computes a figure filters on this, so it is worth an index of its own.
CREATE INDEX IF NOT EXISTS idx_soa_submissions_current
  ON soa_submissions (vendor_cycle_entry_id)
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN soa_submissions.superseded_at IS
  'Set when a later statement replaced this one. Kept as evidence, left out of every total.';
