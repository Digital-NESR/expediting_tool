import { Pool } from 'pg';

const laptopProcurementPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

laptopProcurementPool.on('error', (err) => {
  console.error('[laptopProcurementPool] unexpected error:', err);
});

export default laptopProcurementPool;
