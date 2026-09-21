'use client';

import { daysFromToday } from '../lib/date';
import { displayStatus } from '../lib/helpers';
import { shapeRow } from '../lib/shapeRow';
import type { RegistryApp } from '../lib/useRegistryApp';

/** KPI accents. Kept as a pair because the bar and the figure share a colour. */
const ACCENT = {
  amber: { bar: 'bg-amber-500', text: 'text-amber-600' },
  red: { bar: 'bg-red-500', text: 'text-red-600' },
  green: { bar: 'bg-[#307c4c]', text: 'text-[#307c4c]' },
} as const;

export default function ExpiryScreen({ app }: { app: RegistryApp }) {
  const counts = (status: string) => app.records.filter((r) => displayStatus(r) === status).length;
  const dated = app.records
    .filter((r) => r.expiry)
    .map((r) => ({ r, d: daysFromToday(r.expiry as string) }))
    .filter((x) => x.d <= 90)
    .sort((a, b) => a.d - b.d);

  const kpis = [
    {
      label: 'Expiring in 60 days',
      value: counts('Expiring soon'),
      sub: 'shown as Expiring soon in the registry',
      accent: ACCENT.amber,
    },
    {
      label: 'Expired',
      value: counts('Expired'),
      sub: 'SAP reference is non-compliant',
      accent: ACCENT.red,
    },
    {
      label: 'Extended this period',
      value: counts('Extended'),
      sub: 'original Registry ID retained',
      accent: ACCENT.green,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">
          Expiry &amp; Periodic Review
        </h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500">
          Anything within 90 days of expiry is listed below, and from 60 days out it shows as
          &ldquo;Expiring soon&rdquo; across the registry. Reminders go to the requestor and both
          validators at 60, 30, 14, 7, 5, 3, 2 and 1 days before expiry, on the expiry date itself,
          and weekly after that until the record is renewed or the supplier account is closed — see
          the Expiry Reminders panel on any record for what has been sent. A successful review keeps
          the original Registry ID and extends expiry by a further 12 months.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className={`h-1 ${k.accent.bar}`} />
            <div className="px-4 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {k.label}
              </p>
              <p className={`mt-1 text-3xl font-bold leading-none ${k.accent.text}`}>{k.value}</p>
              <p className="mt-1 text-[11.5px] text-slate-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-[13px] font-bold text-slate-800">
          Review queue — soonest expiry first
        </div>

        {dated.map((x) => {
          const sh = shapeRow(x.r);
          const pct = Math.max(0, Math.min(100, Math.round((1 - Math.max(x.d, 0) / 90) * 100)));
          const overdue = x.d < 0;
          const barPct = (overdue ? 100 : pct) + '%';
          const barColor = overdue || x.d <= 30 ? 'bg-red-500' : 'bg-amber-500';
          const reviewNote = overdue
            ? 'Re-validation required before this ID can be referenced again'
            : x.d <= 30
              ? 'Under 30 days — start the review now'
              : x.d <= 60
                ? 'Flagged Expiring soon in the registry'
                : 'Approaching the 60-day threshold';
          const canReview =
            (app.viewer.isAdmin || app.roleKind === 'req') &&
            app.canActOn(x.r.countryCode) &&
            x.r.base !== 'Pending Level 1' &&
            x.r.base !== 'Pending Level 2';

          return (
            <div
              key={x.r.rid}
              className="grid items-center gap-4 border-b border-slate-100 px-4 py-4 odd:bg-white even:bg-slate-50/60 lg:grid-cols-[1.1fr_1.3fr_1fr_190px]"
            >
              <div>
                <div className="font-mono text-[13.5px] font-bold text-[#1d4f31]">{sh.idLabel}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">
                  {sh.clsLabel} · {sh.country}
                </div>
              </div>

              <div>
                <div className="text-[12.5px] font-bold text-slate-800">{sh.supplierName}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">{sh.scopeDetail}</div>
              </div>

              <div>
                <div className="mb-1.5 flex justify-between gap-2 text-[11.5px]">
                  <span className="font-bold" style={{ color: sh.expiryNoteColor }}>
                    {sh.expiryNote}
                  </span>
                  <span className="text-slate-500">{sh.expiryLabel}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full ${barColor}`} style={{ width: barPct }} />
                </div>
                <div className="mt-1.5 text-[11px] text-slate-500">{reviewNote}</div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => app.open(x.r.rid)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
                >
                  Open record
                </button>
                {canReview && (
                  <button
                    type="button"
                    onClick={() => app.startReview(x.r.rid)}
                    className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3 py-2 text-[12px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90"
                  >
                    Start periodic review
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {dated.length === 0 && (
          <div className="px-4 py-12 text-center text-[13px] text-slate-500">
            No record is within 90 days of expiry.
          </div>
        )}
      </div>
    </div>
  );
}
