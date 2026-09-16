#!/usr/bin/env node
/**
 * Creates delegation_db (if absent) and the delegations table it holds.
 *
 *   node scripts/delegation-init-db.mjs            # report what exists, change nothing
 *   node scripts/delegation-init-db.mjs --apply
 *
 * WHY THIS EXISTS. The resolver in src/lib/delegation.ts used to run this CREATE TABLE itself,
 * on the request path, memoised per process and retried after every failure. That was never
 * going to work here: as of 16 Sep 2026 `delegation_db` does not exist on the configured
 * server, and you cannot create a table inside a database that is not there. So the DDL failed
 * every time, silently, and Catalog Repo has been honouring no delegation grants at all.
 *
 * Schema lives here rather than in the request path, the same way sns-init-db.mjs holds the
 * S&S schema. Running it is a deliberate act by a person, not a side effect of someone opening
 * a page.
 *
 * ONE THING TO SETTLE FIRST. This application only READS delegations; the hub that writes them
 * lives in another codebase which this repository never names. Before running this, find out
 * whether that hub owns the database already under a different name, and set DELEGATION_DB_NAME
 * to it instead. Creating a second, empty delegations table would give you a delegation feature
 * that silently disagrees with the one people actually use, which is worse than the current
 * state of it plainly not working.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL (or the POSTGRES_* / PGSSL names)
 * and DELEGATION_DB_NAME from .env.local, then .env.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (name) => process.argv.includes(`--${name}`);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

/* Byte-for-byte what the request path used to create, so a database built by this script is
   indistinguishable from one the old runtime DDL would have produced. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS delegations (
      id BIGSERIAL PRIMARY KEY,
      delegator_email TEXT NOT NULL,
      delegator_name TEXT,
      delegate_email TEXT NOT NULL,
      delegate_name TEXT,
      app TEXT NOT NULL DEFAULT 'all',
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      revoked_at TIMESTAMPTZ
    )`,
  `CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON delegations (LOWER(delegate_email))`,
];

async function main() {
  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env'));

  const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
  const base = {
    host: process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
    user: process.env.DB_USER ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? '',
    ssl: sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false,
  };
  const dbName = process.env.DELEGATION_DB_NAME || 'delegation_db';
  console.log(`target database: ${dbName}${process.env.DELEGATION_DB_NAME ? '' : ' (default)'}`);

  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  const exists =
    (await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])).rowCount > 0;
  console.log(`database exists: ${exists}`);

  if (!exists) {
    if (!has('apply')) {
      await admin.end();
      console.log('\nDry run. Re-run with --apply to create it. Read the header first.');
      return;
    }
    // No parameter binding for an identifier, so the name is quoted rather than interpolated.
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`created database ${dbName}`);
  }
  await admin.end();

  const db = new Client({ ...base, database: dbName });
  await db.connect();
  try {
    const hadTable = (await db.query(`SELECT to_regclass('public.delegations') IS NOT NULL AS ok`))
      .rows[0].ok;
    console.log(`delegations table exists: ${hadTable}`);
    if (!has('apply')) {
      console.log('\nDry run. Nothing was written. Re-run with --apply.');
      return;
    }
    for (const statement of SCHEMA) await db.query(statement);
    const rows = (await db.query(`SELECT COUNT(*)::int AS n FROM delegations`)).rows[0].n;
    console.log(`schema applied. delegations holds ${rows} row(s).`);
    if (!hadTable) {
      console.log(
        '\nThe table is empty, so nothing is delegated yet. This app only READS it — grants are\n' +
          'created by the delegation hub, which lives in another codebase. An empty table here\n' +
          'behaves exactly like no table at all, so nothing changes until that hub points at this\n' +
          'database.',
      );
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
