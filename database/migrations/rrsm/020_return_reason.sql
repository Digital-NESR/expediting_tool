-- RRSM 020: a Return carries a reason (user decision, 24 Nov 2026).
--
-- An Ops validator who returns a line must say why. The line goes back to the buyer, who is
-- emailed the reason, sorts it out and sends it to Ops again. A buyer returning a line to Ops
-- gives a reason too, and the validator is emailed. The reason stays on the line until it is sent
-- or submitted again; every return is also in rrsm_activity_log.

ALTER TABLE rrsm_cycle_lines
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS returned_by   TEXT,
  ADD COLUMN IF NOT EXISTS returned_at   TIMESTAMPTZ;
