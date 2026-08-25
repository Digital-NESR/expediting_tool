'use client';

import { useState } from 'react';
import LaptopShell from '../components/LaptopShell';
import LaptopAnalyticsClient from './LaptopAnalyticsClient';
import type { LaptopAccessView, LaptopAnalyticsData } from '@/types/laptopProcurement';

type Tab = 'personal' | 'global';

export default function LaptopAnalyticsPageClient({
  personal,
  globalData,
  accessView,
}: {
  personal: LaptopAnalyticsData | null;
  globalData: LaptopAnalyticsData | null;
  accessView: LaptopAccessView;
}) {
  const [tab, setTab] = useState<Tab>('personal');
  const active = tab === 'personal' ? personal : globalData;

  return (
    <LaptopShell
      title="Analytics"
      subtitle={active ? `${active.stats.total} requests · ${active.stats.country_count} countries · ${active.stats.active_requester_count} requesters` : undefined}
      pendingCount={active?.stats.pending_review}
      accessView={accessView}
    >
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab('personal')}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === 'personal' ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Personal
          </button>
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === 'global' ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Global
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {tab === 'personal'
            ? 'Requests in the countries you review, plus any you submitted yourself.'
            : 'Every request across the whole app, regardless of country.'}
        </p>
      </div>

      <LaptopAnalyticsClient data={active} embedded />
    </LaptopShell>
  );
}
