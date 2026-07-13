'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import ProcureGuardHero from '../components/ProcureGuardHero';
import { fmtDate, fmtDateTime, formatProcureGuardStatusLabel, getStatusBadge, isActiveApprovalStatus, usdFmt } from '@/lib/procureGuard-utils';
import type {
  ProcureGuardAnalyticsData,
  ProcureGuardAnalyticsMetric,
  ProcureGuardAnalyticsRequest,
  ProcureGuardHighValueRequest,
  ProcureGuardMonthlyMetric,
  ProcureGuardReviewDurationMetric,
  ProcureGuardVendorMetric,
} from '@/types/procureGuard';

type RequestScope = 'all' | 'adhoc' | 'advance';

const SCOPE_TABS: Array<{ value: RequestScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'adhoc', label: 'Adhoc POs' },
  { value: 'advance', label: 'Advance Payments' },
];

interface ScopedAnalytics {
  count: number;
  total_amount: number;
  average_amount: number;
  vendor_count: number;
  requester_count: number;
  pending: number;
  top_vendor: ProcureGuardVendorMetric | null;
  vendors: ProcureGuardVendorMetric[];
  status_breakdown: ProcureGuardAnalyticsMetric[];
  requester_breakdown: ProcureGuardAnalyticsMetric[];
  monthly_trend: ProcureGuardMonthlyMetric[];
  high_value_open_requests: ProcureGuardHighValueRequest[];
}

function monthSortKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '0000-00' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function bump(map: Map<string, ProcureGuardAnalyticsMetric>, label: string, amount: number) {
  const key = (label || 'Unspecified').trim() || 'Unspecified';
  const row = map.get(key) ?? { label: key, count: 0, amount: 0 };
  row.count += 1;
  row.amount += amount;
  map.set(key, row);
}

// Aggregate a filtered slice of requests into every metric the analytics UI needs. Runs on the
// client so switching tabs or typing a supplier filter is instant with no server round-trip.
function aggregate(requests: ProcureGuardAnalyticsRequest[]): ScopedAnalytics {
  const vendors = new Map<string, ProcureGuardVendorMetric>();
  const status = new Map<string, ProcureGuardAnalyticsMetric>();
  const requesters = new Map<string, ProcureGuardAnalyticsMetric>();
  const monthly = new Map<string, ProcureGuardMonthlyMetric & { _key: string }>();
  const vendorSet = new Set<string>();
  const requesterSet = new Set<string>();
  let totalAmount = 0;
  let pending = 0;

  for (const r of requests) {
    totalAmount += r.amount_usd;
    vendorSet.add(r.vendor_name.toLowerCase());
    if (r.requested_by_email) requesterSet.add(r.requested_by_email.toLowerCase());
    if (isActiveApprovalStatus(r.status)) pending += 1;

    const vk = r.vendor_name || 'Unspecified';
    const v = vendors.get(vk) ?? { label: vk, count: 0, amount: 0, adhoc_count: 0, adhoc_amount: 0, advance_count: 0, advance_amount: 0 };
    v.count += 1;
    v.amount += r.amount_usd;
    if (r.request_type === 'adhoc') { v.adhoc_count += 1; v.adhoc_amount += r.amount_usd; }
    else { v.advance_count += 1; v.advance_amount += r.amount_usd; }
    vendors.set(vk, v);

    bump(status, r.status, r.amount_usd);
    bump(requesters, r.requested_by_name || r.requested_by_email, r.amount_usd);

    const mk = monthSortKey(r.created_at);
    const m = monthly.get(mk) ?? { _key: mk, month: monthLabel(r.created_at), adhoc_count: 0, adhoc_amount: 0, advance_count: 0, advance_amount: 0, total_count: 0, total_amount: 0 };
    if (r.request_type === 'adhoc') { m.adhoc_count += 1; m.adhoc_amount += r.amount_usd; }
    else { m.advance_count += 1; m.advance_amount += r.amount_usd; }
    m.total_count += 1;
    m.total_amount += r.amount_usd;
    monthly.set(mk, m);
  }

  const vendorList = [...vendors.values()];
  const topVendor = [...vendorList].sort((a, b) => b.count - a.count || b.amount - a.amount)[0] ?? null;

  const highValue = requests
    .filter(r => isActiveApprovalStatus(r.status))
    .map(r => ({
      id: r.id,
      request_type: r.request_type,
      reference_number: r.reference_number,
      vendor_name: r.vendor_name,
      status: r.status,
      amount: r.amount,
      amount_usd: r.amount_usd,
      currency: r.currency,
      created_at: r.created_at,
    }))
    .sort((a, b) => b.amount_usd - a.amount_usd)
    .slice(0, 8);

  return {
    count: requests.length,
    total_amount: totalAmount,
    average_amount: requests.length ? totalAmount / requests.length : 0,
    vendor_count: vendorSet.size,
    requester_count: requesterSet.size,
    pending,
    top_vendor: topVendor,
    vendors: vendorList,
    status_breakdown: [...status.values()],
    requester_breakdown: [...requesters.values()],
    monthly_trend: [...monthly.values()].sort((a, b) => a._key.localeCompare(b._key)).slice(-12),
    high_value_open_requests: highValue,
  };
}

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
      <div className={`inline-flex rounded-md border px-2 py-1 text-[0.6875rem] font-bold uppercase ${tones[tone]}`}>{label}</div>
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
                  <p className="text-[0.6875rem] font-bold text-slate-700">{row.month}</p>
                  <p className="text-[0.6875rem] text-slate-500">{row.total_count} req</p>
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
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${badge.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                    <p className="mt-1 text-[0.6875rem] font-semibold uppercase text-slate-400">{row.request_type}</p>
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
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${badge.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <p>{usdFmt(row.amount_usd)}</p>
                    {row.currency !== 'USD' && <p className="text-[0.6875rem] font-normal text-slate-500">{usdFmt(row.amount, row.currency)} original</p>}
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

function ScopeTabs({ value, onChange, counts }: { value: RequestScope; onChange: (v: RequestScope) => void; counts: Record<RequestScope, number> }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
      {SCOPE_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition ${
            value === tab.value ? 'bg-[#307c4c] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {tab.label}
          <span className={`ml-1.5 text-xs font-semibold ${value === tab.value ? 'text-white/80' : 'text-slate-400'}`}>{counts[tab.value]}</span>
        </button>
      ))}
    </div>
  );
}

function SupplierSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search a supplier…"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Clear supplier search">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

export default function AnalyticsClient({ data, embedded = false }: { data: ProcureGuardAnalyticsData | null; embedded?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('requests-desc');
  const [scope, setScope] = useState<RequestScope>('all');
  const [supplierQuery, setSupplierQuery] = useState('');

  const requests = useMemo(() => data?.requests ?? [], [data]);

  const counts = useMemo<Record<RequestScope, number>>(() => ({
    all: requests.length,
    adhoc: requests.filter(r => r.request_type === 'adhoc').length,
    advance: requests.filter(r => r.request_type === 'advance').length,
  }), [requests]);

  const scoped = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    const filtered = requests.filter(r =>
      (scope === 'all' || r.request_type === scope) &&
      (!q || r.vendor_name.toLowerCase().includes(q)),
    );
    return aggregate(filtered);
  }, [requests, scope, supplierQuery]);

  const reviewAging = useMemo(
    () => (data?.review_duration_metrics ?? []).filter(row => scope === 'all' || row.request_type === scope),
    [data, scope],
  );

  if (!data) return <EmptyOrForbidden />;

  const scopeNoun = scope === 'adhoc' ? 'adhoc PO' : scope === 'advance' ? 'advance payment' : 'request';

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
              <p className="text-[0.75rem] text-gray-400 mt-0.5">Generated {fmtDateTime(data.generated_at)}</p>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <ScopeTabs value={scope} onChange={setScope} counts={counts} />
          <SupplierSearch value={supplierQuery} onChange={setSupplierQuery} />
        </section>

        {supplierQuery.trim() && (
          <p className="px-1 text-xs font-semibold text-slate-500">
            Showing {scoped.count} {scopeNoun}{scoped.count === 1 ? '' : 's'} for suppliers matching “{supplierQuery.trim()}”.
          </p>
        )}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total USD Eq." value={usdFmt(scoped.total_amount)} detail={`${scoped.count} ${scopeNoun}${scoped.count === 1 ? '' : 's'}`} tone="green" />
          <MetricCard label="Average USD Eq." value={usdFmt(scoped.average_amount)} detail="Mean value normalized to USD" tone="blue" />
          <MetricCard label="Vendors" value={scoped.vendor_count} detail="Unique vendors in view" tone="slate" />
          <MetricCard label="Requesters" value={scoped.requester_count} detail="Unique requesters in view" tone="slate" />
          <MetricCard label="Pending" value={scoped.pending} detail="Active approval chain items" tone="amber" />
          <MetricCard label="Top Vendor" value={scoped.top_vendor?.label ?? 'None'} detail={scoped.top_vendor ? `${scoped.top_vendor.count} ${scopeNoun}${scoped.top_vendor.count === 1 ? '' : 's'}` : 'No records'} tone="green" />
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Ranking Order</p>
            <p className="text-xs text-slate-500">Applies to vendor, status, requester, and open-request lists using USD-equivalent value.</p>
          </div>
          <SortControl value={sortMode} onChange={setSortMode} />
        </section>

        <VendorTable rows={scoped.vendors.slice(0, 25)} sortMode={sortMode} />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <MetricList title="Top Vendors" rows={scoped.vendors} sortMode={sortMode} />
          <MetricList title="Status Breakdown" rows={scoped.status_breakdown} sortMode={sortMode} formatLabel={formatProcureGuardStatusLabel} />
          <MetricList title="Requester Activity" rows={scoped.requester_breakdown} sortMode={sortMode} />
        </section>

        <MonthlyTrend rows={scoped.monthly_trend} />
        <ReviewAgingTable rows={reviewAging} />
        <HighValueTable rows={scoped.high_value_open_requests} sortMode={sortMode} />
      </main>
    </div>
  );
}
