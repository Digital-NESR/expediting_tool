/**
 * The My Analytics workbook: one buyer's expediting, on six sheets.
 *
 * Split from the page because the page is 1,300 lines of charts and because the part worth
 * testing here is not the spreadsheet but the arithmetic on it -- which lines count as answered,
 * how many days a supplier took, how far a delivery moved. Those are asserted in
 * `src/lib/__tests__/po-expediting-analytics-export.test.ts` without a workbook anywhere near
 * them; only `downloadMyAnalyticsWorkbook` touches exceljs, and it is the thin end.
 *
 * Two rules the sheets follow, both so the file is still useful after someone opens it:
 *
 * Numbers are written as numbers and dates as dates, never as pre-formatted strings. The point
 * of a workbook over the CSV we could have shipped is that the recipient pivots it, and a column
 * of "12 Oct 2026" text sorts alphabetically and sums to nothing.
 *
 * And nothing is recomputed that the screen already computed. Rates and averages come through
 * from the server action, which reads them from the same SQL the cards do. What is derived here
 * is only what the screen has no equivalent of -- the per-supplier value totals, the fastest and
 * slowest response, and the DS category split -- all of it from the line rows on the Line Detail
 * sheet, so a reader can check any of it by hand against the sheet next door.
 */

import type { MyAnalyticsExport, MyExportLine, MySupplierRow } from '@/app/actions/analytics';
import type { Workbook } from 'exceljs';
import { DS_CATEGORY_LEGEND, getDsCode, type DsCategory } from '@/lib/ds-codes';

/* ─── Cells ──────────────────────────────────────────────────── */

export type CellValue = string | number | boolean | Date | null;

/** A column, as it reads on the sheet. `numFmt` is Excel's, applied down the whole column. */
export interface Col<T> {
  name: string;
  width: number;
  of: (row: T) => CellValue;
  numFmt?: string;
}

const DATE_FMT = 'dd mmm yyyy';
const DATETIME_FMT = 'dd mmm yyyy hh:mm';
const MONEY_FMT = '#,##0';
const ONE_DP = '0.0';

/** An ISO string as a real Date, or null — so Excel sorts and filters it as a date. */
export function asDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Whole days between two instants, one decimal place, or null if either is missing. */
export function daysBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = asDate(from);
  const b = asDate(to);
  if (!a || !b) return null;
  return Math.round(((b.getTime() - a.getTime()) / 86_400_000) * 10) / 10;
}

/**
 * Money, to the cent.
 *
 * Adding six thousand floats gives 118409052.1800001, and while the column's number format
 * hides the tail, the stored value is what a pivot totals and what anyone who widens the
 * decimals sees. Rounded once at the end of each sum rather than per line, so the cents still
 * add up to the same figure the dashboard shows.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─── Line-level readings ────────────────────────────────────── */

/**
 * A line counts as answered when the supplier submitted the form, which is what
 * `workflow_state` records. Deliberately not "has a DS code": a supplier who submits without
 * picking one has still replied, and counting them as silent would flatter nobody.
 */
export function isAnswered(line: MyExportLine): boolean {
  return line.workflow_state === 'Submitted';
}

/** Days from dispatch to the supplier's reply, or null while it is still out. */
export function daysToRespond(line: MyExportLine): number | null {
  return daysBetween(line.dispatched_at, line.responded_at);
}

/**
 * How far the delivery moved, in days: positive when the supplier pushed it out, negative when
 * they pulled it in. Null unless both dates exist, which is most lines — a revised date is the
 * exception, not the rule, and a column of zeroes would read as "nothing slipped".
 */
export function daysPushedOut(line: MyExportLine): number | null {
  return daysBetween(line.original_delivery_date, line.new_delivery_date);
}

/** The DS category label the dashboard legend uses, or a plain word for the lines without one. */
export function dsCategoryLabel(line: MyExportLine): string {
  const entry = getDsCode(line.current_status);
  if (!entry) return isAnswered(line) ? 'No DS code' : 'Awaiting response';
  return CATEGORY_LABEL[entry.category];
}

const CATEGORY_LABEL: Record<DsCategory, string> = Object.fromEntries(
  DS_CATEGORY_LEGEND.map((c) => [c.id, c.label]),
) as Record<DsCategory, string>;

/** The six categories in legend order, so the performance sheet's columns match the screen. */
export const CATEGORY_ORDER: readonly DsCategory[] = DS_CATEGORY_LEGEND.map((c) => c.id);

/* ─── Vendor performance ─────────────────────────────────────── */

export interface VendorPerformanceRow {
  supplier_name: string;
  supplier_id: string | null;
  total_lines: number;
  lines_responded: number;
  open_value_usd: number;
  value_responded_usd: number;
  fastest_days: number | null;
  slowest_days: number | null;
  lines_revised: number;
  avg_days_pushed_out: number | null;
  /** Keyed by {@link DsCategory}, plus the two buckets a DS code cannot express. */
  byCategory: Record<string, number>;
}

/**
 * The deeper half of the vendor story, built from the line rows rather than from SQL.
 *
 * It is derived here for one reason: the DS codes and their categories are defined once, in
 * `ds-codes.ts`, and a GROUP BY that listed the delayed codes in SQL would be the second copy —
 * the kind that stops being updated and then quietly disagrees with the dashboard about which
 * statuses count as late. See that file's note on the Sept 2026 renumbering.
 *
 * Averages that the screen already shows are NOT recomputed here; the response-rate sheet
 * carries them straight from the server. The only average invented here is how far deliveries
 * moved, which nothing on screen shows.
 */
export function buildVendorPerformance(
  lines: MyExportLine[],
  breakdown: MySupplierRow[],
): VendorPerformanceRow[] {
  const bySupplier = new Map<string, VendorPerformanceRow>();
  const pushedOut = new Map<string, number[]>();

  const blank = (): Record<string, number> => {
    const counts: Record<string, number> = { 'No DS code': 0, 'Awaiting response': 0 };
    for (const id of CATEGORY_ORDER) counts[CATEGORY_LABEL[id]] = 0;
    return counts;
  };

  for (const line of lines) {
    let row = bySupplier.get(line.supplier_name);
    if (!row) {
      row = {
        supplier_name: line.supplier_name,
        supplier_id: line.supplier_id,
        total_lines: 0,
        lines_responded: 0,
        open_value_usd: 0,
        value_responded_usd: 0,
        fastest_days: null,
        slowest_days: null,
        lines_revised: 0,
        avg_days_pushed_out: null,
        byCategory: blank(),
      };
      bySupplier.set(line.supplier_name, row);
      pushedOut.set(line.supplier_name, []);
    }
    /* First non-null wins: the snapshot carries the id per line and a supplier that was
       expedited before the field existed has it on the later rows only. */
    row.supplier_id = row.supplier_id ?? line.supplier_id;

    const value = line.open_po_value_usd ?? 0;
    row.total_lines += 1;
    row.open_value_usd += value;

    if (isAnswered(line)) {
      row.lines_responded += 1;
      row.value_responded_usd += value;
      const days = daysToRespond(line);
      if (days !== null) {
        row.fastest_days = row.fastest_days === null ? days : Math.min(row.fastest_days, days);
        row.slowest_days = row.slowest_days === null ? days : Math.max(row.slowest_days, days);
      }
    }

    if (line.new_delivery_date) {
      row.lines_revised += 1;
      const moved = daysPushedOut(line);
      if (moved !== null) pushedOut.get(line.supplier_name)?.push(moved);
    }

    row.byCategory[dsCategoryLabel(line)] += 1;
  }

  for (const row of bySupplier.values()) {
    row.open_value_usd = round2(row.open_value_usd);
    row.value_responded_usd = round2(row.value_responded_usd);
  }

  for (const [supplier, moves] of pushedOut) {
    if (!moves.length) continue;
    const mean = moves.reduce((sum, d) => sum + d, 0) / moves.length;
    const row = bySupplier.get(supplier);
    if (row) row.avg_days_pushed_out = Math.round(mean * 10) / 10;
  }

  /* Ordered by the same thing the response-rate sheet is, so the two read as one story told
     twice rather than two unrelated lists of the same suppliers. */
  const rank = new Map(breakdown.map((b, i) => [b.supplier_name, i]));
  return [...bySupplier.values()].sort(
    (a, b) =>
      (rank.get(a.supplier_name) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.supplier_name) ?? Number.MAX_SAFE_INTEGER) ||
      a.supplier_name.localeCompare(b.supplier_name),
  );
}

/* ─── Columns ────────────────────────────────────────────────── */

/** Sheet 2 — how the suppliers compare on answering at all. */
export function responseRateColumns(avgDaysBySupplier: Map<string, number>): Col<MySupplierRow>[] {
  return [
    { name: 'Supplier', width: 42, of: (r) => r.supplier_name },
    { name: 'Times Expedited', width: 16, of: (r) => r.times_expedited },
    { name: 'PO Lines', width: 11, of: (r) => r.total_lines },
    { name: 'Lines Responded', width: 17, of: (r) => r.lines_responded },
    { name: 'Lines Awaiting', width: 15, of: (r) => r.total_lines - r.lines_responded },
    { name: 'Response Rate %', width: 17, of: (r) => r.response_rate, numFmt: ONE_DP },
    {
      name: 'Avg Days to Respond',
      width: 20,
      of: (r) => avgDaysBySupplier.get(r.supplier_name) ?? null,
      numFmt: ONE_DP,
    },
    { name: 'Last Response', width: 20, of: (r) => asDate(r.last_response), numFmt: DATETIME_FMT },
  ];
}

/** Sheet 3 — what the answers were worth and what they said. */
export function performanceColumns(): Col<VendorPerformanceRow>[] {
  const base: Col<VendorPerformanceRow>[] = [
    { name: 'Supplier', width: 42, of: (r) => r.supplier_name },
    { name: 'Supplier ID', width: 14, of: (r) => r.supplier_id },
    { name: 'PO Lines', width: 11, of: (r) => r.total_lines },
    { name: 'Lines Responded', width: 17, of: (r) => r.lines_responded },
    { name: 'Open Value USD', width: 17, of: (r) => r.open_value_usd, numFmt: MONEY_FMT },
    {
      name: 'Value Responded USD',
      width: 20,
      of: (r) => r.value_responded_usd,
      numFmt: MONEY_FMT,
    },
    { name: 'Fastest Reply (days)', width: 19, of: (r) => r.fastest_days, numFmt: ONE_DP },
    { name: 'Slowest Reply (days)', width: 19, of: (r) => r.slowest_days, numFmt: ONE_DP },
    { name: 'Lines with Revised Date', width: 22, of: (r) => r.lines_revised },
    {
      name: 'Avg Days Pushed Out',
      width: 20,
      of: (r) => r.avg_days_pushed_out,
      numFmt: ONE_DP,
    },
  ];
  const categories: Col<VendorPerformanceRow>[] = CATEGORY_ORDER.map((id) => ({
    name: CATEGORY_LABEL[id],
    width: Math.max(12, CATEGORY_LABEL[id].length + 3),
    of: (r: VendorPerformanceRow) => r.byCategory[CATEGORY_LABEL[id]] ?? 0,
  }));
  return [
    ...base,
    ...categories,
    { name: 'No DS code', width: 13, of: (r) => r.byCategory['No DS code'] ?? 0 },
    { name: 'Awaiting response', width: 18, of: (r) => r.byCategory['Awaiting response'] ?? 0 },
  ];
}

/** Sheet 4 — one row per PO line, which is the sheet everything else is a summary of. */
export function lineColumns(): Col<MyExportLine>[] {
  return [
    { name: 'Dispatched', width: 19, of: (r) => asDate(r.dispatched_at), numFmt: DATETIME_FMT },
    { name: 'PO Number', width: 15, of: (r) => r.po_number },
    { name: 'PO Line', width: 9, of: (r) => r.po_line },
    { name: 'Supplier', width: 42, of: (r) => r.supplier_name },
    { name: 'Supplier ID', width: 13, of: (r) => r.supplier_id },
    { name: 'Country', width: 16, of: (r) => r.country },
    { name: 'Purchasing Group', width: 17, of: (r) => r.p_group },
    { name: 'Material', width: 16, of: (r) => r.sap_mat_id },
    { name: 'Description', width: 46, of: (r) => r.item_description },
    { name: 'Open Qty', width: 11, of: (r) => r.open_qty },
    { name: 'Open Value USD', width: 16, of: (r) => r.open_po_value_usd, numFmt: MONEY_FMT },
    {
      name: 'Original Delivery',
      width: 17,
      of: (r) => asDate(r.original_delivery_date),
      numFmt: DATE_FMT,
    },
    { name: 'Responded', width: 12, of: (r) => (isAnswered(r) ? 'Yes' : 'No') },
    { name: 'DS Code', width: 10, of: (r) => getDsCode(r.current_status)?.code ?? null },
    { name: 'DS Status', width: 32, of: (r) => getDsCode(r.current_status)?.name ?? null },
    { name: 'DS Category', width: 22, of: (r) => dsCategoryLabel(r) },
    {
      name: 'Revised Delivery',
      width: 17,
      of: (r) => asDate(r.new_delivery_date),
      numFmt: DATE_FMT,
    },
    { name: 'Days Pushed Out', width: 16, of: (r) => daysPushedOut(r), numFmt: ONE_DP },
    { name: 'Responded At', width: 19, of: (r) => asDate(r.responded_at), numFmt: DATETIME_FMT },
    { name: 'Days to Respond', width: 16, of: (r) => daysToRespond(r), numFmt: ONE_DP },
    { name: 'Supplier Comments', width: 52, of: (r) => r.supplier_comments },
    { name: 'Buyer Comments', width: 52, of: (r) => r.buyer_comments },
    { name: 'Session Ref', width: 38, of: (r) => r.session_ref },
  ];
}

/* ─── Summary ────────────────────────────────────────────────── */

/** The totals the Summary sheet states, including the three the cards do not show. */
export function summaryTotals(data: MyAnalyticsExport) {
  const openValue = round2(data.lines.reduce((sum, l) => sum + (l.open_po_value_usd ?? 0), 0));
  const respondedValue = round2(
    data.lines.filter(isAnswered).reduce((sum, l) => sum + (l.open_po_value_usd ?? 0), 0),
  );
  return {
    linesAwaiting: data.lines.filter((l) => !isAnswered(l)).length,
    sessions: data.sessions.length,
    openValue,
    respondedValue,
    linesRevised: data.lines.filter((l) => l.new_delivery_date).length,
  };
}

/** "1 Oct 2026 to 31 Oct 2026", or what the page says when a bound is missing. */
export function describeRange(filters: { dateFrom: string | null; dateTo: string | null }): string {
  const { dateFrom, dateTo } = filters;
  if (!dateFrom && !dateTo) return 'All time (no date filter)';
  if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`;
  if (dateFrom) return `${dateFrom} onwards`;
  return `Up to ${dateTo}`;
}

/* ─── The workbook ───────────────────────────────────────────── */

function addTableSheet<T>(
  workbook: Workbook,
  opts: { sheetName: string; tableName: string; note: string; columns: Col<T>[]; rows: T[] },
): void {
  const sheet = workbook.addWorksheet(opts.sheetName);

  /* What the sheet is, above the table. A tab called "Vendor Performance" that has been mailed
     on tells the reader nothing about whose work it is or what window it covers. */
  sheet.addRow([opts.note]);
  sheet.getRow(1).font = { size: 10, color: { argb: 'FF58595B' } };
  sheet.addRow([]);

  const headerRow = 3;
  sheet.addTable({
    name: opts.tableName,
    ref: `A${headerRow}`,
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: opts.columns.map((c) => ({ name: c.name, filterButton: true })),
    /* exceljs refuses a table with no body rows, and an empty export is legitimate: a buyer who
       filtered to a week they were on leave should get the headers and the note, not an error. */
    rows: opts.rows.length
      ? opts.rows.map((r) => opts.columns.map((c) => c.of(r)))
      : [opts.columns.map(() => null)],
  });

  opts.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = c.width;
    if (c.numFmt) column.numFmt = c.numFmt;
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
}

/**
 * The workbook itself: six sheets, in the order someone reads them -- the totals, then the two
 * vendor views, then the lines they are made of, then the sessions and the weekly trend.
 *
 * Separate from the download so it can be built and opened outside a browser. A workbook is the
 * one deliverable here that no amount of unit testing proves: the arithmetic can be right and
 * the file still arrive with a sheet missing or a column of #### where the dates should be.
 */
export async function buildMyAnalyticsWorkbook(data: MyAnalyticsExport): Promise<Workbook> {
  /* The one place exceljs is named at runtime. It is a large dependency and this page
     already carries recharts, so it loads on the click rather than on the visit. */
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'NESR PO Expediting';

  const range = describeRange(data.filters);
  const totals = summaryTotals(data);
  const avgDays = new Map(
    data.supplierResponseTime.map((r) => [r.supplier_name, r.avg_days_to_respond]),
  );
  const performance = buildVendorPerformance(data.lines, data.supplierBreakdown);
  const note = `${data.buyer.name} · ${range}`;

  /* ── 1 · Summary ── */
  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['NESR — My Expediting Analytics']);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.addRow([]);

  const kv: [string, CellValue, string?][] = [
    ['Buyer', data.buyer.name],
    ['Email', data.buyer.email],
    ['Date range', range],
    ['Generated', asDate(data.generatedAt), DATETIME_FMT],
    ['', null],
    ['PO lines expedited', data.kpis.totalLinesExpedited],
    ['Suppliers contacted', data.kpis.totalSuppliersContacted],
    ['Emails sent', data.kpis.totalEmailsSent],
    ['Response rate %', data.kpis.overallResponseRate, ONE_DP],
    ['Lines still awaiting a reply', totals.linesAwaiting],
    ['Lines with a revised delivery date', totals.linesRevised],
    ['Expediting sessions', totals.sessions],
    ['Open value expedited (USD)', totals.openValue, MONEY_FMT],
    ['Open value responded (USD)', totals.respondedValue, MONEY_FMT],
  ];
  for (const [label, value, fmt] of kv) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: Boolean(label) };
    if (fmt) row.getCell(2).numFmt = fmt;
  }

  summary.addRow([]);
  const guideHeader = summary.addRow(['What is on each sheet']);
  guideHeader.font = { bold: true, size: 12 };
  const guide: [string, string, number][] = [
    [
      'Vendor Response Rates',
      'Who replies, and how often — the comparison',
      data.supplierBreakdown.length,
    ],
    ['Vendor Performance', 'What those replies were worth and what they said', performance.length],
    ['Line Detail', 'Every PO line you dispatched, with the supplier answer', data.lines.length],
    ['Sessions', 'Each dispatch you sent, with its own response rate', data.sessions.length],
    ['Weekly Trend', 'Lines out versus lines answered, by week', data.weeklyRateData.length],
  ];
  summary.addRow(['Sheet', 'What it shows', 'Rows']).font = { bold: true };
  for (const [name, what, count] of guide) summary.addRow([name, what, count]);

  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 52;
  summary.getColumn(3).width = 10;

  /* ── 2 · Vendor Response Rates ── */
  addTableSheet(workbook, {
    sheetName: 'Vendor Response Rates',
    tableName: 'VendorResponseRates',
    note: `Suppliers you expedited, best-answering first · ${note}`,
    columns: responseRateColumns(avgDays),
    rows: data.supplierBreakdown,
  });

  /* ── 3 · Vendor Performance ── */
  addTableSheet(workbook, {
    sheetName: 'Vendor Performance',
    tableName: 'VendorPerformance',
    note: `Value, speed and what the DS answers said · ${note}`,
    columns: performanceColumns(),
    rows: performance,
  });

  /* ── 4 · Line Detail ── */
  addTableSheet(workbook, {
    sheetName: 'Line Detail',
    tableName: 'LineDetail',
    note: `Every PO line you dispatched · ${note}`,
    columns: lineColumns(),
    rows: data.lines,
  });

  /* ── 5 · Sessions ── */
  addTableSheet(workbook, {
    sheetName: 'Sessions',
    tableName: 'Sessions',
    note: `Every expediting run you sent · ${note}`,
    columns: [
      { name: 'Dispatched', width: 19, of: (r) => asDate(r.dispatched_at), numFmt: DATETIME_FMT },
      { name: 'Suppliers', width: 11, of: (r) => r.total_suppliers },
      { name: 'PO Lines', width: 11, of: (r) => r.total_po_lines },
      { name: 'Emails Sent', width: 13, of: (r) => r.total_emails_sent },
      { name: 'Suppliers Responded', width: 20, of: (r) => r.suppliers_responded },
      { name: 'Lines Responded', width: 17, of: (r) => r.lines_responded },
      { name: 'Response Rate %', width: 17, of: (r) => r.response_rate_pct, numFmt: ONE_DP },
      { name: 'Fully Closed', width: 13, of: (r) => (r.fully_closed ? 'Yes' : 'No') },
      { name: 'Closed At', width: 19, of: (r) => asDate(r.closed_at), numFmt: DATETIME_FMT },
      { name: 'Session Ref', width: 38, of: (r) => r.session_ref },
    ] satisfies Col<MyAnalyticsExport['sessions'][number]>[],
    rows: data.sessions,
  });

  /* ── 6 · Weekly Trend ── */
  addTableSheet(workbook, {
    sheetName: 'Weekly Trend',
    tableName: 'WeeklyTrend',
    note: `Lines out versus lines answered, by week dispatched · ${note}`,
    columns: [
      { name: 'Week Starting', width: 16, of: (r) => asDate(r.week), numFmt: DATE_FMT },
      { name: 'Lines Expedited', width: 16, of: (r) => r.lines_expedited },
      { name: 'Lines Responded', width: 17, of: (r) => r.lines_responded },
      { name: 'Response Rate %', width: 17, of: (r) => r.avg_response_rate, numFmt: ONE_DP },
      { name: 'Sessions', width: 11, of: (r) => r.sessions_count },
    ] satisfies Col<MyAnalyticsExport['weeklyRateData'][number]>[],
    rows: data.weeklyRateData,
  });

  return workbook;
}

/** Build it and hand it to the browser. Call from a click handler. */
export async function downloadMyAnalyticsWorkbook(data: MyAnalyticsExport): Promise<void> {
  const workbook = await buildMyAnalyticsWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(data);
  a.click();
  URL.revokeObjectURL(url);
}

/** `My_Expediting_Analytics_2026-10-01_to_2026-10-31.xlsx` — the range in the name, so two
 *  exports taken a month apart do not land in Downloads as "(1)" and "(2)". */
export function exportFilename(data: MyAnalyticsExport): string {
  const { dateFrom, dateTo } = data.filters;
  const today = data.generatedAt.slice(0, 10);
  const span =
    dateFrom && dateTo
      ? `${dateFrom}_to_${dateTo}`
      : dateFrom
        ? `from_${dateFrom}`
        : dateTo
          ? `to_${dateTo}`
          : `all_time_as_at_${today}`;
  return `My_Expediting_Analytics_${span}.xlsx`;
}
