import pool from '@/lib/db';
import { requireSchema } from '@/lib/db/schema-version';

/**
 * The `active_expediting` analytics columns — `country`, `p_group`, `item_description`,
 * `open_qty`, `open_po_value_usd`, `delivery_date`, `responded_at` — now live in
 * `database/migrations/default/001_baseline.sql`, along with the comments explaining why each
 * one exists. They used to be seven `ADD COLUMN IF NOT EXISTS` statements run here behind a
 * `let activeExpeditingColumnsEnsured` memo, on the first analytics, dispatch or reconciliation
 * request every serverless instance served.
 *
 * What is left is the runtime assertion that those migrations have actually been applied: one
 * cheap memoised row lookup that turns "the schema is missing" into a sentence naming the fix,
 * instead of a confusing query error deep inside an analytics aggregate.
 *
 * The old name said `ensureActiveExpeditingColumns`, because it did create those columns. It
 * no longer creates anything, and a name promising otherwise is worse than no name at all.
 */
export function ensurePoExpeditingSchema(): Promise<void> {
  return requireSchema(pool, 'default', '001_baseline');
}

/**
 * The narrower assertion for the analytics drill-downs, which read `active_expediting.sap_mat_id`
 * — a column `005_expediting_mat_id_snapshot` adds.
 *
 * Deliberately NOT a bump of `ensurePoExpeditingSchema` above. That one is called by dispatch,
 * reconciliation, the supplier portal and every analytics aggregate; pinning it to 005 would make
 * the entire tool refuse to serve until 005 is applied, over a column only four queries read.
 * `schema-version.ts` says the same thing in general terms: pass the baseline unless the caller
 * specifically needs a later migration, and then name that one.
 */
export function ensureExpeditingMatIdSnapshot(): Promise<void> {
  return requireSchema(pool, 'default', '005_expediting_mat_id_snapshot');
}
