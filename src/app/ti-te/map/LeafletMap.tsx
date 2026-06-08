'use client';

// Safe to import directly — this file is loaded only via
// dynamic(() => import('./LeafletMap'), { ssr: false }), so it
// never runs on the server and `window` is always available.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Shipment } from '@/types/tite';
import { BUCKET_HEX, ALERT_LABEL } from '@/lib/tite-utils';

/* ─── Country coordinates ─────────────────────────────────────── */

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Saudi Arabia (KSA)':         [24.7,   46.7],
  'United Arab Emirates (UAE)': [23.4,   53.8],
  'Qatar':                      [25.3,   51.5],
  'Kuwait':                     [29.4,   47.9],
  'Oman':                       [23.6,   58.6],
  'Bahrain':                    [26.2,   50.6],
  'Egypt':                      [26.8,   30.8],
  'Algeria':                    [28.0,    1.7],
  'Iraq':                       [33.2,   43.7],
  'Libya':                      [26.3,   17.2],
  'Chad':                       [15.5,   18.7],
  'Congo':                      [-0.2,   15.8],
  'USA':                        [37.1,  -95.7],
  'Canada':                     [56.1, -106.3],
  'UK':                         [55.4,   -3.4],
  'France':                     [46.2,    2.2],
  'Germany':                    [51.2,   10.5],
};

/* Lowercase alias → canonical key in COUNTRY_COORDS */
const ALIASES: Record<string, string> = {
  'ksa':                           'Saudi Arabia (KSA)',
  'saudi arabia':                  'Saudi Arabia (KSA)',
  'saudi arabia (ksa)':            'Saudi Arabia (KSA)',
  'uae':                           'United Arab Emirates (UAE)',
  'united arab emirates':          'United Arab Emirates (UAE)',
  'united arab emirates (uae)':    'United Arab Emirates (UAE)',
  'usa':                           'USA',
  'united states':                 'USA',
  'united states of america':      'USA',
  'uk':                            'UK',
  'united kingdom':                'UK',
  'great britain':                 'UK',
};

function getCountryCoords(name: string): [number, number] | null {
  const normalised = name.trim().toLowerCase();
  const canonical =
    ALIASES[normalised] ??
    Object.keys(COUNTRY_COORDS).find(k => k.toLowerCase() === normalised);
  return canonical ? COUNTRY_COORDS[canonical] : null;
}

/* ─── Movement color ─────────────────────────────────────────── */

function getMovementColor(movementType: string | null | undefined): string {
  return movementType === 'Temporary Import' ? '#3b82f6' : '#22c55e';
}

/* ─── Arc helper ──────────────────────────────────────────────── */

/** Quadratic bezier arc — returns [lat, lng] tuples. */
function arcPoints(
  from: [number, number],
  to: [number, number],
  segments = 24,
): L.LatLngTuple[] {
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const dLat   = to[0] - from[0];
  const dLng   = to[1] - from[1];
  const curvature = 0.25;
  const ctrlLat = midLat - dLng * curvature;
  const ctrlLng = midLng + dLat * curvature;

  const pts: L.LatLngTuple[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push([
      (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * ctrlLat + t ** 2 * to[0],
      (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * ctrlLng + t ** 2 * to[1],
    ]);
  }
  return pts;
}

/* ─── Component ───────────────────────────────────────────────── */

export default function LeafletMap({ shipments }: { shipments: Shipment[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Guard against React Strict Mode double-invocation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((containerRef.current as any)._leaflet_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (containerRef.current as any)._leaflet_id = null;
    }

    const map = L.map(containerRef.current, { zoomControl: true }).setView([25, 45], 4);

    /* ── English-language CartoDB tiles ── */
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    /* ── Debug: log unique country strings from DB ── */
    const uniqueCountries = [
      ...new Set(shipments.flatMap(s => [
        ...(s.from_country ?? '').split(',').map(c => c.trim()).filter(Boolean),
        s.to_country,
      ].filter(Boolean))),
    ].sort();
    console.log('[LeafletMap] unique from/to countries in shipments data:', uniqueCountries);

    /* ── Build per-country metadata ── */
    const countryMeta: Record<string, { movementTypes: string[]; shipments: Shipment[] }> = {};

    for (const s of shipments) {
      // from_country may be comma-separated (e.g. "UAE, KSA") — expand each
      const fromList = (s.from_country ?? '').split(',').map(c => c.trim()).filter(Boolean);
      const allCountries = [...fromList, s.to_country].filter((c): c is string => !!c);
      for (const country of allCountries) {
        const coords = getCountryCoords(country);
        if (!coords) continue;
        if (!countryMeta[country]) countryMeta[country] = { movementTypes: [], shipments: [] };
        countryMeta[country].movementTypes.push(s.movement_type ?? '');
        if (!countryMeta[country].shipments.find(x => x.id === s.id)) {
          countryMeta[country].shipments.push(s);
        }
      }
    }

    /* ── Draw arc lines first (rendered under circle markers) ── */
    for (const s of shipments) {
      const to = getCountryCoords(s.to_country ?? '');
      if (!to) continue;
      // from_country may be comma-separated — draw a separate arc for each origin
      const fromList = (s.from_country ?? '').split(',').map(c => c.trim()).filter(Boolean);
      const color = BUCKET_HEX[s.alert_level] ?? '#94a3b8';
      for (const fromName of fromList) {
        const from = getCountryCoords(fromName);
        if (!from) continue;
        if (fromName.toLowerCase() === (s.to_country ?? '').trim().toLowerCase()) continue;
        L.polyline(arcPoints(from, to), {
          color,
          weight:  2,
          opacity: 0.7,
        }).addTo(map);
      }
    }

    /* ── Draw country circle markers ── */
    for (const [country, meta] of Object.entries(countryMeta)) {
      const coords = getCountryCoords(country);
      if (!coords) continue;

      const count = meta.shipments.length;
      // Blue if any imports present (imports take priority), green if exports only
      const hasImport = meta.movementTypes.some(t => t === 'Temporary Import');
      const color = hasImport ? '#3b82f6' : '#22c55e';

      const circle = L.circleMarker(coords, {
        radius:      6 + Math.min(count * 2, 14),
        fillColor:   color,
        color:       '#fff',
        weight:      2,
        opacity:     1,
        fillOpacity: 0.85,
      }).addTo(map);

      const rows = meta.shipments
        .map(
          s => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="width:8px;height:8px;border-radius:50%;background:${getMovementColor(s.movement_type)};flex-shrink:0"></span>
            <span style="font-size:12px;color:#0f172a;font-weight:600">${s.reference_number ?? `#${s.id}`}</span>
            <span style="font-size:11px;color:#64748b">${ALERT_LABEL[s.alert_level] ?? s.alert_level}</span>
          </div>`,
        )
        .join('');

      circle.bindPopup(`
        <div style="min-width:170px;font-family:ui-sans-serif,system-ui,sans-serif">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#0f172a">${country}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
            ${count} active shipment${count !== 1 ? 's' : ''}
          </div>
          ${rows}
        </div>
      `);
    }

    return () => {
      map.remove();
    };
  }, [shipments]);

  return <div ref={containerRef} className="w-full h-full" />;
}
