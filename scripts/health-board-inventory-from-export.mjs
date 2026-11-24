#!/usr/bin/env node
/**
 * Inventory Reduction (KPI - Inventory Reduction) from the two Power BI exports, as a Health
 * Board upload file. The procedure, and why, is in src/lib/health-board/procedures/inventory-reduction.md.
 *
 *   node scripts/health-board-inventory-from-export.mjs \
 *     --all="<Inventory$ MoM by Country.xlsx>"            (every country, EOS DMCC/JAFZA excluded)
 *     --ksa-hf="<Inventory$ MoM by Country (1).xlsx>"     (KSA, Hydraulic Fracturing segment only)
 *     --year=2026 --from=July --to=October
 *     --out=<upload.csv>
 *
 * Refuses to run unless each file's "Export Details" sheet shows the filters the KPI needs, so a
 * file exported with the wrong filters cannot slip through.
 *
 * KPI value per country and month = total inventory cost (USD) from the first export, except
 *   Saudi Arabia = first export − the KSA Hydraulic Fracturing export;
 *   "Dubai" in the export is the board's "HQ Dubai";
 *   Global = the sum of the countries (after the KSA subtraction).
 * Values are rounded to the cent; Global is the sum of the rounded country values.
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ALL = arg('all');
const HF = arg('ksa-hf');
const YEAR = Number(arg('year'));
const OUT = arg('out');
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const from = MONTHS.indexOf(arg('from') ?? '');
const to = MONTHS.indexOf(arg('to') ?? '');
if (!ALL || !HF || !YEAR || !OUT || from < 0 || to < from) {
  console.error('Usage: --all=… --ksa-hf=… --year=2026 --from=July --to=October --out=upload.csv');
  process.exit(2);
}

/* The filters each export must carry (from its "Export Details" sheet). */
const NEEDED_ALL = [
  'Material Type is not ZAST or ZSER',
  'Country of Legal Entity is not (Blank)',
  'Reporting Country - Finance is not EOS DMCC or EOS JAFZA',
];
const NEEDED_HF = [
  'Material Type is not ZAST or ZSER',
  'Country of Legal Entity is not (Blank)',
  'Reporting Segment - Finance is Hydraulic Fracturing',
  'Reporting Country - Finance is KSA',
];

async function readExport(path, needed) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const details = wb.getWorksheet('Export Details');
  const filters = [];
  details?.eachRow((r) => filters.push(String(r.getCell(1).value ?? '')));
  const text = filters.join('\n');
  const missing = needed.filter((f) => !text.includes(f));
  if (missing.length) {
    throw new Error(
      `${path}: the export is missing filter(s): ${missing.join('; ')}\nIts filters were:\n${text}`,
    );
  }
  const ws = wb.getWorksheet('Export');
  const head = ws.getRow(1).values.slice(1).map(String);
  const col = (re) => head.findIndex((h) => re.test(h)) + 1;
  const [cy, cm, cc, cv] = [
    col(/\[Year\]$/),
    col(/\[Month\]$/),
    col(/Country of Legal Entity/),
    col(/SumTotal_Cost/),
  ];
  if ([cy, cm, cc, cv].some((c) => c <= 0))
    throw new Error(`${path}: unexpected columns ${head.join(', ')}`);
  const rows = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    rows.push({
      year: Number(r.getCell(cy).value),
      month: String(r.getCell(cm).value),
      country: String(r.getCell(cc).value),
      value: Number(r.getCell(cv).value),
    });
  });
  return { rows, filters: text };
}

const COUNTRY = { Dubai: 'HQ Dubai' };
const cents = (x) => Math.round(x * 100) / 100;

const all = await readExport(ALL, NEEDED_ALL);
const hf = await readExport(HF, NEEDED_HF);

const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
const report = [];
for (let m = from; m <= to; m++) {
  const month = MONTHS[m];
  const here = all.rows.filter((r) => r.year === YEAR && r.month === month);
  if (!here.length) throw new Error(`No rows for ${month} ${YEAR} in ${ALL}`);
  const hfRow = hf.rows.filter((r) => r.year === YEAR && r.month === month);
  if (hfRow.length !== 1 || hfRow[0].country !== 'Saudi Arabia') {
    throw new Error(`Expected exactly one KSA Hydraulic Fracturing row for ${month} ${YEAR}`);
  }
  let global = 0;
  for (const r of here) {
    const country = COUNTRY[r.country] ?? r.country;
    const value = cents(r.country === 'Saudi Arabia' ? r.value - hfRow[0].value : r.value);
    global = cents(global + value);
    lines.push([
      country,
      value.toFixed(2),
      month,
      String(YEAR),
      'KPI - Inventory Reduction',
      'Materials Management',
      '$',
      '',
    ]);
    report.push(
      `${month} ${country}: ${value.toFixed(2)}${r.country === 'Saudi Arabia' ? ` (= ${r.value.toFixed(2)} − KSA HF ${hfRow[0].value.toFixed(2)})` : ''}`,
    );
  }
  lines.push([
    'Global',
    global.toFixed(2),
    month,
    String(YEAR),
    'KPI - Inventory Reduction',
    'Materials Management',
    '$',
    '',
  ]);
  report.push(`${month} Global (sum of ${here.length} countries): ${global.toFixed(2)}`);
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(report.join('\n'));
console.log(
  `\nWrote ${OUT}: ${lines.length - 1} rows. Upload it on /admin → Supply Chain Analytics → Health Board Data.`,
);
