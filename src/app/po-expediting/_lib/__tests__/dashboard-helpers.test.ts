import { describe, expect, it } from 'vitest';

import type { PurchaseOrder } from '@/types/po';
import {
  compareValues,
  daysDiff,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
} from '../format';
import { PO_SORT_MAP, rowMatchesAccountType, rowMatchesSearch, rowMatchesStatus } from '../filters';
import { getPOMajorityDSCode, getPOStatusSummary } from '../po-status';

/* These helpers decide what a buyer sees on the PO dashboard: which lines are past due, which
   rows survive a filter, and which DS code stands for a whole PO. They were unreachable by a
   test while they sat inside a 2,300-line component; splitting that file is what made this
   file possible, so it exists to hold the behaviour still. */

const DAY = 86_400_000;
/** A date `n` days from now, as the ISO string the API hands the dashboard. */
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

/**
 * `PurchaseOrder` types these columns as plain strings, but /api/pos selects them straight out
 * of Postgres and nullable columns arrive as null. The helpers under test know it — they guard
 * with `?? ''` and `if (code)` — so the overrides here are deliberately looser than the type,
 * to exercise the input the code actually receives.
 */
type RowOverride = Partial<Record<keyof PurchaseOrder, string | number | null | undefined>>;

function row(over: RowOverride = {}): PurchaseOrder {
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
  } as unknown as PurchaseOrder;
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
    });
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
    });
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
      getPOMajorityDSCode([row({ 'Delivery Code': null }), row({ 'Delivery Code': 'DS11' })]),
    ).toBe('DS11');
  });

  it.each([
    ['an empty PO', [] as PurchaseOrder[]],
    ['a PO where no line has a code', [row({ 'Delivery Code': null })]],
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

  /* Three letters for every month, September included. This used to read "15 Sept 2026" here
     and "15 Sep 2026" on the analytics screens, because one went through toLocaleDateString and
     the other through a fixed table. Everything goes through the table now. */
  it('formats a date as day, short month, year', () => {
    expect(formatDate('2026-09-15T00:00:00Z')).toBe('15 Sep 2026');
    expect(formatDate('2026-08-15T00:00:00Z')).toBe('15 Aug 2026');
  });

  it.each([null, undefined, ''])('renders an em dash for date %j', (raw) => {
    expect(formatDate(raw)).toBe('—');
  });

  it('passes an unparseable date through rather than hiding it', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});

/*
 * The short form the KPI card shows under 640px.
 *
 * It exists because "$118,409,052.18" needs about 240px and the card has 106px, so the full
 * figure clipped into the next card. These assert the two things that would make the short
 * form worse than the overflow it replaces: losing the magnitude, and padding a small exact
 * number into something that looks rounded.
 */
describe('formatCurrencyCompact', () => {
  it('keeps a tenth, so a total reads as 118.4M rather than 118M', () => {
    expect(formatCurrencyCompact(118_409_052.18)).toBe('$118.4M');
  });

  it('abbreviates at every scale the estate reaches', () => {
    expect(formatCurrencyCompact(1_500_000)).toBe('$1.5M');
    expect(formatCurrencyCompact(1250)).toBe('$1.3K');
    expect(formatCurrencyCompact(12_345_678_901)).toBe('$12.3B');
  });

  it('leaves a figure under a thousand exact, with no trailing tenth', () => {
    /* Compact notation pads to the maximum unless told otherwise, and "$950.0" reads as a
       truncated number rather than as the precise amount it is. */
    expect(formatCurrencyCompact(950)).toBe('$950');
    expect(formatCurrencyCompact(0)).toBe('$0');
  });

  it('stays short enough for the card at every magnitude', () => {
    /* 8 characters is what fits at text-2xl in 106px. The guard is on the format, not on one
       example, because the next person to widen maximumFractionDigits will not be measuring. */
    for (const n of [0, 950, 1250, 118_409_052.18, 12_345_678_901, 999_999_999_999]) {
      expect(formatCurrencyCompact(n).length).toBeLessThanOrEqual(8);
    }
  });

  it('renders an em dash for nothing, like its full-length sibling', () => {
    for (const raw of [null, undefined, '', 'abc']) {
      expect(formatCurrencyCompact(raw)).toBe('\u2014');
    }
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
