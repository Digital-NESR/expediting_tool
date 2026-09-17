-- ============================================================================
-- S&S Registry — the two classifications were defined the wrong way round.
--
-- Single-source is a BUSINESS DECISION: alternatives exist, NESR has chosen one
-- vendor (standardization, a master agreement, warranty preservation, a
-- strategic relationship).
--
-- Sole-source is a MARKET CONDITION: only one supplier can fulfil the
-- requirement at all (patented technology, an OEM part, a sole licensed
-- distributor, a regulatory restriction).
--
-- The seeded reason codes were filed against the inverted meanings, so every
-- reason currently under SGL belongs under SOL and vice versa. Swapping the
-- whole set is the correct operation, not a rename of individual rows: the
-- labels were transposed, the reasons themselves were never wrong.
--
-- Existing records are untouched. sns_record.reason stores the chosen reason as
-- text — a snapshot taken at submission — so a record already raised keeps
-- reading exactly as it did, which is what a compliance artefact has to do.
-- ============================================================================

-- A permutation cannot be done in one UPDATE: UNIQUE (classification, name) is
-- checked row by row, so passing through a state where an SGL row has taken a
-- name an SOL row still holds would be rejected. Going via a third value avoids
-- that, and the CHECK has to be widened to allow the third value to exist even
-- momentarily.
ALTER TABLE sns_reason DROP CONSTRAINT IF EXISTS sns_reason_classification_check;

UPDATE sns_reason SET classification = 'TMP' WHERE classification = 'SGL';
UPDATE sns_reason SET classification = 'SGL' WHERE classification = 'SOL';
UPDATE sns_reason SET classification = 'SOL' WHERE classification = 'TMP';

-- Restored exactly as the baseline declared it, so a database built from
-- 001 + 003 ends up identical to one built from 001 alone plus this swap.
ALTER TABLE sns_reason ADD CONSTRAINT sns_reason_classification_check
  CHECK (classification IN ('SGL', 'SOL'));
