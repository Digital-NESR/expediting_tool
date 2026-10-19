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
  origin: string | null;
  destination: string | null;
  travelType: string | null;
  cabinClass: string | null;
  month: string | null;
  departureDate: string | null;
  amountUsd: number;
  country: string | null;
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

export interface MapData {
  nodes: AirportNode[];
  routes: RouteGroup[];
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
export function buildMapData(bookings: readonly RoutableBooking[]): MapData {
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
    unplotted,
    withoutRoute,
  };
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
