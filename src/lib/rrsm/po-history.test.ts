import { describe, expect, it } from 'vitest';
import { matchServicePos, rollupByYear, serviceWords, type PoLineIn } from './po-history';

const line = (p: Partial<PoLineIn>): PoLineIn => ({
  poNumber: '1',
  item: '10',
  description: '',
  value: 0,
  currency: 'USD',
  created: '2025-01-01',
  releaseState: 'Released',
  ...p,
});

describe('serviceWords', () => {
  it('drops generic words and numbers', () => {
    expect(serviceWords('Zoho Analytics Renewal 2025-26 licence')).toEqual(['zoho', 'analytics']);
  });
});

describe('matchServicePos', () => {
  it('keeps the matching POs and leaves the supplier’s others out', () => {
    const pos = matchServicePos(
      'Zoho Analytics',
      'Zoho Corporation Pte Ltd',
      [
        line({
          poNumber: 'A',
          description: 'Zoho Analytics Sub 16.11.26-15.11.27',
          value: 100,
          created: '2026-10-13',
        }),
        line({ poNumber: 'B', description: 'Zoho Creator Ult 2990Usr', value: 500 }),
      ],
      [],
    );
    expect(pos.map((p) => p.poNumber)).toEqual(['A']);
    expect(pos[0]).toMatchObject({ year: 2026, value: 100, matchedOn: ['analytics'] });
  });

  it('counts only the best-matching lines of a shared PO', () => {
    const [p] = matchServicePos(
      'Covered Parking renewal',
      'Landlord LLC',
      [
        line({
          poNumber: 'P',
          item: '10',
          description: 'Covered Parking Slot 2025-26',
          value: 149,
        }),
        line({
          poNumber: 'P',
          item: '20',
          description: 'UnCovered Parking Slot 2025-26',
          value: 81,
        }),
      ],
      [],
    );
    expect(p.value).toBe(149);
    expect(p.otherLines).toBe(1);
  });

  it('always includes a recorded PO, in full when no line matches', () => {
    const [p] = matchServicePos(
      'Office 365',
      'Reseller',
      [
        line({ poNumber: 'R', description: 'BL-SQ-00646', value: 10 }),
        line({ poNumber: 'R', item: '20', value: 5 }),
      ],
      ['R'],
    );
    expect(p).toMatchObject({ recorded: true, value: 15, otherLines: 0 });
  });
});

describe('rollupByYear', () => {
  it('totals per currency and compares with the year before, newest first', () => {
    const pos = matchServicePos(
      'SpeedExam',
      'SpeedExam Online',
      [
        line({ poNumber: 'A', description: 'SpeedExam', value: 200, created: '2024-08-12' }),
        line({ poNumber: 'B', description: 'SpeedExam', value: 240, created: '2025-10-08' }),
        line({ poNumber: 'C', description: 'SpeedExam', value: 60, created: '2025-11-01' }),
      ],
      [],
    );
    const years = rollupByYear(pos);
    expect(years.map((y) => y.year)).toEqual([2025, 2024]);
    expect(years[0]).toMatchObject({ totals: { USD: 300 }, pos: 2, change: { USD: 0.5 } });
    expect(years[1].change.USD).toBeNull();
  });
});
