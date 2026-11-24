#!/usr/bin/env node
/**
 * FMT - ICPO Transfer Out (KPI - FMT - ICPO Transfer out) from the Power BI "Transfer Out MoM by
 * Country" export, as a Health Board upload file. The procedure, and why, is in
 * src/lib/health-board/procedures/icpo-transfer-out.md.
 *
 *   node scripts/health-board-icpo-from-export.mjs --file="<Transfer Out MoM by Country.xlsx>" \
 *     --year=2026 --from=March --to=October --out=reports/health-board/icpo-2026-mar-oct.csv
 *
 * Value per country and month = TR_OUT_AMOUNT_ (USD, negative = transferred out), rounded to the
 * cent; "Dubai" is the board's "HQ Dubai"; Global = the sum of the countries. Refuses to run unless
 * the "Export Details" sheet shows the filters the KPI needs.
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { normaliseCountry, MONTHS } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FILE = arg('file');
const YEAR = Number(arg('year'));
const OUT = arg('out');
const from = MONTHS.indexOf(arg('from') ?? '');
const to = MONTHS.indexOf(arg('to') ?? '');
if (!FILE || !YEAR || !OUT || from < 0 || to < from) {
  console.error('Usage: --file=… --year=2026 --from=March --to=October --out=upload.csv');
  process.exit(2);
}

const NEEDED = [
  'Movement_Type is not 309 or 310',
  'Plant is not 8013',
  'Reporting Country - Finance is not EOS DMCC or EOS JAFZA',
];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const details = [];
wb.getWorksheet('Export Details')?.eachRow((r) => details.push(String(r.getCell(1).value ?? '')));
const filters = details.join('\n');
const missing = NEEDED.filter((f) => !filters.includes(f));
if (missing.length) {
  throw new Error(
    `${FILE}: missing filter(s): ${missing.join('; ')}\nIts filters were:\n${filters}`,
  );
}

const ws = wb.getWorksheet('Export');
const head = ws.getRow(1).values.slice(1).map(String);
const col = (re) => head.findIndex((h) => re.test(h)) + 1;
const [cy, cm, cc, cv] = [
  col(/\[Year\]$/),
  col(/\[Month\]$/),
  col(/Country of Legal Entity/),
  col(/TR_OUT_AMOUNT/),
];
if ([cy, cm, cc, cv].some((c) => c <= 0))
  throw new Error(`${FILE}: unexpected columns ${head.join(', ')}`);

const cents = (x) => Math.round(x * 100) / 100;
const rows = [];
ws.eachRow((r, i) => {
  if (i === 1) return;
  const raw = String(r.getCell(cc).value ?? '').trim();
  const country = raw === 'Dubai' ? 'HQ Dubai' : normaliseCountry(raw);
  if (!country) throw new Error(`Unknown country "${raw}" in ${FILE}`);
  rows.push({
    year: Number(r.getCell(cy).value),
    month: String(r.getCell(cm).value),
    raw,
    country,
    value: cents(Number(r.getCell(cv).value)),
  });
});

const line = (country, value, month) => [
  country,
  value.toFixed(2),
  month,
  String(YEAR),
  'KPI - FMT - ICPO Transfer out',
  'Materials Management',
  '$',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (let m = from; m <= to; m++) {
  const month = MONTHS[m];
  const here = rows.filter((r) => r.year === YEAR && r.month === month);
  if (!here.length) throw new Error(`No rows for ${month} ${YEAR} in ${FILE}`);
  let global = 0;
  for (const v of here) {
    global = cents(global + v.value);
    lines.push(line(v.country, v.value, month));
    console.log(
      `${month} ${v.country}${v.raw !== v.country ? ` (file: ${v.raw})` : ''}: ${v.value.toFixed(2)}`,
    );
  }
  lines.push(line('Global', global, month));
  console.log(`${month} Global (sum of ${here.length} countries): ${global.toFixed(2)}`);
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
