'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import { fmtDateTime } from '@/lib/procureGuard-utils';
import type {
  ProcureGuardAdminAnalyticsData,
  ProcureGuardUsageClickMetric,
  ProcureGuardUsagePageMetric,
  ProcureGuardUsageUserMetric,
} from '@/types/procureGuard';

type SortMode = 'activity' | 'time' | 'alpha';

function formatDuration(ms: number | null | undefined): string {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function EmptyOrForbidden() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 p-6">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-bold text-slate-900">Admin analytics unavailable</p>
        <p className="mt-2 text-sm text-slate-500">Sign in with admin access to view ProcureGuard usage analytics.</p>
        <Link href="/procure-guard" className="mt-5 inline-flex rounded-md bg-[#307c4c] px-4 py-2 text-sm font-bold text-white hover:bg-[#307c4c]/90">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-[#307c4c]">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
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
        <option value="activity">Most activity</option>
        <option value="time">Most time</option>
        <option value="alpha">A-Z</option>
      </select>
    </label>
  );
}

function PageMetricsTable({ rows, sortMode }: { rows: ProcureGuardUsagePageMetric[]; sortMode: SortMode }) {
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortMode === 'alpha') return a.path.localeCompare(b.path);
    if (sortMode === 'time') return b.total_duration_ms - a.total_duration_ms || b.views - a.views;
    return b.views - a.views || b.total_duration_ms - a.total_duration_ms;
  }), [rows, sortMode]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Page Time</h2>
        <p className="mt-1 text-xs text-slate-500">Where users spend the most time across ProcureGuard.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Page</th>
              <th className="px-4 py-3 text-right font-semibold">Views</th>
              <th className="px-4 py-3 text-right font-semibold">Sessions</th>
              <th className="px-4 py-3 text-right font-semibold">Avg. Time</th>
              <th className="px-4 py-3 text-right font-semibold">Total Time</th>
              <th className="px-4 py-3 text-right font-semibold">Longest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No page tracking yet. Open a few ProcureGuard pages, then come back here.</td></tr>
            ) : sortedRows.map(row => (
              <tr key={row.path} className="hover:bg-[#307c4c]/5">
                <td className="max-w-[420px] px-4 py-3">
                  <p className="truncate font-bold text-slate-900">{row.page_title || row.path}</p>
                  <p className="truncate text-xs text-slate-500">{row.path}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{row.views}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.sessions}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatDuration(row.average_duration_ms)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDuration(row.total_duration_ms)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatDuration(row.longest_duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClickMetricsTable({ rows, sortMode }: { rows: ProcureGuardUsageClickMetric[]; sortMode: SortMode }) {
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortMode === 'alpha') return a.target_label.localeCompare(b.target_label);
    if (sortMode === 'time') return b.average_click_delay_ms - a.average_click_delay_ms || b.clicks - a.clicks;
    return b.clicks - a.clicks || b.average_click_delay_ms - a.average_click_delay_ms;
  }), [rows, sortMode]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Clicks And Decision Delay</h2>
        <p className="mt-1 text-xs text-slate-500">Average time from landing on a page until a user clicks a control.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Clicked Control</th>
              <th className="px-4 py-3 text-left font-semibold">Page</th>
              <th className="px-4 py-3 text-right font-semibold">Clicks</th>
              <th className="px-4 py-3 text-right font-semibold">Users</th>
              <th className="px-4 py-3 text-right font-semibold">Avg. To Click</th>
              <th className="px-4 py-3 text-right font-semibold">Slowest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No click tracking yet.</td></tr>
            ) : sortedRows.map(row => (
              <tr key={`${row.path}-${row.target_label}-${row.target_href || row.target_tag}`} className="hover:bg-[#307c4c]/5">
                <td className="max-w-[340px] px-4 py-3">
                  <p className="truncate font-bold text-slate-900">{row.target_label}</p>
                  <p className="truncate text-xs text-slate-500">{row.target_tag}{row.target_href ? ` · ${row.target_href}` : ''}</p>
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-slate-600">{row.path}</td>
                <td className="px-4 py-3 text-right font-semibold">{row.clicks}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.users}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDuration(row.average_click_delay_ms)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{formatDuration(row.slowest_click_delay_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserMetricsTable({ rows }: { rows: ProcureGuardUsageUserMetric[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">User Behavior</h2>
        <p className="mt-1 text-xs text-slate-500">Per-user activity captured in the last 30 days.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">User</th>
              <th className="px-4 py-3 text-right font-semibold">Page Views</th>
              <th className="px-4 py-3 text-right font-semibold">Clicks</th>
              <th className="px-4 py-3 text-right font-semibold">Sessions</th>
              <th className="px-4 py-3 text-right font-semibold">Avg. Page Time</th>
              <th className="px-4 py-3 text-right font-semibold">Avg. To Click</th>
              <th className="px-4 py-3 text-right font-semibold">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No user activity yet.</td></tr>
            ) : rows.map(row => (
              <tr key={row.user_email} className="hover:bg-[#307c4c]/5">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{row.user_name || row.user_email}</p>
                  <p className="text-xs text-slate-500">{row.user_email}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{row.page_views}</td>
                <td className="px-4 py-3 text-right font-semibold">{row.clicks}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.sessions}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatDuration(row.average_page_duration_ms)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatDuration(row.average_click_delay_ms)}</td>
                <td className="px-4 py-3 text-right text-slate-500">{fmtDateTime(row.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminAnalyticsClient({ data, embedded = false }: { data: ProcureGuardAdminAnalyticsData | null; embedded?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('activity');

  if (!data) return <EmptyOrForbidden />;

  return (
    <div className={`${embedded ? '' : 'min-h-[100dvh]'} bg-white text-slate-900`}>
      {!embedded && <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={data.pending_review} accessView={data.actor.permissions.accessView} />}
      {!embedded && <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <ProcureGuardLogo size="md" />
          <div>
            <p className="text-sm font-bold leading-tight">Admin Analytics</p>
            <p className="text-xs text-slate-500">Last 30 days · generated {fmtDateTime(data.generated_at)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/admin?tool=procureguard-admin" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
              Admin Panel
            </Link>
          </div>
        </div>
      </header>}

      <main className={`${embedded ? '' : 'mx-auto max-w-[1320px] px-4 py-5'}`}>
        <section className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#307c4c]">Usage Tracking</p>
            <h1 className="text-2xl font-black text-slate-950">How users move through ProcureGuard</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Page time and clicks are captured locally for signed-in ProcureGuard users. Form field values are not recorded.</p>
          </div>
          <SortControl value={sortMode} onChange={setSortMode} />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Page Views" value={data.summary.page_views} detail="Completed page visits" />
          <MetricCard label="Clicks" value={data.summary.clicks} detail="Tracked button/link/control clicks" />
          <MetricCard label="Sessions" value={data.summary.sessions} detail="Browser sessions" />
          <MetricCard label="Users" value={data.summary.users} detail="Distinct signed-in users" />
          <MetricCard label="Avg. Page Time" value={formatDuration(data.summary.average_page_duration_ms)} detail="Average page visit duration" />
          <MetricCard label="Avg. To Click" value={formatDuration(data.summary.average_click_delay_ms)} detail="Average delay before a click" />
        </section>

        <section className="mt-5 grid grid-cols-1 gap-5">
          <PageMetricsTable rows={data.page_metrics} sortMode={sortMode} />
          <ClickMetricsTable rows={data.click_metrics} sortMode={sortMode} />
          <UserMetricsTable rows={data.user_metrics} />
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Recent Tracking Events</h2>
            <p className="mt-1 text-xs text-slate-500">Useful for confirming the tracker is firing while testing locally.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Event</th>
                  <th className="px-4 py-3 text-left font-semibold">User</th>
                  <th className="px-4 py-3 text-left font-semibold">Page / Click</th>
                  <th className="px-4 py-3 text-right font-semibold">Timing</th>
                  <th className="px-4 py-3 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_events.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No events recorded yet.</td></tr>
                ) : data.recent_events.map(row => (
                  <tr key={row.id} className="hover:bg-[#307c4c]/5">
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.event_type === 'click' ? 'bg-blue-50 text-blue-700' : 'bg-[#307c4c]/10 text-[#307c4c]'}`}>
                        {row.event_type === 'click' ? 'Click' : 'Page view'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.user_name || row.user_email}</p>
                      <p className="text-xs text-slate-500">{row.user_email}</p>
                    </td>
                    <td className="max-w-[520px] px-4 py-3">
                      <p className="truncate font-semibold text-slate-900">{row.event_type === 'click' ? row.target_text || 'Unknown click' : row.page_title || row.path}</p>
                      <p className="truncate text-xs text-slate-500">{row.target_href || row.path}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatDuration(row.duration_ms)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmtDateTime(row.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
