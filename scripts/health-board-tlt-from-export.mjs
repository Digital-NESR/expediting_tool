#!/usr/bin/env node
/**
 * Supplier Lead Time PO to GR, Local and International (KPI - TLT (Local), KPI - TLT (Intl)), from
 * the Power BI (Supply Chain Data to Insights 2.0) "Average of EXT_LTD" export by Reporting
 * Country, Purch_ORG_Flag and GR posting year and month, as one Health Board upload file. The
 * procedure, and why, is in src/lib/health-board/procedures/tlt.md.
 *
 *   node scripts/health-board-tlt-from-export.mjs --file="<data.xlsx>" --year=2026 \
 *     --months=August,September,October --out=reports/health-board/tlt-2026-aug-oct.csv
 *
 * Purch_ORG_Flag LOCL → TLT (Local), FORN → TLT (Intl). Values rounded to 2 decimals. Global = the
 * simple mean of the country values that month, per KPI, leaving out any country more than 10x
 * the median of the other countries (owner rulings, 24 Nov 2026).
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
  console.error('Usage: --file=data.xlsx --year=2026 --months=August,September --out=upload.csv');
  process.exit(2);
}

const NEEDED = [
  '4YSUPPLY-FRGKE_KEY is G',
  '4YSUPPLY-PLANT_KEY is not 8013 or PM30',
  '4YSUPPLY-DELV_STATUS_KEY is Fully Delivered',
  'EXT_LTD_Bucket is not Wrong Date',
  '4YSUPPLY-PU_DOC_TYPE_KEY is not INTC',
  'Reporting Segment - Finance is not Speciality Chemicals',
  '4YSUPPLY-DELETION_INDICATOR_KEY is',
];
const KPI_BY_FLAG = { LOCL: 'KPI - TLT (Local)', FORN: 'KPI - TLT (Intl)' };

const rows = await readMinimalXlsx(FILE);
requireFilters(FILE, rows, NEEDED);
const head = rows[0] ?? [];
const idx = (name) => head.indexOf(name);
const [ic, ifl, iv, iy, im] = [
  idx('Reporting Country - Finance'),
  idx('Purch_ORG_Flag'),
  idx('Average of EXT_LTD'),
  idx('4YSUPPLY-GR_POSTING_DATE_KEY - Year'),
  idx('4YSUPPLY-GR_POSTING_DATE_KEY - Month'),
];
if ([ic, ifl, iv, iy, im].some((i) => i < 0))
  throw new Error(`${FILE}: unexpected header ${JSON.stringify(head)}`);

const round2 = (x) => Math.round(x * 100) / 100;
const data = new Map();
for (const r of rows.slice(1)) {
  if (r.length !== head.length) continue; // the Total and filters rows
  const kpi = KPI_BY_FLAG[r[ifl]];
  if (!kpi) throw new Error(`Unknown Purch_ORG_Flag "${r[ifl]}" in ${FILE}`);
  const country = normaliseCountry(r[ic]);
  if (!country) throw new Error(`Unknown country "${r[ic]}" in ${FILE}`);
  const key = `${kpi}|${r[iy]}|${r[im]}|${country}`;
  const value = round2(Number(r[iv]));
  if (data.has(key) && data.get(key).value !== value)
    throw new Error(`Conflicting rows for ${key}`);
  data.set(key, { kpi, year: Number(r[iy]), month: r[im], raw: r[ic], country, value });
}

/* A country is left out of Global when it is more than OUTLIER_FACTOR times the median of the
   other countries that month (owner ruling, 24 Nov 2026). Its own value is still loaded. */
const OUTLIER_FACTOR = 10;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const isOutlier = (v, all) => {
  const others = all.filter((o) => o !== v).map((o) => o.value);
  return others.length >= 3 && v.value > OUTLIER_FACTOR * median(others);
};

const line = (kpi, country, value, month) => [
  country,
  value.toFixed(2),
  month,
  String(YEAR),
  kpi,
  'Purchasing',
  'Days',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const kpi of Object.values(KPI_BY_FLAG)) {
  for (const month of MONTHS_IN) {
    const here = [...data.values()].filter(
      (d) => d.kpi === kpi && d.year === YEAR && d.month === month,
    );
    if (!here.length) throw new Error(`No ${kpi} rows for ${month} ${YEAR} in ${FILE}`);
    for (const v of here) lines.push(line(kpi, v.country, v.value, month));
    const outliers = here.filter((v) => isOutlier(v, here));
    const kept = here.filter((v) => !outliers.includes(v));
    const mean = round2(kept.reduce((s, v) => s + v.value, 0) / kept.length);
    lines.push(line(kpi, 'Global', mean, month));
    const left = outliers.map((v) => `${v.country} ${v.value}`).join(', ');
    console.log(
      `${kpi} ${month}: ${here.map((v) => `${v.country} ${v.value}`).join(', ')}\n  Global (mean of ${kept.length}): ${mean}${left ? `  (left out: ${left})` : ''}`,
    );
  }
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
