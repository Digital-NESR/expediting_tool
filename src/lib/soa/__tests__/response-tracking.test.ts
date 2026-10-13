import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { writeConsolidated, type ConsolidatedRow, type ResponseTrackingRow } from '../consolidated';

/**
 * The Response Tracking tab.
 *
 * Exercised through `writeConsolidated` against fixture rows rather than the database, which is
 * the split the module was built for: the query and the format fail in different ways and are
 * worth failing separately.
 *
 * What is pinned is the arithmetic on the cards, because that is the part a champion is judged on
 * and the part that silently goes wrong. Specifically: a supplier nobody wrote to is not a
 * non-responder, and a response filed without an outreach record must not inflate the rate.
 */

const line = (vendorNo: string, vendorName: string): ConsolidatedRow =>
  ({
    vendor_no: vendorNo,
    vendor_name: vendorName,
    country_name: 'Oman',
    cycle_label: 'Q3 2026',
    outstanding_amount: 100,
    currency: 'OMR',
    issues: [],
    marker: null,
  }) as unknown as ConsolidatedRow;

const track = (
  vendorNo: string,
  vendorName: string,
  o: Partial<ResponseTrackingRow> = {},
): ResponseTrackingRow => ({
  vendorNo,
  vendorName,
  openPoAmount: 1000,
  currency: 'OMR',
  status: 'reminded',
  dispatches: 1,
  firstSentAt: new Date('2026-07-01T09:00:00Z'),
  lastSentAt: new Date('2026-07-15T09:00:00Z'),
  respondedAt: null,
  workbook: null,
  email: null,
  invoiceLines: 0,
  ...o,
});

const FILE = { id: 1, fileName: 'soa.xlsx', source: 'supplier_portal' };
const EMAIL = { id: 2, fileName: 'reply.msg', source: 'champion' };

async function sheetOf(tracking: ResponseTrackingRow[]) {
  const { file } = await writeConsolidated([line('V1', 'Acme')], [], tracking);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet('Response Tracking');
  expect(ws, 'the Response Tracking sheet should exist').toBeDefined();
  return ws!;
}

/** The cards sit on rows 4-6; the value of the nth card is row 5 of its two-column block. */
const cardValue = (ws: ExcelJS.Worksheet, i: number) => ws.getCell(5, 1 + i * 2).value;
const cardNote = (ws: ExcelJS.Worksheet, i: number) => String(ws.getCell(6, 1 + i * 2).value ?? '');
const FLOATED = 0, RESPONDED = 1, SPREADSHEET = 2, EMAIL_ONLY = 3, BOTH = 4, NONE = 5;

describe('the Response Tracking tab', () => {
  it('is added to the workbook', async () => {
    const ws = await sheetOf([track('V1', 'Acme')]);
    expect(ws.getCell(1, 1).value).toBe('RESPONSE TRACKING');
  });

  /* The whole reason the tab exists: the consolidated sheet can only describe suppliers who sent
     something, so a non-responder is invisible in the file AP receives. */
  it('lists a supplier who never answered', async () => {
    const ws = await sheetOf([
      track('V1', 'Acme', { workbook: FILE }),
      track('V9', 'Silent Ltd'),
    ]);
    const names = [ws.getCell(9, 1).value, ws.getCell(10, 1).value];
    expect(names).toContain('Silent Ltd');
  });

  it('counts the three routes separately', async () => {
    const ws = await sheetOf([
      track('V1', 'Sheet only', { workbook: FILE }),
      track('V2', 'Email only', { email: EMAIL }),
      track('V3', 'Both', { workbook: FILE, email: EMAIL }),
      track('V4', 'Neither'),
    ]);
    expect(cardValue(ws, SPREADSHEET)).toBe(1);
    expect(cardValue(ws, EMAIL_ONLY)).toBe(1);
    expect(cardValue(ws, BOTH)).toBe(1);
    expect(cardValue(ws, RESPONDED)).toBe(3);
    expect(cardValue(ws, NONE)).toBe(1);
  });

  /* A supplier nobody wrote to has not failed to respond. Counting them as a non-responder would
     understate the rate and blame the supplier for the champion's own backlog. */
  it('does not count a supplier who was never contacted as a non-responder', async () => {
    const ws = await sheetOf([
      track('V1', 'Contacted, silent', { dispatches: 2 }),
      track('V2', 'Never written to', { dispatches: 0, firstSentAt: null, lastSentAt: null }),
    ]);
    expect(cardValue(ws, FLOATED)).toBe(1);
    expect(cardValue(ws, NONE)).toBe(1);
    expect(cardNote(ws, FLOATED)).toContain('of 2 in scope');
    expect(cardNote(ws, FLOATED)).toContain('1 not yet written to');
  });

  /* Live data has these: a champion files a statement for a supplier with no outreach record.
     They are a real response, but putting them in the numerator over a "contacted" denominator
     flatters the rate, so the rate uses contacted-and-answered only. */
  it('keeps the response rate to one population', async () => {
    const ws = await sheetOf([
      track('V1', 'Contacted, answered', { dispatches: 1, workbook: FILE }),
      track('V2', 'Contacted, silent', { dispatches: 1 }),
      track('V3', 'Filed without outreach', { dispatches: 0, firstSentAt: null, workbook: FILE }),
    ]);
    // Three responses counted, but the rate is 1 of 2 contacted, not 2 of 2.
    expect(cardValue(ws, RESPONDED)).toBe(2);
    expect(cardNote(ws, RESPONDED)).toContain('50%');
  });

  it('says so when a response arrived without outreach, rather than leaving the cards to disagree', async () => {
    const ws = await sheetOf([
      track('V1', 'Contacted', { dispatches: 1, workbook: FILE }),
      track('V2', 'Unsolicited', { dispatches: 0, firstSentAt: null, workbook: FILE }),
    ]);
    expect(String(ws.getCell(3, 1).value ?? '')).toContain('no outreach on record');
  });

  it('reports --- rather than dividing by nobody', async () => {
    const ws = await sheetOf([
      track('V1', 'Never contacted', { dispatches: 0, firstSentAt: null }),
    ]);
    expect(cardValue(ws, FLOATED)).toBe(0);
    expect(cardNote(ws, RESPONDED)).toContain('--');
  });

  it('marks each supplier answered or not, and leaves the uncontacted neither', async () => {
    const ws = await sheetOf([
      track('V1', 'Answered', { workbook: FILE }),
      track('V2', 'Silent', { dispatches: 3 }),
      track('V3', 'Not sent', { dispatches: 0, firstSentAt: null }),
    ]);
    expect(ws.getCell(9, 8).value).toBe('Yes');
    expect(ws.getCell(10, 8).value).toBe('No');
    expect(ws.getCell(11, 8).value).toBe('--');
  });

  it('names the route and what was provided', async () => {
    const ws = await sheetOf([track('V1', 'Acme', { workbook: FILE, email: EMAIL })]);
    expect(ws.getCell(9, 10).value).toBe('Supplier portal + Champion');
    expect(ws.getCell(9, 11).value).toBe('Spreadsheet + Email');
  });

  it('holds together with nobody in scope', async () => {
    const ws = await sheetOf([]);
    expect(cardValue(ws, FLOATED)).toBe(0);
    expect(String(ws.getCell(9, 1).value ?? '')).toContain('No suppliers are in scope');
  });
});
