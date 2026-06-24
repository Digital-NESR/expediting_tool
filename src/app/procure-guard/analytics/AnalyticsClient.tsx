'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import ProcureGuardHero from '../components/ProcureGuardHero';
import { fmtDate, fmtDateTime, formatProcureGuardStatusLabel, getStatusBadge, usdFmt } from '@/lib/procureGuard-utils';
import type {
  ProcureGuardAnalyticsData,
  ProcureGuardAnalyticsMetric,
  ProcureGuardHighValueRequest,
  ProcureGuardMonthlyMetric,
  ProcureGuardReviewDurationMetric,
  ProcureGuardVendorMetric,
} from '@/types/procureGuard';

type SortMode = 'requests-desc' | 'amount-desc' | 'alpha-asc' | 'alpha-desc' | 'requests-asc' | 'amount-asc';

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'requests-desc', label: 'Most requests' },
  { value: 'amount-desc', label: 'Most money' },
  { value: 'alpha-asc', label: 'A-Z' },
  { value: 'alpha-desc', label: 'Z-A' },
  { value: 'requests-asc', label: 'Fewest requests' },
  { value: 'amount-asc', label: 'Least money' },
];

function sortMetricRows<T extends ProcureGuardAnalyticsMetric>(rows: T[], sortMode: SortMode): T[] {
  return [...rows].sort((a, b) => {
    if (sortMode === 'amount-desc') return b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label);
    if (sortMode === 'amount-asc') return a.amount - b.amount || a.count - b.count || a.label.localeCompare(b.label);
    if (sortMode === 'alpha-asc') return a.label.localeCompare(b.label);
    if (sortMode === 'alpha-desc') return b.label.localeCompare(a.label);
    if (sortMode === 'requests-asc') return a.count - b.count || a.amount - b.amount || a.label.localeCompare(b.label);
    return b.count - a.count || b.amount - a.amount || a.label.localeCompare(b.label);
  });
}

function sortHighValueRows(rows: ProcureGuardHighValueRequest[], sortMode: SortMode): ProcureGuardHighValueRequest[] {
  return [...rows].sort((a, b) => {
    if (sortMode === 'amount-asc') return a.amount_usd - b.amount_usd || a.vendor_name.localeCompare(b.vendor_name);
    if (sortMode === 'alpha-asc') return a.vendor_name.localeCompare(b.vendor_name) || a.reference_number.localeCompare(b.reference_number);
    if (sortMode === 'alpha-desc') return b.vendor_name.localeCompare(a.vendor_name) || b.reference_number.localeCompare(a.reference_number);
    return b.amount_usd - a.amount_usd || a.vendor_name.localeCompare(b.vendor_name);
  });
}


function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function EmptyOrForbidden() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-lg font-bold text-slate-900">Analytics unavailable</p>
        <p className="mt-2 text-sm text-slate-500">Sign in with an account that has ProcureGuard analytics access.</p>
        <Link href="/procure-guard" className="mt-5 inline-flex rounded-md bg-[#307c4c] px-4 py-2 text-sm font-bold text-white hover:bg-[#307c4c]">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'green' }: { label: string; value: string | number; detail: string; tone?: 'green' | 'blue' | 'amber' | 'slate' }) {
  const tones = {
    green: 'border-[#307c4c]/10 bg-[#307c4c]/10 text-[#307c4c]',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${tones[tone]}`}>{label}</div>
      <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function SortControl({ value, onChange }: { value: SortMode; onChange: (value: SortMode) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      Sort
      <select
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20"
        value={value}
        onChange={e => onChange(e.target.value as SortMode)}
      >
        {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BarRow({
  label,
  count,
  amount,
  maxBarValue,
  barValue,
  formatLabel = value => value,
}: {
  label: string;
  count: number;
  amount: number;
  maxBarValue: number;
  barValue: number;
  formatLabel?: (value: string) => string;
}) {
  const width = maxBarValue > 0 ? Math.max(6, Math.round((barValue / maxBarValue) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(120px,1fr)_minmax(160px,2fr)_120px] items-center gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{formatLabel(label)}</p>
        <p className="text-xs text-slate-500">{count} requests</p>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#307c4c]" style={{ width: `${width}%` }} />
      </div>
      <p className="text-right font-semibold text-slate-700">{usdFmt(amount)}</p>
    </div>
  );
}

function MetricList({ title, rows, sortMode, formatLabel }: { title: string; rows: ProcureGuardAnalyticsMetric[]; sortMode: SortMode; formatLabel?: (value: string) => string }) {
  const sortedRows = sortMetricRows(rows, sortMode);
  const useAmountBars = sortMode.startsWith('amount');
  const maxBarValue = sortedRows.reduce((max, row) => Math.max(max, useAmountBars ? row.amount : row.count), 0);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <span className="text-xs font-semibold text-slate-400">{sortedRows.length} shown</span>
      </div>
      {sortedRows.length === 0 ? (
        <p className="py-5 text-center text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {sortedRows.map(row => (
            <BarRow
              key={row.label}
              label={row.label}
              count={row.count}
              amount={row.amount}
              barValue={useAmountBars ? row.amount : row.count}
              maxBarValue={maxBarValue}
              formatLabel={formatLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function VendorTable({ rows, sortMode }: { rows: ProcureGuardVendorMetric[]; sortMode: SortMode }) {
  const sortedRows = sortMetricRows(rows, sortMode);
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Vendors Overall (USD Equivalent)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Vendor</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-right font-semibold">Adhoc</th>
              <th className="px-4 py-3 text-right font-semibold">Advance</th>
              <th className="px-4 py-3 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500">No vendor activity yet.</td></tr>
            ) : sortedRows.map(row => (
              <tr key={row.label} className="hover:bg-[#307c4c]/5">
                <td className="px-4 py-3 font-bold text-slate-900">{row.label}</td>
                <td className="px-4 py-3 text-right font-semibold">{row.count}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.adhoc_count}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.advance_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{usdFmt(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthlyTrend({ rows }: { rows: ProcureGuardMonthlyMetric[] }) {
  const maxAmount = rows.reduce((max, row) => Math.max(max, row.total_amount), 0);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Monthly Volume</h2>
        <span className="text-xs text-slate-500">Last 12 active months</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-sm text-slate-500">No monthly trend yet.</p>
      ) : (
        <div className="grid min-h-52 grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {rows.map(row => {
            const height = maxAmount > 0 ? Math.max(12, Math.round((row.total_amount / maxAmount) * 150)) : 12;
            return (
              <div key={row.month} className="flex flex-col items-center justify-end gap-2">
                <div className="flex h-40 items-end">
                  <div className="w-7 rounded-t-md bg-[#307c4c]" style={{ height }} />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-bold text-slate-700">{row.month}</p>
                  <p className="text-[11px] text-slate-500">{row.total_count} req</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


function ReviewAgingTable({ rows }: { rows: ProcureGuardReviewDurationMetric[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Review Aging</h2>
        <p className="mt-1 text-xs text-slate-500">Current open requests grouped by review owner and current step, measured from the last status update.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Review Step</th>
              <th className="px-4 py-3 text-left font-semibold">Owner</th>
              <th className="px-4 py-3 text-right font-semibold">Open</th>
              <th className="px-4 py-3 text-right font-semibold">Avg Stuck</th>
              <th className="px-4 py-3 text-right font-semibold">Total Stuck</th>
              <th className="px-4 py-3 text-right font-semibold">Longest</th>
              <th className="px-4 py-3 text-left font-semibold">Oldest Request</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-5 text-center text-slate-500">No active review items.</td></tr>
            ) : rows.map(row => {
              const badge = getStatusBadge(row.status);
              const href = `/procure-guard/${row.request_type === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${row.oldest_request_id}`;
              return (
                <tr key={`${row.request_type}-${row.status}-${row.owner_label}`} className="hover:bg-[#307c4c]/5">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                    <p className="mt-1 text-[11px] font-semibold uppercase text-slate-400">{row.request_type}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.owner_label}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{row.count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatDuration(row.average_hours)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatDuration(row.total_hours)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatDuration(row.longest_hours)}</td>
                  <td className="px-4 py-3">
                    <Link href={href} className="font-bold text-slate-900 hover:text-[#307c4c] hover:underline">{row.oldest_reference_number}</Link>
                    <p className="mt-1 text-xs text-slate-500">{row.oldest_vendor_name} | since {fmtDate(row.oldest_updated_at)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HighValueTable({ rows, sortMode }: { rows: ProcureGuardHighValueRequest[]; sortMode: SortMode }) {
  const sortedRows = sortHighValueRows(rows, sortMode);
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Highest Value Open Requests (USD Equivalent)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Reference</th>
              <th className="px-4 py-3 text-left font-semibold">Vendor</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500">No open requests.</td></tr>
            ) : sortedRows.map(row => {
              const badge = getStatusBadge(row.status);
              return (
                <tr key={`${row.request_type}-${row.id}`} className="hover:bg-[#307c4c]/5">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <Link href={`/procure-guard/${row.request_type === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${row.id}`} className="hover:text-[#307c4c] hover:underline">
                      {row.reference_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.vendor_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <p>{usdFmt(row.amount_usd)}</p>
                    {row.currency !== 'USD' && <p className="text-[11px] font-normal text-slate-500">{usdFmt(row.amount, row.currency)} original</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(row.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AnalyticsClient({ data, embedded = false }: { data: ProcureGuardAnalyticsData | null; embedded?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('requests-desc');
  const topAdhocVendor = useMemo(() => data?.top_adhoc_vendors[0], [data]);

  if (!data) return <EmptyOrForbidden />;

  return (
    <div className={`${embedded ? 'bg-white' : 'min-h-[100dvh] bg-slate-50'} text-slate-900`}>
      {!embedded && <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={data.stats.pending_review} accessView={data.actor.permissions.accessView} />}

      {!embedded && <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-bold">Analytics</span>
        <div className="ml-auto hidden text-xs text-slate-500 sm:block">Generated {fmtDateTime(data.generated_at)}</div>
      </header>}

      <main className={`${embedded ? '' : 'mx-auto max-w-[1320px] px-4 py-5'} space-y-4`}>
        {!embedded && <ProcureGuardHero title="Analytics" subtitle="Spend, vendor, and approval insights across all ProcureGuard requests." />}
        {embedded && (
          <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">ProcureGuard Payment Analytics</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">Generated {fmtDateTime(data.generated_at)}</p>
            </div>
          </section>
        )}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total USD Eq." value={usdFmt(data.stats.total_requested_amount)} detail={`${data.stats.adhoc_total + data.stats.advance_total} total requests`} tone="green" />
          <MetricCard label="Average USD Eq." value={usdFmt(data.stats.average_request_amount)} detail="Mean request value normalized to USD" tone="blue" />
          <MetricCard label="Vendors" value={data.stats.active_vendor_count} detail="Unique active vendors" tone="slate" />
          <MetricCard label="Requesters" value={data.stats.active_requester_count} detail="Unique requester emails" tone="slate" />
          <MetricCard label="Pending" value={data.stats.pending_review} detail="Active approval chain items" tone="amber" />
          <MetricCard label="Top Adhoc" value={topAdhocVendor?.label ?? 'None'} detail={topAdhocVendor ? `${topAdhocVendor.count} adhoc requests` : 'No adhoc records'} tone="green" />
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Ranking Order</p>
            <p className="text-xs text-slate-500">Applies to vendor, status, requester, and open-request lists using USD-equivalent value.</p>
          </div>
          <SortControl value={sortMode} onChange={setSortMode} />
        </section>

        <VendorTable rows={data.top_vendors} sortMode={sortMode} />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <MetricList title="Vendors That Adhoced The Most" rows={data.top_adhoc_vendors} sortMode={sortMode} />
          <MetricList title="Top Advance Payment Vendors" rows={data.top_advance_vendors} sortMode={sortMode} />
          <MetricList title="Status Breakdown" rows={data.status_breakdown} sortMode={sortMode} formatLabel={formatProcureGuardStatusLabel} />
          <MetricList title="Requester Activity" rows={data.requester_breakdown} sortMode={sortMode} />
        </section>

        <ReviewAgingTable rows={data.review_duration_metrics} />
        <MonthlyTrend rows={data.monthly_trend} />
        <HighValueTable rows={data.high_value_open_requests} sortMode={sortMode} />
      </main>
    </div>
  );
}
