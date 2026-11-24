/*
 * The Health Board as an Excel workbook (UX phase 6): the overview for one country, the
 * comparison for one KPI, or one KPI's page. Server-side only (exceljs).
 *
 * Every cell holds the stored value at full precision; the number format shows the same
 * decimals as the board (% and days to 2 places, $ and suppliers whole). Numbers are never
 * rounded into the file. A second sheet says how the figures were worked out (RULES.md).
 */

import ExcelJS from 'exceljs';
import type { Comparison, KpiDetail, Overview, Status } from './calc';
import type { KpiDefinition } from './definitions';
import { MONTHS } from './definitions';
import { betterBy } from './compare';
import { explainYtd } from './explain';
import { formatWithUnit } from './format';

const NUMFMT: Record<KpiDefinition['unit'], string> = {
  '%': '0.00',
  Days: '0.00',
  $: '#,##0',
  Suppliers: '#,##0',
};
const STATUS_TEXT: Record<Status, string> = {
  green: 'Meets target',
  amber: 'Within 10% of target',
  red: 'Misses target by more than 10%',
};
const GREEN = 'FF307C4C';

function newBook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR Supply Chain Health Board';
  wb.created = new Date();
  return wb;
}

function titleRows(ws: ExcelJS.Worksheet, title: string, lines: string[], width: number) {
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: GREEN } };
  for (const l of lines) ws.addRow([l]).font = { color: { argb: 'FF64748B' } };
  ws.addRow([]);
  for (let r = 1; r <= lines.length + 1; r++) ws.mergeCells(r, 1, r, Math.max(width, 1));
}

function header(ws: ExcelJS.Worksheet, cells: string[]) {
  const row = ws.addRow(cells);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: row.number, xSplit: 2 }];
}

function formatNumbers(row: ExcelJS.Row, from: number, to: number, unit: KpiDefinition['unit']) {
  for (let i = from; i <= to; i++) row.getCell(i).numFmt = NUMFMT[unit];
}

function rulesSheet(wb: ExcelJS.Workbook, stamp: string) {
  const ws = wb.addWorksheet('How it is calculated');
  ws.getColumn(1).width = 110;
  const lines = [
    'Supply Chain Health Board — how the figures are worked out',
    '',
    `Exported ${stamp} (Dubai). Values are as stored in the board, at full precision; the cell format only controls how many decimals show.`,
    'One country at a time. Global is its own reported row, not a sum of the countries.',
    "YTD: latest month with a value for Inventory, DSOH, Slow Moving and Supplier Count; sum of the months for ICPO Transfer Out; Finance's uploaded figure for the P&L KPIs; average of the quarters entered for the quarterly KPIs; average of the months entered for every other KPI.",
    "Status: meets target; within 10% of the target's size; or misses by more than 10%. Higher or lower is better per KPI.",
    'A blank month has no value uploaded. Full rules: src/lib/health-board/RULES.md.',
  ];
  lines.forEach((l, i) => {
    const r = ws.addRow([l]);
    r.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) r.font = { bold: true, size: 13, color: { argb: GREEN } };
  });
}

const stampNow = () =>
  new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/** The overview for one country and year. */
export async function overviewWorkbook(o: Overview): Promise<Buffer> {
  const wb = newBook();
  const ws = wb.addWorksheet(`${o.country} ${o.year}`.slice(0, 31));
  const stamp = stampNow();
  const cols = [
    'Category',
    'KPI',
    'Unit',
    'Better',
    `Baseline ${o.year - 1}`,
    'Target',
    ...o.months,
    'YTD',
    'Status',
    'How YTD was worked out',
  ];
  titleRows(
    ws,
    `Supply Chain Health Board — ${o.country} — ${o.year}`,
    [`Exported ${stamp} (Dubai)`],
    cols.length,
  );
  header(ws, cols);
  for (const g of o.groups) {
    for (const r of g.rows) {
      const monthly = Object.fromEntries(o.months.map((m) => [m, r.months[m]?.value ?? null]));
      const row = ws.addRow([
        g.category,
        r.kpi.name,
        r.kpi.unit,
        r.kpi.direction === 'higher' ? 'Higher' : 'Lower',
        r.baseline,
        r.targetWords ?? r.target,
        ...o.months.map((m) => r.months[m]?.value ?? null),
        r.ytd,
        r.status ? STATUS_TEXT[r.status] : '',
        explainYtd(r.kpi, monthly),
      ]);
      formatNumbers(row, 5, 5, r.kpi.unit);
      formatNumbers(row, 7, 7 + o.months.length, r.kpi.unit);
      if (r.targetWords === null && r.target !== null) formatNumbers(row, 6, 6, r.kpi.unit);
    }
  }
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 40;
  ws.getColumn(cols.length).width = 60;
  for (let i = 3; i < cols.length; i++) ws.getColumn(i).width = i === cols.length - 1 ? 28 : 14;
  rulesSheet(wb, stamp);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** One KPI across every country. */
export async function comparisonWorkbook(c: Comparison): Promise<Buffer> {
  const wb = newBook();
  const ws = wb.addWorksheet(`Comparison ${c.year}`);
  const stamp = stampNow();
  const k = c.kpi;
  const cols = [
    'Country',
    'KPI',
    `Baseline ${c.year - 1}`,
    'Target',
    ...c.months,
    'YTD',
    'Status',
    `Better (+) / worse (−) than target, ${k.unit}`,
  ];
  titleRows(
    ws,
    `${k.name} — every country — ${c.year}`,
    [
      `${k.unit} · ${k.direction === 'higher' ? 'higher' : 'lower'} is better · exported ${stamp} (Dubai)`,
    ],
    cols.length,
  );
  header(ws, cols);
  for (const r of c.rows) {
    const row = ws.addRow([
      r.country,
      k.name,
      r.baseline,
      r.targetWords ?? r.target,
      ...c.months.map((m) => r.months[m]?.value ?? null),
      r.ytd,
      r.status ? STATUS_TEXT[r.status] : '',
      betterBy(k, r),
    ]);
    formatNumbers(row, 3, 3, k.unit);
    formatNumbers(row, 5, 5 + c.months.length, k.unit);
    formatNumbers(row, cols.length, cols.length, k.unit);
  }
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 34;
  for (let i = 3; i <= cols.length; i++) ws.getColumn(i).width = i === cols.length ? 22 : 14;
  rulesSheet(wb, stamp);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** One KPI for one country: this year and last year by month. */
export async function detailWorkbook(d: KpiDetail, previous: KpiDetail | null): Promise<Buffer> {
  const wb = newBook();
  const ws = wb.addWorksheet(`${d.country} ${d.year}`.slice(0, 31));
  const stamp = stampNow();
  const k = d.kpi;
  const monthsOf = (x: KpiDetail) =>
    Object.fromEntries(
      x.points.filter((p) => p.label !== 'Baseline').map((p) => [p.label, p.value]),
    );
  const cols = ['Year', ...MONTHS, 'YTD'];
  titleRows(
    ws,
    `${k.name} — ${d.country}`,
    [
      `Baseline ${d.year - 1}: ${d.baseline === null ? '–' : formatWithUnit(k.unit, d.baseline)} · Target: ${d.targetWords ?? '–'} · ${k.direction === 'higher' ? 'higher' : 'lower'} is better`,
      `YTD ${d.year}: ${d.ytd === null ? '–' : formatWithUnit(k.unit, d.ytd)}${d.status ? ` (${STATUS_TEXT[d.status].toLowerCase()})` : ''}. ${explainYtd(k, monthsOf(d))}`,
      `Exported ${stamp} (Dubai)`,
    ],
    cols.length,
  );
  header(ws, cols);
  for (const x of [d, ...(previous ? [previous] : [])]) {
    const m = monthsOf(x);
    const row = ws.addRow([x.year, ...MONTHS.map((mm) => m[mm] ?? null), x.ytd]);
    formatNumbers(row, 2, cols.length, k.unit);
  }
  ws.getColumn(1).width = 8;
  for (let i = 2; i <= cols.length; i++) ws.getColumn(i).width = 12;
  rulesSheet(wb, stamp);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
