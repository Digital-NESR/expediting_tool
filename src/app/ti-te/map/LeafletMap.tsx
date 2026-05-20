'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Shipment } from '@/types/tite';
import { BUCKET_HEX, ALERT_LABEL } from '@/lib/tite-utils';

/* ─── Country coordinates ─────────────────────────────────────── */

const COORDS: Record<string, [number, number]> = {
  'Saudi Arabia (KSA)': [24.7,   46.7],
  'UAE':                [23.4,   53.8],
  'Qatar':              [25.3,   51.5],
  'Kuwait':             [29.4,   47.9],
  'Oman':               [23.6,   58.6],
  'Bahrain':            [26.2,   50.6],
  'Egypt':              [26.8,   30.8],
  'Algeria':            [28.0,    1.7],
  'Iraq':               [33.2,   43.7],
  'Libya':              [26.3,   17.2],
  'Chad':               [15.5,   18.7],
  'Congo':              [-0.2,   15.8],
  'USA':                [37.1,  -95.7],
  'Canada':             [56.1, -106.3],
  'UK':                 [55.4,   -3.4],
  'France':             [46.2,    2.2],
  'Germany':            [51.2,   10.5],
};

const ALERT_ORDER = ['ok', 'closed', 'info', 'plan', 'action', 'urgent', 'overdue'];

function worstOf(levels: string[]): string {
  return levels.reduce((w, l) =>
    ALERT_ORDER.indexOf(l) > ALERT_ORDER.indexOf(w) ? l : w, 'ok');
}

/** Quadratic bezier arc between two lat/lng points. */
function arcPoints(from: [number, number], to: [number, number], segments = 24): [number, number][] {
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const dLat   = to[0] - from[0];
  const dLng   = to[1] - from[1];
  // Control point perpendicular to midpoint for curvature
  const curvature = 0.25;
  const ctrlLat = midLat - dLng * curvature;
  const ctrlLng = midLng + dLat * curvature;
  const pts: [number, number][] = [];
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

    let L: typeof import('leaflet');
    let map: import('leaflet').Map;

    import('leaflet').then(mod => {
      L = mod;
      if (!containerRef.current) return;

      map = L.map(containerRef.current, { zoomControl: true }).setView([25, 45], 4);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      /* ── Build per-country data ── */
      const countryMeta: Record<string, { alertLevels: string[]; shipments: Shipment[] }> = {};

      for (const s of shipments) {
        for (const country of [s.from_country, s.to_country]) {
          if (!country || !COORDS[country]) continue;
          if (!countryMeta[country]) countryMeta[country] = { alertLevels: [], shipments: [] };
          countryMeta[country].alertLevels.push(s.alert_level);
          if (!countryMeta[country].shipments.find(x => x.id === s.id)) {
            countryMeta[country].shipments.push(s);
          }
        }
      }

      /* ── Draw arcs first (under markers) ── */
      for (const s of shipments) {
        const from = COORDS[s.from_country || ''];
        const to   = COORDS[s.to_country   || ''];
        if (!from || !to || s.from_country === s.to_country) continue;

        const color = BUCKET_HEX[s.alert_level] || '#94a3b8';
        L.polyline(arcPoints(from, to), {
          color,
          weight:  1.8,
          opacity: 0.55,
        }).addTo(map);
      }

      /* ── Draw country markers ── */
      for (const [country, meta] of Object.entries(countryMeta)) {
        const coords = COORDS[country];
        if (!coords) continue;

        const count = meta.shipments.length;
        const worst = worstOf(meta.alertLevels);
        const color = BUCKET_HEX[worst] || '#94a3b8';

        const circle = L.circleMarker(coords, {
          radius:      6 + Math.min(count * 2, 14),
          fillColor:   color,
          color:       '#fff',
          weight:      2,
          opacity:     1,
          fillOpacity: 0.85,
        }).addTo(map);

        const rows = meta.shipments
          .map(s => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="width:8px;height:8px;border-radius:50%;background:${BUCKET_HEX[s.alert_level] || '#94a3b8'};flex-shrink:0"></span>
              <span style="font-size:12px;color:#0f172a;font-weight:600">${s.reference_number || `#${s.id}`}</span>
              <span style="font-size:11px;color:#64748b">${ALERT_LABEL[s.alert_level] || s.alert_level}</span>
            </div>`)
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
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)?.remove();
    };
  }, [shipments]);

  return <div ref={containerRef} className="w-full h-full" />;
}
