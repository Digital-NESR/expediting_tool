#!/usr/bin/env node
/**
 * Supplier Count (KPI - Supplier No.) from the Power BI (Supplier Management | AVL) "Total and Active
 * Suppliers by Purchase Organization" export, as a Health Board upload file. The procedure, and why,
 * is in src/lib/health-board/procedures/supplier-count.md.
 *
 *   node scripts/health-board-suppliers-from-snapshot.mjs --file="<…by Purchase Organization.xlsx>" \
 *     --year=2026 --months=August,September,October --global=2587 \
 *     --out=reports/health-board/suppliers-2026-aug-oct.csv
 *
 * The source is LIVE ONLY (today's active suppliers), so the one snapshot goes into every month
 * being filled (owner ruling, 24 Nov 2026). Global counts each supplier once across countries, so it
 * is NOT the sum of the rows; the owner reads it off the dashboard and passes it as --global.
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { MONTHS, normaliseCountry } = await jiti.import('../src/lib/health-board/definitions.ts');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FILE = arg('file');
const YEAR = Number(arg('year'));
const GLOBAL = Number(arg('global'));
const MONTHS_IN = (arg('months') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = arg('out');
if (
  !FILE ||
  !YEAR ||
  !OUT ||
  !Number.isInteger(GLOBAL) ||
  GLOBAL <= 0 ||
  !MONTHS_IN.length ||
  MONTHS_IN.some((m) => !MONTHS.includes(m))
) {
  console.error(
    'Usage: --file=… --year=2026 --months=August,September --global=2587 --out=upload.csv',
  );
  process.exit(2);
}

const NEEDED = [
  'Central_purchasing_block is',
  'Purch__block_for_purchasing_organization is',
  'Vendor Type is Trading Vendors',
  '4YSUPPLY-SUPPLIER_PLANT_KEY is not EOS DMCC, , or EOS JAFZA',
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

const values = [];
wb.getWorksheet('Export').eachRow((r, i) => {
  if (i === 1) return;
  const org = String(r.getCell(1).value ?? '').trim();
  /* The board's aliases: KSA LOCL → Saudi Arabia, Dubai LOCL → HQ Dubai, Abu Dhabi LOCL → UAE. */
  const country = normaliseCountry(org);
  if (!country) throw new Error(`Unknown purchasing organisation "${org}" in ${FILE}`);
  const n = Number(r.getCell(2).value);
  if (!Number.isInteger(n)) throw new Error(`${org}: not a whole number (${r.getCell(2).value})`);
  values.push({ org, country, n });
});

const line = (country, value, month) => [
  country,
  String(value),
  month,
  String(YEAR),
  'KPI - Supplier No.',
  'Sourcing & Supplier Management',
  'Suppliers',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of MONTHS_IN) {
  for (const v of values) lines.push(line(v.country, v.n, month));
  lines.push(line('Global', GLOBAL, month));
}
const sum = values.reduce((s, v) => s + v.n, 0);
for (const v of values) console.log(`${v.country} (${v.org}): ${v.n}`);
console.log(`Global (given): ${GLOBAL}; the rows add up to ${sum}`);
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows for ${MONTHS_IN.join(', ')} ${YEAR}.`);
