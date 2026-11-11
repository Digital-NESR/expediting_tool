/**
 * The bands the browser rebuilds for itself when a filter changes.
 *
 * WHY. Every tick of a filter checkbox rebuilt the whole board on the server — 21 queries — and
 * the reader waited for it. The board is 290 bookings. Folding that many rows in a browser is
 * imperceptible, and the fold is not new code: this calls the same functions in `bands.ts`,
 * `figures.ts`, `routes.ts` and `filters.ts` that the server was calling. There is no second
 * implementation of any band, which is what the note in `queries.ts` was written to prevent.
 *
 * WHY THE AUXILIARY DATA TRAVELS WITH THE BOOKINGS. Two bands need more than the booking row:
 * the map needs each trip's recorded hops, and the channel band needs to know which bookings
 * carry a policy flag and what the savings analysis found. All of it is keyed by booking code,
 * so loading it once for the UNFILTERED scoped set and taking the subset for the filtered codes
 * is exactly what re-querying with a narrower `code = ANY(...)` would have returned. The whole
 * travel database is under 2,000 rows, so "once" is cheap and "again" was never necessary.
 *
 * WHAT IS NOT HERE. `optimisation` and `admin` stay on the server. They are ten SQL aggregations
 * over six tables, and a JS port of them has to agree to the cent on figures people act on —
 * that is its own piece of work, with its own equivalence test. They are fetched separately and
 * arrive a moment later. Everything above the fold, and everything a finance reader sees at all,
 * is built here and updates on the tick.
 */

import { buildChannelBand, buildFinance, type BookingChannel } from './bands';
import { spendPopulation } from './figures';
import { applyFilters, type TravelFilters } from './filters';
import { buildMapData, buildTravelTypeBand, type BookingSegment } from './routes';
import type {
  ChannelBand,
  FinanceBand,
  ScopedBooking,
  TravelHeadline,
  TravelAnalyticsData,
} from './queries';

/**
 * Everything the browser needs to rebuild its bands, loaded once and unfiltered.
 *
 * Maps and Sets are sent as arrays: this crosses a server-action boundary, and neither survives
 * that serialisation.
 */
export interface TravelDataset {
  /** In scope for this reader, before any filter is applied. */
  bookings: ScopedBooking[];
  /** Recorded hops per booking code, outbound first — the order the feed defines. */
  segments: Array<[string, BookingSegment[]]>;
  /** Booking codes carrying at least one policy violation. */
  flaggedCodes: string[];
  /** Missed savings in USD per booking code, for the codes the analysis covers at all. */
  savingsByCode: Array<[string, number]>;
}

/** The part of the payload the browser owns. The rest arrives from the server. */
export type ClientBands = Pick<
  TravelAnalyticsData,
  'bookingsInScope' | 'headline' | 'finance' | 'map' | 'travelTypes' | 'channels'
> & {
  /** The codes in view, so the role-gated fetch can be skipped when nothing is selected. */
  filteredCodes: string[];
};

export function buildClientBands(dataset: TravelDataset, filters: TravelFilters): ClientBands {
  const bookings = applyFilters(dataset.bookings, filters);
  const inFilter = new Set(bookings.map((b) => b.code));

  const segments = new Map<string, BookingSegment[]>(
    dataset.segments.filter(([code]) => inFilter.has(code)),
  );

  /* The savings headline used to be its own SQL SUM over the filtered codes. It is the same
     number as folding the per-code map, so that query is simply gone rather than reproduced —
     one less round trip, and no way for the headline and the channel band to disagree because
     they were computed from two separate reads. */
  let missedSavingsUsd = 0;
  let savingsCoveredBookings = 0;
  const savingsByCode = new Map<string, number>();
  for (const [code, missed] of dataset.savingsByCode) {
    if (!inFilter.has(code)) continue;
    savingsByCode.set(code, missed);
    missedSavingsUsd += missed;
    savingsCoveredBookings += 1;
  }

  const spend = spendPopulation(bookings.map((b) => b.amountUsd));
  const headline: TravelHeadline = {
    spend,
    travellers: new Set(bookings.map((b) => b.employeeId).filter(Boolean)).size,
    pendingApprovals: bookings.filter((b) => b.status === 'Pending Approval').length,
    missedSavingsUsd,
    savingsCoveredBookings,
  };

  const channels: ChannelBand = buildChannelBand(bookings, {
    flagged: new Set(dataset.flaggedCodes.filter((c) => inFilter.has(c))),
    savingsByCode,
  });

  const finance: FinanceBand = buildFinance(bookings, spend);

  return {
    bookingsInScope: bookings.length,
    filteredCodes: [...inFilter],
    headline,
    finance,
    map: buildMapData(bookings, segments),
    travelTypes: buildTravelTypeBand(bookings),
    channels,
  };
}

/** Re-exported so a client component needs only this module. */
export type { BookingChannel };
