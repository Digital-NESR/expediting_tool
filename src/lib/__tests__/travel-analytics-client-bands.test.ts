import { describe, expect, it } from 'vitest';
import { buildClientBands, type TravelDataset } from '@/lib/travel-analytics/client-bands';
import type { ScopedBooking } from '@/lib/travel-analytics/queries';

/**
 * The browser now folds the board that the server used to rebuild on every filter tick.
 *
 * Most of that is safe by construction: `applyFilters`, `buildFinance`, `buildChannelBand`,
 * `buildMapData` and `buildTravelTypeBand` are the same functions the server called, so they
 * cannot disagree with themselves. What is NOT safe by construction is the auxiliary data —
 * the server narrowed it with `code = ANY(filtered)` in SQL, and the browser narrows it by
 * subsetting maps it was sent unfiltered. These tests pin that the two mean the same thing.
 *
 * The savings headline matters most: it was its own SQL SUM and is now a fold, so a bug there
 * shows up as a wrong number on a KPI card rather than as a missing row anybody would notice.
 */

function booking(over: Partial<ScopedBooking> = {}): ScopedBooking {
  return {
    code: 'BTO1',
    country: 'HQ Dubai',
    costCentre: 'C1',
    department: 'HUB',
    companyCode: '2112',
    companyName: 'EOS DMCC',
    segment: 'Drilling',
    employeeId: 'E1',
    employeeName: 'A Traveller',
    channel: 'BTO',
    channelLabel: 'Travel Portal',
    status: 'Approved',
    travelType: 'Business Travel',
    direction: 'Outbound',
    cabinClass: 'Economy',
    origin: 'DXB',
    destination: 'DMM',
    month: '2026-05',
    createdAt: '2026-05-10T00:00:00.000Z',
    departureDate: '2026-05-20',
    leadDays: 10,
    amountUsd: 1000,
    justification: null,
    ...over,
  } as ScopedBooking;
}

const dataset = (over: Partial<TravelDataset> = {}): TravelDataset => ({
  bookings: [
    booking({ code: 'A', country: 'HQ Dubai', amountUsd: 1000 }),
    booking({ code: 'B', country: 'Oman', amountUsd: 2000 }),
    booking({
      code: 'C',
      country: 'Oman',
      amountUsd: 4000,
      channel: 'OFF',
      channelLabel: 'Offline',
    }),
  ],
  segments: [
    ['A', [{ origin: 'DXB', destination: 'DMM' }] as never],
    ['B', [{ origin: 'MCT', destination: 'DXB' }] as never],
    ['C', [{ origin: 'DXB', destination: 'KWI' }] as never],
  ],
  flaggedCodes: ['A', 'B'],
  savingsByCode: [
    ['A', 100],
    ['B', 250],
  ],
  ...over,
});

describe('buildClientBands', () => {
  it('returns the whole scoped set when nothing is filtered', () => {
    const bands = buildClientBands(dataset(), {});
    expect(bands.bookingsInScope).toBe(3);
    expect(bands.headline.spend.totalUsd).toBe(7000);
  });

  it('narrows every figure together when a filter is applied', () => {
    const bands = buildClientBands(dataset(), { countries: ['Oman'] });
    expect(bands.bookingsInScope).toBe(2);
    expect(bands.headline.spend.totalUsd).toBe(6000);
    expect(bands.filteredCodes.sort()).toEqual(['B', 'C']);
  });

  it('sums the savings headline over the filtered codes only', () => {
    // This replaced a SQL SUM keyed on the filtered codes. A is 100 and B is 250; filtering to
    // Oman must leave B alone, not the pair.
    const all = buildClientBands(dataset(), {});
    expect(all.headline.missedSavingsUsd).toBe(350);
    expect(all.headline.savingsCoveredBookings).toBe(2);

    const oman = buildClientBands(dataset(), { countries: ['Oman'] });
    expect(oman.headline.missedSavingsUsd).toBe(250);
    expect(oman.headline.savingsCoveredBookings).toBe(1);
  });

  it('counts a booking as covered only when the analysis actually covers it', () => {
    // C has no savings row at all. Its absence is "not analysed", not "analysed and found zero",
    // and counting it would understate the average saving per covered booking.
    const justC = buildClientBands(dataset(), { channels: ['Offline'] });
    expect(justC.bookingsInScope).toBe(1);
    expect(justC.headline.missedSavingsUsd).toBe(0);
    expect(justC.headline.savingsCoveredBookings).toBe(0);
  });

  it('passes only the filtered policy flags to the channel band', () => {
    // A and B are both flagged. Filtering to the offline channel leaves C, which is not.
    const offline = buildClientBands(dataset(), { channels: ['Offline'] });
    const row = offline.channels.rows.find((r) => r.channel === 'OFF');
    expect(row?.bookings).toBe(1);
    expect(row?.flaggedBookings).toBe(0);

    const portal = buildClientBands(dataset(), { channels: ['Travel Portal'] });
    const btoRow = portal.channels.rows.find((r) => r.channel === 'BTO');
    expect(btoRow?.flaggedBookings).toBe(2);
  });

  it('counts travellers and pending approvals over the filtered set', () => {
    const d = dataset({
      bookings: [
        booking({ code: 'A', employeeId: 'E1', status: 'Pending Approval' }),
        booking({ code: 'B', employeeId: 'E1', status: 'Approved' }),
        booking({ code: 'C', employeeId: 'E2', status: 'Pending Approval', country: 'Oman' }),
      ],
    });
    const all = buildClientBands(d, {});
    expect(all.headline.travellers).toBe(2);
    expect(all.headline.pendingApprovals).toBe(2);

    const oman = buildClientBands(d, { countries: ['Oman'] });
    expect(oman.headline.travellers).toBe(1);
    expect(oman.headline.pendingApprovals).toBe(1);
  });

  it('is a pure fold: the same dataset and filters give the same board', () => {
    const d = dataset();
    expect(JSON.stringify(buildClientBands(d, { countries: ['Oman'] }))).toBe(
      JSON.stringify(buildClientBands(d, { countries: ['Oman'] })),
    );
  });

  it('survives an empty result without inventing an empty shape', () => {
    // Folds over nothing, so these are the real empty bands the builders produce rather than
    // hand-written ones that could drift from them.
    const none = buildClientBands(dataset(), { countries: ['Nowhere'] });
    expect(none.bookingsInScope).toBe(0);
    expect(none.headline.spend.totalUsd).toBe(0);
    expect(none.headline.missedSavingsUsd).toBe(0);
    expect(none.channels.rows).toEqual([]);
  });
});
