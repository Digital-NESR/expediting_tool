-- RRSM 019: the Ops validator is chosen per line by the buyer, not appointed per country
-- (user decision, 24 Nov 2026). The "Ops validator" role in Admin -> RRSM goes away.
--
--   rrsm_service_lines.ops_validator_*   the line's usual validator, remembered so next month
--                                        starts with the same person filled in
--   rrsm_cycle_lines.ops_validator_*     who validates this line this month (copied from the
--                                        register when the month opens; the buyer may change it)
--   rrsm_cycle_lines.ops_sent_at / _by   when and by whom it was sent. Only a SENT line gives the
--                                        validator access: they see that line and its supplier's
--                                        documents, nothing else in RRSM.

ALTER TABLE rrsm_service_lines
  ADD COLUMN IF NOT EXISTS ops_validator_email TEXT,
  ADD COLUMN IF NOT EXISTS ops_validator_name  TEXT;

ALTER TABLE rrsm_cycle_lines
  ADD COLUMN IF NOT EXISTS ops_validator_email TEXT,
  ADD COLUMN IF NOT EXISTS ops_validator_name  TEXT,
  ADD COLUMN IF NOT EXISTS ops_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_sent_by         TEXT;

-- Access is decided from this on every request (currentRrsmActor), so it is indexed.
CREATE INDEX IF NOT EXISTS rrsm_cycle_lines_ops_validator_idx
  ON rrsm_cycle_lines (lower(ops_validator_email))
  WHERE ops_sent_at IS NOT NULL;
