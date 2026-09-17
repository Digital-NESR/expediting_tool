'use client';

/* ─────────────────────────────────────────────────────────────
   SOA Consolidation · Cycles.

   A cycle is a reporting quarter, and it carries its own policy:
   the coverage target, the year-end target, the vendor threshold
   and the lookback are stored ON the cycle rather than read from a
   constant. That is the whole point of this screen — changing next
   quarter's target must not rewrite how last quarter was judged —
   so the create form offers the defaults as editable values and the
   list shows what each cycle actually used, not today's numbers.

   Two actions here have consequences an admin should see BEFORE
   clicking rather than after:

     · Making a cycle active stands the previous one down. Exactly
       one cycle is active, and every champion's screen follows it.
     · Running the extract REPLACES that cycle's spend snapshot. It
       leaves chase lists alone — no champion's correspondence is
       lost — and it is slow, because it aggregates every GRN'd PO
       line in the window.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  activateSoaCycle,
  createSoaCycle,
  getSoaCycleSummary,
  getSoaCycles,
  runSoaExtract,
  type CycleSnapshotSummary,
  type SoaCycle,
} from '@/app/actions/soa/cycles';
import { formatSessionDate, shortDateUTC } from '@/lib/format';

/** What `runSoaExtract` hands back, without importing the server-only extract module. */
type ExtractResult = NonNullable<Awaited<ReturnType<typeof runSoaExtract>>['data']>;

/* The policy defaults a new cycle starts from. They are the same numbers the action
   COALESCEs to, repeated here so the form can show them as editable rather than as a
   silent server-side fallback. */
const DEFAULTS = {
  coverageTargetPct: '70',
  yearEndTargetPct: '95',
  vendorThresholdUsd: '250000',
  lookbackMonths: '18',
};

/** `$250.6M` — the totals here run to hundreds of millions and read badly in full. */
function fmtCompactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** `$250,000` — the threshold is a policy number and reads better unrounded. */
function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** A DATE column, rendered without letting the viewer's time zone shift it a day. */
function dateOnly(iso: string | null): string {
  return iso ? shortDateUTC(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—';
}

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-[#2A7E4F]`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A7E4F]';

/** One number in the snapshot summary. */
function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

export default function SoaCyclesClient() {
  const [cycles, setCycles] = useState<SoaCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState('');

  // Which cycle's snapshot is on screen. Defaults to the active one.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<CycleSnapshotSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Create form.
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [coverage, setCoverage] = useState(DEFAULTS.coverageTargetPct);
  const [yearEnd, setYearEnd] = useState(DEFAULTS.yearEndTargetPct);
  const [threshold, setThreshold] = useState(DEFAULTS.vendorThresholdUsd);
  const [lookback, setLookback] = useState(DEFAULTS.lookbackMonths);
  const [makeActive, setMakeActive] = useState(false);

  // Activation asks first — it stands the current active cycle down.
  const [confirmActivateId, setConfirmActivateId] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);

  // The extract: one slow server call, so a real pending state rather than an optimistic one.
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  const activeCycle = useMemo(() => cycles.find((c) => c.is_active) ?? null, [cycles]);
  const selected = useMemo(
    () => cycles.find((c) => c.id === selectedId) ?? null,
    [cycles, selectedId],
  );

  const loadCycles = useCallback(async () => {
    const rows = await getSoaCycles();
    setCycles(rows);
    setLastRefreshed(new Date());
    return rows;
  }, []);

  const loadSummary = useCallback(async (cycleId: number) => {
    setSummaryLoading(true);
    try {
      setSummary(await getSoaCycleSummary(cycleId));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCycles()
      .then((rows) => {
        const first = rows.find((c) => c.is_active) ?? rows[0];
        if (first) setSelectedId(first.id);
      })
      .finally(() => setLoading(false));
  }, [loadCycles]);

  // The snapshot belongs to the selected cycle; a result from the previous one would lie.
  useEffect(() => {
    if (selectedId === null) return;
    setExtractResult(null);
    void loadSummary(selectedId);
  }, [selectedId, loadSummary]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await loadCycles();
      if (selectedId !== null) await loadSummary(selectedId);
    } finally {
      setIsRefreshing(false);
    }
  }

  function resetForm() {
    setLabel('');
    setPeriodStart('');
    setPeriodEnd('');
    setDeadline('');
    setCoverage(DEFAULTS.coverageTargetPct);
    setYearEnd(DEFAULTS.yearEndTargetPct);
    setThreshold(DEFAULTS.vendorThresholdUsd);
    setLookback(DEFAULTS.lookbackMonths);
    setMakeActive(false);
  }

  /** A blank box means "use the default", not "use zero". */
  const num = (v: string): number | undefined => {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };

  async function submitCycle() {
    setError('');
    if (!label.trim()) {
      setError('A label is required, e.g. "Q4 2026".');
      return;
    }
    if (!periodStart || !periodEnd || !deadline) {
      setError('The period start, period end and submission deadline are all required.');
      return;
    }
    if (!(new Date(periodStart) < new Date(periodEnd))) {
      setError('The period must start before it ends.');
      return;
    }

    setSaving(true);
    const result = await createSoaCycle({
      label: label.trim(),
      periodStart,
      periodEnd,
      submissionDeadline: deadline,
      coverageTargetPct: num(coverage),
      yearEndTargetPct: num(yearEnd),
      vendorThresholdUsd: num(threshold),
      lookbackMonths: num(lookback),
      makeActive,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? 'Could not open the cycle.');
      return;
    }
    const opened = result.data;
    resetForm();
    setFormOpen(false);
    await loadCycles();
    if (opened) setSelectedId(opened.id);
  }

  async function activate(cycleId: number) {
    setError('');
    setActivating(true);
    const result = await activateSoaCycle(cycleId);
    setActivating(false);
    setConfirmActivateId(null);
    if (!result.success) {
      setError(result.error ?? 'Could not activate the cycle.');
      return;
    }
    await loadCycles();
  }

  async function extract(cycleId: number) {
    setError('');
    setExtractResult(null);
    setExtracting(true);
    try {
      const result = await runSoaExtract(cycleId);
      if (!result.success || !result.data) {
        setError(result.error ?? 'The extract failed.');
        return;
      }
      setExtractResult(result.data);
      await loadCycles();
      await loadSummary(cycleId);
    } finally {
      setExtracting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
        <Spinner />
        <span className="text-sm font-medium">Loading cycles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Reporting Cycles</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Last updated:{' '}
            {lastRefreshed
              ? lastRefreshed.toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '-'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="rounded-md bg-[#2A7E4F] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2A7E4F]/90"
          >
            {formOpen ? 'Close' : 'Open a cycle'}
          </button>
          <button
            type="button"
            disabled={isRefreshing}
            onClick={refresh}
            className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="text-[12px] text-slate-400">
        A cycle is one reporting quarter, and it carries its own policy. The coverage target, the
        year-end target, the vendor threshold and the lookback are stored{' '}
        <span className="font-semibold text-slate-600">on the cycle</span> — changing next
        quarter&apos;s target leaves last quarter&apos;s evidence describing the rule it was
        actually judged against. Exactly one cycle is active at a time, and every champion&apos;s
        screen follows it.
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* ── Open a cycle ── */}
      {formOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Open a cycle</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Label" hint="e.g. Q4 2026">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Q4 2026"
                className={INPUT}
              />
            </Field>
            <Field label="Period start">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Period end" hint="The lookback runs back from here.">
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Submission deadline">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Policy for this cycle
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Coverage target %" hint="Default 70. Judged per quarter.">
              <input
                type="number"
                min={0}
                max={100}
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Year-end target %" hint="Default 95.">
              <input
                type="number"
                min={0}
                max={100}
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Vendor threshold (USD)" hint="Default $250,000. Who gets chased.">
              <input
                type="number"
                min={0}
                step={1000}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Lookback (months)" hint="Default 18.">
              <input
                type="number"
                min={1}
                max={60}
                value={lookback}
                onChange={(e) => setLookback(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={makeActive}
              onChange={(e) => setMakeActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2A7E4F]"
            />
            <span className="text-[12px] text-slate-600">
              Make this the active cycle straight away.{' '}
              {activeCycle ? (
                <>
                  <span className="font-semibold text-slate-800">{activeCycle.label}</span> is
                  active now and would be stood down — every champion&apos;s screen switches to the
                  new cycle.
                </>
              ) : (
                'No cycle is active at the moment, so nothing is stood down.'
              )}
            </span>
          </label>

          <p className="mt-3 text-[11px] text-slate-400">
            Re-using an existing label updates that cycle&apos;s dates and policy rather than
            opening a second one.
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                resetForm();
                setFormOpen(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submitCycle}
              className="rounded-lg bg-[#2A7E4F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2A7E4F]/90 disabled:opacity-50"
            >
              {saving ? 'Opening...' : 'Open cycle'}
            </button>
          </div>
        </div>
      )}

      {/* ── The cycles ── */}
      {cycles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
          No cycle has been opened yet. Nothing else in the tool works until one is.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Cycle</th>
                  <th className="px-4 py-3 text-left font-semibold">Period</th>
                  <th className="px-4 py-3 text-left font-semibold">Deadline</th>
                  <th className="px-4 py-3 text-left font-semibold">Policy used</th>
                  <th className="px-4 py-3 text-left font-semibold">Extract</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cycles.map((c) => {
                  const isSelected = c.id === selectedId;
                  const confirming = confirmActivateId === c.id;
                  return (
                    <tr
                      key={c.id}
                      className={`align-top ${isSelected ? 'bg-[#2A7E4F]/5' : 'hover:bg-[#2A7E4F]/[0.03]'}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{c.label}</p>
                        {c.is_active ? (
                          <span className="mt-1 inline-flex items-center rounded-full border border-[#2A7E4F]/20 bg-[#2A7E4F]/10 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-[#2A7E4F]">
                            Active cycle
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-slate-500">
                            Stood down
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {dateOnly(c.period_start)}
                        <span className="text-slate-400"> – </span>
                        {dateOnly(c.period_end)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {dateOnly(c.submission_deadline)}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-800">
                            {c.coverage_target_pct}%
                          </span>{' '}
                          quarterly ·{' '}
                          <span className="font-semibold text-slate-800">
                            {c.year_end_target_pct}%
                          </span>{' '}
                          year-end
                        </p>
                        <p className="mt-0.5">
                          Chase above{' '}
                          <span className="font-semibold text-slate-800">
                            {fmtUsd(c.vendor_threshold_usd)}
                          </span>{' '}
                          · {c.lookback_months}-month lookback
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {c.extracted_at ? (
                          <>
                            <p className="font-semibold text-slate-800">
                              {formatSessionDate(c.extracted_at)}
                            </p>
                            <p className="mt-0.5 text-slate-400">
                              Window {dateOnly(c.extract_from)} – {dateOnly(c.extract_to)}
                            </p>
                          </>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-[#fde68a] bg-[#fef3c7] px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-[#b45309]">
                            Not taken
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                              isSelected
                                ? 'border-[#2A7E4F]/30 bg-[#2A7E4F]/10 text-[#2A7E4F]'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Snapshot'}
                          </button>
                          {!c.is_active && (
                            <button
                              type="button"
                              disabled={activating}
                              onClick={() => setConfirmActivateId(confirming ? null : c.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Make active...
                            </button>
                          )}
                        </div>

                        {confirming && (
                          <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-left">
                            <p className="text-xs leading-relaxed text-[#92400e]">
                              Make <span className="font-bold">{c.label}</span> the active cycle?
                              {activeCycle ? (
                                <>
                                  {' '}
                                  <span className="font-bold">{activeCycle.label}</span> is stood
                                  down in the same move — only one cycle is ever active, and every
                                  champion&apos;s dashboard, scoping screen and deadline switches to{' '}
                                  {c.label} the moment this lands.
                                </>
                              ) : (
                                ' No cycle is active at the moment, so nothing is stood down.'
                              )}
                            </p>
                            <div className="mt-2.5 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={activating}
                                onClick={() => activate(c.id)}
                                className="rounded-lg bg-[#2A7E4F] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2A7E4F]/90 disabled:opacity-60"
                              >
                                {activating ? 'Activating...' : `Yes, activate ${c.label}`}
                              </button>
                              <button
                                type="button"
                                disabled={activating}
                                onClick={() => setConfirmActivateId(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── The selected cycle's snapshot ── */}
      {selected && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Spend snapshot — {selected.label}
              {selected.is_active && (
                <span className="ml-2 rounded-full bg-[#2A7E4F]/10 px-2 py-0.5 text-[10px] font-bold text-[#2A7E4F]">
                  Active
                </span>
              )}
            </h3>
            {summaryLoading && <span className="text-[11px] text-slate-400">Counting...</span>}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile
              label="Suppliers"
              value={summary ? summary.rows.toLocaleString('en-US') : '—'}
              sub="supplier-country rows"
            />
            <Tile
              label="Receipted spend"
              value={summary ? fmtCompactUsd(summary.totalUsd) : '—'}
              sub="the coverage denominator"
            />
            <Tile
              label="Countries"
              value={summary ? String(summary.countries) : '—'}
              sub="present in the snapshot"
            />
            <Tile
              label="Scoped"
              value={summary ? String(summary.scopedCountries) : '—'}
              sub="countries a champion has scoped"
            />
            <Tile
              label="In chase"
              value={summary ? summary.vendorsInChase.toLocaleString('en-US') : '—'}
              sub="vendors on a chase list"
            />
          </div>

          {summary && summary.rows === 0 && !summaryLoading && (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              This cycle has no snapshot yet. Nothing can be scoped or chased until the extract has
              run.
            </p>
          )}

          {/* ── Run the extract ── */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Run the extract</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              Reads every GRN&apos;d PO line in the {selected.lookback_months}-month window ending{' '}
              {dateOnly(selected.period_end)} and writes this cycle&apos;s snapshot — roughly
              413,000 rows aggregated down to about 2,800 written, so it takes several seconds.
            </p>
            <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-600">
              Re-running <span className="font-semibold text-slate-800">replaces</span> this
              cycle&apos;s snapshot with the numbers as they stand now.{' '}
              <span className="font-semibold text-slate-800">
                Chase lists already drawn are left exactly as they are
              </span>{' '}
              — no champion&apos;s correspondence, request or reminder is touched.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={extracting}
                onClick={() => extract(selected.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2A7E4F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2A7E4F]/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {extracting && <Spinner className="h-4 w-4 text-white" />}
                {extracting
                  ? 'Extracting...'
                  : selected.extracted_at
                    ? `Re-run extract for ${selected.label}`
                    : `Run extract for ${selected.label}`}
              </button>
              {extracting && (
                <span className="text-[12px] font-medium text-slate-500">
                  Aggregating receipted spend — this takes several seconds. Leave this page open.
                </span>
              )}
            </div>

            {/* Indeterminate: the extract is one server call, so there is no honest
                percentage to show — only proof that it is still moving. */}
            {extracting && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-full animate-pulse rounded-full bg-[#2A7E4F]" />
              </div>
            )}

            {extractResult && !extracting && (
              <div className="mt-3 space-y-2">
                <div className="rounded-xl border border-[#2A7E4F]/20 bg-[#2A7E4F]/[0.06] p-3">
                  <p className="text-xs font-bold text-[#2A7E4F]">Extract complete</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {extractResult.rows.toLocaleString('en-US')}
                    </span>{' '}
                    supplier-country rows written ·{' '}
                    <span className="font-semibold text-slate-800">
                      {fmtCompactUsd(extractResult.totalUsd)}
                    </span>{' '}
                    of receipted spend ·{' '}
                    <span className="font-semibold text-slate-800">
                      {extractResult.countriesMatched}
                    </span>{' '}
                    countries matched · window {dateOnly(extractResult.from)} –{' '}
                    {dateOnly(extractResult.to)}
                  </p>
                </div>

                {extractResult.spendCountriesUnmapped.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-bold text-red-700">
                      {extractResult.spendCountriesUnmapped.length} spend{' '}
                      {extractResult.spendCountriesUnmapped.length === 1 ? 'country' : 'countries'}{' '}
                      could not be mapped
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-red-700">
                      SAP spelled these countries in a way nobody has mapped, so{' '}
                      <span className="font-bold">
                        their spend is missing from every coverage denominator
                      </span>{' '}
                      — every percentage this cycle produces is measured against a total that does
                      not include them. Add each spelling to the matching country&apos;s spend names
                      and re-run the extract.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {extractResult.spendCountriesUnmapped.map((name) => (
                        <span
                          key={name}
                          className="rounded-md border border-red-200 bg-white px-2 py-0.5 font-mono text-[11px] text-red-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
