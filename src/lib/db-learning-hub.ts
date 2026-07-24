import { Pool } from 'pg';

const learningHubPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.LEARNING_HUB_DB_NAME || 'learning_hub_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

learningHubPool.on('error', (err) => console.error('[learningHubPool] unexpected error:', err));

export default learningHubPool;
