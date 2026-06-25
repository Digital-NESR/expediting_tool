import { Pool } from 'pg';

// Central "delegation hub" database — one DB per tool, like the others.
// Stores only WHO delegates to WHOM, for WHICH app, and WHEN. The actual
// role/scope is always resolved fresh from each app's own permission tables,
// so there is no role duplication or drift.
const delegationPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DELEGATION_DB_NAME || 'delegation_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

delegationPool.on('error', (err) => console.error('[delegationPool] unexpected error:', err));

export default delegationPool;
