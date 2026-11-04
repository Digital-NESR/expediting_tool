import { createPool } from './db/pool';

/**
 * The SAP extract warehouse, read by Supply Chain Analytics.
 *
 * Owned by the data pipeline that loads it, not by this repo: a separate job refreshes ~20
 * tables under the `core` schema daily (see `core.load_log`) and publishes a curated view layer
 * under `track`. Nothing here writes to it and nothing migrates it — it is marked read-only in
 * the migration manifest for the same reason the Travel Portal's and RFx Officer's databases are.
 *
 * `sourceguide` env style, which reads `POSTGRES_*` first and falls back to the platform `DB_*`
 * names, so it resolves both locally and on Vercel.
 */
const materialsPool = createPool(process.env.MATERIALS_DB_NAME || 'materials_db', {
  key: 'materials',
  label: 'materialsPool',
  envStyle: 'sourceguide',
  /* Platform default of 3 connections, deliberately. The overview fires ten aggregates at once
     and widening the pool to 6 was measured at no improvement: the cost is in the queries, not
     in queuing for a connection. The `totals` query alone is ~4.7s, because three
     COUNT(DISTINCT) over 735k rows are three hash aggregates and `core.supplychain` carries no
     index on the columns this board groups by. That table belongs to the pipeline team, so the
     fix is theirs to make, not ours to add behind their back. */
});

export default materialsPool;
