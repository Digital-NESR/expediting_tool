import { Pool } from 'pg';

// Add EMP_DB_NAME=azure_emp_directory
// to Vercel environment variables

const empPool = new Pool({
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

export default empPool;
