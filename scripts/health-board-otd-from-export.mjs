#!/usr/bin/env node
/**
 * On-Time Delivery (KPI - OTD) from the Power BI (Supply Chain Data to Insights 2.0) "On Time
 * Delivery" export by Reporting Country and GR posting month, as a Health Board upload file. The
 * procedure, and why, is in src/lib/health-board/procedures/otd.md.
 *
 *   node scripts/health-board-otd-from-export.mjs --file="<data.xlsx>" --year=2026 \
 *     --months=August,September,October --out=reports/health-board/otd-2026-aug-oct.csv
 *
 * The export has no Year column; the year comes from its "Year is <year>" filter, which must match
 * --year. Values are fractions in the export and percentages on the board (× 100). Global = the
 * simple mean of the country values that month (owner ruling, 24 Nov 2026). Countries map with the
 * board's aliases (KSA → Saudi Arabia, Jordon → Jordan). The export is a minimal xlsx that exceljs
 * cannot open, so the sheet XML is read directly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { createJiti } from 'jiti';

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
  console.error('Usage: --file=data.xlsx --year=2026 --months=August,September --out=upload.csv');
  process.exit(2);
}

const NEEDED = [
  `Year is ${YEAR}`,
  '4YSUPPLY-PLANT_KEY is not 8013 or PM30',
  '4YSUPPLY-FRGKE_KEY is G',
  '4YSUPPLY-GR_POSTING_DATE_KEY is not (Blank)',
  '4YSUPPLY-PU_DOC_TYPE_KEY is not INTC',
  'Reporting Segment - Finance is not Speciality Chemicals',
  '4YSUPPLY-DELETION_INDICATOR_KEY is',
];

const zip = await JSZip.loadAsync(readFileSync(FILE));
const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
if (!sheet) throw new Error(`${FILE}: no sheet1 in the workbook`);
const decode = (s) =>
  s
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const rows = [...sheet.matchAll(/<x:row[^>]*>(.*?)<\/x:row>|<x:row\s*\/>/gs)].map((m) =>
  [
    ...(m[1] ?? '').matchAll(
      /<x:c[^>]*>(?:<x:is><x:t[^>]*>(.*?)<\/x:t><\/x:is>|<x:v>(.*?)<\/x:v>)<\/x:c>/gs,
    ),
  ].map((c) => decode(c[1] ?? c[2] ?? '')),
);

const filters = rows.map((r) => r.join(' ')).find((t) => t.startsWith('Applied filters')) ?? '';
const missing = NEEDED.filter((f) => !filters.includes(f));
if (missing.length) {
  throw new Error(
    `${FILE}: missing filter(s): ${missing.join('; ')}\nIts filters were:\n${filters}`,
  );
}
if (rows[0]?.[0] !== 'Reporting Country - Finance' || rows[0]?.[2] !== 'On Time Delivery') {
  throw new Error(`${FILE}: unexpected header ${JSON.stringify(rows[0])}`);
}

const pct = (x) => Math.round(x * 100 * 1e8) / 1e8;
const data = [];
for (const r of rows.slice(1)) {
  if (r.length !== 3 || r[0] === 'Total') continue;
  const country = normaliseCountry(r[0]);
  if (!country) throw new Error(`Unknown country "${r[0]}" in ${FILE}`);
  if (!MONTHS.includes(r[1])) throw new Error(`Unknown month "${r[1]}" in ${FILE}`);
  data.push({ raw: r[0], country, month: r[1], value: pct(Number(r[2])) });
}

const line = (country, value, month) => [
  country,
  String(value),
  month,
  String(YEAR),
  'KPI - OTD',
  'Purchasing',
  '%',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  const here = data.filter((d) => d.month === month);
  if (!here.length) throw new Error(`No rows for ${month} in ${FILE}`);
  for (const v of here) {
    lines.push(line(v.country, v.value, month));
    console.log(
      `${month} ${v.country}${v.raw !== v.country ? ` (file: ${v.raw})` : ''}: ${v.value.toFixed(2)}%`,
    );
  }
  const mean = pct(here.reduce((s, v) => s + v.value, 0) / here.length / 100);
  lines.push(line('Global', mean, month));
  console.log(`${month} Global (mean of ${here.length} countries): ${mean.toFixed(2)}%`);
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
