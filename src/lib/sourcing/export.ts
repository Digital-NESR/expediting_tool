/**
 * The per-project evidence workbook: one sourcing case, on four sheets.
 *
 * Built so a reader can audit the claim rather than take it. The board asserts that a material
 * was bought 106 times at prices between $27 and $73 and that consolidating would have saved
 * $12.8M; this hands over the 106 lines that say so. A sourcing project nobody can check is a
 * sourcing project nobody will act on.
 *
 * Shaped after `src/lib/po-expediting/analytics-export.ts`, and for the same reasons:
 *
 * NUMBERS ARE WRITTEN AS NUMBERS AND DATES AS DATES, never as pre-formatted strings. The point
 * of a workbook over the CSV already on the board is that the recipient pivots it, and a column
 * of "12 Oct 2026" text sorts alphabetically and sums to nothing.
 *
 * NOTHING IS RECOMPUTED THAT THE BOARD ALREADY COMPUTED. The headline figures come through from
 * the analysis, which read them from the same SQL the cards do. What is derived here is only
 * what the board has no equivalent of — the per-month price series and the per-supplier spread
 * on the Price History sheet — and all of it from the lines on the PO Lines sheet, so a reader
 * can check any of it by hand against the sheet next door.
 *
 * Only `buildProjectWorkbook` touches exceljs, and it is the thin end: every derivation below
 * is pure and asserted in `src/lib/__tests__/sourcing-export.test.ts` without a workbook
 * anywhere near it.
 */

import type { Workbook } from 'exceljs';
import {
  PROJECT_TYPE_LABEL,
  type EvidenceLine,
  type ProjectEvidence,
  type SourcingProject,
} from './types';

export type CellValue = string | number | boolean | Date | null;

/** A column, as it reads on the sheet. `numFmt` is Excel's, applied down the whole column. */
export interface Col<T> {
  name: string;
  width: number;
  of: (row: T) => CellValue;
  numFmt?: string;
}

const DATE_FMT = 'dd mmm yyyy';
const MONEY_FMT = '#,##0.00';
const WHOLE_MONEY_FMT = '#,##0';
const QTY_FMT = '#,##0.###';
const PCT_FMT = '0.0%';

const BRAND = 'FF307C4C';

/** An ISO string as a real Date, or null — so Excel sorts and filters it as a date. */
export function asDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Money, to the cent.
 *
 * Summing thousands of floats gives tails like 118409052.1800001, and while a number format
 * hides them, the stored value is what a pivot totals and what anyone who widens the decimals
 * sees. Rounded once at the end of each sum rather than per line.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─── Derived sheets ──────────────────────────────────────────────────────── */

export interface MonthPoint {
  month: string;
  lines: number;
  qty: number;
  spendUsd: number;
  /** Spend-weighted average unit price for the month. */
  avgUnitPriceUsd: number | null;
  minUnitPriceUsd: number | null;
  maxUnitPriceUsd: number | null;
}

/**
 * Price by month — the visual proof of the variance the project claims.
 *
 * Spend-weighted rather than a mean of line prices: a hundred-unit order at $10 and a one-unit
 * order at $90 average to $10.79 of money actually spent, not $50. The unweighted figure would
 * make every project with one small odd-lot purchase look far more volatile than it is.
 */
export function priceByMonth(lines: EvidenceLine[]): MonthPoint[] {
  const buckets = new Map<string, EvidenceLine[]>();
  for (const l of lines) {
    if (!l.releaseDate) continue;
    const key = l.releaseDate.slice(0, 7);
    const list = buckets.get(key) ?? [];
    list.push(l);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, ls]) => {
      const qty = ls.reduce((s, l) => s + l.qty, 0);
      const spendUsd = ls.reduce((s, l) => s + l.lineValueUsd, 0);
      const prices = ls.map((l) => l.unitPriceUsd).filter((v): v is number => v !== null && v > 0);
      return {
        month,
        lines: ls.length,
        qty: round2(qty),
        spendUsd: round2(spendUsd),
        avgUnitPriceUsd: qty > 0 ? round2(spendUsd / qty) : null,
        minUnitPriceUsd: prices.length ? round2(Math.min(...prices)) : null,
        maxUnitPriceUsd: prices.length ? round2(Math.max(...prices)) : null,
      };
    });
}

export interface SupplierSpread {
  supplierName: string;
  supplierNum: string;
  lines: number;
  qty: number;
  spendUsd: number;
  avgUnitPriceUsd: number | null;
  minUnitPriceUsd: number | null;
  maxUnitPriceUsd: number | null;
  firstPurchase: string | null;
  lastPurchase: string | null;
  /** How much dearer than the cheapest supplier, as a multiple. 1 for the benchmark itself. */
  vsCheapest: number | null;
}

/**
 * Per-supplier spread, derived from the lines rather than taken from the board.
 *
 * Deliberately recomputed here even though the project already carries a supplier list: this
 * sheet sits beside the raw lines, and a reader who adds up the PO Lines sheet must get exactly
 * what this says. Taking the board's figures instead would introduce a second source of truth
 * for the one sheet whose whole purpose is to be checkable.
 */
export function supplierSpread(lines: EvidenceLine[]): SupplierSpread[] {
  const by = new Map<string, EvidenceLine[]>();
  for (const l of lines) {
    const list = by.get(l.supplierNum) ?? [];
    list.push(l);
    by.set(l.supplierNum, list);
  }

  const rows = [...by.entries()].map(([supplierNum, ls]) => {
    const qty = ls.reduce((s, l) => s + l.qty, 0);
    const spendUsd = ls.reduce((s, l) => s + l.lineValueUsd, 0);
    const prices = ls.map((l) => l.unitPriceUsd).filter((v): v is number => v !== null && v > 0);
    const dates = ls.map((l) => l.releaseDate).filter((d): d is string => Boolean(d)).sort();
    return {
      supplierNum,
      supplierName: ls[0]?.supplierName ?? supplierNum,
      lines: ls.length,
      qty: round2(qty),
      spendUsd: round2(spendUsd),
      avgUnitPriceUsd: qty > 0 ? round2(spendUsd / qty) : null,
      minUnitPriceUsd: prices.length ? round2(Math.min(...prices)) : null,
      maxUnitPriceUsd: prices.length ? round2(Math.max(...prices)) : null,
      firstPurchase: dates[0] ?? null,
      lastPurchase: dates[dates.length - 1] ?? null,
      vsCheapest: null as number | null,
    };
  });

  const cheapest = rows
    .filter((r) => r.avgUnitPriceUsd !== null && r.avgUnitPriceUsd > 0)
    .reduce<SupplierSpread | null>(
      (best, r) => (!best || r.avgUnitPriceUsd! < best.avgUnitPriceUsd! ? r : best),
      null,
    );

  if (cheapest?.avgUnitPriceUsd) {
    for (const r of rows) {
      r.vsCheapest =
        r.avgUnitPriceUsd && r.avgUnitPriceUsd > 0
          ? Math.round((r.avgUnitPriceUsd / cheapest.avgUnitPriceUsd) * 100) / 100
          : null;
    }
  }

  return rows.sort((a, b) => (a.avgUnitPriceUsd ?? Infinity) - (b.avgUnitPriceUsd ?? Infinity));
}

/**
 * The Analysis sheet as label/value pairs.
 *
 * A sheet rather than a paragraph because the recipient forwards it: every figure the board
 * showed, plus the method and the caveats that qualify it, in one place that survives being
 * pasted into a deck.
 */
export function analysisRows(p: SourcingProject, e: ProjectEvidence): [string, CellValue][] {
  const rows: [string, CellValue][] = [
    ['Project type', PROJECT_TYPE_LABEL[p.type]],
    ['Country', p.country],
    ['Item', p.title],
    ['SAP material', p.material ?? 'Not a stocked material — grouped by description'],
    ['Material group', p.materialGroup ?? '—'],
    ['Material type', p.materialType ?? '—'],
    ['Purchasing group (owner)', p.owner ?? '—'],
    ['', ''],
    ['Why this is a sourcing project', p.rationale],
    ['', ''],
    ['Purchase orders', p.purchaseOrders],
    ['PO lines', p.lines],
    ['Suppliers', p.supplierCount],
    ['First purchase', asDate(p.firstPurchase)],
    ['Last purchase', asDate(p.lastPurchase)],
    ['Total quantity', round2(p.qty)],
    ['Order unit', p.orderUnit ?? '—'],
    ['Total spend (USD)', round2(p.spendUsd)],
    ['', ''],
    ['Average unit price (USD)', p.avgUnitPriceUsd === null ? '—' : round2(p.avgUnitPriceUsd)],
    ['Lowest unit price (USD)', p.minUnitPriceUsd === null ? '—' : round2(p.minUnitPriceUsd)],
    ['Highest unit price (USD)', p.maxUnitPriceUsd === null ? '—' : round2(p.maxUnitPriceUsd)],
    [
      'Price variation (CV)',
      p.priceCv === null ? 'Not meaningful for a description-grouped service' : round2(p.priceCv),
    ],
    ['', ''],
  ];

  if (p.savingsUsd === null) {
    rows.push(
      ['Estimated saving', 'No benchmark — single supplier'],
      [
        'Why no figure',
        'This item has one supplier, so there is no second price to compare against. The ' +
          'opportunity is to tender it, and the prize is whatever competition produces — which ' +
          'cannot honestly be estimated from purchase history alone.',
      ],
    );
  } else {
    rows.push(
      ['Estimated saving (USD)', round2(p.savingsUsd)],
      ['Saving as % of spend', p.savingsPct === null ? '—' : round2(p.savingsPct) / 100],
      ['Confidence', p.savingsConfidence === 'benchmarked' ? 'Benchmarked' : 'Indicative'],
      [
        'Savings basis',
        p.type === 'leakage'
          ? 'Every line re-priced at the live SAP info-record rate.'
          : "Every line re-priced at the cheapest supplier's spend-weighted average for this " +
            'item in this country. Not the lowest single price, which is usually one lucky order.',
      ],
    );
    if (p.savingsConfidence === 'indicative') {
      rows.push([
        'Why indicative',
        'The benchmark rests on few orders, or on a contract price in a floating currency, so ' +
          'treat the figure as a direction rather than a target.',
      ]);
    }
  }

  rows.push(['', '']);
  if (p.infoRecord) rows.push(['SAP info record', p.infoRecord]);
  if (p.contractPriceUsd !== null) {
    rows.push([
      'Contract unit price (USD)',
      round2(p.contractPriceUsd),
    ]);
    rows.push(['Contract status', p.contractExpired ? 'EXPIRED' : 'Live']);
  }
  if (p.categorySupplierCount !== null) {
    rows.push(['Suppliers in this category / country', p.categorySupplierCount]);
  }

  rows.push(
    ['', ''],
    ['Evidence lines in this file', e.lines.length],
  );
  if (e.truncated) {
    rows.push([
      'NOTE',
      'The line list was capped. Figures above come from the full population; the PO Lines ' +
        'sheet is a sample of it.',
    ]);
  }
  rows.push([
    'Source',
    'SAP extract warehouse (core.supplychain), refreshed daily. Values converted to USD at ' +
      'the rate stored on each purchase order.',
  ]);

  return rows;
}

/* ─── Columns ─────────────────────────────────────────────────────────────── */

export function lineColumns(): Col<EvidenceLine>[] {
  return [
    { name: 'PO number', width: 14, of: (l) => l.purchaseDoc },
    { name: 'Item', width: 7, of: (l) => l.item },
    { name: 'PO released', width: 13, of: (l) => asDate(l.releaseDate), numFmt: DATE_FMT },
    { name: 'Delivery date', width: 13, of: (l) => asDate(l.deliveryDate), numFmt: DATE_FMT },
    { name: 'Supplier', width: 32, of: (l) => l.supplierName },
    { name: 'Supplier SAP ID', width: 15, of: (l) => l.supplierNum },
    { name: 'Description', width: 40, of: (l) => l.description },
    { name: 'Quantity', width: 12, of: (l) => round2(l.qty), numFmt: QTY_FMT },
    { name: 'Unit', width: 8, of: (l) => l.orderUnit },
    {
      name: 'Unit price USD',
      width: 14,
      of: (l) => (l.unitPriceUsd === null ? null : round2(l.unitPriceUsd)),
      numFmt: MONEY_FMT,
    },
    { name: 'Line value USD', width: 15, of: (l) => round2(l.lineValueUsd), numFmt: WHOLE_MONEY_FMT },
    { name: 'Currency', width: 9, of: (l) => l.currency },
    {
      name: 'Line value (native)',
      width: 17,
      of: (l) => (l.nativeValue === null ? null : round2(l.nativeValue)),
      numFmt: WHOLE_MONEY_FMT,
    },
    { name: 'Plant', width: 24, of: (l) => l.plant },
    { name: 'Buyer', width: 22, of: (l) => l.buyer },
    { name: 'Doc type', width: 10, of: (l) => l.docType },
    { name: 'Info record', width: 13, of: (l) => l.infoRecord },
    { name: 'Incoterms', width: 14, of: (l) => l.incoterms },
  ];
}

export function supplierColumns(): Col<SupplierSpread>[] {
  return [
    { name: 'Supplier', width: 34, of: (r) => r.supplierName },
    { name: 'Supplier SAP ID', width: 15, of: (r) => r.supplierNum },
    { name: 'Lines', width: 8, of: (r) => r.lines },
    { name: 'Quantity', width: 13, of: (r) => r.qty, numFmt: QTY_FMT },
    { name: 'Spend USD', width: 15, of: (r) => r.spendUsd, numFmt: WHOLE_MONEY_FMT },
    { name: 'Avg unit price USD', width: 18, of: (r) => r.avgUnitPriceUsd, numFmt: MONEY_FMT },
    { name: 'Lowest USD', width: 13, of: (r) => r.minUnitPriceUsd, numFmt: MONEY_FMT },
    { name: 'Highest USD', width: 13, of: (r) => r.maxUnitPriceUsd, numFmt: MONEY_FMT },
    { name: 'vs cheapest', width: 12, of: (r) => r.vsCheapest, numFmt: '0.00"x"' },
    { name: 'First purchase', width: 14, of: (r) => asDate(r.firstPurchase), numFmt: DATE_FMT },
    { name: 'Last purchase', width: 14, of: (r) => asDate(r.lastPurchase), numFmt: DATE_FMT },
  ];
}

export function monthColumns(): Col<MonthPoint>[] {
  return [
    { name: 'Month', width: 10, of: (m) => m.month },
    { name: 'Lines', width: 8, of: (m) => m.lines },
    { name: 'Quantity', width: 13, of: (m) => m.qty, numFmt: QTY_FMT },
    { name: 'Spend USD', width: 15, of: (m) => m.spendUsd, numFmt: WHOLE_MONEY_FMT },
    { name: 'Avg unit price USD', width: 18, of: (m) => m.avgUnitPriceUsd, numFmt: MONEY_FMT },
    { name: 'Lowest USD', width: 13, of: (m) => m.minUnitPriceUsd, numFmt: MONEY_FMT },
    { name: 'Highest USD', width: 13, of: (m) => m.maxUnitPriceUsd, numFmt: MONEY_FMT },
  ];
}

/**
 * `Sourcing_Kuwait_CALCIUM-CHLORIDE-97_2026-11-18.xlsx`
 *
 * The item and country in the name, so a manager who downloads six of these can tell them apart
 * in a Downloads folder without opening any.
 */
export function projectFilename(p: SourcingProject, today = new Date()): string {
  const slug = (s: string) =>
    s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
  return `Sourcing_${slug(p.country)}_${slug(p.title)}_${today.toISOString().slice(0, 10)}.xlsx`;
}

/* ─── The workbook ────────────────────────────────────────────────────────── */

/** Excel caps a sheet name at 31 characters and rejects `* ? : \ / [ ]`. */
function sheetName(raw: string): string {
  return raw.replace(/[*?:\\/[\]]/g, ' ').slice(0, 31);
}

export async function buildProjectWorkbook(
  p: SourcingProject,
  e: ProjectEvidence,
): Promise<Workbook> {
  /* The one place exceljs is named at runtime. It is a large dependency and this tab already
     carries recharts, so it loads on the click rather than on the visit.

     The `.default` fallback is not decoration. exceljs is CommonJS: Next's bundler hands back a
     namespace whose `Workbook` is directly present, while plain Node puts the whole module under
     `default`. The other three export modules in this repo assume the former and so cannot be
     run outside the app — which is exactly where this one needed to be run to prove the
     workbook reconciles against the warehouse. */
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR Supply Chain Analytics';
  wb.created = new Date();

  /* ── Analysis ── */
  const analysis = wb.addWorksheet(sheetName('Analysis'));
  analysis.columns = [
    { key: 'label', width: 34 },
    { key: 'value', width: 86 },
  ];

  const title = analysis.addRow([`${PROJECT_TYPE_LABEL[p.type]} — ${p.title}`, '']);
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  title.height = 24;
  analysis.addRow([]);

  for (const [label, value] of analysisRows(p, e)) {
    const row = analysis.addRow([label, value]);
    if (label) row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (typeof value === 'number' && /USD|quantity/i.test(label)) {
      row.getCell(2).numFmt = /unit price|contract/i.test(label) ? MONEY_FMT : WHOLE_MONEY_FMT;
    }
    if (label === 'Saving as % of spend') row.getCell(2).numFmt = PCT_FMT;
    if (label === 'NOTE' || label === 'Why no figure' || label === 'Why indicative') {
      row.getCell(2).font = { italic: true, color: { argb: 'FF8A4B00' } };
    }
    if (value instanceof Date) row.getCell(2).numFmt = DATE_FMT;
  }

  /* ── Data sheets ── */
  const spread = supplierSpread(e.lines);
  const months = priceByMonth(e.lines);

  addSheet(wb, 'Suppliers', supplierColumns(), spread);
  addSheet(wb, 'Price history', monthColumns(), months);
  addSheet(wb, 'PO lines', lineColumns(), e.lines);

  return wb;
}

/** One table: a branded header row, frozen, auto-filtered, with column formats applied. */
function addSheet<T>(wb: Workbook, name: string, cols: Col<T>[], rows: T[]): void {
  const ws = wb.addWorksheet(sheetName(name));
  ws.columns = cols.map((c) => ({ header: c.name, key: c.name, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle' };
  header.height = 18;

  for (const row of rows) ws.addRow(cols.map((c) => c.of(row)));

  cols.forEach((c, i) => {
    if (!c.numFmt) return;
    ws.getColumn(i + 1).numFmt = c.numFmt;
  });

  /* Frozen header and a filter, because the first thing anyone does with a few hundred PO
     lines is sort them by price. */
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  }
}

export async function downloadProjectWorkbook(
  p: SourcingProject,
  e: ProjectEvidence,
): Promise<void> {
  const wb = await buildProjectWorkbook(p, e);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectFilename(p);
  a.click();
  URL.revokeObjectURL(url);
}
