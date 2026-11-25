-- RRSM 021: the GR (goods receipt / service entry) document number on each line (user request,
-- 25 Nov 2026), shown on PR & PO in place of the invoice column.
--
-- Filled in by RRSM from SAP, never typed: Materials DB's core.ub_grir holds the GR/IR items with
-- document type WE (Goods Receipt) per PO. That table lists OPEN GR/IR items, so a GR drops out of
-- it once its invoice clears; saving it here is what keeps it on the line afterwards. Several GRs
-- against one PO are kept comma-separated.

ALTER TABLE rrsm_cycle_lines
  ADD COLUMN IF NOT EXISTS gr_number TEXT;
