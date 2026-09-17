'use client';

/* ─────────────────────────────────────────────────────────────
   SOA Consolidation · Excluded vendors.

   NESR's own entities appear in receipted spend like any supplier —
   EOS JAFZA is $250M across ten countries in the current cycle — and
   nobody emails a colleague to ask them to confirm a statement of
   account. So these vendors are never chased.

   They are NOT removed from the coverage denominator. The money did
   move; taking it out of the total as well would inflate every
   percentage and make the SOP's threshold easier to hit than it is
   meant to be. That distinction is the thing most likely to be
   misread here, so the panel says it in its own copy rather than
   leaving it to a code comment.

   Excluding is also not retrospective: a chase list already drawn
   keeps the vendor, because deleting the entry would delete the
   correspondence recorded against it. `addSoaExcludedVendor` returns
   how many live entries remain precisely so this screen can say so.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import {
  addSoaExcludedVendor,
  getSoaExcludedVendors,
  removeSoaExcludedVendor,
  searchSoaSupplierCandidates,
  type ExcludedVendorRow,
  type SupplierCandidate,
} from '@/app/actions/soa/excluded';
import { formatSessionDate } from '@/lib/format';

/** NESR's group entities share this SAP supplier-code block — eight suppliers, one big one. */
const NESR_GROUP_PREFIX = '00013';

/** `$250.6M` — these run to hundreds of millions and read badly in full. */
function fmtCompactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-[#2A7E4F]`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A7E4F]';

export default function SoaExcludedVendorsClient() {
  const [rows, setRows] = useState<ExcludedVendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState('');

  // Search over the ACTIVE cycle's snapshot, by name or supplier code.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SupplierCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // The reason editor, open for at most one candidate at a time.
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  /** What the last exclusion did — including how many drawn entries it did NOT touch. */
  const [outcome, setOutcome] = useState<{ name: string; liveEntries: number } | null>(null);

  const reload = useCallback(async () => {
    setRows(await getSoaExcludedVendors());
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    getSoaExcludedVendors()
      .then((data) => {
        setRows(data);
        setLastRefreshed(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  /* Debounced: the search runs against the snapshot, which is the biggest table in this
     database, so it should not fire on every keystroke. Under two characters the action
     returns nothing anyway, so the request is not made at all. */
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      // Deleting back below two characters cancels the pending search, so the
      // spinner has to be cleared here or it never stops.
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setResults(await searchSoaSupplierCandidates(term));
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await reload();
      const term = query.trim();
      if (term.length >= 2) setResults(await searchSoaSupplierCandidates(term));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function exclude(candidate: SupplierCandidate) {
    setError('');
    if (!reason.trim()) {
      setError('A reason is required — it is what explains the gap to whoever audits this later.');
      return;
    }
    setAdding(true);
    const result = await addSoaExcludedVendor({
      vendorNo: candidate.vendorNo,
      name: candidate.name,
      reason: reason.trim(),
    });
    setAdding(false);
    if (!result.success) {
      setError(result.error ?? 'Could not exclude the vendor.');
      return;
    }
    setOutcome({ name: candidate.name, liveEntries: result.data?.liveEntries ?? 0 });
    setEditing(null);
    setReason('');
    await reload();
    const term = query.trim();
    if (term.length >= 2) setResults(await searchSoaSupplierCandidates(term));
  }

  async function putBack(row: ExcludedVendorRow) {
    setError('');
    setOutcome(null);
    setRemoving(row.vendorNo);
    const result = await removeSoaExcludedVendor(row.vendorNo);
    setRemoving(null);
    if (!result.success) {
      setError(result.error ?? 'Could not remove the exclusion.');
      return;
    }
    await reload();
    const term = query.trim();
    if (term.length >= 2) setResults(await searchSoaSupplierCandidates(term));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
        <Spinner />
        <span className="text-sm font-medium">Loading excluded vendors...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Excluded Vendors</h2>
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
        <button
          type="button"
          disabled={isRefreshing}
          onClick={refresh}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* The one thing that gets misread. Stated as its own block, not as a footnote. */}
      <div className="rounded-2xl border border-[#2A7E4F]/20 bg-[#2A7E4F]/[0.06] p-4">
        <p className="text-sm font-bold text-[#2A7E4F]">Not chased — but still counted</p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
          NESR&apos;s own entities turn up in receipted spend like any supplier, and nobody emails a
          colleague to ask them to confirm a statement of account. An excluded vendor is{' '}
          <span className="font-semibold text-slate-800">never scoped into a chase list</span>.
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
          It stays in the <span className="font-semibold text-slate-800">coverage denominator</span>
          , because the money did move. Removing it from the total as well would inflate every
          percentage and make the SOP&apos;s threshold easier to hit than it is meant to be — so
          excluding a vendor never improves a country&apos;s coverage figure.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* What the last exclusion actually did to chase lists already drawn. */}
      {outcome && (
        <div
          className={`rounded-xl border p-3 ${
            outcome.liveEntries > 0
              ? 'border-[#fde68a] bg-[#fffbeb]'
              : 'border-[#2A7E4F]/20 bg-[#2A7E4F]/[0.06]'
          }`}
        >
          <p
            className={`text-xs font-bold ${
              outcome.liveEntries > 0 ? 'text-[#b45309]' : 'text-[#2A7E4F]'
            }`}
          >
            {outcome.name} excluded
          </p>
          {outcome.liveEntries > 0 ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[#92400e]">
              This exclusion applies to <span className="font-bold">future scoping only</span>.{' '}
              <span className="font-bold">
                {outcome.liveEntries} existing{' '}
                {outcome.liveEntries === 1 ? 'entry remains' : 'entries remain'}
              </span>{' '}
              on chase lists already drawn in the active cycle, and{' '}
              {outcome.liveEntries === 1 ? 'it is' : 'they are'} left exactly as{' '}
              {outcome.liveEntries === 1 ? 'it is' : 'they are'} — removing{' '}
              {outcome.liveEntries === 1 ? 'it' : 'them'} would delete the requests, reminders and
              correspondence already recorded against {outcome.liveEntries === 1 ? 'it' : 'them'}. A
              champion can still close {outcome.liveEntries === 1 ? 'that entry' : 'those entries'}{' '}
              out by hand.
            </p>
          ) : (
            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
              No chase list in the active cycle contains it, so nothing else changes. It will not be
              scoped into one from now on.
            </p>
          )}
        </div>
      )}

      {/* ── Find a supplier to exclude ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Find a supplier</h3>
        <p className="mt-1 text-[12px] text-slate-400">
          Searches the active cycle&apos;s spend snapshot by name{' '}
          <span className="font-semibold text-slate-600">or</span> supplier code — at least two
          characters. Most candidates have never been scoped; the point is to catch them before they
          are.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setEditing(null);
            }}
            placeholder="Name or supplier code..."
            className={`${INPUT} sm:max-w-md`}
          />
          <button
            type="button"
            onClick={() => {
              setQuery(NESR_GROUP_PREFIX);
              setEditing(null);
            }}
            className="rounded-lg border border-[#2A7E4F]/30 bg-[#2A7E4F]/10 px-3 py-2 text-xs font-semibold whitespace-nowrap text-[#2A7E4F] hover:bg-[#2A7E4F]/15"
          >
            Review NESR group entities ({NESR_GROUP_PREFIX}…)
          </button>
          {searching && <Spinner className="h-4 w-4" />}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          NESR&apos;s group entities share the supplier-code block{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">{NESR_GROUP_PREFIX}</code>, so that one
          search lists them together.
        </p>

        {searched && results.length === 0 && !searching && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Nothing in the active cycle&apos;s snapshot matches “{query.trim()}”. A supplier with no
            receipted spend this cycle does not appear here.
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Supplier</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Cycle spend</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Countries</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((c) => {
                    const open = editing === c.vendorNo;
                    return (
                      <tr key={c.vendorNo} className="align-top hover:bg-[#2A7E4F]/[0.03]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{c.name}</p>
                          <p className="font-mono text-xs text-slate-400">{c.vendorNo}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap text-slate-800">
                          {fmtCompactUsd(c.spendUsd)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.countries}</td>
                        <td className="px-4 py-3 text-right">
                          {c.excluded ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-slate-500">
                              Already excluded
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(open ? null : c.vendorNo);
                                setReason('');
                                setError('');
                              }}
                              className="rounded-lg bg-[#2A7E4F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2A7E4F]/90"
                            >
                              Exclude...
                            </button>
                          )}

                          {open && (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Reason <span className="text-red-600">(required)</span>
                                </span>
                                <input
                                  value={reason}
                                  autoFocus
                                  onChange={(e) => setReason(e.target.value)}
                                  placeholder="e.g. NESR group entity — intercompany balance, not chased"
                                  className={INPUT}
                                />
                              </label>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                                The reason is what explains the gap to whoever audits this later —
                                it is stored against the exclusion with your name and the date. An
                                exclusion without one is refused.
                              </p>
                              <div className="mt-2.5 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={adding || !reason.trim()}
                                  onClick={() => exclude(c)}
                                  className="rounded-lg bg-[#2A7E4F] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2A7E4F]/90 disabled:opacity-50"
                                >
                                  {adding ? 'Excluding...' : `Exclude ${c.vendorNo}`}
                                </button>
                                <button
                                  type="button"
                                  disabled={adding}
                                  onClick={() => {
                                    setEditing(null);
                                    setReason('');
                                  }}
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
      </div>

      {/* ── The current exclusion list ── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Currently excluded
          </h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {rows.length}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
            No vendor is excluded. Every supplier above the cycle threshold will be chased.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Vendor</th>
                    <th className="px-4 py-3 text-left font-semibold">Spend this cycle</th>
                    <th className="px-4 py-3 text-left font-semibold">Reason</th>
                    <th className="px-4 py-3 text-left font-semibold">Excluded by</th>
                    <th className="px-4 py-3 text-left font-semibold">Drawn entries</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.vendorNo} className="align-top hover:bg-[#2A7E4F]/[0.03]">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{r.name}</p>
                        <p className="font-mono text-xs text-slate-400">{r.vendorNo}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-800">
                          {fmtCompactUsd(r.cycleSpendUsd)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {r.cycleSpendUsd > 0 ? 'still in the denominator' : 'no spend this cycle'}
                        </p>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-xs leading-relaxed text-slate-600">
                        {r.reason || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <p className="font-medium text-slate-700">{r.excludedBy}</p>
                        <p className="mt-0.5">{formatSessionDate(r.excludedAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {r.liveEntries > 0 ? (
                          <>
                            <span className="inline-flex items-center rounded-full border border-[#fde68a] bg-[#fef3c7] px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-[#b45309]">
                              {r.liveEntries} live
                            </span>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                              On chase lists drawn before the exclusion; kept so the correspondence
                              recorded against them survives.
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={removing === r.vendorNo}
                          onClick={() => putBack(r)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          {removing === r.vendorNo ? 'Removing...' : 'Put back in scope'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-2 text-[11px] text-slate-400">
          Putting a vendor back in scope does not redraw anything on its own — it reappears the next
          time a champion scopes their country.
        </p>
      </div>
    </div>
  );
}
