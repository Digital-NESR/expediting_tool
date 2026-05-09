import { Pool } from 'pg';

const titePool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.TITE_DB_NAME || 'nesr_tite_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

titePool.on('connect', () => {
  console.log('[titePool] connected to:', process.env.TITE_DB_NAME || 'nesr_tite_db');
});

titePool.on('error', (err) => {
  console.error('[titePool] unexpected error:', err);
});

export default titePool;
