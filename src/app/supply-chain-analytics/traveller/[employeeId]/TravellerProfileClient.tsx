'use client';

import { formatDate } from '@/lib/format';
import type { TravellerProfile, TravellerTrip } from '@/lib/travel-analytics/queries';
import TravelMap from '../../TravelMap';
import TravelTypes from '../../TravelTypes';

const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

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
              v: usd(profile.totalSpendUsd),
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

      <TravelMap data={profile.map} title="Where this person flies" height={300} />

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
                  {usd(byYear.get(year)!.reduce((s, t) => s + t.amountUsd, 0))}
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
                        {t.amountUsd > 0 ? usd(t.amountUsd) : '—'}
                      </span>
                    </div>

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
