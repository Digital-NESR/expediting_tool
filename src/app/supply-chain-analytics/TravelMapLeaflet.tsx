'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapData, TripPath } from '@/lib/travel-analytics/routes';

export type MapMode = 'routes' | 'trips';

/** Where the map opens before anyone touches it. */
export type MapFit = 'data' | 'mena';

/**
 * The MENA window, south-west to north-east.
 *
 * Roughly Morocco to Oman and the Horn to the Black Sea, which is where this business flies.
 * The feed also reaches India, Indonesia and Malaysia; fitting to ALL of it opens on a view
 * where the Gulf — nine tenths of the travel — is a smudge the size of a thumbnail. So the
 * board opens here and those airports are a pan away rather than the reason nothing is legible.
 * Nothing is hidden: every plotted airport is still drawn, just outside the opening frame.
 */
const MENA_BOUNDS: [[number, number], [number, number]] = [
  [8, -18],
  [42, 64],
];

/**
 * Twelve hues that stay apart from one another and from the basemap.
 *
 * Qualitative, not a ramp: the colour here identifies a journey and means nothing ordinal, so a
 * sequential palette would invite a reader to see "more" in a darker line. Twelve because that
 * is about the limit of what anyone can hold at once; past that they repeat, and the tooltip
 * rather than the colour is what tells two same-coloured trips apart.
 */
export const TRIP_COLOURS = [
  '#1F5D9C',
  '#C2410C',
  '#307c4c',
  '#7C3AED',
  '#B91C1C',
  '#0E7490',
  '#A16207',
  '#BE185D',
  '#15803D',
  '#4338CA',
  '#B45309',
  '#0F766E',
];

export const tripColour = (index: number) => TRIP_COLOURS[index % TRIP_COLOURS.length];

/**
 * A leg, bowed to the left of travel.
 *
 * Straight lines are the honest default and the corridor view keeps them. They do not work for
 * journeys: an out-and-back lands exactly on top of itself, so a return trip looks like a
 * one-way, and ten people flying DXB→DMM in the same month are one line whatever colour each
 * is given.
 *
 * Bowing consistently to the left of the direction of travel solves both. Out and back bow to
 * opposite sides and open into a lens, and `rank` pushes each additional trip on the same
 * corridor a little further out. The curve is a drawing device for separating overlapping
 * journeys and is NOT a flight path — the caption says so, because a curve on a map otherwise
 * reads as a great circle.
 */
function bowed(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  rank: number,
): [number, number][] {
  const bow = 0.07 + rank * 0.05;
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  /* Perpendicular to the direction of travel. Left of travel is (dLat, -dLon) with lat as y. */
  const cx = (from.lat + to.lat) / 2 + dLat * 0 + -dLon * bow;
  const cy = (from.lon + to.lon) / 2 + dLat * bow;

  const points: [number, number][] = [];
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const u = 1 - t;
    points.push([
      u * u * from.lat + 2 * u * t * cx + t * t * to.lat,
      u * u * from.lon + 2 * u * t * cy + t * t * to.lon,
    ]);
  }
  return points;
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function tripTooltip(trip: TripPath, index: number): string {
  const bits = [
    `<strong>${trip.label}</strong>`,
    trip.travellerName ? trip.travellerName : null,
    [trip.departureDate, trip.travelType].filter(Boolean).join(' · ') || null,
    trip.spendUsd > 0 ? money(trip.spendUsd) : 'No value on the booking',
    `${trip.code}${trip.channelLabel ? ` · ${trip.channelLabel}` : ''}`,
    trip.hasInferredLegs
      ? '<em>Dashed leg inferred from the booking direction, not a recorded segment.</em>'
      : null,
  ].filter(Boolean);
  return `<span style="border-left:3px solid ${tripColour(index)};padding-left:6px">${bits.join('<br/>')}</span>`;
}

/**
 * Where the travel goes.
 *
 * Leaflet with OpenStreetMap's own raster tiles, imported only on the client because Leaflet
 * reaches for `window` at module load. The caller wraps it in `next/dynamic` with `ssr: false`;
 * this file never renders on the server.
 *
 * AIRPORTS, NOT COUNTRIES. TI-TE plots countries because a shipment moves between them. A
 * flight moves between airports, and collapsing to countries would merge Dubai with Dubai World
 * Central and lose every domestic leg. The coordinates come from `airports.ts`, which is a
 * curated table; anything it cannot place is counted and named by the caller rather than
 * silently left off.
 *
 * Two views over the same bookings:
 *
 *   `routes`  Corridors. One line per origin→destination pair, weighted by how many trips used
 *             it. Answers "where do we fly", and deliberately forgets whose trip was whose.
 *   `trips`   Journeys. One colour per booking, every leg of it that colour, so a flight out
 *             and the flight home read as one thing. Answers "what did this trip look like".
 */
export default function TravelMapLeaflet({
  data,
  height,
  mode = 'routes',
  highlightCode = null,
  fit = 'data',
}: {
  data: MapData;
  /** A CSS length. The caller may pass a number of pixels or `'100%'` to fill a sized box. */
  height: number | string;
  mode?: MapMode;
  fit?: MapFit;
  /** When set, that one journey is drawn solid and the rest fade behind it. */
  highlightCode?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    /* Guard against React Strict Mode double-invocation, as the TI-TE map does. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((containerRef.current as any)._leaflet_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (containerRef.current as any)._leaflet_id = null;
    }

    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(
      [25, 45],
      3,
    );

    /* OpenStreetMap's own tiles, not CARTO's.
       CARTO's basemaps now answer an unkeyed request with a 2KB "API KEY REQUIRED" watermark
       instead of a map: HTTP 200, so nothing in the code notices, and the only symptom is the
       words printed across the tiles. OSM needs no key. It has no retina variant and no
       subdomains, which is why both of those options are gone rather than merely unused. */
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const heaviest = Math.max(1, ...data.nodes.map((n) => n.trips));

    if (mode === 'trips') {
      /* How many journeys already drawn on this corridor, so each new one bows a little wider
         instead of landing on the last. Keyed by the ORDERED pair: DXB→DMM and DMM→DXB bow to
         opposite sides already, so they do not need to be told apart here. */
      const rankOf = new Map<string, number>();

      data.trips.forEach((trip, index) => {
        const colour = tripColour(index);
        const dimmed = highlightCode !== null && trip.code !== highlightCode;
        for (const legPath of trip.legs) {
          if (!legPath.from || !legPath.to) continue;
          const key = `${legPath.origin}>${legPath.destination}`;
          const rank = rankOf.get(key) ?? 0;
          rankOf.set(key, rank + 1);

          L.polyline(bowed(legPath.from, legPath.to, rank), {
            color: colour,
            weight: dimmed ? 1 : 2,
            opacity: dimmed ? 0.12 : 0.75,
            /* An inferred return leg is dashed. The reader can see at a glance which half of a
               journey the feed actually recorded and which half was deduced from
               `direction = Return`. */
            dashArray: legPath.inferred ? '4 5' : undefined,
          })
            .addTo(map)
            .bindTooltip(tripTooltip(trip, index), { sticky: true });
        }
      });
    } else {
      const busiest = Math.max(1, ...data.routes.map((r) => r.trips));
      /* Routes under the markers, so a dot is never hidden by a line through it. */
      for (const r of data.routes) {
        if (!r.from || !r.to) continue;
        L.polyline(
          [
            [r.from.lat, r.from.lon],
            [r.to.lat, r.to.lon],
          ],
          {
            color: '#307c4c',
            /* Weight carries volume. Floored at 1 so a single trip is still visible: a route
               nobody can see is a route the reader will conclude does not exist. */
            weight: Math.max(1, Math.round((r.trips / busiest) * 5)),
            opacity: 0.25 + 0.45 * (r.trips / busiest),
          },
        )
          .addTo(map)
          .bindTooltip(
            `<strong>${r.label}</strong><br/>${r.trips} ${r.trips === 1 ? 'trip' : 'trips'}`,
            { sticky: true },
          );
      }
    }

    for (const n of data.nodes) {
      L.circleMarker([n.lat, n.lon], {
        radius: 4 + Math.round((n.trips / heaviest) * 10),
        color: '#1F2937',
        weight: 1.5,
        fillColor: mode === 'trips' ? '#FFFFFF' : '#1F5D9C',
        fillOpacity: mode === 'trips' ? 0.9 : 0.45,
      })
        .addTo(map)
        .bindTooltip(
          `<strong>${n.city} (${n.code})</strong><br/>${n.country}<br/>` +
            `${n.trips} ${n.trips === 1 ? 'appearance' : 'appearances'} · ` +
            `${n.departures} out, ${n.arrivals} in`,
          { sticky: true },
        );
    }

    /* `data` fits what is actually plotted, so a traveller who only flew within the Gulf is not
       shown an empty world with four dots in the corner. `mena` opens on the region instead,
       for the board where the long tail to Jakarta would otherwise set the scale for everyone. */
    if (fit === 'mena') {
      map.fitBounds(L.latLngBounds(MENA_BOUNDS), { padding: [8, 8] });
    } else if (data.nodes.length) {
      const bounds = L.latLngBounds(data.nodes.map((n) => [n.lat, n.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 6 });
    }

    /* The container is sized by an aspect ratio on the board, so its height is not known until
       layout runs — and Leaflet caches the size it saw at construction. Without this the tiles
       are laid out for the wrong box and the map ends up grey below the fold. */
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [data, mode, highlightCode, fit]);

  return <div ref={containerRef} style={{ height }} className="h-full w-full rounded-xl" />;
}
