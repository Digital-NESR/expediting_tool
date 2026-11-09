/**
 * Re-read every stored SOA statement with the corrected number parser and rewrite the amounts.
 *
 *   node --experimental-strip-types --env-file=.env scripts/soa-renormalize-amounts.mjs
 *   node --experimental-strip-types --env-file=.env scripts/soa-renormalize-amounts.mjs --apply
 *   node --experimental-strip-types --env-file=.env scripts/soa-renormalize-amounts.mjs --rollback
 *
 * WHY. `parseAmount` used to delete every comma before reading a number, on the assumption that
 * a comma always groups thousands. Algeria and Kuwait send statements in the French convention,
 * where the comma is the decimal point, so `6 264 791,08` was stored as 626,479,108 -- a hundred
 * times the real balance. SARL SAKER AMN is the vendor that surfaced it. The same reader also
 * extracted digits out of prose and dates, so `Monthly Rental Equipments Month of July 2026`
 * became an outstanding balance of 2026. Both are fixed in `src/lib/soa/parse-amount.ts`; this
 * script applies that fix to statements already uploaded.
 *
 * NO SECOND COPY OF THE PARSER. It imports the application's own module through Node's type
 * stripping, so what runs here is byte-for-byte what runs on a new upload. That is also why this
 * script needs `--experimental-strip-types`.
 *
 * SAFETY. Dry run by default: it prints what would change and writes nothing. `--apply` first
 * copies every row it is about to touch into `soa_amount_backfill_backup`, then updates inside
 * one transaction. `--rollback` restores from that table. A submission whose re-parse does not
 * line up row-for-row with what is stored is skipped entirely and reported, rather than having
 * its amounts written onto rows they may not belong to.
 */

import path from 'node:path';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/* Application code imports its neighbours without a file extension, which is what TypeScript and
   the Next bundler expect and what Node's ESM resolver refuses. Rather than add a `.ts` extension
   to application imports purely to suit this script -- which would mean editing app code for a
   script's benefit, and could not be verified without a full build -- the gap is bridged here:
   if a relative specifier does not resolve, try it again with `.ts`. */
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (!specifier.startsWith('.') || !context.parentURL) throw err;
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (!fs.existsSync(fileURLToPath(candidate))) throw err;
      return next(specifier + '.ts', context);
    }
  },
});

const { parseSupplierWorkbook } = await import('../src/lib/soa/submission-lines.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const VERBOSE = process.argv.includes('--verbose');

const BACKUP_TABLE = 'soa_amount_backfill_backup';

/* ── money columns, and how a stored row and a freshly parsed line line up ── */
const AMOUNT_FIELDS = [
  ['tax_amount', 'taxAmount'],
  ['total_amount', 'totalAmount'],
  ['outstanding_amount', 'outstandingAmount'],
  ['outstanding_days', 'outstandingDays'],
];

/** Numeric columns come back from pg as strings; compare as numbers, with null === null. */
function same(stored, parsed) {
  if (stored === null || stored === undefined) return parsed === null || parsed === undefined;
  if (parsed === null || parsed === undefined) return false;
  return Math.abs(Number(stored) - Number(parsed)) < 1e-9;
}

const sameIssues = (a, b) =>
  JSON.stringify((a ?? []).slice().sort()) === JSON.stringify((b ?? []).slice().sort());

function connect() {
  const sslFlag = (process.env.PGSSL ?? process.env.DB_SSL ?? '').toLowerCase();
  return new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.SOA_DB_NAME || 'soa_consolidation',
    ssl: sslFlag === 'true' || sslFlag === 'require' || sslFlag === '1'
      ? { rejectUnauthorized: false }
      : false,
  });
}

async function rollback(client) {
  const { rows: present } = await client.query(
    `SELECT to_regclass($1) AS t`,
    [`public.${BACKUP_TABLE}`],
  );
  if (!present[0].t) {
    console.log(`No ${BACKUP_TABLE} table — there is nothing to roll back.`);
    return;
  }
  const { rows: count } = await client.query(`SELECT count(*)::int AS n FROM ${BACKUP_TABLE}`);
  console.log(`Restoring ${count[0].n} rows from ${BACKUP_TABLE}…`);
  await client.query('BEGIN');
  const res = await client.query(
    `UPDATE soa_submission_lines l
        SET tax_amount = b.tax_amount,
            total_amount = b.total_amount,
            outstanding_amount = b.outstanding_amount,
            outstanding_days = b.outstanding_days,
            issues = b.issues
       FROM ${BACKUP_TABLE} b
      WHERE b.line_id = l.id`,
  );
  await client.query('COMMIT');
  console.log(`Restored ${res.rowCount} rows. The backup table is left in place.`);
}

async function main() {
  const client = connect();
  await client.connect();

  if (ROLLBACK) {
    await rollback(client);
    await client.end();
    return;
  }

  const { rows: subs } = await client.query(
    `SELECT s.id, s.file_name, (s.superseded_at IS NOT NULL) AS superseded,
            v.name AS vendor_name, v.country_id
       FROM soa_submissions s
       LEFT JOIN vendor_cycle_entries e ON e.id = s.vendor_cycle_entry_id
       LEFT JOIN vendors v ON v.id = e.vendor_id
      WHERE s.content IS NOT NULL
      ORDER BY s.id`,
  );

  const updates = [];           // { lineId, set: {...}, before: {...} }
  const changedCells = [];      // for the report
  const skipped = [];           // submissions whose re-parse did not line up
  const unreadable = [];
  let reparsed = 0;

  for (const sub of subs) {
    const { rows: blob } = await client.query(
      'SELECT content FROM soa_submissions WHERE id = $1',
      [sub.id],
    );
    let parsed;
    try {
      parsed = await parseSupplierWorkbook(blob[0].content);
    } catch (err) {
      unreadable.push({ id: sub.id, vendor: sub.vendor_name, why: String(err.message ?? err) });
      continue;
    }
    reparsed++;

    const { rows: stored } = await client.query(
      `SELECT id, line_no, invoice_number, po_number, tax_amount, total_amount,
              outstanding_amount, outstanding_days, issues
         FROM soa_submission_lines WHERE submission_id = $1 ORDER BY line_no`,
      [sub.id],
    );
    if (stored.length === 0) continue;

    const byLineNo = new Map(parsed.lines.map((l) => [l.lineNo, l]));

    /* The re-parse must land on the same rows it did at upload: the amount reader changed, the
       row walker did not. If an identity does not match, something else about this workbook
       reads differently now and writing amounts by position would corrupt the row. */
    const mismatched = stored.filter((row) => {
      const line = byLineNo.get(row.line_no);
      if (!line) return true;
      const norm = (v) => (v ?? '').toString().trim();
      return (
        norm(row.invoice_number) !== norm(line.invoiceNumber) ||
        norm(row.po_number) !== norm(line.poNumber)
      );
    });
    if (mismatched.length > 0) {
      skipped.push({
        id: sub.id,
        vendor: sub.vendor_name,
        country: sub.country_id,
        storedRows: stored.length,
        parsedRows: parsed.lines.length,
        mismatched: mismatched.length,
      });
      continue;
    }

    for (const row of stored) {
      const line = byLineNo.get(row.line_no);
      const set = {};
      for (const [col, field] of AMOUNT_FIELDS) {
        if (!same(row[col], line[field])) {
          set[col] = line[field];
          changedCells.push({
            sub: sub.id,
            superseded: sub.superseded,
            vendor: sub.vendor_name,
            country: sub.country_id,
            lineNo: row.line_no,
            col,
            from: row[col] === null ? null : Number(row[col]),
            to: line[field],
          });
        }
      }
      if (!sameIssues(row.issues, line.issues)) set.issues = line.issues;
      if (Object.keys(set).length > 0) {
        updates.push({ lineId: row.id, set, before: row });
      }
    }
  }

  /* ── report ─────────────────────────────────────────────────────────────── */
  const money = changedCells.filter((c) => c.col !== 'outstanding_days');
  const corrected = money.filter((c) => c.from !== null && c.to !== null);
  const voided = money.filter((c) => c.from !== null && c.to === null);
  const recovered = money.filter((c) => c.from === null && c.to !== null);

  console.log(`statements re-parsed        ${reparsed} of ${subs.length}`);
  if (unreadable.length) console.log(`  unreadable                ${unreadable.length}`);
  if (skipped.length) console.log(`  skipped, rows did not line up ${skipped.length}`);
  console.log(`lines to update             ${updates.length}`);
  console.log(`  amount corrected          ${corrected.length}  (was a number, now a different one)`);
  console.log(`  amount voided             ${voided.length}  (was a number read out of prose or a date)`);
  console.log(`  amount recovered          ${recovered.length}  (was unreadable, now a number)`);

  if (corrected.length) {
    console.log('\ncorrected amounts, by vendor:');
    const byVendor = {};
    for (const c of corrected) {
      const k = `${c.country} · ${c.vendor}`;
      byVendor[k] ??= { n: 0, from: 0, to: 0 };
      byVendor[k].n++;
      byVendor[k].from += c.from;
      byVendor[k].to += c.to;
    }
    for (const [v, s] of Object.entries(byVendor).sort((a, b) => b[1].n - a[1].n)) {
      console.log(
        `  ${String(s.n).padStart(4)}  ${v.padEnd(46)} ${s.from.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(18)} -> ${s.to.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(16)}`,
      );
    }
  }

  if (voided.length) {
    console.log('\nvoided amounts, by vendor (these inflated a balance with a number from prose):');
    const byVendor = {};
    for (const c of voided) {
      const k = `${c.country} · ${c.vendor}`;
      byVendor[k] ??= { n: 0, from: 0 };
      byVendor[k].n++;
      byVendor[k].from += c.from;
    }
    for (const [v, s] of Object.entries(byVendor).sort((a, b) => b[1].from - a[1].from).slice(0, 15))
      console.log(
        `  ${String(s.n).padStart(4)}  ${v.padEnd(46)} removed ${s.from.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(22)}`,
      );
  }

  if (skipped.length) {
    console.log('\nskipped (re-parse did not line up with the stored rows — left untouched):');
    for (const s of skipped.slice(0, 20))
      console.log(
        `  submission ${String(s.id).padStart(5)}  ${s.country} · ${s.vendor} — stored ${s.storedRows}, parsed ${s.parsedRows}, ${s.mismatched} mismatched`,
      );
  }
  if (unreadable.length && VERBOSE) {
    console.log('\nunreadable statements:');
    for (const u of unreadable) console.log(`  ${u.id}  ${u.vendor} — ${u.why}`);
  }

  if (VERBOSE && corrected.length) {
    console.log('\nevery corrected cell:');
    for (const c of corrected)
      console.log(`  sub ${c.sub} line ${c.lineNo} ${c.col}: ${c.from} -> ${c.to}  [${c.country} ${c.vendor}]`);
  }

  const dumpAt = process.argv.indexOf('--dump');
  if (dumpAt !== -1 && process.argv[dumpAt + 1]) {
    fs.writeFileSync(
      process.argv[dumpAt + 1],
      JSON.stringify({ changedCells, skipped, unreadable }, null, 1),
      'utf8',
    );
    console.log(`\nfull detail written to ${process.argv[dumpAt + 1]}`);
  }

  if (!APPLY) {
    console.log(
      `\nDry run — nothing was written. Re-run with --apply to update ${updates.length} lines.`,
    );
    await client.end();
    return;
  }

  /* ── apply ──────────────────────────────────────────────────────────────── */
  console.log(`\nApplying to ${updates.length} lines…`);
  await client.query('BEGIN');
  await client.query(`CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
    line_id            INTEGER PRIMARY KEY,
    tax_amount         NUMERIC,
    total_amount       NUMERIC,
    outstanding_amount NUMERIC,
    outstanding_days   INTEGER,
    issues             TEXT[],
    backed_up_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  for (const u of updates) {
    // ON CONFLICT DO NOTHING: a second --apply must not overwrite the ORIGINAL values with the
    // already-corrected ones, which would make --rollback restore the wrong numbers.
    await client.query(
      `INSERT INTO ${BACKUP_TABLE}
         (line_id, tax_amount, total_amount, outstanding_amount, outstanding_days, issues)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (line_id) DO NOTHING`,
      [
        u.lineId,
        u.before.tax_amount,
        u.before.total_amount,
        u.before.outstanding_amount,
        u.before.outstanding_days,
        u.before.issues,
      ],
    );
    const cols = Object.keys(u.set);
    await client.query(
      `UPDATE soa_submission_lines SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [u.lineId, ...cols.map((c) => u.set[c])],
    );
  }
  await client.query('COMMIT');
  console.log(`Done. ${updates.length} lines updated; originals kept in ${BACKUP_TABLE}.`);
  console.log(`Undo with:  node --experimental-strip-types --env-file=.env ${path.relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/')} --rollback`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
