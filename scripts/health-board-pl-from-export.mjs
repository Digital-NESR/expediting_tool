#!/usr/bin/env node
/**
 * The six P&L KPIs from Finance's "NIS-Country (Amount in USD)" workbook, as a Health Board upload
 * file. The procedure, and why, is in src/lib/health-board/procedures/pl.md.
 *
 *   node scripts/health-board-pl-from-export.mjs --file="<NIS-Country (Amount in USD)OCT.xlsx>" \
 *     --year=2026 --months=August,September,October --ytd --out=reports/health-board/pl-2026-aug-oct.csv
 *
 * Sheet 1 ("…BY GLOBAL") holds Global; sheet 2 holds every country, with countries across the top
 * (row 1), months under them (row 2), and one row per ratio from row 4. Ratios are fractions in the
 * file and percentages on the board (× 100). "Totals" is the year to date and loads as the YTD row
 * when --ytd is given. A cell reading "na" (no revenue) is no value and is skipped.
 *
 *   MS / TR → P&L (M&S)    TM / TR → P&L (T&M)    OR / TR → P&L (O&R)
 *   OC / TR → P&L (O&C)    TE / TR → P&L (T&E)    PC / PR → P&L (PC/PR)
 *
 * Countries: SSA → Chad (the board's alias). HQ Dubai, HQ Houston, DO, NESR Consolidation, EOS and
 * Syria are not loaded (owner ruling, 24 Nov 2026; HQ Dubai's cells hold USD amounts, not ratios).
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
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
const YTD = process.argv.includes('--ytd');
/* --na-as-blank writes "na" cells as rows with an empty Value (used only to check stored months). */
const NA_AS_BLANK = process.argv.includes('--na-as-blank');
const OUT = arg('out');
if (!FILE || !YEAR || !OUT || MONTHS_IN.some((m) => !MONTHS.includes(m))) {
  console.error(
    'Usage: --file=… --year=2026 --months=August,September [--ytd] [--na-as-blank] --out=upload.csv',
  );
  process.exit(2);
}

/* The category each P&L KPI is filed under on the board (2026). */
const CATEGORY = {
  'KPI - P&L (M&S)': 'Materials Management',
  'KPI - P&L (T&M)': 'Logistics',
  'KPI - P&L (O&R)': 'Sourcing & Supplier Management',
  'KPI - P&L (O&C)': 'Sourcing & Supplier Management',
  'KPI - P&L (T&E)': 'Logistics',
  'KPI - P&L (PC/PR)': 'Sourcing & Supplier Management',
};
const KPI_BY_LINE = {
  'MS / TR': 'KPI - P&L (M&S)',
  'TM / TR': 'KPI - P&L (T&M)',
  'OR / TR': 'KPI - P&L (O&R)',
  'OC / TR': 'KPI - P&L (O&C)',
  'TE / TR': 'KPI - P&L (T&E)',
  'PC / PR': 'KPI - P&L (PC/PR)',
};
const SKIP = new Set(['HQ Dubai', 'HQ Houston', 'DO', 'NESR Consolidation', 'EOS', 'Syria']);
const SHORT = Object.fromEntries(MONTHS.map((m) => [m.slice(0, 3), m]));
SHORT.Totals = 'YTD';

const wanted = new Set([...MONTHS_IN, ...(YTD ? ['YTD'] : [])]);
const pct = (x) => Math.round(x * 100 * 1e8) / 1e8;
const lineOf = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** All cells of the workbook as { kpi, period, country, value|null } ("na" → null). */
async function readPl(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  if (wb.worksheets.length !== 2) throw new Error(`${file}: expected 2 sheets`);
  const [g, s] = wb.worksheets;
  const cells = [];
  const take = (kpi, period, country, v) => {
    if (v !== 'na' && typeof v !== 'number')
      throw new Error(
        `${file}: unexpected cell ${JSON.stringify(v)} for ${kpi} ${period} ${country}`,
      );
    cells.push({ kpi, period, country, value: v === 'na' ? null : pct(v) });
  };
  const gh = g.getRow(1).values;
  for (let r = 3; r <= g.rowCount; r++) {
    const row = g.getRow(r).values;
    const kpi = KPI_BY_LINE[lineOf(row[1])];
    if (!kpi) throw new Error(`${file}: unknown line "${row[1]}" on the Global sheet`);
    for (let c = 2; c < gh.length; c++) {
      const period = SHORT[gh[c]];
      if (!period) throw new Error(`${file}: unknown month "${gh[c]}" on the Global sheet`);
      take(kpi, period, 'Global', row[c]);
    }
  }
  const ch = s.getRow(1).values;
  const mh = s.getRow(2).values;
  for (let r = 4; r <= s.rowCount; r++) {
    const row = s.getRow(r).values;
    const kpi = KPI_BY_LINE[lineOf(row[1])];
    if (!kpi) throw new Error(`${file}: unknown line "${row[1]}" on the country sheet`);
    for (let c = 2; c < ch.length; c++) {
      const raw = String(ch[c]).trim();
      if (raw === 'Totals') {
        /* The all-countries total: must equal Global's YTD on sheet 1, then it is not loaded. */
        const ytd = cells.find(
          (x) => x.kpi === kpi && x.period === 'YTD' && x.country === 'Global',
        );
        if (!ytd || ytd.value !== (row[c] === 'na' ? null : pct(row[c])))
          throw new Error(`${file}: the country sheet's Totals for ${kpi} differ from Global YTD`);
        continue;
      }
      if (SKIP.has(raw)) continue;
      const country = normaliseCountry(raw);
      if (!country) throw new Error(`${file}: unknown country "${raw}"`);
      const period = SHORT[mh[c]];
      if (!period) throw new Error(`${file}: unknown month "${mh[c]}" for ${raw}`);
      take(kpi, period, country, row[c]);
    }
  }
  return cells;
}

const cells = await readPl(FILE);
const lines = [['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words']];
let skipped = 0;
for (const x of cells) {
  if (!wanted.has(x.period)) continue;
  if (x.value === null && !NA_AS_BLANK) {
    skipped++;
    continue;
  }
  lines.push([
    x.country,
    x.value === null ? '' : String(x.value),
    x.period,
    String(YEAR),
    x.kpi,
    CATEGORY[x.kpi],
    '%',
    '',
  ]);
}
writeFileSync(OUT, lines.map((l) => l.join(',')).join('\r\n') + '\r\n');
console.log(
  `Wrote ${OUT}: ${lines.length - 1} rows for ${[...wanted].join(', ')} ${YEAR} (${skipped} "na" cells skipped).`,
);
