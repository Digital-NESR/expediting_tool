#!/usr/bin/env node
/**
 * The two Purchasing Performance cycle-time KPIs from their Power BI exports, as a Health Board
 * upload file. Both exports have the same shape and filters, so one script does both:
 *   --kpi=pr-to-po     PR to PO Creation Days ("AVG PO Creation Cycle Time [Days]")
 *   --kpi=po-approval  PO Approval Days ("AVG PO Approval cycle")
 * The procedure, and why, is in src/lib/health-board/procedures/pr-to-po.md (both KPIs).
 *
 *   node scripts/health-board-pr-to-po-from-export.mjs --kpi=pr-to-po \
 *     --file="<AVG PO Creation Cycle Time [Days].xlsx>" --year=2026 \
 *     --months=August,September,October  [--countries-only=March --only=Chad,India,Yemen] \
 *     --out=reports/health-board/pr-to-po-2026-aug-oct.csv
 *
 * --months         months written for every country, plus Global = the simple mean of the
 *                  country values that month (owner ruling, 24 Nov 2026).
 * --countries-only months written for the countries only, Global left as stored (used to fill
 *                  countries missing from a month already on the board). Limit it with
 *                  --only=Chad,India so the countries already stored are not overwritten.
 *
 * The export recalculates every past month live, so only load the months asked for; earlier
 * months stay as they were reported at the time (owner ruling, 24 Nov 2026).
 *
 * Refuses to run unless the "Export Details" sheet shows the filters the KPI needs.
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
const KPIS = {
  'pr-to-po': { code: 'KPI - PR to PO creation', column: /AveragePO_Creation_Cycle_time/ },
  'po-approval': { code: 'KPI - PO Approval', column: /AveragePO_Approval_Cycle_time/ },
};
const KPI = KPIS[arg('kpi') ?? ''];
const FILE = arg('file');
const YEAR = Number(arg('year'));
const WITH_GLOBAL = list(arg('months'));
const COUNTRIES_ONLY = list(arg('countries-only'));
const ONLY = list(arg('only'));
const OUT = arg('out');
const asked = [...WITH_GLOBAL, ...COUNTRIES_ONLY];
if (!KPI || !FILE || !YEAR || !OUT || !asked.length || asked.some((m) => !MONTHS.includes(m))) {
  console.error(
    'Usage: --kpi=pr-to-po|po-approval --file=export.xlsx --year=2026 --months=August,September [--countries-only=March --only=Chad] --out=upload.csv',
  );
  process.exit(2);
}

const NEEDED = [
  'ActiveBuyerFlag is 1',
  '4YSUPPLY-FRGKE_KEY is G',
  '4YSUPPLY-DELETION_INDICATOR_KEY is',
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
  col(/Reporting Country - Finance/),
  col(KPI.column),
];
if ([cy, cm, cc, cv].some((c) => c <= 0))
  throw new Error(`${FILE}: unexpected columns ${head.join(', ')}`);

const round2 = (x) => Math.round(x * 100) / 100;
const rows = [];
ws.eachRow((r, i) => {
  if (i === 1) return;
  const raw = String(r.getCell(cc).value ?? '').trim();
  if (!raw) {
    console.warn(`Skipped a row with no country: ${JSON.stringify(r.values.slice(1))}`);
    return;
  }
  const country = normaliseCountry(raw);
  if (!country) throw new Error(`Unknown country "${raw}" in ${FILE}`);
  rows.push({
    year: Number(r.getCell(cy).value),
    month: String(r.getCell(cm).value),
    raw,
    country,
    value: Number(r.getCell(cv).value),
  });
});

const line = (country, value, month) => [
  country,
  value.toFixed(2),
  month,
  String(YEAR),
  KPI.code,
  'Purchasing',
  'Days',
  '',
];
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
for (const month of asked) {
  const here = rows.filter((r) => r.year === YEAR && r.month === month);
  if (!here.length) throw new Error(`No rows for ${month} ${YEAR} in ${FILE}`);
  const values = here
    .filter((r) => WITH_GLOBAL.includes(month) || !ONLY.length || ONLY.includes(r.country))
    .map((r) => ({ ...r, value: round2(r.value) }));
  for (const v of values) {
    lines.push(line(v.country, v.value, month));
    console.log(
      `${month} ${v.country}${v.raw !== v.country ? ` (file: ${v.raw})` : ''}: ${v.value.toFixed(2)}${v.value < 0 ? '  NEGATIVE' : ''}`,
    );
  }
  if (WITH_GLOBAL.includes(month)) {
    const mean = round2(values.reduce((s, v) => s + v.value, 0) / values.length);
    lines.push(line('Global', mean, month));
    console.log(`${month} Global (mean of ${values.length} countries): ${mean.toFixed(2)}`);
  }
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(`\nWrote ${OUT}: ${lines.length - 1} rows.`);
