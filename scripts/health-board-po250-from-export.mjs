#!/usr/bin/env node
/**
 * PO Value < 250 $ (KPI - PO < 250 $) from the Power BI (Supply Chain Data to Insights 2.0)
 * "POs_With_Value_lessThan250%" export by Reporting Country and GR posting year and month, as a
 * Health Board upload file. The procedure, and why, is in src/lib/health-board/procedures/po-under-250.md.
 *
 *   node scripts/health-board-po250-from-export.mjs --file="<data.xlsx>" --year=2026 \
 *     --months=January,February,…,October --out=reports/health-board/po250-2026.csv
 *
 * Values are fractions in the export and percentages on the board (× 100). Global = all POs under
 * $250 ÷ all POs that month, from the counts in the export (owner ruling, 24 Nov 2026), not the mean
 * of the country percentages. Rows for other GR posting years in the file are ignored.
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
  console.error('Usage: --file=data.xlsx --year=2026 --months=January,February --out=upload.csv');
  process.exit(2);
}

const NEEDED = [
  `Year is ${YEAR}`,
  '4YSUPPLY-FRGKE_KEY is G',
  '4YSUPPLY-PLANT_KEY is not 8013 or PM30',
  '4YSUPPLY-DELV_STATUS_KEY is Fully Delivered',
  'EXT_LTD_Bucket is not Wrong Date',
  '4YSUPPLY-PU_DOC_TYPE_KEY is not INTC',
  'Reporting Segment - Finance is not Speciality Chemicals',
  '4YSUPPLY-DELETION_INDICATOR_KEY is',
];

const rows = await readMinimalXlsx(FILE);
requireFilters(FILE, rows, NEEDED);
const head = rows[0] ?? [];
const idx = (name) => head.indexOf(name);
const [ic, iy, im, ip, in_] = [
  idx('Reporting Country - Finance'),
  idx('4YSUPPLY-GR_POSTING_DATE_KEY - Year'),
  idx('4YSUPPLY-GR_POSTING_DATE_KEY - Month'),
  idx('POs_With_Value_lessThan250%'),
  idx('POs_With_Value_lessThan250'),
];
if ([ic, iy, im, ip, in_].some((i) => i < 0))
  throw new Error(`${FILE}: unexpected header ${JSON.stringify(head)}`);

const pct = (x) => Math.round(x * 100 * 1e8) / 1e8;
const data = [];
for (const r of rows.slice(1)) {
  if (r.length !== head.length || Number(r[iy]) !== YEAR) continue;
  const country = normaliseCountry(r[ic]);
  if (!country) throw new Error(`Unknown country "${r[ic]}" in ${FILE}`);
  const share = Number(r[ip]);
  data.push({ raw: r[ic], country, month: r[im], value: pct(share), share, count: Number(r[in_]) });
}

const line = (country, value, month) => [
  country,
  String(value),
  month,
  String(YEAR),
  'KPI - PO < 250 $',
  'Purchasing',
  '%',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  const here = data.filter((d) => d.month === month);
  if (!here.length) throw new Error(`No rows for ${month} ${YEAR} in ${FILE}`);
  for (const v of here) lines.push(line(v.country, v.value, month));
  /* Global = all POs under $250 ÷ all POs. Each country's PO total is its count ÷ its share; a
     country at 0% has no recoverable total, so the script refuses rather than guess. */
  if (here.some((v) => v.share === 0))
    throw new Error(`${month}: a country has 0%, so its PO total cannot be derived for Global`);
  const under = here.reduce((s, v) => s + v.count, 0);
  const all = here.reduce((s, v) => s + v.count / v.share, 0);
  const global = pct(under / all);
  lines.push(line('Global', global, month));
  console.log(
    `${month}: ${here.length} countries, Global ${global.toFixed(2)}% (${under} of ${Math.round(all)} POs)`,
  );
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
