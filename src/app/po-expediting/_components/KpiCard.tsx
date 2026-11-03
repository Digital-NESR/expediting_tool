'use client';

import React from 'react';

/**
 * A dashboard figure, with the same figure counted the other way beside it.
 *
 * Every card here counts DISTINCT POs, because that is the unit a buyer chases -- one call to
 * the vendor covers the whole order. But the work is done line by line, and a card reading
 * "41 past due" hides whether that is 60 lines or 600. `lines` puts both readings in one box,
 * after a divider, so neither number can be mistaken for the other.
 */
export function KpiCard({
  label,
  value,
  compactValue,
  lines,
  accent = false,
  warning = false,
  danger = false,
}: {
  label: string;
  value: string;
  /**
   * A shorter rendering of the same figure, shown ONLY below 640px, where the cards sit two to
   * a row with about 106px of usable width. A full currency total needs more than twice that
   * and clipped into the next card. From 640px up there is room, so `value` is what shows and
   * nothing is lost on the screens most of this is read on.
   */
  compactValue?: string;
  /** The same slice counted in PO lines. Omitted on a card where lines mean nothing. */
  lines?: number;
  accent?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger
    ? 'text-red-600'
    : warning
      ? 'text-amber-600'
      : accent
        ? 'text-[#307c4c]'
        : 'text-slate-800';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {/* Baseline-aligned so the small number sits on the big one's line rather than floating,
          and wrapping rather than overflowing in the two-column phone layout. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* One size down below 640px. The compact currency form gets "$118,409,052.18" to
            "$118.4M", but at text-3xl that is still 114px in a 106px box -- abbreviating and
            then overflowing anyway would have been the worst of both. At text-2xl it is 91px,
            with room for the eight characters a "$12.3B" total would need. */}
        <p
          className={`text-2xl sm:text-3xl font-bold tracking-tight ${valueColor}`}
          title={value}
        >
          {compactValue ? (
            <>
              <span className="sm:hidden">{compactValue}</span>
              <span className="hidden sm:inline">{value}</span>
            </>
          ) : (
            value
          )}
        </p>
        {lines !== undefined && (
          /* The divider and the count are ONE span, and nowrap. A long value — "$118,409,052",
             or a seven-figure PO count — pushes this onto a second line, and when the two were
             separate flex children the bar was left stranded at the end of one line or the
             start of the next, reading as a typo rather than as a separator. */
          <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
            <span aria-hidden className="text-xl font-light text-slate-300 select-none">
              |
            </span>
            <span className="text-sm font-semibold text-slate-400">
              {lines.toLocaleString()} {lines === 1 ? 'line' : 'lines'}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
