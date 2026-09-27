import { describe, expect, it } from 'vitest';
import { totalsByCurrencyOf } from '@/lib/soa/submission-read';
import type { SubmissionLineView } from '@/lib/soa/submission-read';

const line = (over: Partial<SubmissionLineView>): SubmissionLineView => ({
  lineNo: 1,
  legalEntity: null,
  invoiceNumber: 'INV-1',
  invoiceDate: '2026-09-01',
  invoiceDateRaw: null,
  poNumber: null,
  serviceType: null,
  currency: 'USD',
  taxAmount: null,
  totalAmount: 100,
  outstandingAmount: 100,
  outstandingDays: 10,
  remarks: null,
  issues: [],
  ...over,
});

describe('totalsByCurrencyOf', () => {
  it('totals each currency separately', () => {
    // Adding dinars to dollars produces a number that means nothing while looking exactly like a
    // number that does.
    const out = totalsByCurrencyOf([
      line({ currency: 'USD', outstandingAmount: 100 }),
      line({ currency: 'KWD', outstandingAmount: 50 }),
      line({ currency: 'USD', outstandingAmount: 25 }),
    ]);
    expect(out).toEqual([
      { currency: 'USD', outstanding: 125, lines: 2 },
      { currency: 'KWD', outstanding: 50, lines: 1 },
    ]);
  });

  it('counts a row whose amount could not be read without adding it in', () => {
    const out = totalsByCurrencyOf([
      line({ outstandingAmount: 100 }),
      line({ outstandingAmount: null }),
    ]);
    // Two lines, one number. The count is what tells the reviewer the total is short.
    expect(out).toEqual([{ currency: 'USD', outstanding: 100, lines: 2 }]);
  });

  it('does not silently fold an unlabelled currency into a real one', () => {
    const out = totalsByCurrencyOf([
      line({ currency: 'USD', outstandingAmount: 10 }),
      line({ currency: null, outstandingAmount: 90 }),
    ]);
    expect(out.map((t) => t.currency).sort()).toEqual(['UNKNOWN', 'USD']);
  });

  it('matches currencies regardless of how the supplier cased them', () => {
    const out = totalsByCurrencyOf([
      line({ currency: 'usd', outstandingAmount: 10 }),
      line({ currency: 'USD', outstandingAmount: 10 }),
    ]);
    expect(out).toEqual([{ currency: 'USD', outstanding: 20, lines: 2 }]);
  });

  it('puts the largest balance first', () => {
    const out = totalsByCurrencyOf([
      line({ currency: 'AED', outstandingAmount: 5 }),
      line({ currency: 'USD', outstandingAmount: 500 }),
    ]);
    expect(out[0].currency).toBe('USD');
  });

  it('returns nothing for a statement with no rows', () => {
    expect(totalsByCurrencyOf([])).toEqual([]);
  });
});
