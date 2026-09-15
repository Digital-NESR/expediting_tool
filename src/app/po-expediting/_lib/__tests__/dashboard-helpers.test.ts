import { describe, expect, it } from 'vitest';

import type { PurchaseOrder } from '@/types/po';
import { compareValues, daysDiff, formatCurrency, formatDate } from '../format';
import { PO_SORT_MAP, rowMatchesAccountType, rowMatchesSearch, rowMatchesStatus } from '../filters';
import { getPOMajorityDSCode, getPOStatusSummary } from '../po-status';

/* These helpers decide what a buyer sees on the PO dashboard: which lines are past due, which
   rows survive a filter, and which DS code stands for a whole PO. They were unreachable by a
   test while they sat inside a 2,300-line component; splitting that file is what made this
   file possible, so it exists to hold the behaviour still. */

const DAY = 86_400_000;
/** A date `n` days from now, as the ISO string the API hands the dashboard. */
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

function row(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    'PO Number': '4500001',
    'PO Line': '10',
    'Supplier Name': 'Acme Drilling',
    'Supplier ID': 'SUP-1',
    'SAP MAT ID': 'MAT-9',
    'Delivery Date': inDays(30),
    'Delivery Code': 'DS04',
    'Account Classification Description': 'Materials',
    ...over,
  } as PurchaseOrder;
}

describe('daysDiff', () => {
  it('is negative in the past and positive in the future', () => {
    expect(daysDiff(inDays(-5))).toBeLessThan(0);
    expect(daysDiff(inDays(30))).toBeGreaterThan(0);
  });

  /* Every caller treats 0 as "no opinion" rather than "today", which is why a blank delivery
     date lands a row in On Track rather than Past Due. */
  it.each([null, undefined, '', 'not a date'])('returns 0 for %j', (raw) => {
    expect(daysDiff(raw)).toBe(0);
  });
});

describe('rowMatchesStatus', () => {
  it('passes everything when no status is selected', () => {
    expect(rowMatchesStatus(row({ 'Delivery Date': inDays(-10) }), [])).toBe(true);
  });

  it.each([
    ['Past Due', -10],
    ['Due Soon', 3],
    ['On Track', 40],
  ])('puts a line %s days out in %s', (label, offset) => {
    expect(rowMatchesStatus(row({ 'Delivery Date': inDays(offset as number) }), [label])).toBe(
      true,
    );
  });

  /* The boundary the buckets turn on: seven days is still Due Soon, eight is On Track. */
  it('treats exactly seven days as Due Soon', () => {
    expect(rowMatchesStatus(row({ 'Delivery Date': inDays(6.5) }), ['Due Soon'])).toBe(true);
    expect(rowMatchesStatus(row({ 'Delivery Date': inDays(8) }), ['Due Soon'])).toBe(false);
  });

  it('excludes a row whose bucket is not selected', () => {
    expect(rowMatchesStatus(row({ 'Delivery Date': inDays(40) }), ['Past Due'])).toBe(false);
  });
});

describe('rowMatchesSearch', () => {
  it('passes everything for an empty term', () => {
    expect(rowMatchesSearch(row(), '')).toBe(true);
  });

  it.each([
    ['PO number', '4500001'],
    ['supplier name', 'acme'],
    ['supplier id', 'sup-1'],
    ['material id', 'mat-9'],
  ])('matches on %s', (_field, term) => {
    expect(rowMatchesSearch(row(), term)).toBe(true);
  });

  it('is case insensitive', () => {
    expect(rowMatchesSearch(row(), 'ACME DRILLING')).toBe(true);
  });

  it('does not match on a field it does not search', () => {
    expect(rowMatchesSearch(row(), 'Materials')).toBe(false);
  });

  it('survives a row with nulls in every searchable field', () => {
    const blank = row({
      'PO Number': null,
      'Supplier Name': null,
      'Supplier ID': null,
      'SAP MAT ID': null,
    } as Partial<PurchaseOrder>);
    expect(rowMatchesSearch(blank, 'anything')).toBe(false);
  });
});

describe('rowMatchesAccountType', () => {
  it('passes everything when nothing is selected', () => {
    expect(rowMatchesAccountType(row(), [])).toBe(true);
  });

  it('matches the trimmed classification', () => {
    const r = row({
      'Account Classification Description': '  Materials  ',
    } as Partial<PurchaseOrder>);
    expect(rowMatchesAccountType(r, ['Materials'])).toBe(true);
  });

  it('excludes a classification that is not selected', () => {
    expect(rowMatchesAccountType(row(), ['Services'])).toBe(false);
  });
});

describe('getPOStatusSummary', () => {
  it('counts each bucket', () => {
    const s = getPOStatusSummary([
      row({ 'Delivery Date': inDays(-3) }),
      row({ 'Delivery Date': inDays(-1) }),
      row({ 'Delivery Date': inDays(2) }),
      row({ 'Delivery Date': inDays(60) }),
    ]);
    expect(s.breakdown).toEqual({ pastDue: 2, dueSoon: 1, onTrack: 1 });
    expect(s.majority).toBe('PAST DUE');
  });

  /* Ties escalate rather than reassure: a PO split evenly between past due and on track reads
     PAST DUE, because the point of the dashboard is to surface what needs chasing. */
  it('breaks a tie towards the worse status', () => {
    const tied = getPOStatusSummary([
      row({ 'Delivery Date': inDays(-1) }),
      row({ 'Delivery Date': inDays(60) }),
    ]);
    expect(tied.majority).toBe('PAST DUE');

    const dueSoonVsOnTrack = getPOStatusSummary([
      row({ 'Delivery Date': inDays(2) }),
      row({ 'Delivery Date': inDays(60) }),
    ]);
    expect(dueSoonVsOnTrack.majority).toBe('DUE SOON');
  });

  it('reads an empty PO as PAST DUE, since every count ties at zero', () => {
    expect(getPOStatusSummary([]).majority).toBe('PAST DUE');
  });
});

describe('getPOMajorityDSCode', () => {
  it('returns the most common code', () => {
    expect(
      getPOMajorityDSCode([
        row({ 'Delivery Code': 'DS05' }),
        row({ 'Delivery Code': 'DS05' }),
        row({ 'Delivery Code': 'DS11' }),
      ]),
    ).toBe('DS05');
  });

  /* Deterministic on a tie, by code order. Without this the collapsed PO row could show a
     different status on every render for the same data. */
  it('breaks a tie by code, so the row does not flicker', () => {
    expect(
      getPOMajorityDSCode([row({ 'Delivery Code': 'DS11' }), row({ 'Delivery Code': 'DS05' })]),
    ).toBe('DS05');
  });

  it('ignores lines with no code', () => {
    expect(
      getPOMajorityDSCode([
        row({ 'Delivery Code': null } as Partial<PurchaseOrder>),
        row({ 'Delivery Code': 'DS11' }),
      ]),
    ).toBe('DS11');
  });

  it.each([
    ['an empty PO', [] as PurchaseOrder[]],
    ['a PO where no line has a code', [row({ 'Delivery Code': null } as Partial<PurchaseOrder>)]],
  ])('returns null for %s', (_why, lines) => {
    expect(getPOMajorityDSCode(lines)).toBeNull();
  });
});

describe('compareValues', () => {
  it('compares numbers numerically, not as text', () => {
    expect(compareValues('9', '10')).toBeLessThan(0);
  });

  it('compares dates chronologically', () => {
    expect(compareValues('2026-01-05', '2026-02-01')).toBeLessThan(0);
  });

  it('falls back to locale text comparison', () => {
    expect(compareValues('alpha', 'beta')).toBeLessThan(0);
  });

  it('reports equal values as equal', () => {
    expect(compareValues('42', '42')).toBe(0);
  });
});

describe('formatting', () => {
  it('spells currency with cents, unlike the shared analytics formatter', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it.each([null, undefined, '', 'abc'])('renders an em dash for currency %j', (raw) => {
    expect(formatCurrency(raw)).toBe('—');
  });

  /* Note the four-letter "Sept". This helper goes through toLocaleDateString, which abbreviates
     September that way, while the shared formatter in '@/lib/format' uses a hand-written month
     table and renders "Sep". So the dashboard and the analytics screens spell one month
     differently. Asserted as it behaves rather than as it ought to: changing it is a visible
     change to every buyer's screen and belongs in its own commit, not in a refactor. */
  it('formats a date as day, short month, year', () => {
    expect(formatDate('2026-09-15T00:00:00Z')).toBe('15 Sept 2026');
    expect(formatDate('2026-08-15T00:00:00Z')).toBe('15 Aug 2026');
  });

  it.each([null, undefined, ''])('renders an em dash for date %j', (raw) => {
    expect(formatDate(raw)).toBe('—');
  });

  it('passes an unparseable date through rather than hiding it', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('PO_SORT_MAP', () => {
  /* These strings are column keys on the row objects, so a typo here sorts by nothing at all
     and fails silently. */
  it('points at columns the rows actually carry', () => {
    const r = row() as unknown as Record<string, unknown>;
    expect(Object.keys(r)).toContain(PO_SORT_MAP.earliestDate);
    expect(PO_SORT_MAP.totalValue).toBe('Open PO Value (USD)');
  });
});
