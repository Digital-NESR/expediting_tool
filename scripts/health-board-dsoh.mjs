#!/usr/bin/env node
/**
 * Days Stock On Hand (KPI - DSOH) as a Health Board upload file. The procedure, and why, is in
 * src/lib/health-board/procedures/dsoh.md.
 *
 *   node scripts/health-board-dsoh.mjs --year=2026 --months=August,September,October \
 *     --countries="India=1159,Algeria=217,KSA=118,Jordon=206,Syria=" \
 *     --global-file="<DSOH by Year and Month.xlsx>" --out=reports/health-board/dsoh-2026-aug-oct.csv
 *
 * Countries: the dashboard's per-country DSOH is LIVE ONLY (today's value, no month history), so
 * the owner reads it off the "DSOH Trend" table and the same value goes into every month being
 * filled (owner ruling, 24 Nov 2026). A country with no value (e.g. "Syria=") is skipped.
 * Global: the "DSOH by Year and Month" export keeps month-end history, so each month's Global comes
 * from its own row there, not from the live table's Total.
 * Values are whole days, as on the board.
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { normaliseCountry, MONTHS } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const list = (s) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const YEAR = Number(arg('year'));
const MONTHS_IN = list(arg('months'));
const COUNTRIES = list(arg('countries'));
const GLOBAL_FILE = arg('global-file');
const OUT = arg('out');
if (
  !YEAR ||
  !OUT ||
  !GLOBAL_FILE ||
  !COUNTRIES.length ||
  !MONTHS_IN.length ||
  MONTHS_IN.some((m) => !MONTHS.includes(m))
) {
  console.error(
    'Usage: --year=2026 --months=August,September --countries="India=1159,…" --global-file=… --out=upload.csv',
  );
  process.exit(2);
}

const countries = [];
for (const pair of COUNTRIES) {
  const [raw, value] = pair.split('=').map((s) => s.trim());
  if (!value) {
    console.log(`${raw}: no value, skipped`);
    continue;
  }
  const country = normaliseCountry(raw);
  if (!country) throw new Error(`Unknown country "${raw}"`);
  if (!/^\d+(\.\d+)?$/.test(value))
    throw new Error(`"${raw}" has a value that is not a number: ${value}`);
  countries.push({ raw, country, value: Math.round(Number(value)) });
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(GLOBAL_FILE);
const ws = wb.getWorksheet('Export');
const head = ws.getRow(1).values.slice(1).map(String);
const col = (re) => head.findIndex((h) => re.test(h)) + 1;
const [cy, cm, cv] = [col(/\[Year\]$/), col(/\[Month\]$/), col(/^\[DSOH\]$/)];
if ([cy, cm, cv].some((c) => c <= 0))
  throw new Error(`${GLOBAL_FILE}: unexpected columns ${head.join(', ')}`);
const global = new Map();
ws.eachRow((r, i) => {
  if (i > 1)
    global.set(`${r.getCell(cy).value}|${r.getCell(cm).value}`, Number(r.getCell(cv).value));
});

const line = (country, value, month) => [
  country,
  String(value),
  month,
  String(YEAR),
  'KPI - DSOH',
  'Materials Management',
  'Days',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  const g = global.get(`${YEAR}|${month}`);
  if (g === undefined) throw new Error(`No Global DSOH for ${month} ${YEAR} in ${GLOBAL_FILE}`);
  for (const c of countries) lines.push(line(c.country, c.value, month));
  lines.push(line('Global', Math.round(g), month));
  console.log(`${month} Global: ${Math.round(g)} (export ${g.toFixed(2)})`);
}
for (const c of countries)
  console.log(`${c.country}${c.raw !== c.country ? ` (typed: ${c.raw})` : ''}: ${c.value}`);
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows for ${MONTHS_IN.join(', ')} ${YEAR}.`);
