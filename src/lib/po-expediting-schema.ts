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
