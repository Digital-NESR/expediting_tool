-- ============================================================================
-- Periodic review becomes a reissue rather than an extension in place.
--
-- A renewal now raises a NEW record, carrying the previous one's values but
-- editable, and mints its own Registry ID. That is deliberate: the ID embeds
-- the issue and expiry window it was minted with, so extending the expiry
-- underneath a fixed ID left the ID describing a period it no longer covered.
--
-- `renewal_of_rid` is the link back. It is the clone that points at its parent
-- because the clone is written once, at creation, while the parent may be
-- renewed more than once over its life.
--
-- The parent is NOT deleted or rewritten. It keeps its own ID, its history and
-- its documents, and is closed only when the replacement is actually published
-- -- so an ID already quoted on a SAP PO stays valid and referenceable right
-- up to its real expiry date, not from the moment someone starts a review.
-- ============================================================================

ALTER TABLE sns_record
  ADD COLUMN IF NOT EXISTS renewal_of_rid INTEGER REFERENCES sns_record(rid);

COMMENT ON COLUMN sns_record.renewal_of_rid IS
  'The record this one was raised to replace, set when a periodic review is started. Null for a first-time record.';

-- Reading a record's lineage means asking "what replaced me", which is a
-- lookup by parent, not by child.
CREATE INDEX IF NOT EXISTS idx_sns_record_renewal_of
  ON sns_record (renewal_of_rid)
  WHERE renewal_of_rid IS NOT NULL;

-- A record may only be superseded once. Two live replacements for one parent
-- would leave the registry unable to say which ID is current -- exactly the
-- ambiguity the registry exists to remove. Rejected and Closed clones are
-- excluded so a refused renewal can be retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sns_record_one_live_renewal
  ON sns_record (renewal_of_rid)
  WHERE renewal_of_rid IS NOT NULL
    AND base_status NOT IN ('Rejected', 'Closed');
