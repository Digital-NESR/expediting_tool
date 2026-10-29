import { describe, expect, it } from 'vitest';
import {
  VENDOR_STATUS_COLUMNS,
  vendorStatusCsv,
  type VendorStatusRow,
} from '@/lib/soa/vendor-status-csv';
import { spendShares } from '@/lib/soa/spend-share';

/**
 * The file a champion sends to Finance.
 *
 * It was built inline in a click handler, between a Blob and an anchor, and so had never been
 * asserted on at all. These are the things that would be embarrassing to get wrong in
 * something an auditor opens.
 */

const row = (over: Partial<VendorStatusRow> = {}): VendorStatusRow => ({
  vendorNo: 'V100',
  vendorName: 'Acme Trading',
  amount: 250_000,
  sharePct: 12.5,
  currency: 'USD',
  status: 'received',
  requestedAt: '2026-01-05T00:00:00.000Z',
  remindedAt: null,
  respondedAt: '2026-01-11T00:00:00.000Z',
  invoiceCount: 3,
  ...over,
});

const cells = (line: string): string[] =>
  line.split('","').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));

describe('the vendor status CSV', () => {
  it('puts % Spend beside the amount it qualifies', () => {
    const head = VENDOR_STATUS_COLUMNS;
    expect(head.indexOf('% Spend')).toBe(head.indexOf('Amount (USD)') + 1);
  });

  it('writes a header and one line per vendor', () => {
    const lines = vendorStatusCsv([row(), row({ vendorNo: 'V200' })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(VENDOR_STATUS_COLUMNS.join(','));
  });

  it('writes the share the way the screens write it', () => {
    expect(cells(vendorStatusCsv([row({ sharePct: 12.5 })]).split('\n')[1])[3]).toBe('12.50%');
    /* A supplier worth a fraction of a per cent is a number, not a rounded-off zero: a
       country of 600 suppliers has most of them here, and a column of "0.00%" against
       suppliers who are really there is what this form exists to avoid. */
    expect(cells(vendorStatusCsv([row({ sharePct: 0.004 })]).split('\n')[1])[3]).toBe('<0.01%');
    expect(cells(vendorStatusCsv([row({ sharePct: 0 })]).split('\n')[1])[3]).toBe('0%');
  });

  it('leaves the share blank rather than printing 0% when there is no denominator', () => {
    /* A country whose extract has not landed has no shares to report. "0%" would be a claim
       about the supplier; empty is a claim about the data, which is the true one. */
    expect(cells(vendorStatusCsv([row({ sharePct: null })]).split('\n')[1])[3]).toBe('');
  });

  it('survives a vendor name with a comma and a quote in it', () => {
    const line = vendorStatusCsv([row({ vendorName: 'Smith, "Bob" & Co' })]).split('\n')[1];
    expect(cells(line)[1]).toBe('Smith, "Bob" & Co');
    /* Still ten fields: a bare comma inside a name would split the row and shift every
       column after it, which is the classic way a CSV quietly lies. */
    expect(line.split('","')).toHaveLength(VENDOR_STATUS_COLUMNS.length);
  });

  it('defuses a name that a spreadsheet would run as a formula', () => {
    expect(
      cells(vendorStatusCsv([row({ vendorName: '=HYPERLINK("http://x")' })]).split('\n')[1])[1],
    ).toMatch(/^'=/);
  });

  it('writes an empty string for a date that has not happened', () => {
    const c = cells(vendorStatusCsv([row({ remindedAt: null })]).split('\n')[1]);
    expect(c[7]).toBe('');
  });
});

describe('the share is of the country, not of the export', () => {
  /*
   * The arithmetic this column stands or falls on, asserted here because it is the mistake
   * that would look plausible.
   *
   * The export is the SCOPED chase list -- the few dozen suppliers carrying the balance, out
   * of hundreds in the country. Dividing by the sum of those rows instead of by the country's
   * whole extract makes every share several times too large and the biggest supplier read as
   * a third of the country when they are a twentieth of it.
   */
  const scoped = [
    { key: 'big', value: 500_000 },
    { key: 'mid', value: 300_000 },
    { key: 'small', value: 200_000 },
  ];
  const COUNTRY_BALANCE = 5_000_000; // the extract; the scoped rows are 1M of it

  it('divides by the country balance', () => {
    const shares = spendShares(scoped, COUNTRY_BALANCE);
    expect(shares.get('big')?.sharePct).toBe(10);
  });

  it('and dividing by the export instead would be five times wrong', () => {
    const selfTotal = scoped.reduce((sum, r) => sum + r.value, 0);
    expect(spendShares(scoped, selfTotal).get('big')?.sharePct).toBe(50);
  });

  it('gives an excluded entity no share, having already left the denominator', () => {
    /* NESR's own entities are off both sides of the division. Six countries have one locked
       into their chase list, so it is in these rows; counting its balance on the numerator
       while the denominator has dropped it is what let coverage climb past 100%. */
    const withIntercompany = [...scoped, { key: 'eos-jafza', value: 0 }];
    const shares = spendShares(withIntercompany, COUNTRY_BALANCE);
    expect(shares.get('eos-jafza')?.sharePct).toBe(0);
    expect(shares.get('big')?.sharePct).toBe(10);
  });
});
