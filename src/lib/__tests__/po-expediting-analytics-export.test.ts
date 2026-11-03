import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildMyAnalyticsWorkbook,
  buildVendorPerformance,
  daysBetween,
  daysPushedOut,
  daysToRespond,
  describeRange,
  dsCategoryLabel,
  exportFilename,
  isAnswered,
  lineColumns,
  performanceColumns,
  responseRateColumns,
  summaryTotals,
} from '@/lib/po-expediting/analytics-export';
import type { MyAnalyticsExport, MyExportLine, MySupplierRow } from '@/app/actions/analytics';

/**
 * The My Analytics workbook.
 *
 * What is asserted here is the arithmetic, not the spreadsheet: whether a line counts as
 * answered, how long the supplier took, how far the delivery moved, and which of those a
 * supplier's row adds up. Those are the numbers somebody will put in front of a vendor, and
 * they were unreachable from a test while they lived inside a click handler.
 */

const line = (over: Partial<MyExportLine> = {}): MyExportLine => ({
  session_ref: '11111111-1111-1111-1111-111111111111',
  dispatched_at: '2026-10-01T08:00:00.000Z',
  responded_at: '2026-10-03T08:00:00.000Z',
  po_number: '4500001',
  po_line: '10',
  supplier_name: 'Acme Valves',
  supplier_id: 'V100',
  country: 'UAE',
  p_group: 'P01',
  sap_mat_id: 'MAT-1',
  item_description: 'Gate valve 6in',
  open_qty: 4,
  open_po_value_usd: 10_000,
  original_delivery_date: '2026-10-20',
  workflow_state: 'Submitted',
  current_status: 'DS04',
  new_delivery_date: null,
  supplier_comments: null,
  buyer_comments: null,
  ...over,
});

const supplier = (over: Partial<MySupplierRow> = {}): MySupplierRow => ({
  supplier_name: 'Acme Valves',
  times_expedited: 2,
  total_lines: 2,
  lines_responded: 1,
  response_rate: 50,
  last_response: '2026-10-03T08:00:00.000Z',
  ...over,
});

describe('reading one line', () => {
  it('counts a submitted line as answered and an emailed one as not', () => {
    expect(isAnswered(line({ workflow_state: 'Submitted' }))).toBe(true);
    expect(isAnswered(line({ workflow_state: 'Email Sent' }))).toBe(false);
  });

  it('counts a submitted line with no DS code as answered', () => {
    /* Submitting without picking a code is still a reply. Treating it as silence would
       understate the supplier and flatter nobody. */
    const l = line({ workflow_state: 'Submitted', current_status: null });
    expect(isAnswered(l)).toBe(true);
    expect(dsCategoryLabel(l)).toBe('No DS code');
  });

  it('labels an unanswered line as awaiting rather than as a missing code', () => {
    expect(
      dsCategoryLabel(
        line({ workflow_state: 'Email Sent', current_status: 'Pending Supplier Response' }),
      ),
    ).toBe('Awaiting response');
  });

  it('takes the DS category from ds-codes, not from a list of its own', () => {
    expect(dsCategoryLabel(line({ current_status: 'DS04' }))).toBe('On Time');
    expect(dsCategoryLabel(line({ current_status: 'DS05' }))).toBe('Delayed');
    expect(dsCategoryLabel(line({ current_status: 'DS12' }))).toBe('Completed / In Progress');
  });

  it('measures the reply from dispatch to response', () => {
    expect(daysToRespond(line())).toBe(2);
  });

  it('leaves the reply time empty while the line is still out', () => {
    /* Not zero. A zero in this column reads as "answered instantly", which is the opposite
       of what an unanswered line means, and it would drag every average down. */
    expect(daysToRespond(line({ workflow_state: 'Email Sent', responded_at: null }))).toBeNull();
  });

  it('reports how far the delivery moved, signed', () => {
    expect(daysPushedOut(line({ new_delivery_date: '2026-10-30' }))).toBe(10);
    /* Pulled in, which happens and should not read as a ten-day slip. */
    expect(daysPushedOut(line({ new_delivery_date: '2026-10-15' }))).toBe(-5);
  });

  it('leaves the movement empty when there is no revised date', () => {
    expect(daysPushedOut(line({ new_delivery_date: null }))).toBeNull();
  });

  it('returns null rather than NaN for an unparseable date', () => {
    expect(daysBetween('not a date', '2026-10-03T08:00:00.000Z')).toBeNull();
    expect(daysBetween(null, '2026-10-03T08:00:00.000Z')).toBeNull();
  });
});

describe('rolling the lines up per vendor', () => {
  const lines = [
    line({ po_line: '10', open_po_value_usd: 10_000, current_status: 'DS04' }),
    line({
      po_line: '20',
      open_po_value_usd: 5_000,
      workflow_state: 'Email Sent',
      responded_at: null,
      current_status: 'Pending Supplier Response',
    }),
    line({
      po_line: '30',
      open_po_value_usd: 2_000,
      responded_at: '2026-10-09T08:00:00.000Z',
      current_status: 'DS12',
      new_delivery_date: '2026-10-26',
    }),
  ];

  it('separates value expedited from value actually answered', () => {
    const [row] = buildVendorPerformance(lines, [supplier()]);
    expect(row.open_value_usd).toBe(17_000);
    /* The 5,000 line is still out, so it is not in the answered figure. This is the pair a
       buyer takes to a vendor meeting, and conflating them is the whole point of the column. */
    expect(row.value_responded_usd).toBe(12_000);
  });

  it('takes fastest and slowest from the answered lines only', () => {
    const [row] = buildVendorPerformance(lines, [supplier()]);
    expect(row.fastest_days).toBe(2);
    expect(row.slowest_days).toBe(8);
  });

  it('averages the delivery movement over the revised lines, not over all of them', () => {
    const [row] = buildVendorPerformance(lines, [supplier()]);
    /* One line moved, by six days. Dividing by all three would report two. */
    expect(row.lines_revised).toBe(1);
    expect(row.avg_days_pushed_out).toBe(6);
  });

  it('splits the lines by DS category', () => {
    const [row] = buildVendorPerformance(lines, [supplier()]);
    expect(row.byCategory['On Time']).toBe(1);
    expect(row.byCategory['Completed / In Progress']).toBe(1);
    expect(row.byCategory['Awaiting response']).toBe(1);
  });

  it('every line lands in exactly one category bucket', () => {
    const [row] = buildVendorPerformance(lines, [supplier()]);
    const binned = Object.values(row.byCategory).reduce((sum, n) => sum + n, 0);
    expect(binned).toBe(row.total_lines);
  });

  it('treats a missing value as zero rather than dropping the line', () => {
    const [row] = buildVendorPerformance(
      [line({ open_po_value_usd: null })],
      [supplier({ total_lines: 1 })],
    );
    expect(row.total_lines).toBe(1);
    expect(row.open_value_usd).toBe(0);
  });

  it('keeps the vendors in the same order as the response-rate sheet', () => {
    /* The two vendor sheets are one story told twice. Re-sorting one of them makes a reader
       scroll back and forth matching names. */
    const two = [line({ supplier_name: 'Beta Ltd' }), line({ supplier_name: 'Acme Valves' })];
    const ranked = [
      supplier({ supplier_name: 'Beta Ltd', response_rate: 90 }),
      supplier({ supplier_name: 'Acme Valves', response_rate: 40 }),
    ];
    expect(buildVendorPerformance(two, ranked).map((r) => r.supplier_name)).toEqual([
      'Beta Ltd',
      'Acme Valves',
    ]);
  });

  it('still lists a vendor the breakdown does not rank', () => {
    const rows = buildVendorPerformance([line({ supplier_name: 'Ghost Co' })], []);
    expect(rows.map((r) => r.supplier_name)).toEqual(['Ghost Co']);
  });
});

describe('the summary sheet', () => {
  const data = (over: Partial<MyAnalyticsExport> = {}): MyAnalyticsExport => ({
    buyer: { name: 'A Buyer', email: 'buyer@nesr.com' },
    generatedAt: '2026-11-02T06:00:00.000Z',
    filters: { dateFrom: null, dateTo: null },
    kpis: {
      totalLinesExpedited: 3,
      totalSuppliersContacted: 1,
      totalEmailsSent: 2,
      overallResponseRate: 66.7,
    },
    supplierBreakdown: [supplier()],
    supplierResponseTime: [
      { supplier_name: 'Acme Valves', avg_days_to_respond: 5, responses_count: 2 },
    ],
    weeklyRateData: [],
    lines: [
      line({ open_po_value_usd: 10_000 }),
      line({ workflow_state: 'Email Sent', responded_at: null, open_po_value_usd: 5_000 }),
      line({ open_po_value_usd: 2_000, new_delivery_date: '2026-10-26' }),
    ],
    sessions: [],
    ...over,
  });

  it('counts what is still out and what it is worth', () => {
    const t = summaryTotals(data());
    expect(t.linesAwaiting).toBe(1);
    expect(t.openValue).toBe(17_000);
    expect(t.respondedValue).toBe(12_000);
    expect(t.linesRevised).toBe(1);
  });

  it('says the date range in words, including when there is none', () => {
    expect(describeRange({ dateFrom: null, dateTo: null })).toBe('All time (no date filter)');
    expect(describeRange({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })).toBe(
      '2026-10-01 to 2026-10-31',
    );
    expect(describeRange({ dateFrom: '2026-10-01', dateTo: null })).toBe('2026-10-01 onwards');
    expect(describeRange({ dateFrom: null, dateTo: '2026-10-31' })).toBe('Up to 2026-10-31');
  });

  it('puts the range in the filename so two exports do not collide in Downloads', () => {
    expect(
      exportFilename(data({ filters: { dateFrom: '2026-10-01', dateTo: '2026-10-31' } })),
    ).toBe('My_Expediting_Analytics_2026-10-01_to_2026-10-31.xlsx');
    expect(exportFilename(data())).toBe('My_Expediting_Analytics_all_time_as_at_2026-11-02.xlsx');
  });
});

describe('the columns', () => {
  it('derives lines awaiting rather than asking the server for it', () => {
    const col = responseRateColumns(new Map()).find((c) => c.name === 'Lines Awaiting');
    expect(col?.of(supplier({ total_lines: 10, lines_responded: 4 }))).toBe(6);
  });

  it('leaves the average blank for a supplier who has never replied', () => {
    const col = responseRateColumns(new Map()).find((c) => c.name === 'Avg Days to Respond');
    expect(col?.of(supplier())).toBeNull();
  });

  it('writes dates as Dates, so the sheet sorts and filters them as dates', () => {
    const col = lineColumns().find((c) => c.name === 'Original Delivery');
    expect(col?.of(line())).toBeInstanceOf(Date);
  });

  it('writes a missing date as blank, not as the string null', () => {
    const col = lineColumns().find((c) => c.name === 'Revised Delivery');
    expect(col?.of(line({ new_delivery_date: null }))).toBeNull();
  });

  it('gives every column a distinct name on each sheet', () => {
    for (const columns of [responseRateColumns(new Map()), performanceColumns(), lineColumns()]) {
      const names = columns.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('carries a DS code as its code and its name in separate columns', () => {
    const cols = lineColumns();
    expect(cols.find((c) => c.name === 'DS Code')?.of(line({ current_status: 'DS04' }))).toBe(
      'DS04',
    );
    expect(cols.find((c) => c.name === 'DS Status')?.of(line({ current_status: 'DS04' }))).toBe(
      'PO Acknowledged - Delivery On time',
    );
  });
});

describe('the workbook itself', () => {
  /* exceljs is dynamically imported, and the first of these tests otherwise pays the whole
     cold-import cost -- about five seconds with the full suite's workers competing, which is
     exactly the default timeout. Warmed once here so the tests below time their own work. */
  beforeAll(async () => {
    await import('exceljs');
  }, 60_000);

  const sample = (over: Partial<MyAnalyticsExport> = {}): MyAnalyticsExport => ({
    buyer: { name: 'A Buyer', email: 'buyer@nesr.com' },
    generatedAt: '2026-11-02T06:00:00.000Z',
    filters: { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
    kpis: {
      totalLinesExpedited: 2,
      totalSuppliersContacted: 1,
      totalEmailsSent: 1,
      overallResponseRate: 50,
    },
    supplierBreakdown: [supplier()],
    supplierResponseTime: [
      { supplier_name: 'Acme Valves', avg_days_to_respond: 2, responses_count: 1 },
    ],
    weeklyRateData: [
      {
        week: '2026-09-28T00:00:00.000Z',
        lines_expedited: 2,
        lines_responded: 1,
        avg_response_rate: 50,
        sessions_count: 1,
      },
    ],
    lines: [line(), line({ po_line: '20', workflow_state: 'Email Sent', responded_at: null })],
    sessions: [
      {
        session_ref: '11111111-1111-1111-1111-111111111111',
        dispatched_at: '2026-10-01T08:00:00.000Z',
        total_suppliers: 1,
        total_po_lines: 2,
        total_emails_sent: 1,
        suppliers_responded: 1,
        lines_responded: 1,
        response_rate_pct: 50,
        fully_closed: false,
        closed_at: null,
      },
    ],
    ...over,
  });

  it('has the six sheets, named as the summary advertises them', async () => {
    const wb = await buildMyAnalyticsWorkbook(sample());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Summary',
      'Vendor Response Rates',
      'Vendor Performance',
      'Line Detail',
      'Sessions',
      'Weekly Trend',
    ]);
  });

  it('writes the Line Detail header exactly as the column spec declares it', async () => {
    const wb = await buildMyAnalyticsWorkbook(sample());
    const sheet = wb.getWorksheet('Line Detail');
    /* Row 3: the note is row 1 and row 2 is the gap. */
    const header = (sheet?.getRow(3).values as unknown[]).slice(1);
    expect(header).toEqual(lineColumns().map((c) => c.name));
  });

  it('puts a real Date in a date cell, not a string', async () => {
    const wb = await buildMyAnalyticsWorkbook(sample());
    const sheet = wb.getWorksheet('Line Detail');
    const col = lineColumns().findIndex((c) => c.name === 'Original Delivery') + 1;
    expect(sheet?.getRow(4).getCell(col).value).toBeInstanceOf(Date);
  });

  it('puts a number in a value cell, so the column can be summed', async () => {
    const wb = await buildMyAnalyticsWorkbook(sample());
    const sheet = wb.getWorksheet('Line Detail');
    const col = lineColumns().findIndex((c) => c.name === 'Open Value USD') + 1;
    expect(sheet?.getRow(4).getCell(col).value).toBe(10_000);
  });

  it('still produces all six sheets when the range caught nothing', async () => {
    /* exceljs refuses a table with no body rows, so an empty export used to be the one that
       threw -- and a buyer filtering to a week they were on leave is a normal thing to do. */
    const wb = await buildMyAnalyticsWorkbook(
      sample({
        lines: [],
        sessions: [],
        supplierBreakdown: [],
        supplierResponseTime: [],
        weeklyRateData: [],
        kpis: {
          totalLinesExpedited: 0,
          totalSuppliersContacted: 0,
          totalEmailsSent: 0,
          overallResponseRate: null,
        },
      }),
    );
    expect(wb.worksheets).toHaveLength(6);
    expect(wb.getWorksheet('Line Detail')).toBeDefined();
  });

  it('names the buyer and the date range on every sheet', async () => {
    const wb = await buildMyAnalyticsWorkbook(sample());
    /* A tab that has been mailed on should still say whose work it is. */
    for (const name of ['Vendor Response Rates', 'Vendor Performance', 'Line Detail']) {
      const note = String(wb.getWorksheet(name)?.getRow(1).getCell(1).value ?? '');
      expect(note).toContain('A Buyer');
      expect(note).toContain('2026-10-01 to 2026-10-31');
    }
  });
});
