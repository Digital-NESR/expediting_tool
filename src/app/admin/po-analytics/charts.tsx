'use client';

/* ─── The four charts. Recharts is heavy, and keeping it to one module means one import site to
   reach for if these are ever loaded on demand. ─── */

import type {
  BuyerRow,
  SupplierResponseTimeRow,
  SupplierRow,
  WeeklyRateRow,
} from '@/app/actions/adminAnalytics';
import { ChartCard } from '@/app/po-expediting/analytics/_components';
import { formatWeek } from '@/lib/format';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/* ─── Chart 1 — Response Rate Over Time ──────────────────────── */

export function ResponseRateLineChart({ data }: { data: WeeklyRateRow[] }) {
  const chartData = data.map((d) => ({
    week: formatWeek(d.week),
    linesExpedited: d.lines_expedited,
    linesResponded: d.lines_responded,
  }));

  const showLabels = chartData.length <= 12;

  return (
    <ChartCard title="Expediting vs Responses by Week">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              Number(value).toLocaleString(),
              name === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded',
            ]}
          />
          <Legend
            formatter={(value) =>
              value === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded'
            }
          />
          <Line
            type="monotone"
            dataKey="linesExpedited"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 4, fill: '#059669' }}
            activeDot={{ r: 6 }}
            name="linesExpedited"
          >
            {showLabels && (
              <LabelList
                dataKey="linesExpedited"
                position="top"
                formatter={(v: unknown) => Number(v).toLocaleString()}
                style={{ fontSize: 11, fill: '#059669', fontWeight: 600 }}
              />
            )}
          </Line>
          <Line
            type="monotone"
            dataKey="linesResponded"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
            name="linesResponded"
          >
            {showLabels && (
              <LabelList
                dataKey="linesResponded"
                position="bottom"
                formatter={(v: unknown) => Number(v).toLocaleString()}
                style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }}
              />
            )}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Chart 3 — PO Lines Expedited by Buyer ──────────────────── */

export function BuyerLinesBarChart({ data }: { data: BuyerRow[] }) {
  const chartData = data.map((r) => ({
    name: r.display_name ?? 'Unknown',
    lines: r.total_lines,
  }));

  return (
    <ChartCard title="PO Lines Expedited by Buyer">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            formatter={(v: unknown) => [
              typeof v === 'number' ? v.toLocaleString() : String(v),
              'PO Lines',
            ]}
          />
          <Bar dataKey="lines" fill="#307c4c" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="lines"
              position="top"
              formatter={(v: unknown) => (typeof v === 'number' ? v.toLocaleString() : String(v))}
              style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Chart 2 — Top 10 Suppliers by Response Rate ────────────── */

export function SupplierBarChart({ data }: { data: SupplierRow[] }) {
  const chartData = data
    .filter((r) => Number(r.times_expedited) >= 1)
    .sort((a, b) => (b.response_rate ?? 0) - (a.response_rate ?? 0))
    .map((r) => ({
      supplierName: String(r.supplier_name || '').slice(0, 25),
      responseRate: Number(r.response_rate) || 0,
      linesResponded: Number(r.lines_responded) || 0,
      totalLines: Number(r.total_lines) || 0,
    }));

  const chartHeight = Math.max(320, chartData.length * 40);

  return (
    <ChartCard title="Top 10 Suppliers by Response Rate">
      <div
        style={{
          height: 400,
          overflowY: 'auto',
          overflowX: 'hidden',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '8px 0',
        }}
      >
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 30, bottom: 10, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v: unknown) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="supplierName"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={180}
              />
              <Tooltip formatter={(v: unknown) => [`${v}%`, 'Response Rate']} />
              <Bar dataKey="responseRate" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={
                      entry.responseRate >= 70
                        ? '#059669'
                        : entry.responseRate >= 30
                          ? '#f59e0b'
                          : '#ef4444'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/* ─── Chart — Avg Response Time by Supplier ──────────────────── */

export function AvgResponseTimeBarChart({ data }: { data: SupplierResponseTimeRow[] }) {
  const chartData = data.map((r) => ({
    supplierName: String(r.supplier_name || '').slice(0, 28),
    avgDays: r.avg_days_to_respond,
    responsesCount: r.responses_count,
  }));

  const chartHeight = Math.max(320, chartData.length * 40);

  return (
    <ChartCard title="Avg. Response Time by Supplier (Days)">
      <div
        style={{
          height: 400,
          overflowY: 'auto',
          overflowX: 'hidden',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '8px 0',
        }}
      >
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 40, bottom: 10, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v: unknown) => `${v}d`}
              />
              <YAxis
                type="category"
                dataKey="supplierName"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={180}
              />
              <Tooltip
                formatter={(
                  v: unknown,
                  _: unknown,
                  props: { payload?: { responsesCount?: number } },
                ) => [
                  `${v} days avg (${props.payload?.responsesCount ?? 0} responses)`,
                  'Response Time',
                ]}
              />
              <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={
                      entry.avgDays <= 1 ? '#059669' : entry.avgDays <= 3 ? '#f59e0b' : '#ef4444'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
