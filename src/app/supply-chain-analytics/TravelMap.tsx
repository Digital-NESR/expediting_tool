'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { MapData } from '@/lib/travel-analytics/routes';
import { tripColour, type MapFit, type MapMode } from './TravelMapLeaflet';

/**
 * The map, with everything it is not showing said out loud.
 *
 * Leaflet touches `window` at module load, so the map itself arrives through `next/dynamic`
 * with `ssr: false` — the same arrangement as the TI-TE map.
 *
 * The notes under it are the point of this wrapper. A map is the easiest visual to over-trust:
 * what is drawn looks like everything there is. So an airport the coordinate table cannot
 * place, and a booking with no route on it at all, are both counted and named here instead of
 * being quietly absent.
 */

const TravelMapLeaflet = dynamic(() => import('./TravelMapLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
      Loading map…
    </div>
  ),
});

const MODES: { id: MapMode; label: string; hint: string }[] = [
  {
    id: 'routes',
    label: 'Corridors',
    hint: 'One line per route, weighted by how many trips use it',
  },
  {
    id: 'trips',
    label: 'Journeys',
    hint: 'One colour per booking, every leg of it the same colour',
  },
];

export default function TravelMap({
  data,
  title = 'Where the travel goes',
  height = 360,
  aspect = false,
  fit = 'data',
  defaultMode = 'routes',
}: {
  data: MapData;
  title?: string;
  /** Fixed pixel height. Ignored when `aspect` is set. */
  height?: number;
  /** Size the map 16:9 against its own width instead of pinning a height. */
  aspect?: boolean;
  fit?: MapFit;
  defaultMode?: MapMode;
}) {
  const [mode, setMode] = useState<MapMode>(defaultMode);
  const [highlight, setHighlight] = useState<string | null>(null);
  const plottedTrips = data.nodes.reduce((s, n) => s + n.departures, 0);
  const inferredTrips = data.trips.filter((t) => t.hasInferredLegs).length;

  /* The legend names journeys, and twelve is where the palette starts repeating — past that a
     swatch stops identifying anything and the list is just long. */
  const legend = data.trips.slice(0, 12);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {data.nodes.length} {data.nodes.length === 1 ? 'airport' : 'airports'} ·{' '}
            {mode === 'trips'
              ? `${data.trips.length} ${data.trips.length === 1 ? 'journey' : 'journeys'}`
              : `${data.routes.length} ${data.routes.length === 1 ? 'route' : 'routes'}`}
          </p>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  mode === m.id ? 'text-white' : 'bg-white text-slate-500'
                }`}
                style={mode === m.id ? { background: '#307c4c' } : undefined}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.nodes.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
          No routes to plot.
        </div>
      ) : aspect ? (
        /* 16:9 against the column's own width, so the map grows with the page instead of
           sitting at a height somebody picked once against one screen. */
        <div className="aspect-video w-full">
          <TravelMapLeaflet
            data={data}
            height="100%"
            mode={mode}
            fit={fit}
            highlightCode={highlight}
          />
        </div>
      ) : (
        <TravelMapLeaflet
          data={data}
          height={height}
          mode={mode}
          fit={fit}
          highlightCode={highlight}
        />
      )}

      {mode === 'trips' && legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((trip, index) => (
            <button
              key={trip.code}
              type="button"
              onMouseEnter={() => setHighlight(trip.code)}
              onMouseLeave={() => setHighlight(null)}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <span
                className="h-2 w-4 shrink-0 rounded-sm"
                style={{ background: tripColour(index) }}
              />
              <span className="font-medium">{trip.label}</span>
              {trip.travellerName && <span className="text-slate-400">{trip.travellerName}</span>}
            </button>
          ))}
          {data.trips.length > legend.length && (
            <span className="text-[11px] text-slate-400">
              and {data.trips.length - legend.length} more, all drawn — colours repeat past twelve,
              so hover a line for which trip it is.
            </span>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1">
        <p className="text-[10px] text-slate-400">
          {mode === 'trips' ? (
            <>
              One colour per booking; every leg of a journey shares it. Lines are bowed to the left
              of travel so an outbound and its return separate instead of overlapping — the curve is
              spacing, not a flight path. Dashed legs were inferred from the booking direction
              rather than read from a recorded segment.
            </>
          ) : (
            <>
              Line weight is trips on that route; circle size is how often an airport appears at
              either end. {plottedTrips} plotted {plottedTrips === 1 ? 'journey' : 'journeys'}.
            </>
          )}
        </p>
        {mode === 'trips' && inferredTrips > 0 && (
          <p className="text-[11px] text-slate-500">
            {inferredTrips} of {data.trips.length}{' '}
            {inferredTrips === 1 ? 'journey has a return leg' : 'journeys have a return leg'} that
            is not in the segment feed, drawn dashed from the booking&apos;s own direction.
          </p>
        )}
        {fit === 'mena' && (
          <p className="text-[11px] text-slate-500">
            Opens on MENA. Travel to India, Indonesia and Malaysia is drawn too — pan or zoom out to
            reach it.
          </p>
        )}
        {data.unplotted.length > 0 && (
          <p className="text-[11px] font-semibold text-[#8A4B00]">
            {data.unplotted.length} {data.unplotted.length === 1 ? 'airport has' : 'airports have'}{' '}
            no coordinate and {data.unplotted.length === 1 ? 'is' : 'are'} not drawn:{' '}
            {data.unplotted
              .slice(0, 8)
              .map((u) => `${u.code} (${u.trips})`)
              .join(', ')}
            {data.unplotted.length > 8 ? ` and ${data.unplotted.length - 8} more` : ''}.
          </p>
        )}
        {data.withoutRoute > 0 && (
          <p className="text-[11px] text-slate-500">
            {data.withoutRoute} {data.withoutRoute === 1 ? 'booking carries' : 'bookings carry'} no
            origin or destination, so {data.withoutRoute === 1 ? 'it is' : 'they are'} on no route
            here.
          </p>
        )}
      </div>
    </section>
  );
}
