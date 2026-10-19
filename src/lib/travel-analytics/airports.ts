/**
 * Where an airport is, so the travel board can draw a map.
 *
 * NOTHING IN THE DATA KNOWS THIS. `bookings` carries IATA codes and `flightsegmentlegs` carries
 * airport names; neither carries a coordinate, and no other table in the estate does either. So
 * this is a curated lookup, written here rather than guessed at render time, covering the 63
 * airports the feed currently uses.
 *
 * City-level precision, one decimal, which is roughly 11km. A world map at this zoom cannot
 * show better and a rounder number is less likely to be wrong in a way that matters: the point
 * of the map is "people keep flying Dubai to Dammam", not a runway threshold.
 *
 * AN AIRPORT WITHOUT A COORDINATE IS NOT DROPPED. `unplottedFrom` returns the ones a map could
 * not place, with their traffic, so the screen can say "4 airports not shown" instead of quietly
 * drawing a smaller picture than the data supports. That matters more than the map: a reader who
 * cannot see that something is missing will believe what is drawn is everything.
 *
 * Follows the pattern already in `src/app/ti-te/map/LeafletMap.tsx`, which keeps its own
 * country-level table for the same reason.
 */

export interface Airport {
  /** City or metro name, for the tooltip. The feed's own airport names are longer and noisier. */
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export const AIRPORTS: Record<string, Airport> = {
  // ── Gulf ──
  DXB: { city: 'Dubai', country: 'United Arab Emirates', lat: 25.3, lon: 55.4 },
  DWC: { city: 'Dubai World Central', country: 'United Arab Emirates', lat: 24.9, lon: 55.2 },
  AUH: { city: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4, lon: 54.7 },
  RKT: { city: 'Ras Al Khaimah', country: 'United Arab Emirates', lat: 26.0, lon: 56.0 },
  DMM: { city: 'Dammam', country: 'Saudi Arabia', lat: 26.5, lon: 49.8 },
  RUH: { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.9, lon: 46.7 },
  JED: { city: 'Jeddah', country: 'Saudi Arabia', lat: 21.7, lon: 39.2 },
  KWI: { city: 'Kuwait City', country: 'Kuwait', lat: 29.2, lon: 47.9 },
  BAH: { city: 'Bahrain', country: 'Bahrain', lat: 26.3, lon: 50.6 },
  DOH: { city: 'Doha', country: 'Qatar', lat: 25.3, lon: 51.6 },
  MCT: { city: 'Muscat', country: 'Oman', lat: 23.6, lon: 58.3 },
  BSR: { city: 'Basra', country: 'Iraq', lat: 30.5, lon: 47.7 },

  // ── Levant and North Africa ──
  AMM: { city: 'Amman', country: 'Jordan', lat: 31.7, lon: 35.9 },
  DAM: { city: 'Damascus', country: 'Syria', lat: 33.4, lon: 36.5 },
  BEY: { city: 'Beirut', country: 'Lebanon', lat: 33.8, lon: 35.5 },
  CAI: { city: 'Cairo', country: 'Egypt', lat: 30.1, lon: 31.4 },
  SPX: { city: 'Cairo Sphinx', country: 'Egypt', lat: 30.1, lon: 31.0 },
  ALG: { city: 'Algiers', country: 'Algeria', lat: 36.7, lon: 3.2 },
  ORN: { city: 'Oran', country: 'Algeria', lat: 35.6, lon: -0.6 },
  TUN: { city: 'Tunis', country: 'Tunisia', lat: 36.9, lon: 10.2 },
  MJI: { city: 'Tripoli Mitiga', country: 'Libya', lat: 32.9, lon: 13.3 },
  IST: { city: 'Istanbul', country: 'Turkey', lat: 41.3, lon: 28.7 },

  // ── Sub-Saharan Africa ──
  ADD: { city: 'Addis Ababa', country: 'Ethiopia', lat: 9.0, lon: 38.8 },
  HGA: { city: 'Hargeisa', country: 'Somaliland', lat: 9.5, lon: 44.1 },
  LBV: { city: 'Libreville', country: 'Gabon', lat: 0.5, lon: 9.4 },
  PNR: { city: 'Pointe-Noire', country: 'Congo', lat: -4.8, lon: 11.9 },

  // ── South Asia ──
  KHI: { city: 'Karachi', country: 'Pakistan', lat: 24.9, lon: 67.2 },
  ISB: { city: 'Islamabad', country: 'Pakistan', lat: 33.6, lon: 72.8 },
  LYP: { city: 'Faisalabad', country: 'Pakistan', lat: 31.4, lon: 73.0 },
  MUX: { city: 'Multan', country: 'Pakistan', lat: 30.2, lon: 71.4 },
  SKT: { city: 'Sialkot', country: 'Pakistan', lat: 32.5, lon: 74.4 },
  DEL: { city: 'Delhi', country: 'India', lat: 28.6, lon: 77.1 },
  BOM: { city: 'Mumbai', country: 'India', lat: 19.1, lon: 72.9 },
  BLR: { city: 'Bengaluru', country: 'India', lat: 13.2, lon: 77.7 },
  HYD: { city: 'Hyderabad', country: 'India', lat: 17.2, lon: 78.4 },
  COK: { city: 'Kochi', country: 'India', lat: 10.2, lon: 76.4 },
  CCJ: { city: 'Kozhikode', country: 'India', lat: 11.1, lon: 75.9 },
  TRV: { city: 'Thiruvananthapuram', country: 'India', lat: 8.5, lon: 77.0 },
  CNN: { city: 'Kannur', country: 'India', lat: 12.0, lon: 75.5 },
  IXE: { city: 'Mangaluru', country: 'India', lat: 12.9, lon: 74.9 },
  TRZ: { city: 'Tiruchirappalli', country: 'India', lat: 10.8, lon: 78.7 },
  LKO: { city: 'Lucknow', country: 'India', lat: 26.8, lon: 80.9 },
  IXC: { city: 'Chandigarh', country: 'India', lat: 30.7, lon: 76.8 },
  ATQ: { city: 'Amritsar', country: 'India', lat: 31.7, lon: 74.8 },
  CMB: { city: 'Colombo', country: 'Sri Lanka', lat: 7.2, lon: 79.9 },
  KTM: { city: 'Kathmandu', country: 'Nepal', lat: 27.7, lon: 85.4 },
  DAC: { city: 'Dhaka', country: 'Bangladesh', lat: 23.8, lon: 90.4 },
  CGP: { city: 'Chattogram', country: 'Bangladesh', lat: 22.2, lon: 91.8 },

  // ── East and South East Asia ──
  KUL: { city: 'Kuala Lumpur', country: 'Malaysia', lat: 2.7, lon: 101.7 },
  SIN: { city: 'Singapore', country: 'Singapore', lat: 1.4, lon: 103.9 },
  CGK: { city: 'Jakarta', country: 'Indonesia', lat: -6.1, lon: 106.7 },
  DPS: { city: 'Denpasar', country: 'Indonesia', lat: -8.7, lon: 115.2 },
  PKU: { city: 'Pekanbaru', country: 'Indonesia', lat: 0.5, lon: 101.4 },
  MNL: { city: 'Manila', country: 'Philippines', lat: 14.5, lon: 121.0 },
  PEK: { city: 'Beijing', country: 'China', lat: 40.1, lon: 116.6 },

  // ── Europe and the Americas ──
  CDG: { city: 'Paris', country: 'France', lat: 49.0, lon: 2.5 },
  LHR: { city: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.5 },
  HAM: { city: 'Hamburg', country: 'Germany', lat: 53.6, lon: 10.0 },
  IAH: { city: 'Houston', country: 'United States', lat: 30.0, lon: -95.3 },
  LAX: { city: 'Los Angeles', country: 'United States', lat: 33.9, lon: -118.4 },
  SFO: { city: 'San Francisco', country: 'United States', lat: 37.6, lon: -122.4 },
  SEA: { city: 'Seattle', country: 'United States', lat: 47.4, lon: -122.3 },
  YDF: { city: 'Deer Lake', country: 'Canada', lat: 49.2, lon: -57.4 },
};

export function airportFor(code: string | null | undefined): Airport | null {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  return c ? (AIRPORTS[c] ?? null) : null;
}

/** A label for a code the table does not know, so a tooltip still says something useful. */
export function airportLabel(code: string | null | undefined): string {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  const a = AIRPORTS[c];
  return a ? `${a.city} (${c})` : c || 'Unknown';
}

/**
 * The codes a map cannot place, with how much traffic each carries.
 *
 * Returned so the screen can name them. A map that silently omits an airport is a map that
 * understates the travel, and the reader has no way to tell.
 */
export function unplottedFrom(
  counts: ReadonlyMap<string, number> | ReadonlyArray<[string, number]>,
): { code: string; trips: number }[] {
  const entries = Array.isArray(counts) ? counts : [...counts];
  return entries
    .filter(([code]) => !AIRPORTS[String(code).trim().toUpperCase()])
    .map(([code, trips]) => ({ code: String(code), trips: Number(trips) || 0 }))
    .sort((a, b) => b.trips - a.trips);
}
