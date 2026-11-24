import { describe, expect, it } from 'vitest';
import {
  normaliseName,
  planMigration,
  recurrentCategory,
  rentalCategory,
  stripSegment,
  type RecurrentIn,
  type RentalLineIn,
} from './migrate-plan';

const line = (p: Partial<RentalLineIn>): RentalLineIn => ({
  id: 1,
  countryCode: 'AE',
  supplierCode: '1106491',
  supplierName: 'ISHRAQAAT',
  description: 'Forklift',
  category: 'Equipment Rental',
  uom: 'month',
  rate: 45000,
  serviceNumber: null,
  startsOn: null,
  registryCode: null,
  ...p,
});

const rec = (p: Partial<RecurrentIn>): RecurrentIn => ({
  id: 9,
  countryCode: 'HQ',
  supplierCode: '1103384',
  supplierName: 'Zoho Corporation Pte Ltd',
  serviceName: 'Zoho Analytics',
  description: 'Reporting Solution',
  department: 'IT',
  annualValue: 11379.36,
  currency: 'USD',
  contractExpiry: '2027-11-15',
  registryCode: null,
  ...p,
});

describe('names', () => {
  it('drops trailing segment tags, keeps the rest', () => {
    expect(stripSegment('Asab camp-CT')).toBe('Asab camp');
    expect(stripSegment('HABSHAN Catering-Pipeline')).toBe('HABSHAN Catering');
    expect(stripSegment('Compressor and Generators-WT')).toBe('Compressor and Generators');
    expect(stripSegment('Forklift')).toBe('Forklift');
    expect(normaliseName(' Asab  Camp ')).toBe('asab camp');
  });
});

describe('categories', () => {
  it('maps RRSM rental categories onto the taxonomy, with item overrides', () => {
    expect(rentalCategory('Equipment Rental', 'Forklift')).toEqual({
      category: 'Lifting Equipment',
      subcategory: 'Forklift',
    });
    expect(rentalCategory('Equipment Rental', 'Carbouy Tank rental')).toEqual({
      category: 'Operation Rental',
      subcategory: 'Technical Rental equipment',
    });
    expect(rentalCategory('Transportation', 'BASE Monthly trasnport')).toEqual({
      category: 'Logistics',
      subcategory: 'Crew Transportation',
    });
    expect(rentalCategory('Office and Camp', 'Security Services').subcategory).toBe('Security');
  });
  it('maps recurrent services by what they are', () => {
    expect(
      recurrentCategory({
        serviceName: 'Medical Insurance',
        description: '',
        department: 'Finance',
      }),
    ).toEqual({
      category: 'HR',
      subcategory: 'Medical Insurance',
    });
    expect(
      recurrentCategory({ serviceName: 'Bayt.com', description: '', department: 'HR' }).subcategory,
    ).toBe('Recruitment');
    expect(
      recurrentCategory({
        serviceName: 'Zoho Analytics',
        description: 'Reporting Solution',
        department: 'IT',
      }),
    ).toEqual({
      category: 'IT',
      subcategory: 'Licenses',
    });
  });
});

describe('planMigration', () => {
  it('groups identical units into one item and splits by rate', () => {
    const plan = planMigration({
      rental: [
        line({ id: 1 }),
        line({ id: 2 }),
        line({ id: 3, description: 'Forklift-CT' }),
        line({ id: 4, rate: 40000 }),
      ],
      recurrent: [],
      existing: [],
      today: '2026-11-23',
    });
    expect(plan.items.map((i) => i.rentalLineIds)).toEqual([[1, 2, 3], [4]]);
    expect(plan.items[0]).toMatchObject({
      itemName: 'Forklift',
      uomName: 'Month',
      unitPrice: 45000,
      existingCode: null,
    });
  });

  it('merges into an existing entry by vendor code and name, ignoring leading zeros and case', () => {
    const plan = planMigration({
      rental: [line({})],
      recurrent: [rec({})],
      existing: [
        { code: 'CAT-1200', countryCode: 'AE', supplierCode: '0001106491', itemName: 'FORKLIFT' },
        {
          code: 'CAT-1300',
          countryCode: 'HQ',
          supplierCode: '1103384',
          itemName: 'Zoho Analytics',
        },
      ],
      today: '2026-11-23',
    });
    expect(plan.items.map((i) => i.existingCode)).toEqual(['CAT-1200', 'CAT-1300']);
  });

  it('prices a recurrent service per year; no value means 0 and "rate to confirm"', () => {
    const plan = planMigration({
      rental: [],
      recurrent: [rec({}), rec({ id: 10, annualValue: null, serviceName: 'LMS' })],
      existing: [],
      today: '2026-11-23',
    });
    expect(plan.items[0]).toMatchObject({
      uomName: 'Year',
      unitPrice: 11379.36,
      rateToConfirm: false,
      effectiveDate: '2026-11-16',
      expiryDate: '2027-11-15',
    });
    expect(plan.items[1]).toMatchObject({ unitPrice: 0, rateToConfirm: true });
  });

  it('skips rows already moved and rows with no vendor code', () => {
    const plan = planMigration({
      rental: [line({ registryCode: 'CAT-1' }), line({ id: 2, supplierCode: '' })],
      recurrent: [rec({ supplierCode: null })],
      existing: [],
      today: '2026-11-23',
    });
    expect(plan.items).toHaveLength(0);
    expect(plan.skipped.map((s) => s.id)).toEqual([2, 9]);
  });
});

describe('category targets', () => {
  it('every mapped category and sub-category exists in the NESR spend taxonomy', async () => {
    const { default: taxonomy } = await import('@/data/catalog-taxonomy.json');
    const { RENTAL_CATEGORY_MAP } = await import('./migrate-plan');
    const has = (c: string, s: string | null) =>
      (taxonomy as { name: string; subs: { name: string }[] }[]).some(
        (t) => t.name === c && (s === null || t.subs.some((x) => x.name === s)),
      );
    const targets = Object.values(RENTAL_CATEGORY_MAP).flat();
    for (const t of targets)
      expect(has(t.category, t.subcategory), `${t.category} / ${t.subcategory}`).toBe(true);
    for (const name of [
      'Medical Insurance',
      'Bayt.com',
      'Covered Parking',
      'Housekeeping Service',
      'Storage Fees',
      'GardaWorld Risk Advisory',
      'Azure VM',
      'SAP FICO consultant',
      'Marine Insurance',
      'Group Life Insurance',
      'Something else',
    ])
      for (const dept of [
        'IT',
        'Finance',
        'HR',
        'Administration',
        'Maintenance',
        'QHSE',
        'Operations',
        'Business Development',
        null,
      ]) {
        const p = recurrentCategory({ serviceName: name, description: '', department: dept });
        expect(
          has(p.category, p.subcategory),
          `${name}/${dept}: ${p.category} / ${p.subcategory}`,
        ).toBe(true);
      }
  });
});

describe('units of measure', () => {
  it('round-trips between RRSM codes and registry names', async () => {
    const { uomName, rrsmUom } = await import('./migrate-plan');
    for (const code of ['month', 'day', 'hour', 'headcount', 'unit'])
      expect(rrsmUom(uomName(code))).toBe(code);
    expect(rrsmUom('Year')).toBe('unit');
  });
});
