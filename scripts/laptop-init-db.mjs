import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
const schemaPath = path.join(cwd, 'database', 'laptop_procurement_schema.sql');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsAt = trimmed.indexOf('=');
    if (equalsAt < 0) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvFile(envPath);

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
const host = process.env.DB_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT) || 5432;
const user = process.env.DB_USER ?? 'postgres';
const password = process.env.DB_PASSWORD ?? '';
const dbName = process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db';

// 1. Ensure the database exists (connect to the maintenance "postgres" db).
const admin = new Client({ host, port, user, password, database: 'postgres', ssl: sslConfig });
await admin.connect();
const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database: ${dbName}`);
} else {
  console.log(`Database already exists: ${dbName}`);
}
await admin.end();

// 2. Apply the schema inside the target database.
const client = new Client({ host, port, user, password, database: dbName, ssl: sslConfig });
await client.connect();
await client.query(fs.readFileSync(schemaPath, 'utf8'));

// 3. Seed a local admin permission row.
const localAdminEmail = process.env.LOCAL_DEV_EMAIL ?? 'local.procureguard@example.com';
const localAdminName = process.env.LOCAL_DEV_NAME ?? 'Local ProcureGuard User';
await client.query(
  `INSERT INTO laptop_permissions (email, name, role)
   VALUES ($1, $2, 'Admin')
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP`,
  [localAdminEmail, localAdminName],
);

await client.end();
console.log(`Laptop Procurement PostgreSQL database is ready: ${dbName}`);
