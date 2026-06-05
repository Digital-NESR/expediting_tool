import { Pool } from 'pg';

const procureGuardPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.PROCURE_GUARD_DB_NAME || 'procureguard_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

procureGuardPool.on('error', (err) => {
  console.error('[procureGuardPool] unexpected error:', err);
});

export default procureGuardPool;
