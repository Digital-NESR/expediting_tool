import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  applyFilters,
  FILTER_KEYS,
  filterOptionsFrom,
  filterValue,
  hasAnyFilter,
  matchesFilters,
  sanitiseFilters,
  type FilterableBooking,
} from '@/lib/travel-analytics/filters';

/**
 * The board's filters.
 *
 * Two things here are worth a test rather than a read-through. The first is the empty list,
 * which has to mean "no restriction" and not "match nothing" — getting that backwards empties
 * the whole board the moment somebody opens a dropdown and closes it again. The second is
 * sanitiseFilters, which is the trust boundary: these values arrive from a browser through a
 * public endpoint, and the only reason a filter cannot be used to read outside a reader's
 * scope is that it is intersected with options built from that scope.
 */

const booking = (o: Partial<FilterableBooking> = {}): FilterableBooking => ({
  country: 'HQ Dubai',
  costCentre: 'CC100',
  segment: 'Drilling',
  companyName: 'NESR',
  travelType: 'Business Travel',
  cabinClass: 'Economy',
  status: 'Confirmed',
  channelLabel: 'Booked in the portal',
  ...o,
});

describe('filterValue', () => {
  it('trims the padding the feed ships', () => {
    expect(filterValue(booking({ segment: '  Drilling ' }), 'segments')).toBe('Drilling');
  });

  it('names the blanks so they can be asked for', () => {
    expect(filterValue(booking({ segment: null }), 'segments')).toBe('Unassigned');
    expect(filterValue(booking({ segment: '   ' }), 'segments')).toBe('Unassigned');
  });
});

describe('matchesFilters', () => {
  it('lets everything through when nothing is set', () => {
    expect(matchesFilters(booking(), {})).toBe(true);
  });

  it('treats an empty list as no restriction, not as match-nothing', () => {
    for (const key of FILTER_KEYS) {
      expect(matchesFilters(booking(), { [key]: [] }), `${key} = [] should not exclude`).toBe(true);
    }
  });

  it('accepts any of the values in one dimension', () => {
    const f = { countries: ['Egypt', 'HQ Dubai'] };
    expect(matchesFilters(booking(), f)).toBe(true);
    expect(matchesFilters(booking({ country: 'Egypt' }), f)).toBe(true);
    expect(matchesFilters(booking({ country: 'Iraq' }), f)).toBe(false);
  });

  it('requires every dimension that is set', () => {
    const f = { countries: ['HQ Dubai'], segments: ['Production'] };
    expect(matchesFilters(booking(), f)).toBe(false);
    expect(matchesFilters(booking({ segment: 'Production' }), f)).toBe(true);
  });

  it('covers every declared key, so a new filter cannot be added without being applied', () => {
    for (const key of FILTER_KEYS) {
      expect(
        matchesFilters(booking(), { [key]: ['a value no booking has'] }),
        `${key} is declared but never tested`,
      ).toBe(false);
    }
  });
});

describe('applyFilters', () => {
  it('returns a copy, not the original array', () => {
    const rows = [booking()];
    expect(applyFilters(rows, {})).not.toBe(rows);
    expect(applyFilters(rows, {})).toEqual(rows);
  });

  it('narrows to the chosen channel', () => {
    const rows = [booking(), booking({ channelLabel: 'Booked offline' })];
    expect(applyFilters(rows, { channels: ['Booked offline'] })).toHaveLength(1);
  });
});

describe('filterOptionsFrom', () => {
  it('lists each value once, sorted', () => {
    const options = filterOptionsFrom([
      booking({ country: 'Iraq' }),
      booking({ country: 'Egypt' }),
      booking({ country: 'Egypt' }),
    ]);
    expect(options.countries).toEqual(['Egypt', 'Iraq']);
  });

  it('offers the blanks as a choice', () => {
    expect(filterOptionsFrom([booking({ costCentre: null })]).costCentres).toEqual(['Unassigned']);
  });

  it('has an entry for every filter key', () => {
    const options = filterOptionsFrom([booking()]);
    for (const key of FILTER_KEYS) {
      expect(options[key], `${key} missing from the options`).toBeDefined();
    }
  });
});

describe('sanitiseFilters', () => {
  const options = filterOptionsFrom([booking(), booking({ country: 'Egypt' })]);

  it('drops a value that is not a real option', () => {
    expect(sanitiseFilters({ countries: ['Egypt', 'Narnia'] }, options)).toEqual({
      countries: ['Egypt'],
    });
  });

  it('drops a dimension entirely once nothing in it survives', () => {
    /* Not `{ countries: [] }`: an empty list means "no restriction", so leaving one behind
       would be indistinguishable from the reader not having filtered, which is right, but it
       would also make activeFilterCount and the Clear button disagree with the dropdown. */
    expect(sanitiseFilters({ countries: ['Narnia'] }, options)).toEqual({});
  });

  it('refuses a country the reader cannot see, because it is not among their options', () => {
    /* The options come from the SCOPED bookings, so a filter can only ever narrow what the
       scope already allowed. This is the whole of the trust boundary. */
    expect(sanitiseFilters({ countries: ['Saudi Arabia (KSA)'] }, options)).toEqual({});
  });

  it('survives junk from a browser without throwing', () => {
    const junk = { countries: 'Egypt', segments: null, nonsense: ['x'] } as never;
    expect(sanitiseFilters(junk, options)).toEqual({});
    expect(sanitiseFilters(null, options)).toEqual({});
    expect(sanitiseFilters(undefined, options)).toEqual({});
  });

  it('de-duplicates a repeated value', () => {
    expect(sanitiseFilters({ countries: ['Egypt', 'Egypt'] }, options)).toEqual({
      countries: ['Egypt'],
    });
  });
});

describe('the filter counters', () => {
  it('counts chosen values across dimensions, not dimensions', () => {
    const f = { countries: ['Egypt', 'Iraq'], segments: ['Drilling'] };
    expect(activeFilterCount(f)).toBe(3);
    expect(hasAnyFilter(f)).toBe(true);
  });

  it('reads an all-empty filter as untouched', () => {
    expect(hasAnyFilter({ countries: [], segments: [] })).toBe(false);
    expect(activeFilterCount({})).toBe(0);
  });
});
