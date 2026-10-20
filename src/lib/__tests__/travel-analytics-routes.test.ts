import { describe, expect, it } from 'vitest';
import { AIRPORTS, airportFor, airportLabel, unplottedFrom } from '@/lib/travel-analytics/airports';
import {
  buildMapData,
  buildTravelTypeBand,
  buildTripPaths,
  type BookingSegment,
  type RoutableBooking,
} from '@/lib/travel-analytics/routes';

/**
 * The map and the travel-type band.
 *
 * Both are folds over bookings the scoping query has already filtered, so nothing here decides
 * who sees what. What they can still get wrong is quieter: dropping an airport the coordinate
 * table does not know, merging two directions of the same route, or averaging a ticket price
 * over the 90 bookings that carry no price. Each of those would produce a picture that looks
 * complete and is not.
 */

/* Each call gets its own code. A trip path is per booking, so two fixtures sharing one code
   would be one journey and the counts would quietly halve. */
let nextCode = 0;
const trip = (o: Partial<RoutableBooking> = {}): RoutableBooking => ({
  code: `BTO${100000 + (nextCode += 1)}`,
  direction: 'OneWay',
  origin: 'DXB',
  destination: 'DMM',
  travelType: 'Business Travel',
  cabinClass: 'Economy',
  month: '2026-06',
  departureDate: '2026-06-10',
  amountUsd: 240,
  country: 'HQ Dubai',
  ...o,
});

describe('the airport table', () => {
  it('places the airports the feed leans on', () => {
    for (const code of ['DXB', 'DMM', 'CAI', 'AUH', 'MCT', 'KWI']) {
      expect(airportFor(code), `${code} should be plotted`).not.toBeNull();
    }
  });

  it('is not fooled by case or padding', () => {
    expect(airportFor('  dxb ')?.city).toBe('Dubai');
  });

  /* A code nobody added yet must come back null rather than a guess, so the map can say it is
     not drawing it. */
  it('returns null for a code it does not know', () => {
    expect(airportFor('ZZZ')).toBeNull();
    expect(airportFor('')).toBeNull();
    expect(airportFor(null)).toBeNull();
  });

  it('still labels an unknown code with the code itself', () => {
    expect(airportLabel('ZZZ')).toBe('ZZZ');
    expect(airportLabel('DXB')).toBe('Dubai (DXB)');
  });

  it('names what it cannot place, with the traffic attached', () => {
    expect(
      unplottedFrom([
        ['DXB', 40],
        ['ZZZ', 3],
        ['QQQ', 9],
      ]),
    ).toEqual([
      { code: 'QQQ', trips: 9 },
      { code: 'ZZZ', trips: 3 },
    ]);
  });

  /* Coordinates on the wrong side of the world put a flight in the sea, and nothing else in the
     code would notice. */
  it('holds coordinates that are on the planet', () => {
    for (const [code, a] of Object.entries(AIRPORTS)) {
      expect(Math.abs(a.lat), `${code} latitude`).toBeLessThanOrEqual(90);
      expect(Math.abs(a.lon), `${code} longitude`).toBeLessThanOrEqual(180);
      expect(a.city.length, `${code} city`).toBeGreaterThan(0);
      expect(a.country.length, `${code} country`).toBeGreaterThan(0);
    }
  });
});

describe('buildMapData', () => {
  it('counts a route once per trip and both ends per booking', () => {
    const map = buildMapData([trip(), trip(), trip({ destination: 'CAI' })]);
    const dxbDmm = map.routes.find((r) => r.label === 'DXB → DMM');
    expect(dxbDmm?.trips).toBe(2);
    expect(map.nodes.find((n) => n.code === 'DXB')?.trips).toBe(3);
    expect(map.nodes.find((n) => n.code === 'DXB')?.departures).toBe(3);
    expect(map.nodes.find((n) => n.code === 'DMM')?.arrivals).toBe(2);
  });

  /* Merging the two directions would hide a one-way pattern, which on this feed is most of the
     rotation travel. */
  it('keeps the two directions of a route apart', () => {
    const map = buildMapData([trip(), trip({ origin: 'DMM', destination: 'DXB' })]);
    expect(map.routes.map((r) => r.label).sort()).toEqual(['DMM → DXB', 'DXB → DMM']);
  });

  it('orders routes and airports by traffic', () => {
    const map = buildMapData([trip({ destination: 'CAI' }), trip(), trip(), trip()]);
    expect(map.routes[0].label).toBe('DXB → DMM');
    expect(map.nodes[0].code).toBe('DXB');
  });

  /* The whole reason the map carries a note. An airport without a coordinate is reported, and
     the route through it still exists with no line to draw. */
  it('reports an airport it cannot place instead of dropping it', () => {
    const map = buildMapData([trip({ destination: 'ZZZ' })]);
    expect(map.unplotted).toEqual([{ code: 'ZZZ', trips: 1 }]);
    expect(map.nodes.map((n) => n.code)).toEqual(['DXB']);
    const route = map.routes.find((r) => r.label === 'DXB → ZZZ');
    expect(route?.trips).toBe(1);
    expect(route?.to).toBeNull();
  });

  it('counts a booking with no route rather than silently losing it', () => {
    const map = buildMapData([trip({ destination: null }), trip({ origin: '' }), trip()]);
    expect(map.withoutRoute).toBe(2);
    expect(map.routes).toHaveLength(1);
  });

  it('holds together with nothing at all', () => {
    const map = buildMapData([]);
    expect(map).toEqual({ nodes: [], routes: [], trips: [], unplotted: [], withoutRoute: 0 });
  });
});

describe('buildTravelTypeBand', () => {
  /* The figure this band exists for. Averaging over the unpriced bookings would measure the
     hole in the feed rather than the cost of a seat. */
  it('averages the ticket over priced bookings only', () => {
    const band = buildTravelTypeBand([
      trip({ amountUsd: 1000 }),
      trip({ amountUsd: 0 }),
      trip({ amountUsd: 0 }),
    ]);
    const business = band.rows.find((r) => r.type === 'Business Travel');
    expect(business?.trips).toBe(3);
    expect(business?.pricedTrips).toBe(1);
    expect(business?.averageTicketUsd).toBe(1000);
  });

  it('reports no average rather than zero when nothing carries a price', () => {
    const band = buildTravelTypeBand([trip({ amountUsd: 0 })]);
    expect(band.rows[0].averageTicketUsd).toBeNull();
  });

  it('separates the types and ranks them by trips', () => {
    const band = buildTravelTypeBand([trip({ travelType: 'Vacation Travel' }), trip(), trip()]);
    expect(band.rows.map((r) => r.type)).toEqual(['Business Travel', 'Vacation Travel']);
    expect(band.types).toEqual(['Business Travel', 'Vacation Travel']);
  });

  /* A blank type is a real group of bookings; filing them under nothing would make the counts
     disagree with the board's total. */
  it('gives an unlabelled type a name rather than dropping it', () => {
    const band = buildTravelTypeBand([trip({ travelType: null }), trip({ travelType: '  ' })]);
    expect(band.rows).toHaveLength(1);
    expect(band.rows[0].type).toBe('Unspecified');
    expect(band.rows[0].trips).toBe(2);
  });

  it('counts anything above Economy as premium', () => {
    const band = buildTravelTypeBand([
      trip({ cabinClass: 'Business' }),
      trip({ cabinClass: 'Economy' }),
      trip({ cabinClass: null }),
    ]);
    expect(band.rows[0].premiumTrips).toBe(1);
  });

  it('names each type its own busiest route', () => {
    const band = buildTravelTypeBand([
      trip(),
      trip(),
      trip({ travelType: 'Vacation Travel', destination: 'COK' }),
    ]);
    expect(band.rows.find((r) => r.type === 'Business Travel')?.topRoute).toBe('DXB → DMM');
    expect(band.rows.find((r) => r.type === 'Vacation Travel')?.topRoute).toBe('DXB → COK');
  });

  it('builds the monthly mix in date order', () => {
    const band = buildTravelTypeBand([
      trip({ month: '2026-07' }),
      trip({ month: '2026-06' }),
      trip({ month: '2026-06', travelType: 'Vacation Travel' }),
    ]);
    expect(band.byMonth.map((m) => m.month)).toEqual(['2026-06', '2026-07']);
    expect(band.byMonth[0].counts['Business Travel']).toBe(1);
    expect(band.byMonth[0].counts['Vacation Travel']).toBe(1);
  });

  it('holds together with nothing at all', () => {
    const band = buildTravelTypeBand([]);
    expect(band.rows).toEqual([]);
    expect(band.byMonth).toEqual([]);
  });
});

describe('buildTripPaths', () => {
  const segs = (
    ...rows: Array<[string, string, string, string]>
  ): Map<string, BookingSegment[]> => {
    const m = new Map<string, BookingSegment[]>();
    for (const [code, direction, origin, destination] of rows) {
      const list = m.get(code) ?? [];
      list.push({ code, direction, origin, destination });
      m.set(code, list);
    }
    return m;
  };

  it('keeps every leg of one booking together', () => {
    const b = trip({ code: 'BTO1', direction: 'Return', destination: 'CAI' });
    const [path] = buildTripPaths(
      [b],
      segs(['BTO1', 'Outbound', 'DXB', 'CAI'], ['BTO1', 'Inbound', 'CAI', 'DXB']),
    );
    expect(path.legs.map((l) => l.label)).toEqual(['DXB → CAI', 'CAI → DXB']);
    expect(path.label).toBe('DXB → CAI → DXB');
    expect(path.hasInferredLegs).toBe(false);
  });

  it('infers the way home for a Return booking with no segments, and marks it', () => {
    const [path] = buildTripPaths(
      [trip({ code: 'OFF1', direction: 'Return', destination: 'CAI' })],
      new Map(),
    );
    expect(path.legs).toHaveLength(2);
    expect(path.legs[0].inferred).toBe(false);
    expect(path.legs[1].inferred).toBe(true);
    expect(path.legs[1].label).toBe('CAI → DXB');
    expect(path.hasInferredLegs).toBe(true);
  });

  it('invents nothing for a one-way booking', () => {
    const [path] = buildTripPaths([trip({ code: 'OFF2', direction: 'OneWay' })], new Map());
    expect(path.legs).toHaveLength(1);
    expect(path.hasInferredLegs).toBe(false);
  });

  it('does not append a return leg when the segments already come home', () => {
    const b = trip({ code: 'BTO2', direction: 'Return', destination: 'CAI' });
    const [path] = buildTripPaths(
      [b],
      segs(['BTO2', 'Outbound', 'DXB', 'CAI'], ['BTO2', 'Inbound', 'CAI', 'DXB']),
    );
    expect(path.legs.filter((l) => l.inferred)).toHaveLength(0);
  });

  it('drops a booking that has no route at all rather than guessing one', () => {
    expect(buildTripPaths([trip({ code: 'X', origin: null })], new Map())).toHaveLength(0);
  });

  it('gives every booking its own path, so the map can colour per journey', () => {
    const map = buildMapData([trip(), trip(), trip({ destination: 'CAI' })]);
    expect(map.trips).toHaveLength(3);
    expect(new Set(map.trips.map((t) => t.code)).size).toBe(3);
  });
});
