'use client';

/* ─── PO Expediting analytics, the admin view.

   This file was 1,589 lines: three drill-down modals, three sortable tables, four charts, a
   filter multi-select and the panel that arranges them. Those are in ./po-analytics now; what
   is left here is the panel — the filter state, the fetches it drives, and the layout.

   The badges, sort helpers and layout shells the extracted parts use are NOT duplicated: they
   come from the shared analytics kit at '@/app/po-expediting/analytics/_components', which the
   three analytics surfaces already share, and the date and currency formatters from
   '@/lib/format'. That was true before this split and is worth keeping true.
   ─── */

import type { BuyerRow, ExpeditingAnalytics, RecentSession } from '@/app/actions/adminAnalytics';
import { getFilterOptions, getTeamAnalyticsData } from '@/app/actions/teamAnalytics';
import type {
  FilterOptions,
  TeamAnalyticsData,
  TeamAnalyticsFilters,
} from '@/app/actions/teamAnalytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminMultiSelect } from './po-analytics/AdminMultiSelect';
import { AnalyticsSection } from './po-analytics/AnalyticsSection';
import {
  AdminSessionDetailModal,
  AdminSupplierDetailModal,
  BuyerDetailModal,
} from './po-analytics/modals';

/* ─── Props ──────────────────────────────────────────────────── */

interface PoAnalyticsPanelProps {
  analytics: ExpeditingAnalytics;
}

/* ─── PoAnalyticsPanel ────────────────────────────────────────── */

export default function PoAnalyticsPanel({ analytics: initialAnalytics }: PoAnalyticsPanelProps) {
  const [liveAnalytics, setLiveAnalytics] = useState<ExpeditingAnalytics>(initialAnalytics);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());

  // Modal state
  const [buyerModal, setBuyerModal] = useState<BuyerRow | null>(null);
  const [supplierModalName, setSupplierModalName] = useState<string | null>(null);
  const [sessionModal, setSessionModal] = useState<RecentSession | null>(null);

  // Filter state
  const [poFilterOpts, setPoFilterOpts] = useState<FilterOptions | null>(null);
  const [poDateFrom, setPoDateFrom] = useState('');
  const [poDateTo, setPoDateTo] = useState('');
  const [poBuyers, setPoBuyers] = useState<string[]>([]);
  const [poCountries, setPoCountries] = useState<string[]>([]);
  const [poSegments, setPoSegments] = useState<string[]>([]);
  const [poSuppliers, setPoSuppliers] = useState<string[]>([]);
  const [poTeamData, setPoTeamData] = useState<TeamAnalyticsData | null>(null);

  // Load filter options on mount
  useEffect(() => {
    getFilterOptions().then(setPoFilterOpts);
  }, []);

  const poHasActiveFilters =
    !!poDateFrom ||
    !!poDateTo ||
    poBuyers.length > 0 ||
    poCountries.length > 0 ||
    poSegments.length > 0 ||
    poSuppliers.length > 0;

  function clearPoFilters() {
    setPoDateFrom('');
    setPoDateTo('');
    setPoBuyers([]);
    setPoCountries([]);
    setPoSegments([]);
    setPoSuppliers([]);
  }

  // Stable ref for current filter values
  const poFiltersRef = useRef<TeamAnalyticsFilters>({});
  poFiltersRef.current = {
    dateFrom: poDateFrom || undefined,
    dateTo: poDateTo || undefined,
    buyerEmails: poBuyers.length ? poBuyers : undefined,
    countries: poCountries.length ? poCountries : undefined,
    segments: poSegments.length ? poSegments : undefined,
    supplierNames: poSuppliers.length ? poSuppliers : undefined,
  };

  const fetchAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (poHasActiveFilters || poTeamData !== null) {
        // Use filtered fetch
        const result = await getTeamAnalyticsData(poFiltersRef.current);
        setPoTeamData(result);
        // Also sync to liveAnalytics shape for AnalyticsSection compatibility
        setLiveAnalytics({
          totalLinesExpedited: result.totalLinesExpedited,
          totalSuppliersContacted: result.totalSuppliersContacted,
          totalEmailsSent: result.totalEmailsSent,
          overallResponseRate: result.overallResponseRate,
          buyerBreakdown: result.buyerBreakdown,
          supplierBreakdown: result.supplierBreakdown,
          recentSessions: result.recentSessions,
          weeklyRateData: result.weeklyRateData,
          supplierResponseTime: result.supplierResponseTime,
        });
      } else {
        // Same action as the filtered branch, just with no filters — it used to be
        // getExpeditingAnalytics, an unfiltered clone that had drifted out of sync.
        const data = await getTeamAnalyticsData({});
        setLiveAnalytics(data);
      }
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [poHasActiveFilters, poTeamData]);

  // Debounce filter changes
  const poFilterInitialDone = useRef(false);
  const poDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!poFilterInitialDone.current) {
      poFilterInitialDone.current = true;
      return;
    }
    if (poDebounceRef.current) clearTimeout(poDebounceRef.current);
    poDebounceRef.current = setTimeout(() => fetchAnalytics(), 500);
    return () => {
      if (poDebounceRef.current) clearTimeout(poDebounceRef.current);
    };
  }, [poDateFrom, poDateTo, poBuyers, poCountries, poSegments, poSuppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            PO Expediting Analytics
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Last updated:{' '}
            {lastRefreshed.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
        >
          <svg
            className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px]">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Date From
            </label>
            <input
              type="date"
              value={poDateFrom}
              onChange={(e) => setPoDateFrom(e.target.value)}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Date To
            </label>
            <input
              type="date"
              value={poDateTo}
              onChange={(e) => setPoDateTo(e.target.value)}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors"
            />
          </div>
          {poFilterOpts && (
            <>
              <AdminMultiSelect
                label="Expeditor"
                options={poFilterOpts.buyers}
                selected={poBuyers}
                onChange={setPoBuyers}
                searchable
              />
              <AdminMultiSelect
                label="Country"
                options={poFilterOpts.countries.map((c) => ({ value: c, label: c }))}
                selected={poCountries}
                onChange={setPoCountries}
              />
              <AdminMultiSelect
                label="P Group"
                options={poFilterOpts.segments.map((s) => ({ value: s, label: s }))}
                selected={poSegments}
                onChange={setPoSegments}
                searchable
              />
              <AdminMultiSelect
                label="Supplier"
                options={poFilterOpts.suppliers.map((s) => ({ value: s, label: s }))}
                selected={poSuppliers}
                onChange={setPoSuppliers}
                searchable
              />
            </>
          )}
          {poHasActiveFilters && (
            <button
              onClick={clearPoFilters}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors pb-2"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <div
        className={`transition-opacity ${isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
      >
        <AnalyticsSection
          analytics={liveAnalytics}
          onBuyerClick={setBuyerModal}
          onSupplierClick={setSupplierModalName}
          onSessionClick={setSessionModal}
        />
      </div>

      {/* ── Modals ── */}
      {buyerModal && (
        <BuyerDetailModal
          buyer={buyerModal}
          onClose={() => setBuyerModal(null)}
          onSessionClick={setSessionModal}
        />
      )}
      {supplierModalName && (
        <AdminSupplierDetailModal
          supplierName={supplierModalName}
          onClose={() => setSupplierModalName(null)}
        />
      )}
      {sessionModal && (
        <AdminSessionDetailModal session={sessionModal} onClose={() => setSessionModal(null)} />
      )}
    </>
  );
}
