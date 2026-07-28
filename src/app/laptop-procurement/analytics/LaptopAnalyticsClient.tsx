'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import LaptopShell, { GLASS } from '../components/LaptopShell';
import type { LaptopAnalyticsData, LaptopAnalyticsMetric } from '@/types/laptopProcurement';

const GREEN = '#307c4c';
const PALETTE = ['#307c4c', '#6AAF8E', '#58595B', '#C5E0D2', '#1f7a4d', '#9CA3AF', '#0e7490', '#7c3aed'];

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="mb-1 font-semibold text-slate-900">Analytics unavailable</p>
        <p className="text-sm text-slate-500">Check the Laptop Procurement database connection.</p>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={`${GLASS} p-4`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-[26px] font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function ListCard({ title, data }: { title: string; data: LaptopAnalyticsMetric[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div className={`${GLASS} p-5`}>
      <h2 className="mb-4 text-[15px] font-bold">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">No data.</p>
      ) : (
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-600">{d.label}</span>
                <span className="ml-2 font-bold text-slate-900 tabular-nums">{d.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#307c4c]" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LaptopAnalyticsClient({ data, embedded = false }: { data: LaptopAnalyticsData | null; embedded?: boolean }) {
  if (!data) return <DbError />;
  const { actor, stats } = data;

  const content = (
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Total" value={stats.total} />
          <Kpi label="Pending" value={stats.pending_review} />
          <Kpi label="Procure New" value={stats.procure_new} />
          <Kpi label="Inventory" value={stats.assigned_inventory} />
          <Kpi label="Repaired" value={stats.repaired} />
          <Kpi label="Rejected" value={stats.rejected} />
        </section>

        <section className={`${GLASS} p-5`}>
          <h2 className="mb-4 text-[15px] font-bold">Monthly Request Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.monthly_trend} margin={{ left: -10 }}>
              <defs>
                <linearGradient id="lpTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke={GREEN} strokeWidth={2} fill="url(#lpTrend)" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-slate-500">Based on the original requested date (from the Power BI export).</p>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`${GLASS} p-5`}>
            <h2 className="mb-4 text-[15px] font-bold">Status Breakdown</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.status_breakdown} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="count" fill={GREEN} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={`${GLASS} p-5`}>
            <h2 className="mb-4 text-[15px] font-bold">Device Type</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.device_breakdown} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={(entry) => { const e = entry as unknown as { label?: string; count?: number }; return `${e.label ?? ''}: ${e.count ?? 0}`; }} labelLine={false}>
                  {data.device_breakdown.map((entry, i) => <Cell key={entry.label} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListCard title="Request Types" data={data.request_type_breakdown} />
          <ListCard title="Top Requested Models" data={data.top_models} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListCard title="Top Countries" data={data.country_breakdown} />
          <ListCard title="Top Segments" data={data.segment_breakdown} />
        </section>

        <p className="text-center text-xs text-slate-500">Generated {new Date(data.generated_at).toLocaleString('en-GB')}</p>
      </div>
  );

  if (embedded) return content;

  return (
    <LaptopShell
      title="Analytics"
      subtitle={`${stats.total} requests · ${stats.country_count} countries · ${stats.active_requester_count} requesters`}
      pendingCount={stats.pending_review}
      accessView={actor.permissions.accessView}
    >
      {content}
    </LaptopShell>
  );
}
