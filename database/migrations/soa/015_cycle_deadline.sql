-- Two deadlines, because a cycle has two.
--
-- `submission_deadline` is the date a SUPPLIER is given: it goes into the letter, and it is what
-- the chase is measured against. `cycle_deadline` is the date the CHAMPION is given: the day by
-- which the country has to be reconciled, closed and handed to Finance.
--
-- One column was doing both jobs, which made the second invisible. A country can be perfectly on
-- time for collection and still be late closing, and nothing in the tool could say so.
--
-- Backfilled from the collection deadline rather than defaulted to a fixed offset: an existing
-- cycle has one real date and inventing a gap after it would be a guess presented as a fact. An
-- admin sets them apart from then on.
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS cycle_deadline DATE;

UPDATE cycles SET cycle_deadline = submission_deadline WHERE cycle_deadline IS NULL;

ALTER TABLE cycles ALTER COLUMN cycle_deadline SET NOT NULL;

COMMENT ON COLUMN cycles.submission_deadline IS
  'Collection deadline: the date given to suppliers in the request letter.';
COMMENT ON COLUMN cycles.cycle_deadline IS
  'Cycle deadline: the date by which a country must be reconciled, closed and handed off.';
