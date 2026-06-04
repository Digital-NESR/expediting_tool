'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import { ALERT_PILL, ALERT_DOT, ALERT_LABEL, fmtDate, usdFmt, getStatusBadge } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

/* ─── Error / empty states ───────────────────────────────────── */

function DbError() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Please contact your administrator.</p>
      </div>
    </div>
  );
}

/* ─── MOT icon ───────────────────────────────────────────────── */

function MotIcon({ mot }: { mot: string | null }) {
  const m = (mot || '').toLowerCase();
  if (m.includes('air')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z" />
    </svg>
  );
  if (m.includes('sea')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1M19 13V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6M12 10v4M12 2v3" />
    </svg>
  );
  if (m.includes('land') || m.includes('lnad')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

/* ─── Alert display map ──────────────────────────────────────── */

const ALERT_DISPLAY: Record<string, string> = {
  overdue: 'Overdue',
  urgent:  'Urgent (≤7 days)',
  action:  'Action (8-14 days)',
  plan:    'Plan (15-30 days)',
  info:    'Monitor (31-60 days)',
  ok:      'On Track (60+ days)',
  closed:  'Closed',
};

const ALL_ALERT_OPTIONS = ['overdue', 'urgent', 'action', 'plan', 'info', 'ok', 'closed'];
const ALL_STATUS_OPTIONS = ['Open', 'Open - Extended', 'Closed', 'Closed - Refund Recovered'];

/* ─── Main ───────────────────────────────────────────────────── */

export default function ShipmentsClient({ shipments, viewOnly }: { shipments: Shipment[] | null; viewOnly?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  /* filter state */
  const [search,             setSearch]             = useState('');
  const [filterCountries,    setFilterCountries]    = useState<string[]>([]);
  const [filterSegments,     setFilterSegments]     = useState<string[]>([]);
  const [filterMovementTypes,setFilterMovementTypes]= useState<string[]>([]);
  const [filterStatuses,     setFilterStatuses]     = useState<string[]>([]);
  const [filterAlerts,       setFilterAlerts]       = useState<string[]>([]);

  const list = shipments ?? [];
  const activeCount = list.filter(s => s.status !== 'Closed' && s.status !== 'Closed - Refund Recovered').length;
  const urgentCount = list.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  const hasActiveFilters =
    search !== '' ||
    filterCountries.length > 0 ||
    filterSegments.length > 0 ||
    filterMovementTypes.length > 0 ||
    filterStatuses.length > 0 ||
    filterAlerts.length > 0;

  function clearAllFilters() {
    setSearch('');
    setFilterCountries([]);
    setFilterSegments([]);
    setFilterMovementTypes([]);
    setFilterStatuses([]);
    setFilterAlerts([]);
  }

  /* ── Cascading option lists ── */

  // Base: apply all filters except the one being computed
  const afterSearch = useMemo(() => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(s =>
      s.reference_number?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.invoice_number?.toLowerCase().includes(q) ||
      s.customs_reference_number?.toLowerCase().includes(q) ||
      s.awb_number?.toLowerCase().includes(q) ||
      s.po_number?.toLowerCase().includes(q)
    );
  }, [list, search]);

  const applyFilters = (
    src: Shipment[],
    {
      countries    = filterCountries,
      segments     = filterSegments,
      movementTypes= filterMovementTypes,
      statuses     = filterStatuses,
      alerts       = filterAlerts,
    }: {
      countries?:     string[];
      segments?:      string[];
      movementTypes?: string[];
      statuses?:      string[];
      alerts?:        string[];
    } = {},
  ) => src.filter(s => {
    if (countries.length     && !countries.includes(s.country      ?? '(Blank)'))      return false;
    if (segments.length      && !segments.includes(s.segment        ?? '(Blank)'))      return false;
    if (movementTypes.length && !movementTypes.includes(s.movement_type ?? '(Blank)')) return false;
    if (statuses.length      && !statuses.includes(s.status))                           return false;
    if (alerts.length        && !alerts.includes(s.alert_level))                        return false;
    return true;
  });

  const countryOptions = useMemo(() =>
    [...new Set(
      applyFilters(afterSearch, { countries: [] })
        .map(s => s.country ?? '(Blank)')
    )].sort()
  , [afterSearch, filterSegments, filterMovementTypes, filterStatuses, filterAlerts]);

  const segmentOptions = useMemo(() =>
    [...new Set(
      applyFilters(afterSearch, { segments: [] })
        .map(s => s.segment ?? '(Blank)')
    )].sort()
  , [afterSearch, filterCountries, filterMovementTypes, filterStatuses, filterAlerts]);

  const movementTypeOptions = useMemo(() =>
    [...new Set(
      applyFilters(afterSearch, { movementTypes: [] })
        .map(s => s.movement_type ?? '(Blank)')
        .filter(Boolean)
    )].sort()
  , [afterSearch, filterCountries, filterSegments, filterStatuses, filterAlerts]);

  const statusOptions = useMemo(() =>
    ALL_STATUS_OPTIONS.filter(st =>
      applyFilters(afterSearch, { statuses: [] }).some(s => s.status === st)
    )
  , [afterSearch, filterCountries, filterSegments, filterMovementTypes, filterAlerts]);

  const alertOptions = useMemo(() =>
    ALL_ALERT_OPTIONS.filter(al =>
      applyFilters(afterSearch, { alerts: [] }).some(s => s.alert_level === al)
    )
  , [afterSearch, filterCountries, filterSegments, filterMovementTypes, filterStatuses]);

  /* ── Final filtered rows ── */

  const rows = useMemo(() => applyFilters(afterSearch), [
    afterSearch, filterCountries, filterSegments,
    filterMovementTypes, filterStatuses, filterAlerts,
  ]);

  const totalDep = rows.reduce((a, s) => a + (Number(s.deposit_usd) || 0), 0);

  if (shipments === null) return <DbError />;

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeCount={activeCount} urgentCount={urgentCount} />

      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Shipment Register</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 pb-16 pt-6">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Shipment register</p>
            <h1 className="text-2xl font-bold tracking-tight">Shipment register</h1>
            <p className="text-sm text-slate-500 mt-1">
              {rows.length} of {list.length} records · Customs deposit on view: <strong className="tabular-nums">{usdFmt(totalDep)}</strong>
            </p>
          </div>
          {!viewOnly && (
            <button
              onClick={() => router.push('/ti-te/shipments/new')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#006B0C' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New shipment
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 mb-4">
          {/* Search row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                className="flex-1 text-sm outline-none placeholder-slate-400 bg-transparent"
                placeholder="Search by description, reference, invoice no, customs ref..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors shrink-0"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Dropdown row */}
          <div className="flex flex-wrap gap-2">
            <MultiSelectDropdown
              label="Country"
              options={countryOptions}
              selectedOptions={filterCountries}
              onChange={setFilterCountries}
            />
            <MultiSelectDropdown
              label="Segment"
              options={segmentOptions}
              selectedOptions={filterSegments}
              onChange={setFilterSegments}
            />
            <MultiSelectDropdown
              label="Movement Type"
              options={movementTypeOptions}
              selectedOptions={filterMovementTypes}
              onChange={setFilterMovementTypes}
            />
            <MultiSelectDropdown
              label="Status"
              options={statusOptions}
              selectedOptions={filterStatuses}
              onChange={setFilterStatuses}
            />
            <MultiSelectDropdown
              label="Alert"
              options={alertOptions}
              selectedOptions={filterAlerts}
              onChange={setFilterAlerts}
              displayMap={ALERT_DISPLAY}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: '#006B0C18' }}>
                <svg className="w-6 h-6" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" /></svg>
              </div>
              <p className="font-semibold text-slate-900 mb-1">No shipments found</p>
              <p className="text-sm text-slate-500 mb-5">Add your first TI-TE shipment to get started.</p>
              {!viewOnly && (
                <button onClick={() => router.push('/ti-te/shipments/new')} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#006B0C' }}>Add Shipment</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['#', 'Segment / Description', 'Route', 'MOT', 'Customs Ref.', 'Deposit (USD)', 'Import date', 'Effective expiry', 'Owner', 'Status', ''].map((h, i) => (
                      <th key={i} className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id} onClick={() => router.push(`/ti-te/shipments/${s.id}`)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[12px] text-slate-500">{String(s.id).padStart(3, '0')}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{s.segment || '—'}</div>
                        <div className="text-[11.5px] text-slate-400 max-w-[220px] truncate">{(s.description || '').slice(0, 55)}{(s.description || '').length > 55 ? '…' : ''}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-[12.5px] text-slate-700">
                          <span>{s.from_country || '—'}</span>
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                          <span>{s.to_country || '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-slate-500 text-[12.5px]">
                          <MotIcon mot={s.mot} />
                          {s.mot || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-slate-500">{s.customs_reference_number || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] whitespace-nowrap">{usdFmt(s.deposit_usd)}</td>
                      <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap">{fmtDate(s.import_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="text-[12.5px]">{fmtDate(s.extended_date || s.expiry_date)}</div>
                        {s.extended_date && (
                          <div className="text-[11px] text-slate-400 line-through">{fmtDate(s.expiry_date)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full text-white font-bold text-[9px] flex items-center justify-center shrink-0" style={{ background: '#006B0C' }}>
                            {(s.created_by || '').split(' ').map((p: string) => p[0]).slice(0, 2).join('')}
                          </span>
                          <span className="text-[12px] text-slate-600">{(s.created_by || '').split(' ')[0] || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => { const sb = getStatusBadge(s.status); return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${sb.className}`}>
                            {sb.label}
                          </span>
                        ); })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">No shipments match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
