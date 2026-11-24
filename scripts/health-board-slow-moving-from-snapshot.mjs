#!/usr/bin/env node
/**
 * Slow-Moving Inventory > 2 Years (KPI - Slow Moving) from the Power BI live snapshot export, as
 * a Health Board upload file. The procedure, and why, is in
 * src/lib/health-board/procedures/slow-moving.md.
 *
 *   node scripts/health-board-slow-moving-from-snapshot.mjs \
 *     --file="<data.xlsx>" --year=2026 --months=August,September,October \
 *     --out=reports/health-board/slow-moving-2026-aug-oct.csv
 *
 * The source is LIVE ONLY: it shows today's slow-moving stock, not a month-end history. The owner's
 * ruling (24 Nov 2026) is to record the snapshot in the months being filled (--months).
 *
 * Refuses to run unless the file's "Applied filters" are the ones the KPI needs, and unless the
 * countries add up to the file's Total. Countries are mapped with the board's own spellings
 * (KSA → Saudi Arabia, Jordon → Jordan), and Global is the file's Total.
 *
 * The export is a minimal xlsx that exceljs cannot open, so the sheet XML is read directly.
 */
import { writeFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { readMinimalXlsx, requireFilters } from './lib/minimal-xlsx.mjs';

const jiti = createJiti(import.meta.url);
const { normaliseCountry, MONTHS } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FILE = arg('file');
const YEAR = Number(arg('year'));
const MONTHS_IN = (arg('months') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = arg('out');
if (!FILE || !YEAR || !OUT || !MONTHS_IN.length || MONTHS_IN.some((m) => !MONTHS.includes(m))) {
  console.error(
    'Usage: --file=data.xlsx --year=2026 --months=August,September,October --out=upload.csv',
  );
  process.exit(2);
}

const NEEDED = [
  'YEAR_AGING is 2 - 3 Years, 3 - 4 Years, 4 - 5 Years, or > 5 Years',
  'Material_Type is not ZAST',
  'Value_Unrestricted is greater than 0',
];

const rows = await readMinimalXlsx(FILE);
requireFilters(FILE, rows, NEEDED);
if (rows[0]?.[0] !== 'Reporting Country - Finance' || rows[0]?.[1] !== 'SOH_amount') {
  throw new Error(`${FILE}: unexpected header ${JSON.stringify(rows[0])}`);
}

const cents = (x) => Math.round(x * 100) / 100;
const values = [];
let total = null;
for (const r of rows.slice(1)) {
  if (r.length !== 2) continue;
  if (r[0] === 'Total') {
    total = Number(r[1]);
    continue;
  }
  const country = normaliseCountry(r[0]);
  if (!country) throw new Error(`Unknown country "${r[0]}" in ${FILE}`);
  values.push({ raw: r[0], country, value: cents(Number(r[1])) });
}
if (total === null) throw new Error(`${FILE}: no Total row`);
const sum = cents(values.reduce((s, v) => s + v.value, 0));
if (Math.abs(sum - cents(total)) > 0.05) {
  throw new Error(`Countries add up to ${sum}, but the file's Total is ${total}`);
}

const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  for (const v of values) {
    lines.push([
      v.country,
      v.value.toFixed(2),
      month,
      String(YEAR),
      'KPI - Slow Moving',
      'Materials Management',
      '$',
      '',
    ]);
  }
  lines.push([
    'Global',
    cents(total).toFixed(2),
    month,
    String(YEAR),
    'KPI - Slow Moving',
    'Materials Management',
    '$',
    '',
  ]);
}
writeFileSync(
  OUT,
  lines.map((l) => l.map((c) => (/[",]/.test(c) ? `"${c}"` : c)).join(',')).join('\r\n') + '\r\n',
);
for (const v of values)
  console.log(
    `${v.country}${v.raw !== v.country ? ` (file: ${v.raw})` : ''}: ${v.value.toFixed(2)}`,
  );
console.log(
  `Global (file Total; countries add up to ${sum.toFixed(2)}): ${cents(total).toFixed(2)}`,
);
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows for ${MONTHS_IN.join(', ')} ${YEAR}.`);
