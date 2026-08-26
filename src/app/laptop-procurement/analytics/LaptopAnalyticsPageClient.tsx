'use client';

import LaptopShell from '../components/LaptopShell';
import LaptopAnalyticsClient from './LaptopAnalyticsClient';
import type { LaptopAccessView, LaptopAnalyticsData } from '@/types/laptopProcurement';

export default function LaptopAnalyticsPageClient({
  data,
  accessView,
}: {
  data: LaptopAnalyticsData | null;
  accessView: LaptopAccessView;
}) {
  return (
    <LaptopShell
      title="Analytics"
      subtitle={data ? `${data.stats.total} requests · ${data.stats.country_count} countries · ${data.stats.active_requester_count} requesters` : undefined}
      pendingCount={data?.stats.pending_review}
      accessView={accessView}
    >
      <p className="mb-5 text-xs text-slate-500">Requests in the countries you review, plus any you submitted yourself.</p>
      <LaptopAnalyticsClient data={data} embedded />
    </LaptopShell>
  );
}
