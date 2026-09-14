import pool from '@/lib/db';

/**
 * Columns `active_expediting` needs in order to be the analytics source of record.
 *
 * `sap_open_po_master` is truncated and reloaded nightly by n8n with ONLY the POs
 * that are still open, so every analytics query that INNER JOINed it silently lost
 * each expedited line whose PO had since closed — completed work vanished from the
 * totals, the supplier breakdowns and the response-rate denominators. The fix is to
 * snapshot the line's descriptive and quantitative fields at dispatch time (the same
 * way `supplier_name` / `supplier_id` already were) and read those in analytics,
 * LEFT JOINing the master only where genuinely live data is wanted.
 *
 * `responded_at` is separate: the response-time charts used to read `updated_at`,
 * which `saveBuyerComment` also bumps, so every buyer note made the supplier look
 * faster than it was. `responded_at` is written ONLY by `submitSupplierUpdates`;
 * `updated_at` stays a generic audit column.
 *
 * Migrations are a deferred workstream here, so these are added through the
 * codebase's idempotent `ADD COLUMN IF NOT EXISTS` pattern, memoised like the other
 * `ensure*` helpers so the DDL runs at most once per process.
 */
let activeExpeditingColumnsEnsured: Promise<void> | null = null;

export async function ensureActiveExpeditingColumns(): Promise<void> {
  if (activeExpeditingColumnsEnsured) return activeExpeditingColumnsEnsured;
  activeExpeditingColumnsEnsured = (async () => {
    /* Dispatch-time snapshot of sap_open_po_master, mirroring that table's types. */
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS country TEXT`);
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS p_group TEXT`);
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS item_description TEXT`);
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS open_qty NUMERIC`);
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS open_po_value_usd NUMERIC`);
    /* The ORIGINAL SAP delivery date at dispatch — not the supplier's revised
       `new_delivery_date`, which already lives on this table. */
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS delivery_date DATE`);
    /* When the SUPPLIER responded. Never touched by buyer edits. */
    await pool.query(`ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ`);
  })().catch((err) => {
    activeExpeditingColumnsEnsured = null;
    throw err;
  });
  return activeExpeditingColumnsEnsured;
}
