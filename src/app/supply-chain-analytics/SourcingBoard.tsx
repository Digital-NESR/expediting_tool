'use client';

/**
 * Sourcing Opportunities — candidate projects generated from spend history.
 *
 * ── WHY THIS IS A TABLE AND NOT A PAGE OF CARDS ─────────────────────────────────────────────
 * The board shows everything that qualifies rather than a curated shortlist, so the reader's
 * job is scanning and narrowing. Thresholds here are noise floors, not editorial: the presets
 * tighten the dial and the ranking carries the weight. A card layout would make twenty rows
 * feel like the whole answer when there are two hundred.
 *
 * ── THE HONESTY RULES THIS BOARD KEEPS ──────────────────────────────────────────────────────
 *  - A project with no benchmark shows a DASH, never a zero. Competitive tenders are
 *    single-supplier by definition and genuinely cannot be priced; rendering them as $0 would
 *    rank the best ones last and imply they are worthless.
 *  - Savings carry their confidence. "Indicative" means the benchmark rests on few orders or a
 *    floating-currency contract price.
 *  - The guards report what they removed. They discard a measurable slice of apparent
 *    opportunity — mixed units, freight pseudo-materials, charge containers — and a reader is
 *    entitled to see how much and on what grounds rather than wondering why a number they
 *    remember is missing.
 *  - PIR coverage is stated. Contract comparison reaches roughly a tenth of material spend; a
 *    leakage total without that denominator reads as the whole picture.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { fetchProjectEvidence, fetchSourcingAnalysis } from '@/app/actions/sourcing';
import { csvSafe } from '@/lib/catalog-manager-utils';
import type { PoFilters, PoFilterOptions } from '@/lib/purchase-orders/filters';
import {
  DEFAULT_REQUEST,
  PROJECT_TYPE_LABEL,
  type Preset,
  type ProjectType,
  type SourcingAnalysis,
  type SourcingProject,
  type SourcingRequest,
} from '@/lib/sourcing/types';
import { downloadProjectWorkbook } from '@/lib/sourcing/export';
import PurchaseOrderFilterBar from './PurchaseOrderFilterBar';
import { SavingsByCountry, TYPE_TONE, usdCompact } from './SourcingCharts';

const int = (n: number) => n.toLocaleString();

const PRESET_LABEL: Record<Preset, { label: string; hint: string }> = {
  all: { label: 'Show everything', hint: '≥3 orders · ≥$25k' },
  balanced: { label: 'Balanced', hint: '≥4 orders · ≥$50k' },
  high: { label: 'High confidence', hint: '≥5 orders · ≥$100k · 2+ suppliers' },
  strict: { label: 'Strict', hint: '≥5 orders · ≥$250k · ≥$25k saving' },
};

const LOOKBACKS = [12, 24, 36, 60];

type SortKey = 'rank' | 'spend' | 'savings' | 'orders' | 'suppliers' | 'country';

/* ─── Small shared pieces ─────────────────────────────────────────────────── */

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight" style={{ color: tone ?? '#0f172a' }}>
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11.5px] text-slate-400">{note}</div>}
    </div>
  );
}

function TypeBadge({ type }: { type: ProjectType }) {
  const tone = TYPE_TONE[type];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `${tone}1A`, color: tone }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      {PROJECT_TYPE_LABEL[type]}
    </span>
  );
}

/** Savings, or an explicit dash. Never a zero standing in for "we cannot tell". */
function Savings({ p }: { p: SourcingProject }) {
  if (p.savingsUsd === null) {
    return (
      <span className="text-[12.5px] text-slate-400" title="No second supplier to benchmark against">
        — no benchmark
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-slate-900">{usdCompact(p.savingsUsd)}</span>
      {p.savingsPct !== null && <span className="ml-1 text-[11.5px] text-slate-400">{p.savingsPct.toFixed(0)}%</span>}
      {p.savingsConfidence === 'indicative' && (
        <span
          className="ml-1.5 text-[10.5px] text-amber-600"
          title="Benchmark rests on few orders, or on a floating-currency contract price"
        >
          indicative
        </span>
      )}
    </span>
  );
}

/* ─── Board ───────────────────────────────────────────────────────────────── */

export default function SourcingBoard({ options }: { options: PoFilterOptions }) {
  const [analysis, setAnalysis] = useState<SourcingAnalysis | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [req, setReq] = useState<SourcingRequest>(DEFAULT_REQUEST);
  const [sort, setSort] = useState<SortKey>('rank');
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Which project's workbook is being built, and the last one that failed. */
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  /**
   * Loads on first render of the tab, not with the page.
   *
   * `materialsPool` allows 8 connections and is shared with the Purchase Orders board. Loading
   * this board alongside that one put roughly twenty aggregates on the pool at once — measured
   * at ~19.5s, and the same shape of burst that previously made queries at the back of the
   * queue fail with "timeout exceeded when trying to connect". The board is behind a tab
   * nobody has opened yet, so it waits until they do, exactly as Past Due does.
   */
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    startTransition(async () => {
      setAnalysis(await fetchSourcingAnalysis(DEFAULT_REQUEST));
    });
  }, [loaded]);

  const apply = useCallback((next: SourcingRequest) => {
    setReq(next);
    startTransition(async () => {
      setAnalysis(await fetchSourcingAnalysis(next));
    });
  }, []);

  const onFilters = useCallback((filters: PoFilters) => apply({ ...req, filters }), [apply, req]);

  const projects = useMemo(() => {
    const list = analysis?.projects ?? [];
    if (sort === 'rank') return list;
    const by: Record<Exclude<SortKey, 'rank'>, (p: SourcingProject) => number | string> = {
      spend: (p) => -p.spendUsd,
      savings: (p) => -(p.savingsUsd ?? -1),
      orders: (p) => -p.purchaseOrders,
      suppliers: (p) => -p.supplierCount,
      country: (p) => p.country,
    };
    return [...list].sort((a, b) => {
      const x = by[sort](a);
      const y = by[sort](b);
      return typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    });
  }, [analysis, sort]);

  /**
   * Fetches the PO lines behind one project and hands back a workbook.
   *
   * Deliberately NOT prefetched with the board — a project can sit behind hundreds of lines and
   * nobody wants all of them for every row. It is fetched when a reader asks for that one,
   * using the same request that produced the board so the evidence reconciles to the figures.
   */
  const downloadWorkbook = useCallback(
    async (p: SourcingProject) => {
      setDownloading(p.id);
      setDownloadError(null);
      try {
        const evidence = await fetchProjectEvidence(req, {
          country: p.country,
          groupKey: p.groupKey,
          isService: p.type === 'service',
        });
        if (!evidence) {
          setDownloadError(`Could not read the lines behind ${p.title}.`);
          return;
        }
        await downloadProjectWorkbook(p, evidence);
      } catch {
        setDownloadError(`Could not build the workbook for ${p.title}.`);
      } finally {
        setDownloading(null);
      }
    },
    [req],
  );

  const exportCsv = useCallback(() => {
    const head = [
      'Type', 'Country', 'Item', 'Material', 'Material group', 'Owner',
      'Orders', 'Lines', 'Suppliers', 'Spend USD', 'Min unit USD', 'Max unit USD',
      'Price CV', 'Savings USD', 'Savings %', 'Confidence', 'Info record',
      'First purchase', 'Last purchase', 'Suppliers (name:avg USD)', 'Rationale',
    ];
    const rows = projects.map((p) => [
      PROJECT_TYPE_LABEL[p.type], p.country, p.title, p.material ?? '', p.materialGroup ?? '', p.owner ?? '',
      p.purchaseOrders, p.lines, p.supplierCount, Math.round(p.spendUsd),
      p.minUnitPriceUsd ?? '', p.maxUnitPriceUsd ?? '',
      p.priceCv === null ? '' : p.priceCv.toFixed(3),
      p.savingsUsd === null ? '' : Math.round(p.savingsUsd),
      p.savingsPct === null ? '' : p.savingsPct.toFixed(1),
      p.savingsConfidence, p.infoRecord ?? '',
      p.firstPurchase ?? '', p.lastPurchase ?? '',
      p.suppliers.map((s) => `${s.name}:${s.avgUnitPriceUsd.toFixed(2)}`).join('; '),
      p.rationale,
    ]);
    /* `csvSafe` is mandatory here — a description beginning `=` or `+` would otherwise execute
       as a formula when the export is opened in Excel. */
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${csvSafe(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NESR_Sourcing_Opportunities.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [projects]);

  if (!analysis && busy) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-28 rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
        <p className="text-[15px] font-semibold text-slate-900">Sourcing analysis unavailable</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          The SAP extract warehouse could not be reached. The other boards on this page are unaffected.
        </p>
      </div>
    );
  }

  const s = analysis.summary;
  const servicesBlocked =
    req.includeServices &&
    (req.filters.supplier.length > 0 ||
      req.filters.buyer.length > 0 ||
      req.filters.purchasingOrg.length > 0 ||
      req.filters.accountClassification.length > 0);

  return (
    <div className="space-y-4">
      <PurchaseOrderFilterBar
        options={options}
        value={req.filters}
        onChange={onFilters}
        onReset={() => apply({ ...req, filters: DEFAULT_REQUEST.filters })}
        busy={busy}
        activeCount={
          [req.filters.accountClassification, req.filters.segment, req.filters.country,
           req.filters.purchasingOrg, req.filters.supplier, req.filters.buyer].filter((l) => l.length).length
        }
      />

      {/* ── Board-specific dial ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Qualification</label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => apply({ ...req, preset: p, minSpendUsd: null })}
                  title={PRESET_LABEL[p].hint}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    req.preset === p
                      ? 'border-[#307c4c] bg-[#307c4c] text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {PRESET_LABEL[p].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Lookback</label>
            <div className="flex gap-1">
              {LOOKBACKS.map((mo) => (
                <button
                  key={mo}
                  type="button"
                  onClick={() => apply({ ...req, lookbackMonths: mo })}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    req.lookbackMonths === mo
                      ? 'border-[#307c4c] bg-[#307c4c] text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {mo}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Minimum spend{req.minSpendUsd !== null && ` · ${usdCompact(req.minSpendUsd)}`}
            </label>
            <input
              type="range"
              min={0}
              max={500_000}
              step={25_000}
              value={req.minSpendUsd ?? 50_000}
              onChange={(e) => apply({ ...req, minSpendUsd: Number(e.target.value) })}
              className="w-44 accent-[#307c4c]"
              aria-label="Minimum spend"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Project type</label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => {
                const on = req.types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      apply({ ...req, types: on ? req.types.filter((x) => x !== t) : req.types.concat([t]) })
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      on ? 'border-[#307c4c] bg-[#307c4c] text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {PROJECT_TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-600">
            <input
              type="checkbox"
              checked={req.includeServices}
              onChange={(e) => apply({ ...req, includeServices: e.target.checked })}
              className="accent-[#307c4c]"
            />
            Include service clusters
          </label>

          <button
            type="button"
            onClick={exportCsv}
            disabled={!projects.length}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        {servicesBlocked && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-relaxed text-amber-700">
            Service clusters are grouped by description, which collapses supplier, buyer, purchasing org and
            account classification. With one of those filters active they cannot be narrowed honestly, so they
            are left out rather than shown contradicting your selection.
          </p>
        )}
      </div>

      <div className={busy ? 'pointer-events-none space-y-4 opacity-50 transition-opacity' : 'space-y-4 transition-opacity'}>
        {/* ── Headline ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <Stat label="Projects" value={int(s.projects)} note={`${s.byCountry.length} countries`} />
          <Stat label="Addressable spend" value={usdCompact(s.addressableSpendUsd)} note="Covered by these projects" />
          <Stat
            label="Identified savings"
            value={usdCompact(s.identifiedSavingsUsd)}
            note={
              s.addressableSpendUsd > 0
                ? `${((s.identifiedSavingsUsd / s.addressableSpendUsd) * 100).toFixed(1)}% of addressable`
                : undefined
            }
            tone="#307c4c"
          />
          <Stat label="Spend examined" value={usdCompact(s.examinedSpendUsd)} note="Before thresholds" />
          <Stat
            label="Contract coverage"
            value={s.pirCoveragePct === null ? '—' : `${s.pirCoveragePct.toFixed(0)}%`}
            note="Material spend with a live info record"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h3 className="text-sm font-bold tracking-tight text-slate-900">Where the opportunity sits</h3>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Identified savings by country. Countries with no benchmarkable project are absent, not zero.
            </p>
            <div className="mt-4">
              <SavingsByCountry rows={s.byCountry} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold tracking-tight text-slate-900">By project type</h3>
            <ul className="mt-4 space-y-2.5">
              {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[])
                .filter((t) => s.byType[t].projects > 0)
                .map((t) => (
                  <li key={t} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <TypeBadge type={t} />
                    <span className="tabular-nums text-slate-400">
                      <span className="font-semibold text-slate-900">{s.byType[t].projects}</span> ·{' '}
                      {usdCompact(s.byType[t].spendUsd)}
                      {s.byType[t].savingsUsd > 0 && (
                        <span className="ml-1 text-[#307c4c]">→ {usdCompact(s.byType[t].savingsUsd)}</span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>

            {s.excluded.length > 0 && (
              <>
                <h4 className="mt-5 border-t border-slate-100 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Removed by data-quality guards
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {s.excluded.map((e) => (
                    <li key={e.reason} className="flex items-start justify-between gap-2 text-[11.5px]">
                      <span className="text-slate-500">{e.reason}</span>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        {e.groups} · {usdCompact(e.spendUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* ── Projects ── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-slate-900">Candidate projects</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {int(projects.length)} shown · click a row for the evidence
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-500">Sort</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-[#307c4c]"
              >
                <option value="rank">Best opportunity</option>
                <option value="savings">Savings</option>
                <option value="spend">Spend</option>
                <option value="orders">Orders</option>
                <option value="suppliers">Suppliers</option>
                <option value="country">Country</option>
              </select>
            </div>
          </div>

          {downloadError && (
            <p className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-[12px] text-red-700">
              {downloadError}
            </p>
          )}

          {projects.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-slate-400">
              Nothing qualifies at these thresholds. Loosen the preset or lower the minimum spend.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.map((p) => {
                const open = expanded === p.id;
                return (
                  <div key={p.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : p.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypeBadge type={p.type} />
                          <span className="truncate text-[13px] font-semibold text-slate-900" title={p.title}>
                            {p.title}
                          </span>
                          {p.infoRecord && (
                            <span
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                              title={`SAP info record ${p.infoRecord}`}
                            >
                              PIR
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-400">
                          <span className="font-medium text-slate-500">{p.country}</span>
                          <span>{p.purchaseOrders} orders</span>
                          <span>{p.supplierCount} supplier{p.supplierCount === 1 ? '' : 's'}</span>
                          {p.materialGroup && <span className="truncate">{p.materialGroup}</span>}
                          {p.owner && <span className="truncate">· {p.owner}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-semibold tabular-nums text-slate-900">
                          {usdCompact(p.spendUsd)}
                        </div>
                        <div className="mt-0.5"><Savings p={p} /></div>
                      </div>
                    </button>

                    {/* Sibling of the row button, not nested — a button inside a button is
                        invalid and the inner one never receives its click. */}
                    <div className="flex justify-end px-5 pb-3 -mt-2">
                      <button
                        type="button"
                        onClick={() => downloadWorkbook(p)}
                        disabled={downloading === p.id}
                        title="Excel workbook: the analysis, the supplier spread, the price history and every PO line behind it"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-[#307c4c] hover:text-[#307c4c] disabled:opacity-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                        </svg>
                        {downloading === p.id ? 'Building…' : 'Evidence pack'}
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                        <p className="text-[12.5px] leading-relaxed text-slate-700">{p.rationale}</p>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Suppliers
                            </h4>
                            <ul className="mt-2 space-y-1.5">
                              {p.suppliers.map((sup) => (
                                <li key={sup.supplierNum} className="flex items-center justify-between gap-3 text-[12px]">
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-slate-700" title={sup.name}>{sup.name}</span>
                                    {sup.isCheapest && (
                                      <span className="shrink-0 rounded bg-[#307c4c]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#307c4c]">
                                        benchmark
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-slate-400">
                                    {sup.avgUnitPriceUsd > 0 && <>${sup.avgUnitPriceUsd.toFixed(2)} · </>}
                                    {usdCompact(sup.spendUsd)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Evidence
                            </h4>
                            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                              {p.material && (
                                <><dt className="text-slate-400">Material</dt>
                                  <dd className="font-mono text-[11px] text-slate-700">{p.material}</dd></>
                              )}
                              <dt className="text-slate-400">Period</dt>
                              <dd className="text-slate-700">{p.firstPurchase ?? '—'} → {p.lastPurchase ?? '—'}</dd>
                              <dt className="text-slate-400">Lines</dt>
                              <dd className="tabular-nums text-slate-700">{int(p.lines)}</dd>
                              {p.minUnitPriceUsd !== null && (
                                <><dt className="text-slate-400">Unit price</dt>
                                  <dd className="tabular-nums text-slate-700">
                                    ${p.minUnitPriceUsd.toFixed(2)} – ${(p.maxUnitPriceUsd ?? 0).toFixed(2)}
                                    {p.orderUnit && <span className="text-slate-400"> / {p.orderUnit}</span>}
                                  </dd></>
                              )}
                              {p.priceCv !== null && (
                                <><dt className="text-slate-400">Variation</dt>
                                  <dd className="tabular-nums text-slate-700">{(p.priceCv * 100).toFixed(0)}%</dd></>
                              )}
                              {p.contractPriceUsd !== null && (
                                <><dt className="text-slate-400">Contract price</dt>
                                  <dd className="tabular-nums text-slate-700">
                                    ${p.contractPriceUsd.toFixed(2)}
                                    {p.contractExpired && <span className="ml-1 text-amber-600">expired</span>}
                                  </dd></>
                              )}
                              {p.categorySupplierCount !== null && (
                                <><dt className="text-slate-400">Category suppliers</dt>
                                  <dd className="tabular-nums text-slate-700">{p.categorySupplierCount}</dd></>
                              )}
                            </dl>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Provenance and the standing caveats ── */}
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11.5px] leading-relaxed text-slate-500">
          Savings compare what was paid against the <span className="font-semibold text-slate-600">cheapest
          supplier&rsquo;s spend-weighted average</span> for the same item in the same country — not against the
          lowest single price, which is usually one lucky order. Projects with a single supplier carry no
          benchmark and show a dash rather than zero. Contract comparison reaches only the share of material
          spend shown above, so leakage figures are a floor, not a total. Service clusters are grouped by
          description and carry no comparable unit price; treat their scope as indicative.
          {analysis.loadedAt && (
            <> Warehouse refreshed {new Date(analysis.loadedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}.</>
          )}
        </p>
      </div>
    </div>
  );
}
