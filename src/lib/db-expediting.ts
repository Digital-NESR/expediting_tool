import { Pool } from 'pg';

// Read-only access to the NESR expediting tool database (same Azure server) for the
// real SAP supplier master. Catalog Repo only reads supplier_contacts for the picker.
const expeditingPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.EXPEDITING_DB_NAME || 'nesr_expediting_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

expeditingPool.on('error', (err) => console.error('[expeditingPool] unexpected error:', err));

export default expeditingPool;
