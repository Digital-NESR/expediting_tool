import { Pool } from 'pg';

/*
 * Dedicated pool for the SourceGuide tool — never shared with `pool` (db.ts),
 * `titePool` (db-tite.ts) or `procureGuardPool` (db-procureguard.ts).
 *
 * Reads the same credentials as the other tools (DB_* on Vercel) but also
 * falls back to the POSTGRES_* / PGSSL names used in the local .env, and to the
 * `SourceGuide_DB` env var the database name was provisioned under.
 */
const sourceGuidePool = new Pool({
  host:     process.env.POSTGRES_HOST     || process.env.DB_HOST,
  port:     Number(process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432,
  database: process.env.SourceGuide_DB    || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
  user:     process.env.POSTGRES_USER     || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: (process.env.PGSSL === 'true' || process.env.DB_SSL === 'true')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

sourceGuidePool.on('error', (err) => {
  console.error('[sourceGuidePool] unexpected error:', err);
});

export default sourceGuidePool;
