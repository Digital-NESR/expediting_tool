#!/usr/bin/env node
/**
 * One-off: undo the 15 Sep renumbering and put stored Delivery Status codes on the official list.
 *
 *   node --env-file=.env scripts/remap-ds-codes-official.mjs            # dry run, prints what would move
 *   node --env-file=.env scripts/remap-ds-codes-official.mjs --apply
 *   node --env-file=.env scripts/remap-ds-codes-official.mjs --rollback # restore this script's backups
 *
 * WHY
 * `scripts/remap-ds-codes.mjs` renumbered everything on 15 Sep onto what was believed to be an
 * official 18-code list: "PO Acknowledged - No response" was treated as an app invention, retired
 * to DS07L, and every code above it pulled down by one, which removed DS19.
 *
 * The official list actually has nineteen codes and does include "PO Acknowledged - No response",
 * at DS07. The numbering that was replaced had been right. So this script moves the data back.
 *
 * THE EVIDENCE WAS ALREADY IN THE DATABASE. `sap_open_po_master` is loaded from SAP by n8n and
 * nothing in this app writes it. It has always arrived carrying DS19 and no DS07L. September read
 * that as an n8n job that had not caught up; it was SAP stating the official list. The visible
 * symptom was 85 open PO lines sitting at DS19 with a blank status label, because the app's list
 * stopped at DS18.
 *
 * WHICH TABLES MOVE, AND WHICH MUST NOT
 * Only the two the supplier portal writes. `sap_open_po_master` is deliberately absent from
 * TARGETS: it is ALREADY on the official numbering, so remapping it would shift correct data into
 * being wrong. It is also truncated and reloaded nightly, so there is nothing there to preserve.
 * Adding it to this list would be the one change that breaks the thing this script fixes.
 *
 * THE MAPPING IS BY MEANING, NOT BY POSITION. DS10 does not move — "Payment Issues" is DS10 on
 * both lists — and "Delivery On Hold - Others" goes from DS09 to DS11 rather than to DS10. A
 * naive "shift everything up by one" is wrong for exactly those two.
 *
 * SAFETY. Every table is copied to <table>_bak_dsofficial before anything is written, the whole
 * run is one transaction, and each column is rewritten by a single CASE expression so no row is
 * touched twice and no intermediate state can collide. A new backup suffix on purpose: the
 * September run's `_bak_dsremap` tables are the only record of the state before that migration,
 * and reusing the name would destroy it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Current (September) code -> official code.
 *
 * Read down the comments rather than the numbers: every line is a meaning that keeps its meaning.
 * Anything absent is already correct and is left alone — DS01 to DS06, and DS10.
 */
const REMAP = {
  DS07L: 'DS07', // PO Acknowledged - No response      (un-retired; it is on the official list)
  DS07: 'DS08', // Delivery On Hold - Pending LC
  DS08: 'DS09', // Delivery On Hold - Pending Advance Payment
  DS09: 'DS11', // Delivery On Hold - Others           (not DS10 — see the header)
  DS11: 'DS12', // Delivered & Invoiced
  DS12: 'DS13', // Service Ongoing
  DS13: 'DS14', // Service Completed
  DS14: 'DS15', // Shipped - In Transit
  DS15: 'DS16', // Ready for Collection
  DS16: 'DS17', // Collected by Freight Forwarder
  DS17: 'DS18', // Customs Clearance
  DS18: 'DS19', // Products Delivered to Base
};

/**
 * Every column the SUPPLIER PORTAL stores a DS code in.
 *
 * `sap_open_po_master.delivery_code` is knowingly not here. See the header — it is already right.
 */
const TARGETS = [
  { table: 'active_expediting', column: 'current_status' },
  { table: 'expediting_audit_log', column: 'status_submitted' },
];

const BACKUP_SUFFIX = '_bak_dsofficial';

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

/** `CASE col WHEN 'DS07L' THEN 'DS07' ... ELSE col END` — one pass, no collisions. */
function caseExpression(column) {
  const whens = Object.entries(REMAP)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ');
  return `CASE ${column} ${whens} ELSE ${column} END`;
}

async function distribution(client, { table, column }) {
  const { rows } = await client.query(
    `SELECT ${column} AS code, COUNT(*)::int AS n
       FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''
      GROUP BY 1 ORDER BY 1`,
  );
  return rows;
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

    /* What is there now, printed on every run including the dry one, because this is the number a
       person should sanity-check before letting the script write anything. */
    let moving = 0;
    for (const target of TARGETS) {
      const rows = await distribution(client, target);
      const affected = rows.filter((r) => REMAP[r.code]).reduce((n, r) => n + r.n, 0);
      moving += affected;
      console.log(`\n${target.table}.${target.column}`);
      console.log('  now:   ' + rows.map((r) => `${r.code}:${r.n}`).join('  '));
      console.log(
        '  moves: ' +
          rows
            .filter((r) => REMAP[r.code])
            .map((r) => `${r.code}->${REMAP[r.code]} (${r.n})`)
            .join('  '),
      );
    }

    /* The check that matters most, and the reason this script exists: SAP's own table must still
       be on the official numbering when this finishes. If it is not, something has renumbered it
       and this script's premise no longer holds. */
    const sap = await distribution(client, {
      table: 'sap_open_po_master',
      column: 'delivery_code',
    });
    const sapCodes = new Set(sap.map((r) => r.code));
    console.log('\nsap_open_po_master.delivery_code (NOT touched by this script)');
    console.log('  ' + sap.map((r) => `${r.code}:${r.n}`).join('  '));
    if (sapCodes.has('DS07L')) {
      throw new Error(
        'sap_open_po_master contains DS07L, so it is on the September numbering rather than the ' +
          'official one. This script assumes the opposite. Stop and re-check before running it.',
      );
    }
    if (!sapCodes.has('DS19')) {
      console.warn(
        '  WARNING: no DS19 in sap_open_po_master. Expected on the official numbering — ' +
          'verify the loader before trusting this run.',
      );
    }

    console.log(`\n${moving} rows would move.`);

    if (!has('apply')) {
      console.log('\nDry run. Re-run with --apply to write.');
      return;
    }

    await client.query('BEGIN');
    for (const { table, column } of TARGETS) {
      const backup = `${table}${BACKUP_SUFFIX}`;
      await client.query(`DROP TABLE IF EXISTS ${backup}`);
      await client.query(`CREATE TABLE ${backup} AS TABLE ${table}`);
      const res = await client.query(`UPDATE ${table} SET ${column} = ${caseExpression(column)}`);
      console.log(`  ${table}: backed up to ${backup}, rewrote ${res.rowCount} rows`);
    }
    await client.query('COMMIT');

    console.log('\nCommitted. Distribution now:');
    for (const target of TARGETS) {
      const rows = await distribution(client, target);
      console.log(`  ${target.table}: ` + rows.map((r) => `${r.code}:${r.n}`).join('  '));
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nFAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function rollback(client) {
  try {
    await client.query('BEGIN');
    for (const { table } of TARGETS) {
      const backup = `${table}${BACKUP_SUFFIX}`;
      const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [backup]);
      if (!rows[0]?.t) throw new Error(`No backup table ${backup} — nothing to roll back to.`);
      await client.query(`TRUNCATE ${table}`);
      await client.query(`INSERT INTO ${table} SELECT * FROM ${backup}`);
      console.log(`  ${table}: restored from ${backup}`);
    }
    await client.query('COMMIT');
    console.log('\nRolled back.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nROLLBACK FAILED:', err.message);
    process.exitCode = 1;
  }
}

await main();
