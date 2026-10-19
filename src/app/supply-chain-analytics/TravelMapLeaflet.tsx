'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapData } from '@/lib/travel-analytics/routes';

/**
 * Where the travel goes.
 *
 * Same shape as the TI-TE map: Leaflet with CARTO's English raster tiles, imported only on the
 * client because Leaflet reaches for `window` at module load. The caller wraps it in
 * `next/dynamic` with `ssr: false`; this file never renders on the server.
 *
 * AIRPORTS, NOT COUNTRIES. TI-TE plots countries because a shipment moves between them. A
 * flight moves between airports, and collapsing to countries would merge Dubai with Dubai World
 * Central and lose every domestic leg. The coordinates come from `airports.ts`, which is a
 * curated table; anything it cannot place is counted and named by the caller rather than
 * silently left off.
 *
 * Lines are straight rather than great circles. Over these distances - almost everything inside
 * one region - the difference is a few pixels, and a curve would imply a flight path the data
 * does not contain.
 */
export default function TravelMapLeaflet({ data, height }: { data: MapData; height: number }) {
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

    const busiest = Math.max(1, ...data.routes.map((r) => r.trips));
    const heaviest = Math.max(1, ...data.nodes.map((n) => n.trips));

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

    for (const n of data.nodes) {
      L.circleMarker([n.lat, n.lon], {
        radius: 4 + Math.round((n.trips / heaviest) * 10),
        color: '#1F5D9C',
        weight: 1.5,
        fillColor: '#1F5D9C',
        fillOpacity: 0.45,
      })
        .addTo(map)
        .bindTooltip(
          `<strong>${n.city} (${n.code})</strong><br/>${n.country}<br/>` +
            `${n.trips} ${n.trips === 1 ? 'appearance' : 'appearances'} · ` +
            `${n.departures} out, ${n.arrivals} in`,
          { sticky: true },
        );
    }

    /* Fit to what is actually plotted rather than a fixed view, so a traveller who only flew
       within the Gulf is not shown an empty world with four dots in the corner. */
    if (data.nodes.length) {
      const bounds = L.latLngBounds(data.nodes.map((n) => [n.lat, n.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 6 });
    }

    return () => {
      map.remove();
    };
  }, [data]);

  return <div ref={containerRef} style={{ height }} className="w-full rounded-xl" />;
}
