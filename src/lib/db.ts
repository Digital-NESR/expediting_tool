import { Pool } from 'pg';

// Singleton pool — reused across hot-reloads in development
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

const pool: Pool = globalThis._pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool;
}

export default pool;
