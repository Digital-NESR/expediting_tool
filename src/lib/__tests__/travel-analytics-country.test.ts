import { describe, expect, it } from 'vitest';
import {
  buildCountryIndex,
  countryOptions,
  displayCountry,
  isTestBooking,
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

describe('displayCountry', () => {
  it("writes SAP's 'Jordon' as Jordan", () => {
    // SAP spells it 'Jordon' and the cost-centre export carries that through — 24 rows of it.
    // It is corrected here rather than upstream, because SAP is the authority for the data and
    // the next reseed would revert anything written into the table.
    expect(displayCountry('Jordon')).toBe('Jordan');
    expect(displayCountry('  Jordon  ')).toBe('Jordan');
  });

  it('leaves every other country exactly as it is', () => {
    for (const c of ['KSA', 'HQ Dubai', 'EOS JAFZA', 'Oman', 'Kuwait', 'UAE', 'HQ Houston'])
      expect(displayCountry(c)).toBe(c);
  });

  it('is case- and whitespace-honest rather than clever', () => {
    // Only the exact spelling SAP emits is rewritten. 'JORDON' is not something the export
    // produces, and guessing at variants would start rewriting values nobody has seen.
    expect(displayCountry('JORDON')).toBe('JORDON');
    expect(displayCountry('')).toBe('');
    expect(displayCountry(null)).toBe('');
    expect(displayCountry(undefined)).toBe('');
  });

  it('normalises the grantable country list', () => {
    const options = countryOptions([
      { code: '2925', name: 'NPS Jordan', country: 'Jordon' },
      { code: '2112', name: 'Energy Oilfield Supplies DMCC', country: 'HQ Dubai' },
    ]);
    expect(options).toContain('Jordan');
    expect(options).not.toContain('Jordon');
  });

  it('normalises the country resolved onto a booking, so a grant and a booking agree', () => {
    // If the options list said 'Jordan' while resolution said 'Jordon', every grant written from
    // the picker would match no booking and look like a country with no travel.
    const index = buildCountryIndex(
      [{ costCentre: 'C251100101', companyCode: '2925', department: 'CEMENTING' }],
      [{ code: '2925', name: 'NPS Jordan', country: 'Jordon' }],
    );
    expect(resolveBookingCountry(index, 'C251100101', null).country).toBe('Jordan');
    expect(resolveBookingCountry(index, null, '2925').country).toBe('Jordan');
  });
});

describe('isTestBooking', () => {
  it("recognises the agency's own test bookings", () => {
    // Company 1000 "Satguru Test" on two invented cost centres: 17 bookings, ~$10,100 of
    // fictitious spend that was the whole of the previously "unmapped" population.
    expect(isTestBooking('C999999999', '1000')).toBe(true);
    expect(isTestBooking('C999999997', '1000')).toBe(true);
    expect(isTestBooking('  c999999999  ', ' 1000 ')).toBe(true);
  });

  it('needs BOTH the cost centre and the company to match', () => {
    // Either alone could be a real row. Only the pair identifies an agency test booking.
    expect(isTestBooking('C999999999', '2112')).toBe(false);
    expect(isTestBooking('C121100101', '1000')).toBe(false);
  });

  it('leaves real bookings alone', () => {
    expect(isTestBooking('C128890009', '2112')).toBe(false);
    expect(isTestBooking(null, null)).toBe(false);
    expect(isTestBooking('', '')).toBe(false);
  });
});
