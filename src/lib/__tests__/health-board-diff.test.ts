import { describe, expect, it } from 'vitest';
import { diffUpload, type StoredCell } from '@/lib/health-board/diff';
import type { ParsedRow } from '@/lib/health-board/parse';

const parsed = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  line: 2,
  kpi: 'KPI - OTD',
  year: 2026,
  period: 'July',
  country: 'Global',
  countryRaw: 'Global',
  value: 53.78,
  valueText: '53.78',
  targetWords: null,
  category: 'Purchasing',
  unit: '%',
  sourceRef: null,
  ...over,
});

const stored = (over: Partial<StoredCell> = {}): StoredCell => ({
  kpi: 'KPI - OTD',
  year: 2026,
  period: 'July',
  country: 'Global',
  valueText: '53.78',
  targetWords: null,
  category: 'Purchasing',
  ...over,
});

describe('what an upload would do', () => {
  it('a new cell is added', () => {
    const d = diffUpload([parsed({ period: 'August' })], [stored()]);
    expect(d.added).toHaveLength(1);
    expect(d.changed).toHaveLength(0);
  });

  it('the same number written differently is unchanged (53.780 is 53.78)', () => {
    const d = diffUpload([parsed({ valueText: '53.780' })], [stored()]);
    expect(d.unchanged).toHaveLength(1);
  });

  it('a different number, target text or category is a change, with the old cell kept', () => {
    expect(
      diffUpload([parsed({ valueText: '53.79' })], [stored()]).changed[0].before.valueText,
    ).toBe('53.78');
    expect(diffUpload([parsed({ targetWords: '>= 60' })], [stored()]).changed).toHaveLength(1);
    expect(diffUpload([parsed({ category: 'Logistics' })], [stored()]).changed).toHaveLength(1);
  });

  it('a value cleared to blank is a change, not a no-op', () => {
    expect(diffUpload([parsed({ valueText: null, value: null })], [stored()]).changed).toHaveLength(
      1,
    );
  });

  it('notes a category that disagrees with the one already stored for that KPI and year', () => {
    const d = diffUpload([parsed({ period: 'August', category: 'Logistics' })], [stored()]);
    expect(d.categoryNotes).toHaveLength(1);
  });
});
