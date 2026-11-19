-- RRSM 009: each supplier's own default for the documents an invitation asks for.
--
-- The buyer ticks Delivery Note / Timesheet per supplier on the Supplier validation page, and
-- what they untick is remembered for the next cycle (user decision, 19 Nov 2026). The choice for
-- one cycle still lives on that cycle's link (008); this is the default a new link starts from.
-- Both TRUE by default: a supplier owes both unless a buyer says otherwise.

ALTER TABLE rrsm_suppliers
  ADD COLUMN IF NOT EXISTS requires_delivery_note BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS requires_timesheet     BOOLEAN NOT NULL DEFAULT TRUE;
