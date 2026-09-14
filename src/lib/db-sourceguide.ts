import { createPool } from './db/pool';

/*
 * Dedicated pool for the SourceGuide tool — never shared with `pool` (db.ts),
 * `titePool` (db-tite.ts) or `procureGuardPool` (db-procureguard.ts).
 *
 * Reads the same credentials as the other tools (DB_* on Vercel) but also
 * falls back to the POSTGRES_* / PGSSL names used in the local .env, and to the
 * `SourceGuide_DB` env var the database name was provisioned under. (POSTGRES_*
 * is preferred over DB_* here — see the 'sourceguide' envStyle in ./db/pool.)
 */
const sourceGuidePool = createPool(
  process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
  { key: 'sourceguide', label: 'sourceGuidePool', envStyle: 'sourceguide' },
);

export default sourceGuidePool;
