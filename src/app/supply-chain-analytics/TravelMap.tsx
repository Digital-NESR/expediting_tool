'use client';

import dynamic from 'next/dynamic';
import type { MapData } from '@/lib/travel-analytics/routes';

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
    <div className="flex h-[360px] w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
      Loading map…
    </div>
  ),
});

export default function TravelMap({
  data,
  title = 'Where the travel goes',
  height = 360,
}: {
  data: MapData;
  title?: string;
  height?: number;
}) {
  const plottedTrips = data.nodes.reduce((s, n) => s + n.departures, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          {data.nodes.length} {data.nodes.length === 1 ? 'airport' : 'airports'} ·{' '}
          {data.routes.length} {data.routes.length === 1 ? 'route' : 'routes'}
        </p>
      </div>

      {data.nodes.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
          No routes to plot.
        </div>
      ) : (
        <TravelMapLeaflet data={data} height={height} />
      )}

      <div className="mt-2 space-y-1">
        <p className="text-[10px] text-slate-400">
          Line weight is trips on that route; circle size is how often an airport appears at either
          end. {plottedTrips} plotted {plottedTrips === 1 ? 'journey' : 'journeys'}.
        </p>
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
