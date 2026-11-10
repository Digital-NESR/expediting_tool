import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  applyAnalyticsFilters,
  buildDateTree,
  dateNodeKeys,
  dateRangeFor,
  EMPTY_FILTERS,
  type AnalyticsFilterState,
} from '@/app/procure-guard/analytics/AnalyticsFilters';
import type { ProcureGuardAnalyticsRequest } from '@/types/procureGuard';

/**
 * Every card and table on the analytics page is recomputed from the array this returns, so a
 * wrong predicate is not a wrong list -- it is a wrong total on a KPI card, which is the kind of
 * number people forward to someone else.
 */

const NOW = new Date('2026-11-10T12:00:00');

function req(over: Partial<ProcureGuardAnalyticsRequest> = {}): ProcureGuardAnalyticsRequest {
  return {
    id: 1,
    request_type: 'advance',
    reference_number: 'ADV-1',
    vendor_name: 'Stewart & Stevenson',
    status: 'Submitted',
    requested_by_email: 'a@nesr.com',
    requested_by_name: 'A Person',
    amount: 1000,
    amount_usd: 1000,
    currency: 'USD',
    created_at: '2026-11-09T10:00:00',
    priority: 'Normal',
    country: 'Saudi Arabia (KSA)',
    reviewed_at: null,
    spend_value_usd: null,
    ...over,
  } as ProcureGuardAnalyticsRequest;
}

const filters = (over: Partial<AnalyticsFilterState> = {}): AnalyticsFilterState => ({
  ...EMPTY_FILTERS,
  ...over,
});

const refs = (rows: ProcureGuardAnalyticsRequest[]) => rows.map((r) => r.reference_number);

describe('applyAnalyticsFilters', () => {
  it('returns everything when nothing is set', () => {
    const rows = [req({ reference_number: 'A' }), req({ reference_number: 'B' })];
    expect(applyAnalyticsFilters(rows, EMPTY_FILTERS, NOW)).toHaveLength(2);
  });

  it('filters by request type', () => {
    const rows = [
      req({ reference_number: 'ADV', request_type: 'advance' }),
      req({ reference_number: 'ADH', request_type: 'adhoc' }),
    ];
    expect(refs(applyAnalyticsFilters(rows, filters({ scope: 'adhoc' }), NOW))).toEqual(['ADH']);
  });

  it('filters by a relative date window, counting whole local days', () => {
    const rows = [
      req({ reference_number: 'TODAY', created_at: '2026-11-10T09:00:00' }),
      req({ reference_number: 'SIX_DAYS', created_at: '2026-11-04T23:30:00' }),
      req({ reference_number: 'EIGHT_DAYS', created_at: '2026-11-02T09:00:00' }),
    ];
    const kept = refs(applyAnalyticsFilters(rows, filters({ datePreset: 'last7' }), NOW));
    expect(kept).toContain('TODAY');
    expect(kept).toContain('SIX_DAYS');
    expect(kept).not.toContain('EIGHT_DAYS');
  });

  it('includes both endpoints of a custom range', () => {
    const rows = [
      req({ reference_number: 'BEFORE', created_at: '2026-10-31T23:59:00' }),
      req({ reference_number: 'FIRST', created_at: '2026-11-01T00:05:00' }),
      req({ reference_number: 'LAST', created_at: '2026-11-05T23:50:00' }),
      req({ reference_number: 'AFTER', created_at: '2026-11-06T00:10:00' }),
    ];
    const kept = refs(
      applyAnalyticsFilters(
        rows,
        filters({ datePreset: 'custom', from: '2026-11-01', to: '2026-11-05' }),
        NOW,
      ),
    );
    expect(kept).toEqual(['FIRST', 'LAST']);
  });

  it('applies a half-filled custom range on the end that was given', () => {
    const rows = [
      req({ reference_number: 'OLD', created_at: '2026-01-01T00:00:00' }),
      req({ reference_number: 'NEW', created_at: '2026-11-09T00:00:00' }),
    ];
    expect(
      refs(applyAnalyticsFilters(rows, filters({ datePreset: 'custom', from: '2026-06-01' }), NOW)),
    ).toEqual(['NEW']);
    expect(
      refs(applyAnalyticsFilters(rows, filters({ datePreset: 'custom', to: '2026-06-01' }), NOW)),
    ).toEqual(['OLD']);
  });

  it('drops a row with an unreadable date only when a date filter is asked for', () => {
    const rows = [req({ reference_number: 'BAD', created_at: 'not a date' })];
    expect(applyAnalyticsFilters(rows, EMPTY_FILTERS, NOW)).toHaveLength(1);
    expect(applyAnalyticsFilters(rows, filters({ datePreset: 'last30' }), NOW)).toHaveLength(0);
  });

  it('treats multi-selects as OR within a field and AND across fields', () => {
    const rows = [
      req({ reference_number: 'A', country: 'Oman', priority: 'High' }),
      req({ reference_number: 'B', country: 'Kuwait', priority: 'Normal' }),
      req({ reference_number: 'C', country: 'Oman', priority: 'Normal' }),
    ];
    expect(
      refs(applyAnalyticsFilters(rows, filters({ countries: ['Oman', 'Kuwait'] }), NOW)),
    ).toEqual(['A', 'B', 'C']);
    expect(
      refs(
        applyAnalyticsFilters(rows, filters({ countries: ['Oman'], priorities: ['Normal'] }), NOW),
      ),
    ).toEqual(['C']);
  });

  it('matches a blank country or priority as Unspecified, the way the options list shows it', () => {
    const rows = [req({ reference_number: 'BLANK', country: null, priority: '  ' })];
    expect(refs(applyAnalyticsFilters(rows, filters({ countries: ['Unspecified'] }), NOW))).toEqual(
      ['BLANK'],
    );
    expect(
      refs(applyAnalyticsFilters(rows, filters({ priorities: ['Unspecified'] }), NOW)),
    ).toEqual(['BLANK']);
  });

  it('searches the vendor case-insensitively on a substring', () => {
    const rows = [req({ reference_number: 'A', vendor_name: 'Stewart & Stevenson' })];
    expect(applyAnalyticsFilters(rows, filters({ vendorQuery: 'stevenson' }), NOW)).toHaveLength(1);
    expect(applyAnalyticsFilters(rows, filters({ vendorQuery: 'halliburton' }), NOW)).toHaveLength(
      0,
    );
  });

  it('bounds on the USD equivalent, inclusive at both ends', () => {
    const rows = [
      req({ reference_number: 'SMALL', amount_usd: 100 }),
      req({ reference_number: 'MID', amount_usd: 500 }),
      req({ reference_number: 'BIG', amount_usd: 1000 }),
    ];
    expect(
      refs(applyAnalyticsFilters(rows, filters({ minAmount: '500', maxAmount: '1000' }), NOW)),
    ).toEqual(['MID', 'BIG']);
    expect(refs(applyAnalyticsFilters(rows, filters({ minAmount: '600' }), NOW))).toEqual(['BIG']);
  });

  it('ignores an amount box holding something that is not a number', () => {
    const rows = [req({ reference_number: 'A', amount_usd: 100 })];
    expect(applyAnalyticsFilters(rows, filters({ minAmount: 'abc' }), NOW)).toHaveLength(1);
  });

  it('filters by requester email, not by display name', () => {
    const rows = [
      req({ reference_number: 'A', requested_by_email: 'a@nesr.com' }),
      req({ reference_number: 'B', requested_by_email: 'b@nesr.com' }),
    ];
    expect(refs(applyAnalyticsFilters(rows, filters({ requesters: ['b@nesr.com'] }), NOW))).toEqual(
      ['B'],
    );
  });
});

describe('dateRangeFor', () => {
  it('bounds last month to that calendar month', () => {
    const { fromMs, toMs } = dateRangeFor({ datePreset: 'last-month', from: '', to: '' }, NOW);
    expect(new Date(fromMs).getMonth()).toBe(9); // October
    expect(new Date(toMs).getMonth()).toBe(9);
    expect(new Date(toMs).getDate()).toBe(31);
  });

  it('is unbounded for all time', () => {
    const { fromMs, toMs } = dateRangeFor({ datePreset: 'all', from: '', to: '' }, NOW);
    expect(fromMs).toBe(Number.NEGATIVE_INFINITY);
    expect(toMs).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('activeFilterCount', () => {
  it('counts nothing for an untouched bar', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each narrowed field once, and the amount pair as one', () => {
    expect(activeFilterCount(filters({ scope: 'adhoc' }))).toBe(1);
    expect(activeFilterCount(filters({ countries: ['Oman', 'Kuwait'] }))).toBe(1);
    expect(activeFilterCount(filters({ minAmount: '1', maxAmount: '2' }))).toBe(1);
    expect(
      activeFilterCount(filters({ scope: 'adhoc', datePreset: 'last7', vendorQuery: 'x' })),
    ).toBe(3);
  });

  it('does not count whitespace typed into a text box', () => {
    expect(activeFilterCount(filters({ vendorQuery: '   ' }))).toBe(0);
  });
});

describe('date tree', () => {
  it('maps a date to its year, quarter, month and day keys', () => {
    expect(dateNodeKeys('2026-05-24T10:00:00')).toEqual([
      'Y:2026',
      'Q:2026-2',
      'M:2026-05',
      'D:2026-05-24',
    ]);
    // Quarter boundaries, which are the easy ones to get wrong by one.
    expect(dateNodeKeys('2026-03-31T23:00:00')[1]).toBe('Q:2026-1');
    expect(dateNodeKeys('2026-04-01T00:00:00')[1]).toBe('Q:2026-2');
    expect(dateNodeKeys('2026-12-31T12:00:00')[1]).toBe('Q:2026-4');
  });

  it('has no keys for an unreadable date', () => {
    expect(dateNodeKeys('not a date')).toEqual([]);
  });

  it('keeps everything under a ticked year', () => {
    const rows = [
      req({ reference_number: 'JAN', created_at: '2026-01-15T10:00:00' }),
      req({ reference_number: 'DEC', created_at: '2026-12-15T10:00:00' }),
      req({ reference_number: 'OTHER_YEAR', created_at: '2025-06-15T10:00:00' }),
    ];
    expect(
      refs(
        applyAnalyticsFilters(rows, filters({ datePreset: 'tree', dateNodes: ['Y:2026'] }), NOW),
      ),
    ).toEqual(['JAN', 'DEC']);
  });

  it('keeps only that quarter, or only that month, or only that day', () => {
    const rows = [
      req({ reference_number: 'Q1', created_at: '2026-02-10T10:00:00' }),
      req({ reference_number: 'Q2_MAY_01', created_at: '2026-05-01T10:00:00' }),
      req({ reference_number: 'Q2_MAY_24', created_at: '2026-05-24T10:00:00' }),
      req({ reference_number: 'Q2_JUNE', created_at: '2026-06-10T10:00:00' }),
    ];
    const pick = (node: string) =>
      refs(applyAnalyticsFilters(rows, filters({ datePreset: 'tree', dateNodes: [node] }), NOW));
    expect(pick('Q:2026-2')).toEqual(['Q2_MAY_01', 'Q2_MAY_24', 'Q2_JUNE']);
    expect(pick('M:2026-05')).toEqual(['Q2_MAY_01', 'Q2_MAY_24']);
    expect(pick('D:2026-05-24')).toEqual(['Q2_MAY_24']);
  });

  it('unions several ticks rather than intersecting them', () => {
    const rows = [
      req({ reference_number: 'JAN_2025', created_at: '2025-01-10T10:00:00' }),
      req({ reference_number: 'MAY_2026', created_at: '2026-05-10T10:00:00' }),
      req({ reference_number: 'AUG_2026', created_at: '2026-08-10T10:00:00' }),
    ];
    expect(
      refs(
        applyAnalyticsFilters(
          rows,
          filters({ datePreset: 'tree', dateNodes: ['Y:2025', 'M:2026-08'] }),
          NOW,
        ),
      ),
    ).toEqual(['JAN_2025', 'AUG_2026']);
  });

  it('does not narrow anything when the tree is open but nothing is ticked', () => {
    const rows = [req({ reference_number: 'A' }), req({ reference_number: 'B' })];
    const f = filters({ datePreset: 'tree', dateNodes: [] });
    expect(applyAnalyticsFilters(rows, f, NOW)).toHaveLength(2);
    expect(activeFilterCount(f)).toBe(0);
  });

  it('counts as one active filter once something is ticked', () => {
    expect(activeFilterCount(filters({ datePreset: 'tree', dateNodes: ['Y:2026'] }))).toBe(1);
  });

  it('builds only branches that contain requests, newest first, with real counts', () => {
    const rows = [
      req({ created_at: '2026-05-24T10:00:00' }),
      req({ created_at: '2026-05-24T11:00:00' }),
      req({ created_at: '2026-02-10T10:00:00' }),
      req({ created_at: '2025-11-01T10:00:00' }),
    ];
    const tree = buildDateTree(rows);
    expect(tree.map((y) => y.label)).toEqual(['2026', '2025']);
    expect(tree[0].count).toBe(3);
    expect(tree[0].children.map((q) => q.label)).toEqual(['Q2 · Apr–Jun', 'Q1 · Jan–Mar']);
    const may = tree[0].children[0].children[0];
    expect(may.label).toBe('May');
    expect(may.count).toBe(2);
    expect(may.children).toHaveLength(1);
    expect(may.children[0].count).toBe(2);
  });

  it('leaves undated rows out of the tree instead of inventing a branch', () => {
    const tree = buildDateTree([req({ created_at: 'not a date' })]);
    expect(tree).toEqual([]);
  });
});
