#!/usr/bin/env node
/**
 * Catalogue / PIR Coverage (KPI - PIR Coverage) from the two Power BI "$Value for POs with PIR"
 * exports, as a Health Board upload file. The procedure, and why, is in
 * src/lib/health-board/procedures/pir-coverage.md.
 *
 *   node scripts/health-board-pir-from-export.mjs \
 *     --by-country="<$Value for POs with PIR By Country.xlsx>" \
 *     --global="<$Value for POs with PIR By Release Timeline.xlsx>" \
 *     --year=2026 --months=August,September,October --out=reports/health-board/pir-2026-aug-oct.csv
 *
 * Value = "%PO$ with PIR" (a fraction in the export, a percentage on the board) by PO release month.
 * Countries come from the by-country file and Global from the release-timeline file, which is the
 * all-countries figure. Both are minimal xlsx files read with scripts/lib/minimal-xlsx.mjs.
 */
import { writeFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { readMinimalXlsx, requireFilters } from './lib/minimal-xlsx.mjs';

const jiti = createJiti(import.meta.url);
const { normaliseCountry, MONTHS } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const BY_COUNTRY = arg('by-country');
const GLOBAL = arg('global');
const YEAR = Number(arg('year'));
const MONTHS_IN = (arg('months') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = arg('out');
if (
  !BY_COUNTRY ||
  !GLOBAL ||
  !YEAR ||
  !OUT ||
  !MONTHS_IN.length ||
  MONTHS_IN.some((m) => !MONTHS.includes(m))
) {
  console.error(
    'Usage: --by-country=… --global=… --year=2026 --months=August,September --out=upload.csv',
  );
  process.exit(2);
}

const NEEDED = [
  `Year is ${YEAR}`,
  'Account Classification Description is Direct Order or Inventory',
];
const pct = (x) => Math.round(x * 100 * 1e8) / 1e8;
const column = (head, name, file) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`${file}: no "${name}" column in ${JSON.stringify(head)}`);
  return i;
};

/* Countries: Reporting Country, %PO$ with PIR, release month (the year is the filter's). */
const c = await readMinimalXlsx(BY_COUNTRY);
requireFilters(BY_COUNTRY, c, NEEDED);
const ch = c[0];
const [cc, cp, cm] = [
  column(ch, 'Reporting Country - Finance', BY_COUNTRY),
  column(ch, '%PO$ with PIR', BY_COUNTRY),
  column(ch, '4YSUPPLY-PO_RELEASE_DATE_KEY - Month', BY_COUNTRY),
];
const countries = [];
for (const r of c.slice(1)) {
  if (r.length !== ch.length) continue; // the Total and filters rows
  const country = normaliseCountry(r[cc]);
  if (!country) throw new Error(`Unknown country "${r[cc]}" in ${BY_COUNTRY}`);
  countries.push({ raw: r[cc], country, month: r[cm], value: pct(Number(r[cp])) });
}

/* Global: release year and month, %PO$ with PIR. */
const g = await readMinimalXlsx(GLOBAL);
requireFilters(GLOBAL, g, NEEDED);
const gh = g[0];
const [gy, gm, gp] = [
  column(gh, '4YSUPPLY-PO_RELEASE_DATE_KEY - Year', GLOBAL),
  column(gh, '4YSUPPLY-PO_RELEASE_DATE_KEY - Month', GLOBAL),
  column(gh, '%PO$ with PIR', GLOBAL),
];
const global = new Map();
for (const r of g.slice(1)) {
  if (r.length === gh.length && Number(r[gy]) === YEAR) global.set(r[gm], pct(Number(r[gp])));
}

const line = (country, value, month) => [
  country,
  String(value),
  month,
  String(YEAR),
  'KPI - PIR Coverage',
  'Sourcing & Supplier Management',
  '%',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  const here = countries.filter((x) => x.month === month);
  if (!here.length) throw new Error(`No country rows for ${month} in ${BY_COUNTRY}`);
  if (!global.has(month)) throw new Error(`No Global row for ${month} ${YEAR} in ${GLOBAL}`);
  for (const v of here) lines.push(line(v.country, v.value, month));
  lines.push(line('Global', global.get(month), month));
  console.log(
    `${month}: ${here.map((v) => `${v.country} ${v.value.toFixed(2)}`).join(', ')}; Global ${global.get(month).toFixed(2)}`,
  );
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
