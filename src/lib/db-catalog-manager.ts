import { Pool } from 'pg';

const catalogManagerPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.CATALOG_MANAGER_DB_NAME || 'catalog_manager_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

catalogManagerPool.on('error', (err) => console.error('[catalogManagerPool] unexpected error:', err));

export default catalogManagerPool;
