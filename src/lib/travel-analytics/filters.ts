/**
 * The board's filters.
 *
 * Applied at ONE point: immediately after the scoping query, before any band is built. Every
 * figure on the page — the headline, the spend splits, the map, the travel types, the
 * optimisation band, the traveller directory, the data-quality counts — is a fold over that one
 * list or a query keyed on its booking codes. So narrowing the list narrows all of them, and no
 * band can be left behind when a filter is added, because no band knows filters exist.
 *
 * Filters compose with the reader's SCOPE, they never widen it. The scope decides which
 * bookings exist for this person; a filter only hides some of those. A filter naming a country
 * the reader does not hold matches nothing, which is the correct answer and not an error.
 *
 * An empty or absent list means "no restriction on this field", never "match nothing". That is
 * the opposite of how `scope.countries` works, and deliberately so: a scope of `[]` is a grant
 * that covers nothing, while a filter of `[]` is a dropdown nobody has touched.
 */

export interface TravelFilters {
  countries?: string[];
  costCentres?: string[];
  segments?: string[];
  companies?: string[];
  travelTypes?: string[];
  cabinClasses?: string[];
  statuses?: string[];
  /** `Booked in the portal` / `Booked offline`, as `CHANNEL_LABEL` spells them. */
  channels?: string[];
}

/** The fields a filter can test. Narrow on purpose, so any booking shape satisfies it. */
export interface FilterableBooking {
  country: string | null;
  costCentre: string | null;
  segment: string | null;
  companyName: string | null;
  travelType: string | null;
  cabinClass: string | null;
  status: string | null;
  channelLabel: string;
}

export interface TravelFilterOptions {
  countries: string[];
  costCentres: string[];
  segments: string[];
  companies: string[];
  travelTypes: string[];
  cabinClasses: string[];
  statuses: string[];
  channels: string[];
}

export const EMPTY_FILTERS: TravelFilters = {};

/** Every filter key, so a loop over them cannot miss one that was added later. */
export const FILTER_KEYS = [
  'countries',
  'costCentres',
  'segments',
  'companies',
  'travelTypes',
  'cabinClasses',
  'statuses',
  'channels',
] as const satisfies readonly (keyof TravelFilters)[];

const FIELD_OF: Record<(typeof FILTER_KEYS)[number], keyof FilterableBooking> = {
  countries: 'country',
  costCentres: 'costCentre',
  segments: 'segment',
  companies: 'companyName',
  travelTypes: 'travelType',
  cabinClasses: 'cabinClass',
  statuses: 'status',
  channels: 'channelLabel',
};

/**
 * What a booking's value is, for both filtering and listing options.
 *
 * Trimmed, because the feed pads `segment` with spaces, and a value that is blank after
 * trimming becomes the literal `Unassigned` so it can be filtered FOR. A booking with no
 * segment is a real group of bookings and a reader looking for them should be able to ask.
 */
export function filterValue(booking: FilterableBooking, key: (typeof FILTER_KEYS)[number]): string {
  const raw = booking[FIELD_OF[key]];
  const v = String(raw ?? '').trim();
  return v || 'Unassigned';
}

/** True when this booking survives every filter that has been set. */
export function matchesFilters(booking: FilterableBooking, filters: TravelFilters): boolean {
  for (const key of FILTER_KEYS) {
    const wanted = filters[key];
    if (!wanted || wanted.length === 0) continue;
    if (!wanted.includes(filterValue(booking, key))) return false;
  }
  return true;
}

export function applyFilters<T extends FilterableBooking>(
  bookings: readonly T[],
  filters: TravelFilters,
): T[] {
  if (!hasAnyFilter(filters)) return [...bookings];
  return bookings.filter((b) => matchesFilters(b, filters));
}

export function hasAnyFilter(filters: TravelFilters): boolean {
  return FILTER_KEYS.some((k) => (filters[k]?.length ?? 0) > 0);
}

export function activeFilterCount(filters: TravelFilters): number {
  return FILTER_KEYS.reduce((n, k) => n + (filters[k]?.length ?? 0), 0);
}

/**
 * The values a reader may choose from.
 *
 * Built from the UNFILTERED scoped set, so the dropdowns hold still as filters are applied.
 * Rebuilding them from the filtered set would remove every option the reader had not picked
 * the moment they picked one, which makes a filter impossible to widen without clearing it.
 */
export function filterOptionsFrom(bookings: readonly FilterableBooking[]): TravelFilterOptions {
  const collect = (key: (typeof FILTER_KEYS)[number]) =>
    [...new Set(bookings.map((b) => filterValue(b, key)))].sort((a, z) =>
      a.localeCompare(z, undefined, { numeric: true }),
    );
  return {
    countries: collect('countries'),
    costCentres: collect('costCentres'),
    segments: collect('segments'),
    companies: collect('companies'),
    travelTypes: collect('travelTypes'),
    cabinClasses: collect('cabinClasses'),
    statuses: collect('statuses'),
    channels: collect('channels'),
  };
}

/**
 * Drop anything the client sent that is not a real option.
 *
 * These arrive from a browser through a public endpoint, so they are input rather than
 * configuration. Unknown values are discarded instead of refused: a stale tab holding a cost
 * centre that has since been renamed should show the board, not an error.
 */
export function sanitiseFilters(
  filters: TravelFilters | null | undefined,
  options: TravelFilterOptions,
): TravelFilters {
  if (!filters) return {};
  const out: TravelFilters = {};
  for (const key of FILTER_KEYS) {
    const sent = filters[key];
    if (!Array.isArray(sent) || sent.length === 0) continue;
    const allowed = new Set(options[key]);
    const kept = [...new Set(sent.map((v) => String(v)))].filter((v) => allowed.has(v));
    if (kept.length) out[key] = kept;
  }
  return out;
}
