import { Pool } from 'pg';

/**
 * Connection settings for the S&S Registry database.
 *
 * Accepts two naming schemes: the platform-standard DB_* variables the other
 * tools read, and the POSTGRES_* / SnS_DB / PGSSL names used in local .env.local.
 * DB_* wins where both are present, so a deployment that already sets the
 * platform variables needs no extra configuration.
 */
const host = process.env.DB_HOST ?? process.env.POSTGRES_HOST;
const port = Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432;
const user = process.env.DB_USER ?? process.env.POSTGRES_USER;
const password = process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
const database = process.env.SNS_REGISTRY_DB_NAME ?? process.env.SnS_DB ?? 'sns_registry_db';
const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
const ssl = sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false;

const snsPool = new Pool({
  host,
  port,
  database,
  user,
  password,
  ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

snsPool.on('error', (err) => console.error('[snsPool] unexpected error:', err));

export default snsPool;
