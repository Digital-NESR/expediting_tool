'use client';

/**
 * The Purchase Orders board — NESR's PO book as it stands in the SAP extract warehouse.
 *
 * Deliberately a read-only overview with no filters: it is the first cut of this data in the
 * app, and the question it answers is "what is in here and is it worth wiring up properly".
 * Filters belong in the next pass, once there is a reader asking for a specific slice.
 *
 * The ranked dimension charts are Tailwind bar lists rather than recharts: they are ten or
 * twelve labelled rows with a value each, which HTML lays out better than an SVG chart —
 * long category names wrap instead of being clipped to an axis gutter — and it keeps the
 * recharts bundle to the one chart that genuinely needs a continuous axis.
 */

import type { PurchaseOrderAnalytics, DimensionSlice } from '@/lib/purchase-orders/queries';
import { GREEN, STATUS_TONE, SpendTrend, usdCompact } from './PurchaseOrderCharts';

const int = (n: number) => n.toLocaleString();

function freshness(iso: string | null): string {
  if (!iso) return 'Refresh time unavailable';
  const d = new Date(iso);
  const hours = (Date.now() - d.getTime()) / 3_600_000;
  const when = d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (hours < 36) return `Warehouse refreshed ${when}`;
  return `Warehouse last refreshed ${when} — ${Math.floor(hours / 24)} days ago`;
}

/* ─── Stat tile ─────────────────────────────────────────────────────────────
   A bare number with its label. No plot, so no hover layer — the figure is the whole content. */
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11.5px] text-slate-400">{note}</div>}
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
      {sub && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ─── Ranked bar list ───────────────────────────────────────────────────────
   One series, one hue, so identity never rests on colour: every row is named and carries its
   own value. Bars are scaled to the largest value in THIS list — each list is its own question
   ("which country is biggest") and nothing is compared across two of them. */
function BarList({ rows, emptyNote }: { rows: DimensionSlice[]; emptyNote: string }) {
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-slate-400">{emptyNote}</p>;
  const ceiling = Math.max(1, ...rows.map((r) => r.valueUsd));

  return (
    <ol className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] text-slate-700" title={r.name}>
              {r.name}
            </span>
            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-slate-900">
              {usdCompact(r.valueUsd)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {/* 4px rounded data-end, anchored to a zero baseline at the left. */}
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(1, (r.valueUsd / ceiling) * 100)}%`, background: GREEN }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
              {int(r.lines)} lines
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PurchaseOrderAnalyticsClient({ data }: { data: PurchaseOrderAnalytics | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
        <p className="text-[15px] font-semibold text-slate-900">Purchase order data unavailable</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          The SAP extract warehouse could not be reached. The other boards on this page are
          unaffected.
        </p>
      </div>
    );
  }

  const { totals, trend, delivery, adherence } = data;
  const deliveryTotal = Math.max(1, delivery.reduce((s, d) => s + d.lines, 0));
  const topSupplierShare = data.bySupplier.length
    ? (data.bySupplier[0].valueUsd / Math.max(1, totals.valueUsd)) * 100
    : 0;

  const span =
    totals.firstRelease && totals.lastRelease
      ? `${totals.firstRelease} → ${totals.lastRelease}`
      : '—';

  return (
    <div className="space-y-5">
      {/* ── Provenance. A board drawn from a daily batch has to say how old it is, or a reader
             cannot tell a quiet week from a stalled pipeline. ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
          {freshness(data.loadedAt)}
        </span>
        <span>·</span>
        <span>
          <span className="font-medium text-slate-500">core.supplychain</span> · PO release dates{' '}
          {span}
        </span>
      </div>

      {/* ── Headline figures ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="PO value" value={usdCompact(totals.valueUsd)} note="Net order value, USD" />
        <Stat label="PO lines" value={int(totals.lines)} note={`${int(totals.orders)} orders`} />
        <Stat label="Suppliers" value={int(totals.suppliers)} note={`${totals.countries} countries`} />
        <Stat
          label="Open value"
          value={usdCompact(totals.openValueUsd)}
          note="Ordered, not yet delivered"
        />
        <Stat
          label="On time"
          value={`${adherence.pctOnTime.toFixed(1)}%`}
          note={`of ${int(adherence.measured)} delivered lines`}
        />
        <Stat
          label="Median lead time"
          value={adherence.medianLeadDays === null ? '—' : `${Math.round(adherence.medianLeadDays)} d`}
          note="PO release → delivery"
        />
      </div>

      {/* ── Trend ── */}
      <Card
        title="PO value released per month"
        sub="Last 36 months, by PO release date. The final month is still in progress."
      >
        <SpendTrend data={trend} />
      </Card>

      {/* ── Delivery state + schedule adherence ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Delivery status"
          sub="Every PO line by how much of it has been received."
        >
          <div className="space-y-3">
            {/* Stacked share bar. 2px surface gaps between segments so adjacent fills never
                touch, and each segment is labelled — the amber does not clear 3:1 against the
                card, so it never carries meaning on its own. */}
            <div className="flex gap-0.5 overflow-hidden rounded-lg">
              {delivery.map((d) => (
                <div
                  key={d.status}
                  className="h-7"
                  style={{
                    width: `${(d.lines / deliveryTotal) * 100}%`,
                    background: STATUS_TONE[d.status] ?? STATUS_TONE.Unknown,
                  }}
                  title={`${d.status}: ${int(d.lines)} lines`}
                />
              ))}
            </div>
            <ul className="space-y-2">
              {delivery.map((d) => (
                <li key={d.status} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: STATUS_TONE[d.status] ?? STATUS_TONE.Unknown }}
                    />
                    <span className="truncate text-slate-700">{d.status}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    <span className="font-semibold text-slate-900">
                      {((d.lines / deliveryTotal) * 100).toFixed(1)}%
                    </span>{' '}
                    · {int(d.lines)} lines ·{' '}
                    <span className="text-slate-500">{usdCompact(d.openValueUsd)} open</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card
          title="Delivered against the date requested"
          sub="Fully-delivered lines only, compared to the required delivery date on the PO."
        >
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
              {adherence.pctOnTime.toFixed(1)}%
            </span>
            <span className="text-[12.5px] text-slate-400">delivered on or before the date asked for</span>
          </div>
          <div className="mt-4 flex gap-0.5 overflow-hidden rounded-lg">
            <div
              className="h-7"
              style={{ width: `${adherence.pctOnTime}%`, background: GREEN }}
              title={`On time: ${int(adherence.onTime)}`}
            />
            <div
              className="h-7"
              style={{ width: `${100 - adherence.pctOnTime}%`, background: '#B34141' }}
              title={`Late: ${int(adherence.late)}`}
            />
          </div>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />
                On or before
              </span>
              <span className="tabular-nums font-semibold text-slate-900">{int(adherence.onTime)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#B34141' }} />
                Late
              </span>
              <span className="tabular-nums font-semibold text-slate-900">{int(adherence.late)}</span>
            </li>
          </ul>
          {/* The reader will ask why this is not measured against the supplier's promise. */}
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-relaxed text-slate-400">
            Measured against the requested delivery date, not the supplier promise date — in this
            extract the promise date is a copy of the actual delivery date on every row, so it
            would report 100% on time.
          </p>
        </Card>
      </div>

      {/* ── Where the money goes ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spend by country" sub="Top 12 by net order value.">
          <BarList rows={data.byCountry} emptyNote="No country data." />
        </Card>
        <Card title="Spend by material group" sub="Top 10 categories by net order value.">
          <BarList rows={data.byMaterialGroup} emptyNote="No material group data." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spend by purchasing group" sub="Top 10 service lines by net order value.">
          <BarList rows={data.byPurchasingGroup} emptyNote="No purchasing group data." />
        </Card>
        <Card
          title="Top suppliers"
          sub={
            topSupplierShare >= 1
              ? `Top 10 by net order value. The largest alone is ${topSupplierShare.toFixed(1)}% of total PO value.`
              : 'Top 10 by net order value.'
          }
        >
          <BarList rows={data.bySupplier} emptyNote="No supplier data." />
        </Card>
      </div>

      <Card title="Spend by material type" sub="How the book splits between services, products and spares.">
        <BarList rows={data.byMaterialType} emptyNote="No material type data." />
      </Card>
    </div>
  );
}
