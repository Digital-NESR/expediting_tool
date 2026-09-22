'use client';

import { daysFromToday } from '../lib/date';
import { displayStatus, recordLabel } from '../lib/helpers';
import type { RegistryRecord } from '../lib/types';
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

  /* Which records have a replacement, and whether it has landed yet.
     A periodic review raises a new record and leaves this one alone until the
     replacement is signed off, so "has a renewal in flight" and "has been
     renewed" are different states and the screen has to tell them apart. */
  const replacementOf = new Map<number, RegistryRecord>();
  for (const r of app.records) {
    if (r.renewalOfRid == null) continue;
    if (r.base === 'Rejected' || r.base === 'Closed') continue;
    replacementOf.set(r.renewalOfRid, r);
  }
  const renewedCount = app.records.filter(
    (r) => r.renewalOfRid != null && (r.base === 'Active' || r.base === 'Extended'),
  ).length;

  const dated = app.records
    /* Closed records are retired — superseded by a replacement, or shut. They
       still carry an expiry date, so without this they sit in the queue being
       chased for a review that has already happened. */
    .filter((r) => r.base !== 'Closed')
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
      label: 'Renewed',
      /* Was counts('Extended'), which is dead: 'Extended' belonged to the old
         model where a review extended a record in place. A renewal now
         publishes a replacement as Active, so nothing writes that status and
         the card could only ever read zero. */
      value: renewedCount,
      sub: 'replacement issued and in force',
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
          and weekly after that until the record is renewed — see the Expiry Reminders panel on any
          record for what has been sent. A review raises a replacement record, which you can edit
          before submitting; once it is signed off it takes over with a new Registry ID, and this
          one is closed and kept on file for audit.
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
          /* Opens the record rather than acting from here. A renewal is a new
             record built from this one, and the requestor needs to see what
             they are copying before they start editing it. */
          const replacement = replacementOf.get(x.r.rid) ?? null;
          const canReview =
            !replacement &&
            app.can.create &&
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
                <div className="mt-1.5 text-[11px] text-slate-500">
                  {replacement
                    ? replacement.base === 'Active' || replacement.base === 'Extended'
                      ? `Replaced by ${recordLabel(replacement)}`
                      : `Replacement ${recordLabel(replacement)} is in validation — this ID stays valid until it is signed off`
                    : reviewNote}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {replacement && (
                  <button
                    type="button"
                    onClick={() => app.open(replacement.rid)}
                    className="rounded-lg border border-[#6AAF8E] bg-[#307c4c]/5 px-3 py-2 text-[12px] font-semibold text-[#1d4f31] transition-colors hover:bg-[#307c4c]/10"
                  >
                    {replacement.base === 'Active' || replacement.base === 'Extended'
                      ? 'Open the replacement'
                      : 'Renewal in progress — open it'}
                  </button>
                )}
                {!canReview && (
                  <button
                    type="button"
                    onClick={() => app.open(x.r.rid)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
                  >
                    Open record
                  </button>
                )}
                {canReview && (
                  <button
                    type="button"
                    onClick={() => app.open(x.r.rid)}
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
