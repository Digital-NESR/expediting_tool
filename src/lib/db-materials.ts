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
});

export default materialsPool;
