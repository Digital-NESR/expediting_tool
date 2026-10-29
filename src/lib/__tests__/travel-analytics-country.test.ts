import { describe, expect, it } from 'vitest';
import {
  buildCountryIndex,
  countryOptions,
  resolveBookingCountry,
  type CostCentreCompany,
  type CostCentreDepartment,
} from '@/lib/travel-analytics/country-map';

/**
 * Giving a booking a country when the feed does not carry one.
 *
 * This is the hinge the whole access model turns on: `countryFilterSql` decides what a reader
 * may see by comparing against the country this file produced, so a cost centre that fails to
 * resolve does not show up as a wrong number — it shows up as a booking quietly missing from
 * somebody's dashboard. The cases pinned below are the ones that would fail silently.
 */

const departments: CostCentreDepartment[] = [
  { costCentre: 'C118800004', companyCode: '2111', department: 'SUPPLY CHAIN' },
  { costCentre: 'C138800002', companyCode: '2115', department: 'CEMENTING' },
  { costCentre: 'C157700008', companyCode: '2553', department: 'MANAGEMENT' },
  /* A cost centre whose company is not in the companies table at all. */
  { costCentre: 'C999000001', companyCode: '9999', department: 'ORPHANED DEPARTMENT' },
];

const companies: CostCentreCompany[] = [
  { code: '2111', name: 'NESR DMCC', country: 'HQ Dubai' },
  { code: '2115', name: 'NESR Energy Services LLC', country: 'UAE' },
  { code: '2553', name: 'Sahara Petroleum Service', country: 'Kuwait' },
  { code: '2112', name: 'Energy Oilfield Supplies DMCC', country: 'KSA' },
];

const index = buildCountryIndex(departments, companies);
const resolve = (costCentre: string | null, companyCode: string | null) =>
  resolveBookingCountry(index, costCentre, companyCode);

describe('resolving a booking to a country', () => {
  it('places a booking by its cost centre', () => {
    expect(resolve('C118800004', '2111')).toMatchObject({
      country: 'HQ Dubai',
      via: 'cost-centre',
      department: 'SUPPLY CHAIN',
    });
  });

  /* Against the October 2026 feed exactly one real booking needs this route. It is one booking,
     and without the fallback it would be an unmapped row visible only to admins. */
  it('falls back to the company code when the cost centre is unknown', () => {
    expect(resolve('C000000000', '2112')).toMatchObject({ country: 'KSA', via: 'company-code' });
  });

  /*
   * THE ORDER MATTERS, and today's data cannot show it. Both routes agree on all 219 real
   * bookings, so a version of this that checked the company code first would pass every
   * sanity check and be wrong the first time a company trades in two countries — which is
   * precisely what a cost centre, the finer key, exists to distinguish.
   */
  it('prefers the cost centre when the two routes disagree', () => {
    const conflicting = buildCountryIndex(
      [{ costCentre: 'C500000001', companyCode: '2553', department: 'LOGISTICS' }],
      companies,
    );
    expect(resolveBookingCountry(conflicting, 'C500000001', '2112').country).toBe('Kuwait');
  });

  /* The eleven `Satguru Test` rows: company 1000, cost centre C999999999, in neither table.
     Unmapped is a state that gets reported, never a booking that gets dropped. */
  it('leaves a booking unmapped rather than guessing', () => {
    expect(resolve('C999999999', '1000')).toEqual({
      country: null,
      via: null,
      department: null,
      companyName: null,
    });
  });

  it('survives a booking with no cost centre and no company code', () => {
    expect(resolve(null, null).country).toBeNull();
    expect(resolve('', '').country).toBeNull();
  });

  /*
   * The travel feed pads its columns and the laptop workbook import left non-breaking spaces
   * behind — the same two defects that made `normaliseCostCenterText` necessary in the laptop
   * tool. A cost centre differing only by whitespace or case must not fall out of its country,
   * because the symptom is a booking vanishing from a country reader's dashboard with nothing
   * anywhere saying why.
   */
  it('matches a cost centre despite padding, case and non-breaking spaces', () => {
    expect(resolve('  c118800004 ', null).country).toBe('HQ Dubai');
    expect(resolve(' C118800004 ', null).country).toBe('HQ Dubai');
    expect(resolve('C118800004', null).via).toBe('cost-centre');
  });

  /* A department whose company has no country is still a department. Losing the name here would
     turn a chargeback row into a bare nine-digit code nobody can act on. */
  it('keeps the department when the cost centre resolves but its company has no country', () => {
    expect(resolve('C999000001', '9999')).toMatchObject({
      country: null,
      via: null,
      department: 'ORPHANED DEPARTMENT',
    });
  });

  /* A company-code match knows which country paid, not which department did. Inventing one
     would put money against a cost centre nobody charged. */
  it('does not invent a department for a company-code match', () => {
    expect(resolve('C000000000', '2112').department).toBeNull();
  });

  /* A duplicated cost centre is a mapping error. Taking the first row keeps the answer stable
     instead of flipping with whatever order Postgres returned the rows in that minute. */
  it('is stable when a cost centre appears twice', () => {
    const duplicated = buildCountryIndex(
      [
        { costCentre: 'C777000001', companyCode: '2111', department: 'FIRST' },
        { costCentre: 'C777000001', companyCode: '2112', department: 'SECOND' },
      ],
      companies,
    );
    expect(resolveBookingCountry(duplicated, 'C777000001', null).country).toBe('HQ Dubai');
    expect(resolveBookingCountry(duplicated, 'C777000001', null).department).toBe('FIRST');
  });
});

describe('the grant editor’s country list', () => {
  /* Taken from the companies table, not from the bookings. A country with no travel yet still
     has to be grantable, or the first person in a new country cannot be given access until
     somebody there has already flown. */
  it('offers every mapped country, sorted and de-duplicated', () => {
    expect(countryOptions(companies)).toEqual(['HQ Dubai', 'KSA', 'Kuwait', 'UAE']);
  });

  it('drops blank country labels rather than offering an unnamed option', () => {
    expect(countryOptions([{ code: '1', name: 'x', country: '  ' }, ...companies])).toEqual([
      'HQ Dubai',
      'KSA',
      'Kuwait',
      'UAE',
    ]);
  });
});
