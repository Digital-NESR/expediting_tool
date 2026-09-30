-- Why a vendor was closed without a statement.
--
-- Required for `nil_balance` and optional for `non_responder`, enforced in the action rather than
-- here: a column cannot see which status a row is moving to, and a CHECK that fires on every
-- update would refuse the perfectly ordinary case of a nil-balance vendor whose note was written
-- in the same statement.
--
-- It matters because a nil-balance vendor adds its whole balance to the coverage figure the
-- quarter is judged on. An auditor asking "on what basis was this supplier counted as reconciled"
-- has to get the champion's own words, from the moment they made the call, and not a reconstruction.
ALTER TABLE vendor_cycle_entries ADD COLUMN IF NOT EXISTS resolution_note TEXT;

COMMENT ON COLUMN vendor_cycle_entries.resolution_note IS
  'Champion''s justification for closing this vendor without a statement. Required for nil_balance.';
