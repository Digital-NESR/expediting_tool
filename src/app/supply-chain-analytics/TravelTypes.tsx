'use client';

import type { TravelTypeBand } from '@/lib/travel-analytics/routes';

/**
 * How the three kinds of trip differ.
 *
 * Worth its own band because the types are not small variations on each other. On the current
 * feed vacation travel is 12% of trips and the most expensive ticket by a wide margin, which is
 * invisible in any chart that only counts bookings or only sums spend.
 *
 * Average ticket is over PRICED bookings only, and the card says so. 90 of 230 bookings carry
 * no value, and averaging over them would measure the hole in the feed rather than the cost of
 * a seat.
 */

const TONES = ['#307c4c', '#1F5D9C', '#8A6D2F', '#8E4585', '#A85438'];

const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

export default function TravelTypes({ band }: { band: TravelTypeBand }) {
  if (!band.rows.length) {
    return null;
  }

  const toneFor = (type: string) => TONES[band.types.indexOf(type) % TONES.length];
  const mostTrips = Math.max(1, ...band.rows.map((r) => r.trips));
  const dearest = Math.max(1, ...band.rows.map((r) => r.averageTicketUsd ?? 0));
  const tallestMonth = Math.max(
    1,
    ...band.byMonth.map((m) => Object.values(m.counts).reduce((s, n) => s + n, 0)),
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">Travel by type</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Average ticket is over priced bookings only, so the ones carrying no value do not drag it
          down.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {band.rows.map((r) => (
          <div
            key={r.type}
            className="rounded-xl border border-slate-200 p-3"
            style={{ borderTopColor: toneFor(r.type), borderTopWidth: 3 }}
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {r.type}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: toneFor(r.type) }}>
                {r.trips}
              </span>
              <span className="text-[11px] text-slate-400">trips</span>
            </div>
            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Spend</dt>
                <dd className="font-mono tabular-nums text-slate-800">{usd(r.spendUsd)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Avg ticket</dt>
                <dd className="font-mono tabular-nums font-bold text-slate-900">
                  {r.averageTicketUsd === null ? '—' : usd(r.averageTicketUsd)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Priced of total</dt>
                <dd className="font-mono tabular-nums text-slate-500">
                  {r.pricedTrips}/{r.trips}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Above Economy</dt>
                <dd className="font-mono tabular-nums text-slate-500">{r.premiumTrips}</dd>
              </div>
              {r.topRoute && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Top route</dt>
                  <dd className="truncate font-mono text-slate-700" title={r.topRoute}>
                    {r.topRoute}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>

      {/* Two bars rather than one, because trips and average ticket rank the types differently
          and that inversion is the finding. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            By trips
          </div>
          <ul className="space-y-1.5">
            {band.rows.map((r) => (
              <li key={r.type} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-slate-600">{r.type}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${Math.max(1, (r.trips / mostTrips) * 100)}%`,
                      background: toneFor(r.type),
                    }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-700">
                  {r.trips}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            By average ticket
          </div>
          <ul className="space-y-1.5">
            {band.rows.map((r) => (
              <li key={r.type} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-slate-600">{r.type}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${Math.max(1, ((r.averageTicketUsd ?? 0) / dearest) * 100)}%`,
                      background: toneFor(r.type),
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-700">
                  {r.averageTicketUsd === null ? '—' : usd(r.averageTicketUsd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {band.byMonth.length > 1 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Mix over time
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 90 }}>
            {band.byMonth.map((m) => {
              const total = Object.values(m.counts).reduce((s, n) => s + n, 0);
              return (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-t"
                    style={{ height: `${(total / tallestMonth) * 100}%` }}
                    title={`${m.label}: ${band.types
                      .map((t) => `${t} ${m.counts[t] ?? 0}`)
                      .join(', ')}`}
                  >
                    {band.types.map((t) =>
                      (m.counts[t] ?? 0) > 0 ? (
                        <div
                          key={t}
                          style={{
                            height: `${((m.counts[t] ?? 0) / total) * 100}%`,
                            background: toneFor(t),
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <span className="truncate text-[9px] text-slate-400">{m.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {band.types.map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: toneFor(t) }}
                />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
