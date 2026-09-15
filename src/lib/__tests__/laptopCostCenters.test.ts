import { describe, expect, it } from 'vitest';

import {
  findCostCenter,
  getCompaniesForRequestorCountry,
  getCompanyByCode,
  normaliseCostCenterText,
  type CostCenterFormData,
} from '@/lib/laptopCostCenters';

/* The character at the heart of all of this: Excel writes the source export with U+00A0
   between words, so 1,554 of the 2,335 department names were unmatchable by anything that
   typed a plain space. Named here so the tests below read as prose. */
const NBSP = '\u00A0';

/**
 * A miniature of the real mapping. The three shapes that matter are all here: a country the
 * form reaches through two workbook labels ('Abu Dhabi'), a workbook label no form country
 * reaches ('HQ Houston', which is genuinely the case in production), and a form country mapped
 * to nothing ('Other').
 */
const DATA: CostCenterFormData = {
  companies: [
    { code: '2110', name: 'NESR UAE', countries: ['UAE'] },
    { code: '2115', name: 'EOS JAFZA FZE', countries: ['EOS JAFZA'] },
    { code: '2330', name: 'NPS Saudi', countries: ['KSA'] },
    { code: '1101', name: 'NESR BVI', countries: ['HQ Houston'] },
  ],
  countryMap: {
    'Abu Dhabi': ['UAE', 'EOS JAFZA'],
    'Saudi Arabia': ['KSA'],
    Other: [],
  },
};

describe('getCompaniesForRequestorCountry', () => {
  it('returns every company under all of a country’s workbook labels', () => {
    expect(getCompaniesForRequestorCountry(DATA, 'Abu Dhabi').map((c) => c.code)).toEqual([
      '2110',
      '2115',
    ]);
  });

  it('returns the one company for a country with a single label', () => {
    expect(getCompaniesForRequestorCountry(DATA, 'Saudi Arabia').map((c) => c.code)).toEqual([
      '2330',
    ]);
  });

  it('preserves the order the companies arrived in', () => {
    const reversed: CostCenterFormData = { ...DATA, companies: [...DATA.companies].reverse() };
    expect(getCompaniesForRequestorCountry(reversed, 'Abu Dhabi').map((c) => c.code)).toEqual([
      '2115',
      '2110',
    ]);
  });

  it.each([
    ['a country mapped to no labels', 'Other'],
    ['a country absent from the map', 'Antarctica'],
    ['a blank country', ''],
  ])('yields an empty list for %s', (_why, country) => {
    expect(getCompaniesForRequestorCountry(DATA, country)).toEqual([]);
  });

  it.each([null, undefined])('yields an empty list for country %j', (country) => {
    expect(getCompaniesForRequestorCountry(DATA, country)).toEqual([]);
  });

  /* The form renders before its data arrives if the database read fails, so every helper has
     to survive a null. An empty dropdown is the degraded state; a thrown error is not. */
  it.each([null, undefined])('yields an empty list when the data itself is %j', (data) => {
    expect(getCompaniesForRequestorCountry(data, 'Abu Dhabi')).toEqual([]);
  });

  it('never returns a company whose label is unreachable from the map', () => {
    const reachable = new Set(Object.values(DATA.countryMap).flat());
    expect(reachable.has('HQ Houston')).toBe(false);
    for (const country of Object.keys(DATA.countryMap)) {
      const codes = getCompaniesForRequestorCountry(DATA, country).map((c) => c.code);
      expect(codes).not.toContain('1101');
    }
  });
});

describe('getCompanyByCode', () => {
  it('finds a company by its exact code', () => {
    expect(getCompanyByCode(DATA, '2330')?.name).toBe('NPS Saudi');
  });

  /* Codes are four-digit strings from the source spreadsheet, matched exactly. There is no
     trimming or case folding here on purpose: a code that needs either is a data error the
     admin page should show, not something this should paper over. */
  it.each(['9999', ' 2330', '2330 ', ''])('returns null for code %j', (code) => {
    expect(getCompanyByCode(DATA, code)).toBeNull();
  });

  it.each([null, undefined])('returns null for code %j', (code) => {
    expect(getCompanyByCode(DATA, code)).toBeNull();
  });

  it.each([null, undefined])('returns null when the data itself is %j', (data) => {
    expect(getCompanyByCode(data, '2330')).toBeNull();
  });
});

describe('findCostCenter', () => {
  const departments = [
    { department: 'CEMENTING', costCenter: 'C011100101' },
    { department: 'COILED TUBING', costCenter: 'C011110101' },
    { department: 'Hydraulic Fracturing', costCenter: 'C011130101' },
  ];

  it('matches a department exactly', () => {
    expect(findCostCenter(departments, 'CEMENTING')).toBe('C011100101');
  });

  /* The form auto-fills the cost center from a department the user typed or picked, and the
     source spreadsheet is inconsistent about case and trailing spaces. Both sides are folded,
     which is also why the table is unique on LOWER(department). */
  it.each([
    ['cementing', 'C011100101'],
    ['  CEMENTING  ', 'C011100101'],
    ['hydraulic fracturing', 'C011130101'],
    ['HYDRAULIC FRACTURING', 'C011130101'],
  ])('is case- and whitespace-insensitive: %j', (input, expected) => {
    expect(findCostCenter(departments, input)).toBe(expected);
  });

  it('returns null for a department the company does not have', () => {
    expect(findCostCenter(departments, 'WIRELINE')).toBeNull();
  });

  it.each([null, undefined, '', '   '])('returns null for department %j', (department) => {
    expect(findCostCenter(departments, department)).toBeNull();
  });

  /* Not the same state: undefined means the company's rows have not been fetched yet, and an
     empty array means they arrived and there were none. Both must yield null rather than
     throw, because the form calls this on every keystroke while a fetch is in flight. */
  it.each([
    ['not yet loaded', undefined],
    ['loaded but empty', [] as { department: string; costCenter: string }[]],
  ])('returns null when the department list is %s', (_why, list) => {
    expect(findCostCenter(list, 'CEMENTING')).toBeNull();
  });
});

describe('normaliseCostCenterText', () => {
  it('folds the non-breaking space the source spreadsheet uses', () => {
    expect(normaliseCostCenterText(`SUPPLY${NBSP}CHAIN`)).toBe('SUPPLY CHAIN');
    expect(normaliseCostCenterText(`ADMIN${NBSP}GOVT${NBSP}&${NBSP}SECURIT`)).toBe(
      'ADMIN GOVT & SECURIT',
    );
  });

  it.each([
    ['en quad', '\u2000'],
    ['em space', '\u2003'],
    ['narrow no-break space', '\u202F'],
    ['ideographic space', '\u3000'],
    ['ogham space mark', '\u1680'],
  ])('folds the %s', (_name, space) => {
    expect(normaliseCostCenterText(`A${space}B`)).toBe('A B');
  });

  it.each([
    ['zero-width space', '\u200B'],
    ['zero-width non-joiner', '\u200C'],
    ['byte order mark', '\uFEFF'],
  ])('strips the %s outright, rather than turning it into a space', (_name, ch) => {
    expect(normaliseCostCenterText(`AB${ch}CD`)).toBe('ABCD');
  });

  it('collapses runs of spaces and trims the workbook padding', () => {
    expect(normaliseCostCenterText('CEMENTING           ')).toBe('CEMENTING');
    expect(normaliseCostCenterText(`  WL${NBSP}${NBSP}LOG  -  OPEN HOLE  `)).toBe(
      'WL LOG - OPEN HOLE',
    );
  });

  it('leaves an already-clean value untouched', () => {
    expect(normaliseCostCenterText('HYDRAULIC FRACTURING')).toBe('HYDRAULIC FRACTURING');
    expect(normaliseCostCenterText('C011100101')).toBe('C011100101');
  });

  it.each([null, undefined, '', '   ', `${NBSP}${NBSP}`])(
    'returns an empty string for %j',
    (input) => {
      expect(normaliseCostCenterText(input)).toBe('');
    },
  );
});

describe('findCostCenter across the whitespace boundary', () => {
  /* The exact failure this fixes. The department list came from the spreadsheet with a
     non-breaking space; the department name came from the employee directory with a plain
     one. They looked identical and never matched, so the cost center never auto-filled. */
  const fromSpreadsheet = [{ department: `SUPPLY${NBSP}CHAIN`, costCenter: 'C018800001' }];

  it('matches a plain-space query against a non-breaking-space row', () => {
    expect(findCostCenter(fromSpreadsheet, 'SUPPLY CHAIN')).toBe('C018800001');
  });

  it('matches a non-breaking-space query against a plain-space row', () => {
    const cleaned = [{ department: 'SUPPLY CHAIN', costCenter: 'C018800001' }];
    expect(findCostCenter(cleaned, `SUPPLY${NBSP}CHAIN`)).toBe('C018800001');
  });

  it('still matches once both sides are clean', () => {
    const cleaned = [{ department: 'SUPPLY CHAIN', costCenter: 'C018800001' }];
    expect(findCostCenter(cleaned, 'supply chain')).toBe('C018800001');
  });

  it('does not match two genuinely different departments', () => {
    expect(findCostCenter(fromSpreadsheet, 'SUPPLY CHAINS')).toBeNull();
  });
});
