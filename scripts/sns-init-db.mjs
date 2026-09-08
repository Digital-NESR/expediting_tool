// Creates sns_registry_db (if absent), applies the schema, and seeds the
// reference data the New Record wizard needs. Idempotent — re-running only
// inserts rows that are missing, so edits made in /admin survive.
//
//   npm run sns:db:init
//
// Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL and
// SNS_REGISTRY_DB_NAME from .env.local.

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { COUNTRIES, REASONS, SEGMENTS, TAXONOMY } from './sns-reference-seed.mjs';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
const schemaPath = path.join(cwd, 'database', 'sns_registry_schema.sql');

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

// Accepts the platform-standard DB_* names and the POSTGRES_* / SnS_DB / PGSSL
// names used in .env.local. DB_* wins where both are set.
const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
const sslConfig = sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false;
const host = process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432;
const user = process.env.DB_USER ?? process.env.POSTGRES_USER ?? 'postgres';
const password = process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? '';
const dbName = process.env.SNS_REGISTRY_DB_NAME || process.env.SnS_DB || 'sns_registry_db';

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
console.log('Schema applied.');

// 3. Seed reference data. Every insert is ON CONFLICT DO NOTHING, so rows
//    renamed or deleted in the admin console are not resurrected by name —
//    only genuinely missing rows are added back.
let counts = { categories: 0, subs: 0, families: 0, commodities: 0, countries: 0, segments: 0, reasons: 0 };

for (const [catIndex, [spendType, catName, subs]] of TAXONOMY.entries()) {
  const cat = await client.query(
    `INSERT INTO sns_category (name, spend_type, sort_order) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [catName, spendType, catIndex],
  );
  let categoryId = cat.rows[0]?.id;
  if (categoryId) counts.categories++;
  else categoryId = (await client.query(`SELECT id FROM sns_category WHERE name = $1`, [catName])).rows[0].id;

  for (const [subIndex, [subName, families]] of subs.entries()) {
    const sub = await client.query(
      `INSERT INTO sns_sub_category (category_id, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (category_id, name) DO NOTHING
       RETURNING id`,
      [categoryId, subName, subIndex],
    );
    let subId = sub.rows[0]?.id;
    if (subId) counts.subs++;
    else subId = (await client.query(
      `SELECT id FROM sns_sub_category WHERE category_id = $1 AND name = $2`, [categoryId, subName],
    )).rows[0].id;

    for (const [famIndex, [famName, commodities]] of families.entries()) {
      const fam = await client.query(
        `INSERT INTO sns_family (sub_category_id, name, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (sub_category_id, name) DO NOTHING
         RETURNING id`,
        [subId, famName, famIndex],
      );
      let famId = fam.rows[0]?.id;
      if (famId) counts.families++;
      else famId = (await client.query(
        `SELECT id FROM sns_family WHERE sub_category_id = $1 AND name = $2`, [subId, famName],
      )).rows[0].id;

      for (const [comIndex, comName] of commodities.entries()) {
        const com = await client.query(
          `INSERT INTO sns_commodity (family_id, name, sort_order) VALUES ($1, $2, $3)
           ON CONFLICT (family_id, name) DO NOTHING
           RETURNING id`,
          [famId, comName, comIndex],
        );
        if (com.rows[0]?.id) counts.commodities++;
      }
    }
  }
}

for (const [index, [name, code]] of COUNTRIES.entries()) {
  const r = await client.query(
    `INSERT INTO sns_country (code, name, sort_order) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO NOTHING
     RETURNING code`,
    [code, name, index],
  );
  if (r.rowCount) counts.countries++;
}

for (const [index, name] of SEGMENTS.entries()) {
  const r = await client.query(
    `INSERT INTO sns_segment (name, sort_order) VALUES ($1, $2)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [name, index],
  );
  if (r.rowCount) counts.segments++;
}

for (const cls of ['SGL', 'SOL']) {
  for (const [index, name] of REASONS[cls].entries()) {
    const r = await client.query(
      `INSERT INTO sns_reason (classification, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (classification, name) DO NOTHING
       RETURNING id`,
      [cls, name, index],
    );
    if (r.rowCount) counts.reasons++;
  }
}

await client.end();

console.log('Reference data seeded (new rows only):', counts);
console.log(`\nDone. S&S Registry is ready on "${dbName}".`);
console.log('Registry records start empty — submit the first one from /sns-registry.');
