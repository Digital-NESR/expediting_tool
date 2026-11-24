#!/usr/bin/env node
/**
 * One-time initial load of the Supply Chain Health Board (`all_kpis`).
 *
 *   node --env-file=.env --env-file-if-exists=.env.local scripts/health-board-seed.mjs \
 *     --csv=<SharePoint "All KPIs" export> \
 *     --modified=<ID,Modified csv taken from the 2026 Power BI file> \
 *     --ytd=<P&L YTD numbers taken from the Power BI YTD measures, json> \
 *     [--dry] [--by=<email>]
 *
 * The rows go through the same parser the /admin upload uses (src/lib/health-board, loaded with
 * jiti so this plain-Node script can read the TypeScript), so the first load and every later
 * upload apply the same rules. Rules: src/lib/health-board/RULES.md.
 *
 * Two loads are recorded, so the board can always say where a number came from:
 *   1. the SharePoint export. Two rows for one cell: the one with the newest SharePoint Modified
 *      date wins (ties: the higher list ID); the other is kept in kpi_source_rows as 'superseded'.
 *   2. the P&L YTD figures that were typed into the Power BI YTD measures, as YTD rows. A BLANK()
 *      in the measure becomes no row.
 *
 * Refuses to run against a database that already holds values: this is a first load, and every
 * later change goes through the upload, which keeps history.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { createJiti } from 'jiti';
import { credentials } from '../database/migrations/databases.mjs';

const jiti = createJiti(import.meta.url);
const { parseKpiGrid, rowKey } = await jiti.import('../src/lib/health-board/parse.ts');
const { normaliseCountry, kpiByCode } = await jiti.import('../src/lib/health-board/definitions.ts');
const { parseCsv } = await jiti.import('../src/lib/spreadsheet-import.ts');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY = process.argv.includes('--dry');
const BY = arg('by') || 'initial-load script';
const CSV = arg('csv');
const MODIFIED = arg('modified');
const YTD = arg('ytd');
const REPORT = arg('report');
if (!CSV || !MODIFIED || !YTD) {
  console.error('Usage: --csv=… --modified=… --ytd=… [--dry] [--by=…] [--report=…]');
  process.exit(2);
}

const out = [];
const say = (s = '') => {
  out.push(s);
  console.log(s);
};

/* ── 1. The SharePoint export ── */
const csvText = readFileSync(CSV, 'utf8');
const grid = parseCsv(csvText);
const parsed = parseKpiGrid(grid, {
  duplicates: 'keep-all',
  blanks: 'keep',
  allowDiscontinued: true,
});
const rejects = parsed.problems.filter((p) => p.severity === 'reject');
const warns = parsed.problems.filter((p) => p.severity === 'warn');

/* "16/04/2025 10:16:46 AM" — the list's Modified column as the Power BI file holds it. */
function parseModified(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec((s ?? '').trim());
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[7] === 'PM') h += 12;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], h, +m[5], +m[6]));
}
const modifiedById = new Map();
for (const [id, mod] of parseCsv(readFileSync(MODIFIED, 'utf8')).slice(1)) {
  if (id) modifiedById.set(id.trim(), parseModified(mod));
}

const groups = new Map();
for (const r of parsed.rows) groups.set(rowKey(r), [...(groups.get(rowKey(r)) ?? []), r]);

/*
 * The board owner's decisions on specific duplicates, made on 24 Nov 2026 after seeing both rows.
 * These override "newest Modified wins" for exactly these cells and nothing else.
 *
 * Past Due % and Past Due % > 30 Days, Nov and Dec 2025: a 'United Arab Emirates' row exists only
 * in those two months beside the year-long 'UAE' series. Power BI added the two together. The
 * owner's ruling: the 'UAE' series is the real one; the other row is a stray entry.
 */
const OWNER_KEEPS_RAW_COUNTRY = new Map(
  ['KPI - Past Due', 'KPI - Past Due > 30 Days'].flatMap((kpi) =>
    ['November', 'December'].map((period) => [`${kpi}|2025|${period}|UAE`, 'UAE']),
  ),
);

const winners = [];
const superseded = []; // { row, by, reason }
const conflicts = [];
for (const rows of groups.values()) {
  if (rows.length === 1) {
    winners.push(rows[0]);
    continue;
  }
  const keepRaw = OWNER_KEEPS_RAW_COUNTRY.get(rowKey(rows[0]));
  if (keepRaw) {
    const win = rows.find((r) => r.countryRaw === keepRaw);
    if (!win || rows.filter((r) => r.countryRaw === keepRaw).length !== 1) {
      throw new Error(`Owner decision for ${rowKey(rows[0])} no longer matches the data`);
    }
    winners.push(win);
    const rest = rows.filter((r) => r !== win);
    conflicts.push({ win, rest, owner: true });
    for (const r of rest) {
      superseded.push({
        row: r,
        reason: `Board owner's decision (24 Nov 2026): the '${keepRaw}' series (ID ${win.sourceRef}) is the real one; '${r.countryRaw}' was a stray entry`,
      });
    }
    continue;
  }
  const ranked = [...rows].sort((a, b) => {
    const ma = modifiedById.get(a.sourceRef)?.getTime() ?? -Infinity;
    const mb = modifiedById.get(b.sourceRef)?.getTime() ?? -Infinity;
    return mb - ma || Number(b.sourceRef) - Number(a.sourceRef);
  });
  const [win, ...rest] = ranked;
  winners.push(win);
  const same = rest.every(
    (r) => r.valueText === win.valueText && (r.targetWords ?? '') === (win.targetWords ?? ''),
  );
  if (!same) conflicts.push({ win, rest });
  for (const r of rest) {
    const wm = modifiedById.get(win.sourceRef);
    superseded.push({
      row: r,
      reason: `${same ? 'Exact copy of' : 'Superseded by'} ID ${win.sourceRef} (modified ${wm ? wm.toISOString() : 'unknown'})`,
    });
  }
}

say(`SharePoint export: ${grid.length} lines, ${parsed.rows.length} rows read`);
say(`  rejected: ${rejects.length}`);
for (const p of rejects) say(`    line ${p.line}: ${p.message}`);
say(`  warnings: ${warns.length}`);
for (const p of warns) say(`    line ${p.line}: ${p.message}`);
say(
  `  cells: ${winners.length}; duplicate rows dropped: ${superseded.length} (${conflicts.length} with a different value)`,
);
for (const c of conflicts) {
  say(
    `    ${c.owner ? '[owner decision] ' : ''}${c.win.kpi} | ${c.win.country} | ${c.win.period} ${c.win.year}: kept ${c.win.valueText} (ID ${c.win.sourceRef}, ${c.win.countryRaw}); dropped ${c.rest
      .map((r) => `${r.valueText} (ID ${r.sourceRef}, ${r.countryRaw})`)
      .join(', ')}`,
  );
}

/* ── 2. P&L YTD from the Power BI measures ── */
const ytdSource = JSON.parse(readFileSync(YTD, 'utf8'));
const categoryOf = new Map();
for (const r of winners) categoryOf.set(`${r.kpi}|${r.year}`, r.category);
const ytdRows = [];
const ytdNotes = [];
for (const [yearText, byCountry] of Object.entries(ytdSource)) {
  const year = Number(yearText);
  for (const [raw, byKpi] of Object.entries(byCountry)) {
    const country = normaliseCountry(raw);
    if (!country) throw new Error(`YTD measure names an unknown country "${raw}"`);
    for (const [code, valueText] of Object.entries(byKpi)) {
      const kpi = kpiByCode(code);
      if (!kpi || kpi.ytd !== 'entered') throw new Error(`YTD measure has a non-P&L KPI ${code}`);
      if (valueText === null) {
        ytdNotes.push(`${year} ${raw} ${code}: BLANK() in the measure, no YTD row`);
        continue;
      }
      const category = categoryOf.get(`${kpi.code}|${year}`);
      if (!category) throw new Error(`No ${year} rows for ${code} to take a category from`);
      ytdRows.push({
        kpi: kpi.code,
        year,
        period: 'YTD',
        country,
        countryRaw: raw,
        valueText,
        targetWords: null,
        category,
      });
    }
  }
}
const ytdKeys = new Set(ytdRows.map(rowKey));
if (ytdKeys.size !== ytdRows.length) throw new Error('Two YTD figures map to the same cell');
for (const r of winners)
  if (ytdKeys.has(rowKey(r))) throw new Error(`The export already has a YTD row for ${rowKey(r)}`);
say();
say(`Power BI P&L YTD: ${ytdRows.length} rows (${ytdNotes.length} BLANK skipped)`);
for (const n of ytdNotes) say(`    ${n}`);

if (REPORT) writeFileSync(REPORT, out.join('\n') + '\n');
if (rejects.length) {
  console.error('\nRejected rows: fix the source or the rules before loading. Nothing written.');
  process.exit(1);
}
if (DRY) {
  console.log('\n--dry: nothing written.');
  process.exit(0);
}

/* ── 3. Write ── */
const client = new pg.Client({
  ...credentials('sourceguide'),
  database: process.env.ALL_KPIS_DB_NAME || 'all_kpis',
});
await client.connect();
try {
  await client.query('BEGIN');
  const { rows: existing } = await client.query('SELECT count(*)::int AS n FROM kpi_values');
  if (existing[0].n > 0)
    throw new Error(`kpi_values already holds ${existing[0].n} rows; this is a first load only.`);

  async function insertMany(sql, columns, rows) {
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const params = [];
      const tuples = chunk.map((r) => {
        const ph = r.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${ph.join(',')})`;
      });
      await client.query(`${sql} (${columns.join(',')}) VALUES ${tuples.join(',')}`, params);
    }
  }

  const fileName = CSV.split(/[\\/]/).pop();
  const { rows: l1 } = await client.query(
    `INSERT INTO kpi_loads (kind, file_name, loaded_by, rows_in_file, rows_added, rows_changed, rows_unchanged, rows_rejected, note)
     VALUES ('initial-load', $1, $2, $3, $4, 0, 0, 0, $5) RETURNING id`,
    [
      fileName,
      BY,
      parsed.rows.length,
      winners.length,
      `SharePoint "All KPIs" export; ${superseded.length} duplicate rows superseded by modified date`,
    ],
  );
  const load1 = l1[0].id;
  await insertMany(
    'INSERT INTO kpi_values',
    [
      'kpi',
      'year',
      'period',
      'country',
      'country_raw',
      'value',
      'target_words',
      'category',
      'source_ref',
      'source_modified',
      'load_id',
      'updated_by',
    ],
    winners.map((r) => [
      r.kpi,
      r.year,
      r.period,
      r.country,
      r.countryRaw,
      r.valueText,
      r.targetWords,
      r.category,
      r.sourceRef,
      modifiedById.get(r.sourceRef) ?? null,
      load1,
      BY,
    ]),
  );
  const header = grid.find((row) => row.map((c) => c.trim().toLowerCase()).includes('kpi'));
  const asCells = (line) =>
    Object.fromEntries(header.map((h, i) => [h, grid[line - 1]?.[i] ?? '']));
  await insertMany(
    'INSERT INTO kpi_source_rows',
    ['load_id', 'line', 'cells', 'outcome', 'reason'],
    [
      ...winners.map((r) => [load1, r.line, JSON.stringify(asCells(r.line)), 'added', null]),
      ...superseded.map((s) => [
        load1,
        s.row.line,
        JSON.stringify(asCells(s.row.line)),
        'superseded',
        s.reason,
      ]),
    ],
  );

  const { rows: l2 } = await client.query(
    `INSERT INTO kpi_loads (kind, file_name, loaded_by, rows_in_file, rows_added, rows_changed, rows_unchanged, rows_rejected, note)
     VALUES ('initial-load', $1, $2, $3, $3, 0, 0, 0, $4) RETURNING id`,
    [
      'Power BI YTD measures (2025 and 2026 reports)',
      BY,
      ytdRows.length,
      'P&L YTD figures that were typed into the Power BI YTD measure, mapped to board countries',
    ],
  );
  const load2 = l2[0].id;
  await insertMany(
    'INSERT INTO kpi_values',
    [
      'kpi',
      'year',
      'period',
      'country',
      'country_raw',
      'value',
      'target_words',
      'category',
      'load_id',
      'updated_by',
    ],
    ytdRows.map((r) => [
      r.kpi,
      r.year,
      r.period,
      r.country,
      r.countryRaw,
      r.valueText,
      null,
      r.category,
      load2,
      BY,
    ]),
  );
  await insertMany(
    'INSERT INTO kpi_source_rows',
    ['load_id', 'line', 'cells', 'outcome', 'reason'],
    ytdRows.map((r, i) => [
      load2,
      i + 1,
      JSON.stringify({ year: r.year, country: r.countryRaw, kpi: r.kpi, value: r.valueText }),
      'added',
      null,
    ]),
  );

  const { rows: total } = await client.query('SELECT count(*)::int AS n FROM kpi_values');
  await client.query('COMMIT');
  console.log(`\nLoaded. kpi_values now holds ${total[0].n} rows (loads ${load1} and ${load2}).`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\nRolled back:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
