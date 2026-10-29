'use client';

import { formatDate } from '@/lib/format';
import { routeInWords } from '@/lib/travel-analytics/airports';
import type { TravellerProfile, TravellerTrip } from '@/lib/travel-analytics/queries';
import TravelMap from '../../TravelMap';
import TravelTypes from '../../TravelTypes';

/* Rounded thousands, for the summary cards only. A card is a magnitude at a glance and `$3.3k`
   is the right amount of precision there. */
const usdShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

/* To the cent, everywhere a reader might reconcile the figure against something else.
   A trip row is a price somebody paid and a year subtotal is the sum of the rows under it;
   `$1.2k` against an invoice is not a number anyone can check, and a column of rounded
   thousands does not visibly add up to its own heading. */
const usdExact = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const STATUS_TONE: Record<string, string> = {
  Approved: 'bg-[#307c4c]/10 text-[#1f5733]',
  Rejected: 'bg-red-50 text-red-700',
  'Pending Approval': 'bg-amber-50 text-amber-800',
};

/**
 * Everything one person has travelled, newest first.
 *
 * Grouped by year rather than listed flat. A travel history is read as "what have they been
 * doing lately", and a year heading answers that without the reader counting dates; with 10
 * trips it is cosmetic, and the people who matter here have far more than 10.
 *
 * Every trip shows its money, its route, its type and its status together, because the
 * questions asked of this page are comparative: is this person always in Business, do they
 * always book late, is one route most of their spend.
 */
export default function TravellerProfileClient({ profile }: { profile: TravellerProfile }) {
  const byYear = new Map<string, TravellerTrip[]>();
  for (const t of profile.trips) {
    /* A trip with no departure date still belongs somewhere. "Undated" sorts last rather than
       being dropped or pretending to a year it does not have. */
    const year = t.departureDate ? t.departureDate.slice(0, 4) : 'Undated';
    const list = byYear.get(year) ?? [];
    list.push(t);
    byYear.set(year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    return b.localeCompare(a);
  });

  const violations = profile.trips.reduce((s, t) => s + t.violations.length, 0);
  const lateBookings = profile.trips.filter(
    (t) => t.leadDays !== null && t.leadDays >= 0 && t.leadDays < 7,
  ).length;

  return (
    <div className="space-y-4">
      {/* ── Who ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {[
                profile.email,
                `Employee ${profile.employeeId}`,
                profile.nationality,
                profile.countries.length ? profile.countries.join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {profile.passportExpiry && (
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Passport expires
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {formatDate(profile.passportExpiry)}
              </div>
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { k: 'Trips', v: String(profile.trips.length) },
            {
              k: 'Share of spend',
              v: usdShort(profile.totalSpendUsd),
              note: `${profile.pricedTrips} of ${profile.trips.length} priced`,
            },
            { k: 'Countries', v: String(profile.countries.length) },
            { k: 'Policy flags', v: String(violations) },
            { k: 'Booked inside 7 days', v: String(lateBookings) },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-slate-200 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {c.k}
              </dt>
              <dd className="mt-0.5 text-lg font-bold text-slate-900">{c.v}</dd>
              {c.note && <p className="text-[10px] text-slate-400">{c.note}</p>}
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[10px] text-slate-400">
          Share of spend splits a booking across everyone travelling on it, so a family reservation
          is not counted five times over.
        </p>
      </section>

      <PolicyBand trips={profile.trips} />

      {/* Journeys by default here: one person has a handful of trips, which is exactly the
          case where a colour per booking reads and a corridor roll-up tells you nothing. */}
      <TravelMap
        data={profile.map}
        title="Where this person flies"
        height={360}
        defaultMode="trips"
      />

      <TravelTypes band={profile.travelTypes} />

      {/* ── Every trip ── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Every trip</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Newest first. Everything in scope for you, which may be fewer trips than this person has
            taken if your access is limited to some countries.
          </p>
        </div>

        {profile.trips.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No trips in scope.</p>
        ) : (
          years.map((year) => (
            <div key={year}>
              <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-y border-slate-100 bg-slate-50 px-4 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {year}
                </span>
                <span className="text-[11px] text-slate-400">
                  {byYear.get(year)!.length} {byYear.get(year)!.length === 1 ? 'trip' : 'trips'} ·{' '}
                  {usdExact(byYear.get(year)!.reduce((s, t) => s + t.amountUsd, 0))}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {byYear.get(year)!.map((t) => (
                  <li key={t.code} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {t.route}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t.departureDate ? formatDate(t.departureDate) : 'No departure date'}
                        </span>
                        {t.travelType && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {t.travelType}
                          </span>
                        )}
                        {t.cabinClass && t.cabinClass !== 'Economy' && (
                          <span className="rounded-full bg-[#8A6D2F]/10 px-2 py-0.5 text-[10px] font-semibold text-[#8A6D2F]">
                            {t.cabinClass}
                          </span>
                        )}
                        {t.status && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              STATUS_TONE[t.status] ?? 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {t.status}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {t.amountUsd > 0 ? usdExact(t.amountUsd) : '—'}
                      </span>
                    </div>

                    {/* The codes above are what the booking says; this is what they mean.
                        Shown only when the airport table knows at least one end, because
                        "DXB to ZZZ" restates the line above it and earns nothing. */}
                    {routeInWords(t.origin, t.destination) && (
                      <div className="mt-0.5 text-xs text-slate-600">
                        {routeInWords(t.origin, t.destination)}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="font-mono">{t.code}</span>
                      {t.direction && <span>{t.direction}</span>}
                      {t.carriers.length > 0 && <span>{t.carriers.join(' · ')}</span>}
                      {t.country && <span>{t.country}</span>}
                      {t.costCentre && (
                        <span title={t.department ?? undefined}>
                          {t.costCentre}
                          {t.department ? ` · ${t.department}` : ''}
                        </span>
                      )}
                      {/* Negative lead time is the 44-booking data problem showing up on one
                          person's row. Said plainly rather than rendered as a tidy number. */}
                      {t.leadDays !== null && (
                        <span className={t.leadDays < 0 ? 'font-semibold text-[#8A4B00]' : ''}>
                          {t.leadDays < 0
                            ? `booked ${Math.abs(t.leadDays)} days AFTER departure`
                            : `booked ${t.leadDays} ${t.leadDays === 1 ? 'day' : 'days'} ahead`}
                        </span>
                      )}
                    </div>

                    {t.violations.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {t.violations.map((v, i) => (
                          <span
                            key={`${t.code}-${i}`}
                            className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}

                    {t.justification && (
                      <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-500">
                        {t.justification}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * This person's policy record.
 *
 * The same three rules the board counts, counted for one person. Worth its own block rather
 * than only the red chips on each trip: chips answer "was this trip flagged" and a manager
 * looking at somebody is asking "is this a pattern", which is a different question and needs
 * the denominator next to it.
 *
 * The rate is over trips, not over flags: one trip can break two rules, and a "120% violation
 * rate" is the kind of figure that gets a dashboard disbelieved.
 */
function PolicyBand({ trips }: { trips: TravellerTrip[] }) {
  const counts = new Map<string, number>();
  for (const t of trips) {
    for (const v of t.violations) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const flaggedTrips = trips.filter((t) => t.violations.length > 0).length;
  const rows = [...counts.entries()].sort((a, z) => z[1] - a[1]);

  if (trips.length === 0) return null;

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Policy</h3>
        <p className="mt-1 text-sm text-[#1f5733]">
          No policy flags on any of {trips.length} {trips.length === 1 ? 'trip' : 'trips'} in scope.
        </p>
      </section>
    );
  }

  const worst = Math.max(...rows.map(([, n]) => n));
  const rate = Math.round((flaggedTrips / trips.length) * 100);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Policy</h3>
        <p className="text-xs text-slate-500">
          {flaggedTrips} of {trips.length} {trips.length === 1 ? 'trip' : 'trips'} flagged ·{' '}
          <span className="font-semibold text-[#B71C1C]">{rate}%</span>
        </p>
      </div>
      <ul className="space-y-1.5">
        {rows.map(([label, n]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="w-[42%] shrink-0 truncate text-[11px] text-slate-600" title={label}>
              {label}
            </span>
            <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded bg-[#B71C1C]/70"
                style={{ width: `${Math.max(2, (n / worst) * 100)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-700">
              {n} {n === 1 ? 'trip' : 'trips'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-slate-400">
        A trip can break more than one rule, so these add up to more than the flagged count. The
        rate above is trips flagged, not flags raised.
      </p>
    </section>
  );
}
