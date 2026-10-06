import { describe, expect, it } from 'vitest';
import { scopeTotals } from '@/app/soa-consolidation/lib';
import type { ScopeCandidate } from '@/lib/soa/candidates';

/**
 * Excluded suppliers are NESR's own intercompany entities. There is no third party to send a
 * statement to and no balance anyone outside the group could confirm, so they are out of the
 * coverage measure on both sides of the division.
 *
 * Getting this wrong is not cosmetic: it puts a ceiling on coverage that no amount of chasing can
 * reach, and coverage is what gates the handoff.
 */
const candidate = (over: Partial<ScopeCandidate> = {}): ScopeCandidate => ({
  vendorNo: '0001',
  name: 'A Supplier',
  valueUsd: 100,
  emails: ['ap@supplier.com'],
  selected: false,
  locked: false,
  excluded: false,
  overThreshold: true,
  rank: 1,
  cumulativePct: 10,
  sharePct: 10,
  ...over,
});

describe('scopeTotals with exclusions', () => {
  it('leaves an excluded supplier out of the reachable ceiling', () => {
    const rows = [
      candidate({ vendorNo: 'a', valueUsd: 700 }),
      candidate({ vendorNo: 'b', valueUsd: 300, excluded: true }),
    ];
    // Ticking everything tickable reaches 700, not 1000: the 300 was never ours to collect.
    expect(scopeTotals(rows, new Set()).reachableUsd).toBe(700);
  });

  it('never counts an excluded supplier as selected balance', () => {
    // A legacy cycle can hold an excluded supplier that was scoped before the exclusion existed.
    // Counting it would put balance in the numerator that the divisor does not carry, and the
    // screen would report more than 100% of a country's balance selected.
    const rows = [
      candidate({ vendorNo: 'a', valueUsd: 700 }),
      candidate({ vendorNo: 'b', valueUsd: 300, excluded: true, selected: true }),
    ];
    const totals = scopeTotals(rows, new Set(['a', 'b']));
    expect(totals.selectedUsd).toBe(700);
    expect(totals.selectedUsd).toBeLessThanOrEqual(totals.reachableUsd);
  });

  it('still counts it as a row, so the list can show it', () => {
    const rows = [candidate({ vendorNo: 'b', excluded: true })];
    const totals = scopeTotals(rows, new Set());
    expect(totals.excludedCount).toBe(1);
  });

  it('lets a champion who ticked everything selectable reach the whole balance', () => {
    const rows = [
      candidate({ vendorNo: 'a', valueUsd: 600 }),
      candidate({ vendorNo: 'b', valueUsd: 400 }),
      candidate({ vendorNo: 'c', valueUsd: 250, excluded: true }),
    ];
    const totals = scopeTotals(rows, new Set(['a', 'b']));
    // 1000 of 1000. Before this the same selection read 80% and could not be improved.
    expect(totals.selectedUsd).toBe(1000);
    expect(totals.reachableUsd).toBe(1000);
  });
});
