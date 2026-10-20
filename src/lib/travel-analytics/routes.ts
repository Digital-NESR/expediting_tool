import { airportFor, airportLabel } from './airports';

/**
 * Where the travel actually goes, for the map and the travel-type band.
 *
 * Built in JS from the already-scoped bookings rather than queried again. The scoping query has
 * done the hard part — deciding which bookings this reader may see — and re-deriving that in a
 * second query is how the two drift. Everything here is a fold over rows that are already
 * correct.
 */

/** The fields these folds need. Deliberately narrow, so any scoped booking shape satisfies it. */
export interface RoutableBooking {
  code: string;
  origin: string | null;
  destination: string | null;
  /** `OneWay` / `Return` / `RoundTrip`; the only thing that says a trip comes back. */
  direction: string | null;
  travelType: string | null;
  cabinClass: string | null;
  month: string | null;
  departureDate: string | null;
  amountUsd: number;
  country: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  channelLabel?: string;
}

export interface RouteGroup {
  origin: string;
  destination: string;
  /** `DXB → DMM`, for a tooltip or a table. */
  label: string;
  trips: number;
  spendUsd: number;
  /** Null when either end has no coordinate; the map skips the line and says so. */
  from: { lat: number; lon: number } | null;
  to: { lat: number; lon: number } | null;
}

export interface AirportNode {
  code: string;
  label: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Times this airport appears as either end of a booking. */
  trips: number;
  departures: number;
  arrivals: number;
  spendUsd: number;
}

/** One flown hop. `inferred` legs were derived, not recorded; the map says which. */
export interface TripLeg {
  origin: string;
  destination: string;
  label: string;
  from: { lat: number; lon: number } | null;
  to: { lat: number; lon: number } | null;
  inferred: boolean;
}

/**
 * One booking, with every hop it covers.
 *
 * The map's other view groups by route, which answers "which corridors do we fly" and
 * deliberately loses the trip: DXB→CAI and CAI→DXB become two unrelated lines even when they
 * are the two halves of one person's week. This keeps them together so one colour can carry
 * one journey.
 */
export interface TripPath {
  code: string;
  legs: TripLeg[];
  travellerName: string | null;
  employeeId: string | null;
  travelType: string | null;
  departureDate: string | null;
  spendUsd: number;
  channelLabel: string;
  /** `DXB → CAI → DXB`, the whole journey in one line. */
  label: string;
  /** True when any leg was derived from `direction` rather than read from a segment row. */
  hasInferredLegs: boolean;
}

export interface MapData {
  nodes: AirportNode[];
  routes: RouteGroup[];
  /** One entry per booking, so the map can colour a journey rather than a corridor. */
  trips: TripPath[];
  /** Codes with no coordinate, named so the map can admit what it is not showing. */
  unplotted: { code: string; trips: number }[];
  /** Bookings with no origin or no destination at all, so they are on no route. */
  withoutRoute: number;
}

/**
 * Fold bookings into airports and routes.
 *
 * Direction is kept: `DXB → DMM` and `DMM → DXB` are separate routes, because a chart that
 * merged them would hide a one-way pattern, which on this data is most of the rotation travel.
 */
export function buildMapData(
  bookings: readonly RoutableBooking[],
  segmentsByCode: ReadonlyMap<string, BookingSegment[]> = new Map(),
): MapData {
  const routes = new Map<string, RouteGroup>();
  const seen = new Map<string, number>();
  const nodes = new Map<string, AirportNode>();
  let withoutRoute = 0;

  const touch = (code: string, spend: number, kind: 'dep' | 'arr') => {
    seen.set(code, (seen.get(code) ?? 0) + 1);
    const airport = airportFor(code);
    if (!airport) return;
    const node = nodes.get(code) ?? {
      code,
      label: airportLabel(code),
      city: airport.city,
      country: airport.country,
      lat: airport.lat,
      lon: airport.lon,
      trips: 0,
      departures: 0,
      arrivals: 0,
      spendUsd: 0,
    };
    node.trips += 1;
    if (kind === 'dep') node.departures += 1;
    else node.arrivals += 1;
    /* Spend is the booking's, counted once at each end. A node's total is therefore "value
       flowing through here", not a share of the country total, and the label says so. */
    node.spendUsd += spend;
    nodes.set(code, node);
  };

  for (const b of bookings) {
    const from = (b.origin ?? '').trim().toUpperCase();
    const to = (b.destination ?? '').trim().toUpperCase();
    if (!from || !to) {
      withoutRoute += 1;
      continue;
    }
    touch(from, b.amountUsd, 'dep');
    touch(to, b.amountUsd, 'arr');

    const key = `${from}>${to}`;
    const a = airportFor(from);
    const z = airportFor(to);
    const route = routes.get(key) ?? {
      origin: from,
      destination: to,
      label: `${from} → ${to}`,
      trips: 0,
      spendUsd: 0,
      from: a ? { lat: a.lat, lon: a.lon } : null,
      to: z ? { lat: z.lat, lon: z.lon } : null,
    };
    route.trips += 1;
    route.spendUsd += b.amountUsd;
    routes.set(key, route);
  }

  const unplotted = [...seen.entries()]
    .filter(([code]) => !airportFor(code))
    .map(([code, trips]) => ({ code, trips }))
    .sort((x, y) => y.trips - x.trips);

  return {
    nodes: [...nodes.values()].sort((x, y) => y.trips - x.trips),
    routes: [...routes.values()].sort((x, y) => y.trips - x.trips),
    trips: buildTripPaths(bookings, segmentsByCode),
    unplotted,
    withoutRoute,
  };
}

/** A `flightsegments` row, reduced to what a path needs. Ordered by the caller. */
export interface BookingSegment {
  code: string;
  direction: string | null;
  origin: string | null;
  destination: string | null;
}

const leg = (from: string, to: string, inferred: boolean): TripLeg => {
  const a = airportFor(from);
  const z = airportFor(to);
  return {
    origin: from,
    destination: to,
    label: `${from} → ${to}`,
    from: a ? { lat: a.lat, lon: a.lon } : null,
    to: z ? { lat: z.lat, lon: z.lon } : null,
    inferred,
  };
};

/**
 * Turn each booking into the sequence of hops it covers.
 *
 * Three sources, in descending order of how much they are trusted:
 *
 *  1. `flightsegments`, where they exist. These are what was actually booked, and 126 of the
 *     230 bookings have them.
 *  2. The booking's own `departureAirportCode` / `arrivalAirportCode` otherwise, which is one
 *     hop whatever the trip really was.
 *  3. A return hop appended when `direction` says the trip comes back and the legs so far do
 *     not end where they started. 83 Return bookings carry no segments at all, and drawing
 *     them as a one-way line would say something false about them.
 *
 * (3) is the only one that invents anything, so it is the only one marked `inferred`, and the
 * map draws those dashed. A reader should be able to see which half of a journey the data
 * actually knows about.
 */
export function buildTripPaths(
  bookings: readonly RoutableBooking[],
  segmentsByCode: ReadonlyMap<string, BookingSegment[]>,
): TripPath[] {
  const paths: TripPath[] = [];

  for (const b of bookings) {
    const recorded = segmentsByCode.get(b.code) ?? [];
    const legs: TripLeg[] = [];

    for (const seg of recorded) {
      const from = (seg.origin ?? '').trim().toUpperCase();
      const to = (seg.destination ?? '').trim().toUpperCase();
      if (from && to) legs.push(leg(from, to, false));
    }

    if (legs.length === 0) {
      const from = (b.origin ?? '').trim().toUpperCase();
      const to = (b.destination ?? '').trim().toUpperCase();
      if (!from || !to) continue;
      legs.push(leg(from, to, false));
    }

    const direction = (b.direction ?? '').trim().toLowerCase();
    const returns = direction === 'return' || direction === 'roundtrip';
    const start = legs[0].origin;
    const end = legs[legs.length - 1].destination;
    if (returns && end !== start) legs.push(leg(end, start, true));

    const stops = [legs[0].origin, ...legs.map((l) => l.destination)];
    paths.push({
      code: b.code,
      legs,
      travellerName: b.employeeName ?? null,
      employeeId: b.employeeId ?? null,
      travelType: b.travelType,
      departureDate: b.departureDate,
      spendUsd: b.amountUsd,
      channelLabel: b.channelLabel ?? '',
      label: stops.join(' → '),
      hasInferredLegs: legs.some((l) => l.inferred),
    });
  }

  /* Newest first, which is the order a reader scans a legend in, and the order the trip list
     beside the map already uses. */
  return paths.sort((a, z) => (z.departureDate ?? '').localeCompare(a.departureDate ?? ''));
}

export interface TravelTypeRow {
  type: string;
  trips: number;
  spendUsd: number;
  /** Over the priced bookings only, so the 90 zero-value ones do not drag it towards nothing. */
  pricedTrips: number;
  averageTicketUsd: number | null;
  /** The share of this type's trips that is not Economy. */
  premiumTrips: number;
  topRoute: string | null;
}

export interface TravelTypeBand {
  rows: TravelTypeRow[];
  /** Trips per type per month, for the stacked trend. */
  byMonth: { month: string; label: string; counts: Record<string, number> }[];
  types: string[];
}

const monthLabel = (m: string): string => {
  const [y, mm] = m.split('-');
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const i = Number(mm) - 1;
  return names[i] ? `${names[i]} ${y.slice(2)}` : m;
};

/**
 * The travel types, side by side.
 *
 * Average ticket is over the priced bookings only. On this feed that is the difference between
 * a vacation ticket looking like $1,359 and looking like $1,654, and the second is the real
 * number: 90 of 230 bookings carry no value at all and averaging over them measures the gap in
 * the feed rather than the cost of a seat.
 */
export function buildTravelTypeBand(bookings: readonly RoutableBooking[]): TravelTypeBand {
  const byType = new Map<string, RoutableBooking[]>();
  for (const b of bookings) {
    const type = (b.travelType ?? '').trim() || 'Unspecified';
    const list = byType.get(type) ?? [];
    list.push(b);
    byType.set(type, list);
  }

  const rows: TravelTypeRow[] = [...byType.entries()]
    .map(([type, list]) => {
      const priced = list.filter((b) => b.amountUsd > 0);
      const routeCounts = new Map<string, number>();
      for (const b of list) {
        const from = (b.origin ?? '').trim().toUpperCase();
        const to = (b.destination ?? '').trim().toUpperCase();
        if (!from || !to) continue;
        const k = `${from} → ${to}`;
        routeCounts.set(k, (routeCounts.get(k) ?? 0) + 1);
      }
      const top = [...routeCounts.entries()].sort((a, z) => z[1] - a[1])[0];
      return {
        type,
        trips: list.length,
        spendUsd: list.reduce((s, b) => s + b.amountUsd, 0),
        pricedTrips: priced.length,
        averageTicketUsd: priced.length
          ? priced.reduce((s, b) => s + b.amountUsd, 0) / priced.length
          : null,
        premiumTrips: list.filter(
          (b) => (b.cabinClass ?? '').trim() && (b.cabinClass ?? '').trim() !== 'Economy',
        ).length,
        topRoute: top ? top[0] : null,
      };
    })
    .sort((a, z) => z.trips - a.trips);

  const types = rows.map((r) => r.type);
  const months = new Map<string, Record<string, number>>();
  for (const b of bookings) {
    const m = b.month;
    if (!m) continue;
    const type = (b.travelType ?? '').trim() || 'Unspecified';
    const row = months.get(m) ?? Object.fromEntries(types.map((t) => [t, 0]));
    row[type] = (row[type] ?? 0) + 1;
    months.set(m, row);
  }

  return {
    rows,
    types,
    byMonth: [...months.entries()]
      .sort((a, z) => a[0].localeCompare(z[0]))
      .map(([month, counts]) => ({ month, label: monthLabel(month), counts })),
  };
}
