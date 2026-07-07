import { Pool } from 'pg';

// Read-only employee directory (Azure AD users synced into azure_emp_directory).
// Configured on the deployed app via EMP_DB_NAME; unset locally, in which case the
// pool never connects and the search action degrades to empty results.
const empDirectoryPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.EMP_DB_NAME || 'azure_emp_directory',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

empDirectoryPool.on('error', (err) => {
  console.error('[empDirectoryPool] unexpected error:', err);
});

export default empDirectoryPool;
