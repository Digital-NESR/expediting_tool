#!/usr/bin/env node
/**
 * One-off: renumber stored Delivery Status codes onto the official list.
 *
 *   node scripts/remap-ds-codes.mjs            # dry run, prints the row counts it would move
 *   node scripts/remap-ds-codes.mjs --apply
 *   node scripts/remap-ds-codes.mjs --rollback # restore from the backup tables this made
 *
 * WHY
 * The app shipped a 19-code list carrying an extra status, "PO Acknowledged - No response", at
 * DS07. That pushed every code above it up by one and produced a DS19 that does not exist in
 * NESR's official 18-code list. The supplier portal dropdown was built from the app's list, so
 * every code a supplier ever submitted was stored under the shifted numbering.
 *
 * Relabelling alone would therefore have changed what history means: a line submitted as
 * "Delivered & Invoiced" (DS12 on the old list) would have started reading as "Service Ongoing"
 * (DS12 on the official list). This script moves the DATA instead, by meaning, so every row
 * keeps the status the supplier actually chose.
 *
 * THE MAPPING IS BY MEANING, NOT BY POSITION. Note DS10 does not move and DS11 does not become
 * DS10: "Payment Issues" is DS10 on both lists, and "Delivery On Hold - Others" moves from DS11
 * to DS09. A naive "shift everything down by one" would have been wrong for exactly those two.
 *
 * THE RETIRED CODE. Old DS07, "PO Acknowledged - No response", has no equivalent on the official
 * list. Folding it into another status would have invented a meaning for real submissions, so it
 * moves to DS07L instead: still rendered with its own label, never offered to a supplier again.
 *
 * WHAT THIS CANNOT REACH — READ THIS BEFORE RUNNING
 * sap_open_po_master is not written by this application. It has no primary key and no
 * timestamps; n8n truncates and reloads it from SAP, and it arrives using the OLD numbering
 * (it currently contains DS19 and no DS08). This script renumbers the copy that is in the table
 * right now, so the dashboard is correct today, but the next load will put the old numbering
 * back. The n8n job, or SAP itself, has to adopt the official list for the fix to hold. The
 * mapping below is the one to hand to whoever owns that job.
 *
 * SAFETY. Every table is copied to <table>_bak_dsremap before anything is written, the whole
 * run is one transaction, and each column is rewritten by a single CASE expression so no row is
 * touched twice and no intermediate state can collide. --rollback restores from those copies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** old code -> official code. Anything absent is already correct and is left alone. */
const REMAP = {
  DS07: 'DS07L', // PO Acknowledged - No response  (retired, no official equivalent)
  DS08: 'DS07', // Delivery On Hold - Pending LC
  DS09: 'DS08', // Delivery On Hold - Pending Advance Payment
  DS11: 'DS09', // Delivery On Hold - Others
  DS12: 'DS11', // Delivered & Invoiced
  DS13: 'DS12', // Service Ongoing
  DS14: 'DS13', // Service Completed
  DS15: 'DS14', // Shipped - In Transit
  DS16: 'DS15', // Ready for Collection
  DS17: 'DS16', // Collected by Freight Forwarder
  DS18: 'DS17', // Customs Clearance
  DS19: 'DS18', // Products Delivered to Base
  // DS01..DS06 and DS10 keep their numbers. 'Pending Supplier Response' is not a DS code.
};

/** Every column that stores a DS code, and the table it lives on. */
const TARGETS = [
  { table: 'active_expediting', column: 'current_status' },
  { table: 'expediting_audit_log', column: 'status_submitted' },
  { table: 'sap_open_po_master', column: 'delivery_code' },
];

const BACKUP_SUFFIX = '_bak_dsremap';

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

/** `CASE col WHEN 'DS08' THEN 'DS07' ... ELSE col END` — one pass, no collisions. */
function caseExpression(column) {
  const whens = Object.entries(REMAP)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ');
  return `CASE ${column} ${whens} ELSE ${column} END`;
}

async function main() {
  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env'));

  const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
  const client = new Client({
    host: process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
    user: process.env.DB_USER ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? '',
    database: process.env.EXPEDITING_DB_NAME || process.env.DB_NAME || 'nesr_expediting_db',
    ssl: sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    if (has('rollback')) return await rollback(client);

    /* What is there now. Printed for every run, including the dry run, because this is the
       number a person should sanity-check before letting the script write anything. */
    let total = 0;
    for (const { table, column } of TARGETS) {
      const rows = (
        await client.query(
          `SELECT ${column} AS code, COUNT(*)::int AS n
             FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''
            GROUP BY 1 ORDER BY 1`,
        )
      ).rows;
      const moving = rows.filter((r) => REMAP[r.code]);
      const n = moving.reduce((s, r) => s + r.n, 0);
      total += n;
      console.log(`\n${table}.${column} — ${n} row(s) to renumber`);
      for (const r of rows) {
        const to = REMAP[r.code];
        console.log(
          `  ${String(r.code).padEnd(28)} ${String(r.n).padStart(7)}` +
            (to ? `   ->  ${to}` : '   (unchanged)'),
        );
      }
    }
    console.log(`\n${total} row(s) across ${TARGETS.length} tables.`);

    if (!has('apply')) {
      console.log('\nDry run. Nothing was written. Re-run with --apply.');
      return;
    }

    await client.query('BEGIN');

    for (const { table } of TARGETS) {
      const backup = `${table}${BACKUP_SUFFIX}`;
      const exists = (
        await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${backup}`])
      ).rows[0].ok;
      if (exists) {
        throw new Error(
          `${backup} already exists — this script has been run before. Drop the backup tables ` +
            `first if you really mean to run it again, or use --rollback.`,
        );
      }
      await client.query(`CREATE TABLE ${backup} AS TABLE ${table}`);
      console.log(`backed up ${table} -> ${backup}`);
    }

    for (const { table, column } of TARGETS) {
      const res = await client.query(
        `UPDATE ${table} SET ${column} = ${caseExpression(column)}
          WHERE ${column} = ANY($1::text[])`,
        [Object.keys(REMAP)],
      );
      console.log(`${table}.${column}: ${res.rowCount} row(s) renumbered`);
    }

    await client.query('COMMIT');
    console.log('\nCommitted.');

    for (const { table, column } of TARGETS) {
      const rows = (
        await client.query(
          `SELECT ${column} AS code, COUNT(*)::int AS n FROM ${table}
            WHERE ${column} IS NOT NULL AND ${column} <> '' GROUP BY 1 ORDER BY 1`,
        )
      ).rows;
      console.log(`\n${table}.${column} after:`);
      for (const r of rows)
        console.log(`  ${String(r.code).padEnd(28)} ${String(r.n).padStart(7)}`);
      const stale = rows.filter((r) => r.code === 'DS19');
      if (stale.length) console.log('  !! DS19 still present — investigate before deploying.');
    }

    console.log(
      '\nREMINDER: sap_open_po_master is reloaded from SAP by n8n and will arrive with the old\n' +
        'numbering again. Update that job to the official list, or the dashboard reverts on the\n' +
        'next load. The mapping is at the top of this file.',
    );
  } finally {
    await client.end();
  }
}

async function rollback(client) {
  for (const { table } of TARGETS) {
    const backup = `${table}${BACKUP_SUFFIX}`;
    const exists = (
      await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${backup}`])
    ).rows[0].ok;
    if (!exists) {
      console.error(`No backup ${backup} — cannot roll back.`);
      process.exit(1);
    }
  }
  await client.query('BEGIN');
  for (const { table } of TARGETS) {
    const backup = `${table}${BACKUP_SUFFIX}`;
    await client.query(`TRUNCATE ${table}`);
    await client.query(`INSERT INTO ${table} SELECT * FROM ${backup}`);
    console.log(`restored ${table} from ${backup}`);
  }
  await client.query('COMMIT');
  console.log('Rolled back. Drop the *_bak_dsremap tables when you are satisfied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
