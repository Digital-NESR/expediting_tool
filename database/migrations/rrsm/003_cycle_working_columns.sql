-- What the Ops and Buyer screens need that the baseline did not have.
--
-- All read off the two mockups in design/rrsm/ rather than guessed: the Monthly Asset Tracker's
-- grid has its own columns, and its master-data panel names three fields the register was
-- missing.

/* ─── Register: the master data the tracker's panel shows ─────────────────────────────────── */

-- Entity, purchasing group and plant.
--
-- The tracker shows these together as "master data" for a segment, and the Kuwait workbooks carry
-- plant on every row. Nullable: a line can be registered before anyone has looked them up, and a
-- recurrent service that is not tied to a plant has none.
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS entity           TEXT;
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS purchasing_group TEXT;
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS plant            TEXT;

/* ─── Cycle line: what Ops actually confirms ──────────────────────────────────────────────── */

-- Still on hire?
--
-- The tracker's flow is "copy last month's assets, then Ops confirm each one (still on hire,
-- days, quantity)". So the question is asked every cycle and answered per cycle -- an asset
-- off-hired in March was on hire in February, and `rrsm_service_lines.off_hire_date` records when
-- it stopped for good, not what was true in a given month. Defaults TRUE because the copy forward
-- assumes continuity and Ops are confirming, not re-entering.
ALTER TABLE rrsm_cycle_lines ADD COLUMN IF NOT EXISTS on_hire BOOLEAN NOT NULL DEFAULT TRUE;

-- Days on hire within the cycle, which is NOT the quantity.
--
-- The tracker shows Days and Qty as separate columns and multiplies neither into the other: two
-- vehicles for ten days is qty 2, days 10. Keeping days out of `qty` is what lets the monthly
-- rate stay a monthly rate; a part-month is priced by whoever reads this, not by silently
-- scaling the quantity.
ALTER TABLE rrsm_cycle_lines ADD COLUMN IF NOT EXISTS days NUMERIC(6, 2);

-- What the supplier billed, against what Ops validated.
--
-- The tracker's GRN check is one sentence -- "invoice must match validated" -- and it needs both
-- numbers side by side to say so. The validated figure is already here as the generated `value`;
-- this is the other half. Null until an invoice arrives, which is most of the cycle.
ALTER TABLE rrsm_cycle_lines ADD COLUMN IF NOT EXISTS supplier_invoice NUMERIC(16, 3);

-- A free note per line, which the tracker shows beside the asset and the workbooks keep as
-- COMMENTS. Distinct from `remarks`, which is the supplier's: this one is Ops'.
ALTER TABLE rrsm_cycle_lines ADD COLUMN IF NOT EXISTS ops_note TEXT;

-- Finding last month's row for the "vs last month" column is the single most repeated lookup on
-- the Ops screen, and it goes service line -> previous cycle.
CREATE INDEX IF NOT EXISTS rrsm_cycle_lines_service_line
  ON rrsm_cycle_lines (service_line_id, cycle_id);
