'use client';

/**
 * Past-due analysis for open purchase orders.
 *
 * "Open" is the warehouse's own definition — released, not deleted, with quantity still
 * outstanding — and "past due" is measured against the delivery date on the line. Both are
 * stated on the board itself: this sits next to a Power BI page answering the same question
 * with a different population, and a reader comparing the two needs to see which is which.
 */

import type { PastDueAnalysis } from '@/lib/purchase-orders/past-due';
import { DUE_IN, PAST_DUE, PastDueByCountry, PastDueDonut, usdCompact } from './PurchaseOrderCharts';

const int = (n: number) => n.toLocaleString();

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: tone ?? '#0f172a' }}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11.5px] text-slate-400">{note}</div>}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
      {sub && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function PastDueBoard({ data }: { data: PastDueAnalysis | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
        <p className="text-[15px] font-semibold text-slate-900">Past due analysis unavailable</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          The SAP extract warehouse could not be reached.
        </p>
      </div>
    );
  }

  const { totals, byCountry, ageing, worstSuppliers } = data;

  if (!totals.lines) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
        <p className="text-[15px] font-semibold text-slate-900">No open PO lines match these filters</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          Widen the selection above to see past-due analysis.
        </p>
      </div>
    );
  }

  const pastDuePct = totals.lines ? (totals.pastDueLines / totals.lines) * 100 : 0;
  const ageingMax = Math.max(1, ...ageing.map((a) => a.lines));
  /* Countries worst-first: the chart is read for where the problem is, not for volume. A
     country with a handful of lines is noise, so the long tail keeps its order but the ones
     being judged have enough lines to mean something. */
  const countryRows = [...byCountry].sort((a, b) => b.pastDuePct - a.pastDuePct || b.total - a.total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Net PO released value" value={usdCompact(totals.netValueUsd)} note="Open lines, USD" />
        <Stat label="Net PO line count" value={int(totals.lines)} note={`${int(totals.orders)} orders`} />
        <Stat label="Still to receive" value={usdCompact(totals.openValueUsd)} note="Undelivered portion" />
        <Stat
          label="Past due lines"
          value={int(totals.pastDueLines)}
          note={`${pastDuePct.toFixed(1)}% of open lines`}
          tone={PAST_DUE}
        />
        <Stat
          label="Past due value"
          value={usdCompact(totals.pastDueValueUsd)}
          note="Net order value at risk"
          tone={PAST_DUE}
        />
        <Stat label="Suppliers" value={int(totals.suppliers)} note="With open lines" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card title="% PO lines by delivery due group" sub="Every open PO line, split by whether its delivery date has passed.">
            <PastDueDonut dueIn={totals.dueInLines} pastDue={totals.pastDueLines} />
          </Card>
        </div>
        <div className="lg:col-span-3">
          <Card
            title="% PO lines by delivery due group, by country"
            sub="Normalised to 100% so the rate is comparable; worst first. Line counts are in the tooltip."
          >
            <PastDueByCountry rows={countryRows} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="How late is past due" sub="Days since the delivery date on the line.">
          <ol className="space-y-2.5">
            {ageing.map((a) => (
              <li key={a.bucket}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-slate-700">{a.bucket}</span>
                  <span className="text-[12.5px] tabular-nums text-slate-400">
                    <span className="font-semibold text-slate-900">{int(a.lines)}</span> lines ·{' '}
                    {usdCompact(a.valueUsd)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(a.lines ? 1 : 0, (a.lines / ageingMax) * 100)}%`,
                      background: PAST_DUE,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] text-slate-400">
            <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: DUE_IN }} />{' '}
            {int(totals.dueInLines)} lines are still within their delivery date.
          </p>
        </Card>

        <Card title="Suppliers with the most value past due" sub="Top 10 by past-due net order value.">
          {worstSuppliers.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-400">Nothing past due in this selection.</p>
          ) : (
            <ol className="space-y-2.5">
              {worstSuppliers.map((s) => (
                <li key={s.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12.5px] text-slate-700" title={s.name}>
                      {s.name}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-slate-900">
                      {usdCompact(s.valueUsd)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(1, (s.valueUsd / Math.max(1, worstSuppliers[0].valueUsd)) * 100)}%`,
                          background: PAST_DUE,
                        }}
                      />
                    </div>
                    <span className="w-36 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                      {int(s.pastDue)}/{int(s.total)} lines · {int(s.worstDays)}d worst
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* The definitions, where a reader comparing this to the Power BI page will look. */}
      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11.5px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">Open PO</span> is the warehouse&rsquo;s own
        definition — released (SAP status Approved), not flagged for deletion, with quantity still
        outstanding. <span className="font-semibold text-slate-600">Past due</span> is measured
        against the delivery date held on the line, not the supplier promise date, which in this
        extract is a copy of the actual delivery date. Lines with no delivery date count as Due In.
        These figures will not tie exactly to the Power BI page beside them, which counts a wider
        line population including service lines.
      </p>
    </div>
  );
}
