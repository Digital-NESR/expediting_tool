import { describe, expect, it } from 'vitest';
import { parseKpiGrid, parseNumber } from '@/lib/health-board/parse';
import { normaliseCountry, normalisePeriod } from '@/lib/health-board/definitions';

const HEADER = [
  'Country',
  'Value',
  'Month',
  'Year',
  'KPI',
  'Category',
  'Unit',
  'Target words',
  'ID',
];
const row = (over: Partial<Record<(typeof HEADER)[number], string>> = {}) => {
  const base: Record<string, string> = {
    Country: 'KSA',
    Value: '1,239.5',
    Month: 'January',
    Year: '2026',
    KPI: 'KPI - OTD',
    Category: 'Purchasing ',
    Unit: '%',
    'Target words': '',
    ID: '7',
    ...over,
  };
  return HEADER.map((h) => base[h]);
};

describe('numbers', () => {
  it('reads the list’s number formats exactly', () => {
    expect(parseNumber('1,239')).toBe(1239);
    expect(parseNumber('-1,737,068.36')).toBe(-1737068.36);
    expect(parseNumber('4.557872497')).toBe(4.557872497);
    expect(parseNumber('')).toBeNull();
  });

  it('refuses anything that is not plainly a number', () => {
    for (const s of ['12%', '1.2.3', 'n/a', '1,23', '$5']) expect(parseNumber(s)).toBe('invalid');
  });
});

describe('countries and periods', () => {
  it('maps the spellings Power BI mapped', () => {
    expect(normaliseCountry('KSA LOCL')).toBe('Saudi Arabia');
    expect(normaliseCountry('SSA')).toBe('Chad');
    expect(normaliseCountry('Algeria​')).toBe('Algeria');
    expect(normaliseCountry(' uae ')).toBe('UAE');
    expect(normaliseCountry('UAE - EOS')).toBe('EOS');
  });

  it('keeps EOS DMCC and EOS JAFZA as their own entities', () => {
    expect(normaliseCountry('EOS DMCC')).toBe('EOS DMCC');
    expect(normaliseCountry('EOS JAFZA')).toBe('EOS JAFZA');
  });

  it('does not guess an unknown country', () => {
    expect(normaliseCountry('Saudi')).toBeNull();
  });

  it('forgives surrounding space in a month and nothing else', () => {
    expect(normalisePeriod('February ')).toBe('February');
    expect(normalisePeriod('Feb')).toBeNull();
  });
});

describe('parsing an upload', () => {
  it('reads a row and finds the header below a preamble line', () => {
    const r = parseKpiGrid([['ListSchema={...}'], HEADER, row()]);
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      line: 3,
      kpi: 'KPI - OTD',
      country: 'Saudi Arabia',
      countryRaw: 'KSA',
      period: 'January',
      year: 2026,
      value: 1239.5,
      valueText: '1239.5',
      category: 'Purchasing',
      sourceRef: '7',
    });
  });

  it('rejects what it cannot read exactly, with the reason', () => {
    const r = parseKpiGrid([
      HEADER,
      row({ KPI: 'KPI - Nope' }),
      row({ Country: 'Atlantis' }),
      row({ Month: 'Jan' }),
      row({ Year: '26' }),
      row({ Value: 'abc' }),
      row({ Category: ' ' }),
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.problems.map((p) => p.severity)).toEqual(Array(6).fill('reject'));
  });

  it('rejects a quarterly KPI outside a quarter-end month', () => {
    const r = parseKpiGrid([HEADER, row({ KPI: 'KPI - InvRecon Acc', Month: 'April' })]);
    expect(r.rows).toHaveLength(0);
    expect(r.problems[0].message).toMatch(/quarterly/);
  });

  it('takes a YTD row only for the P&L KPIs', () => {
    const r = parseKpiGrid([
      HEADER,
      row({ KPI: 'KPI - P&L (M&S)', Month: 'YTD' }),
      row({ KPI: 'KPI - OTD', Month: 'YTD' }),
    ]);
    expect(r.rows.map((x) => x.kpi)).toEqual(['KPI - P&L (M&S)']);
  });

  it('rejects both copies when a file has the same cell twice', () => {
    const r = parseKpiGrid([
      HEADER,
      row({ Value: '1' }),
      row({ Country: 'Saudi Arabia', Value: '2' }),
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.problems).toHaveLength(2);
  });

  it('warns, without rejecting, about a unit that disagrees with the KPI', () => {
    const r = parseKpiGrid([
      HEADER,
      row({ KPI: 'KPI - InvRecon Aging', Month: 'March', Unit: '%' }),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.problems[0].severity).toBe('warn');
  });
});
