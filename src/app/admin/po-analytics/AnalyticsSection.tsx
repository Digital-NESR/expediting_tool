'use client';

/* ─── One titled section of the panel: heading, KPI row and the charts beneath it. ─── */

import type { BuyerRow, ExpeditingAnalytics, RecentSession } from '@/app/actions/adminAnalytics';
import { KpiCard, SectionTitle } from '@/app/po-expediting/analytics/_components';
import {
  AvgResponseTimeBarChart,
  BuyerLinesBarChart,
  ResponseRateLineChart,
  SupplierBarChart,
} from './charts';
import { BuyerTable, SessionsTable, SupplierTable } from './tables';

/* ─── Analytics Section ───────────────────────────────────────── */

export function AnalyticsSection({
  analytics,
  onBuyerClick,
  onSupplierClick,
  onSessionClick,
}: {
  analytics: ExpeditingAnalytics;
  onBuyerClick: (buyer: BuyerRow) => void;
  onSupplierClick: (name: string) => void;
  onSessionClick: (session: RecentSession) => void;
}) {
  const rateColor =
    analytics.overallResponseRate === null
      ? 'text-slate-800'
      : analytics.overallResponseRate >= 70
        ? 'text-[#307c4c]'
        : analytics.overallResponseRate >= 30
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Row 1 — KPI cards */}
      <div>
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total PO Lines Expedited"
            value={analytics.totalLinesExpedited.toLocaleString()}
            accent
          />
          <KpiCard
            label="Total Suppliers Contacted"
            value={analytics.totalSuppliersContacted.toLocaleString()}
            accent
          />
          <KpiCard label="Total Emails Sent" value={analytics.totalEmailsSent.toLocaleString()} />
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Overall Response Rate
            </p>
            <p className={`text-3xl font-bold tracking-tight ${rateColor}`}>
              {analytics.overallResponseRate !== null ? `${analytics.overallResponseRate}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2 — Charts */}
      <div>
        <SectionTitle>Trends</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ResponseRateLineChart data={analytics.weeklyRateData} />
          <BuyerLinesBarChart data={analytics.buyerBreakdown} />
        </div>
      </div>

      {/* Row 3 — Buyer Activity */}
      <div>
        <SectionTitle>Buyer Activity</SectionTitle>
        <BuyerTable rows={analytics.buyerBreakdown} onBuyerClick={onBuyerClick} />
      </div>

      {/* Row 4 — Supplier Performance charts */}
      <div>
        <SectionTitle>Supplier Performance</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SupplierBarChart data={analytics.supplierBreakdown} />
          <AvgResponseTimeBarChart data={analytics.supplierResponseTime} />
        </div>
      </div>

      {/* Row 5 — Supplier Response Rates table */}
      <div>
        <SectionTitle>Supplier Response Rates</SectionTitle>
        <SupplierTable rows={analytics.supplierBreakdown} onSupplierClick={onSupplierClick} />
      </div>

      {/* Row 6 — Recent Sessions */}
      <div>
        <SectionTitle>Recent Expediting Sessions</SectionTitle>
        <SessionsTable rows={analytics.recentSessions} onSessionClick={onSessionClick} />
      </div>
    </div>
  );
}
