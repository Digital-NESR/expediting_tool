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
  /*
   * Above the platform default of 3, and with a longer wait for a connection.
   *
   * The Purchase Orders page loads an overview and a filter-option set together, which is
   * roughly seventeen aggregates issued at once. On three connections the ones at the back of
   * the queue waited longer than the default 10s acquisition timeout and threw "timeout
   * exceeded when trying to connect" — a queue, reported as an unreachable database, which is
   * what made this look like a credentials or permissions fault when it was neither.
   *
   * Eight connections clear that batch in three rounds; 30s of patience means a slow round
   * still completes rather than failing the board. Both numbers stay small against the
   * server's 859-connection budget, and this pool serves one admin-only page.
   *
   * The queries themselves are the real cost — `totals` alone is ~4.7s, three COUNT(DISTINCT)
   * over 735k rows, because `core.supplychain` has no index on the columns this board groups
   * by. That table belongs to the pipeline team, so adding indexes is theirs to decide, not
   * ours to do behind their back.
   */
  max: 8,
  connectionTimeoutMillis: 30000,
});

export default materialsPool;

/**
 * What this pool actually resolved to, for a diagnostic line. Never the password.
 *
 * The board is platform-admin only and its failure card previously said "could not be reached"
 * whatever the cause, which is useless when local works and a deployment does not: the two
 * environments disagree about which variables are set, and the only way to tell is to print
 * what each one resolved. `envStyle: 'sourceguide'` prefers `POSTGRES_*` over `DB_*`, so a
 * deployment that sets both can end up connecting as a different role here than the pools that
 * read `DB_USER` — which is exactly the kind of mismatch this makes visible.
 */
export function materialsTarget(): string {
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '(unset)';
  const port = Number(process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432;
  const user = process.env.POSTGRES_USER || process.env.DB_USER || '(unset)';
  const database = process.env.MATERIALS_DB_NAME || 'materials_db';
  const ssl = process.env.PGSSL === 'true' || process.env.DB_SSL === 'true' ? 'on' : 'off';
  const which = process.env.POSTGRES_USER ? 'POSTGRES_USER' : 'DB_USER';
  return `${user}@${host}:${port}/${database} (ssl ${ssl}, user from ${which})`;
}
