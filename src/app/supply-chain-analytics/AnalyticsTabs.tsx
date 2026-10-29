'use client';

/* ─────────────────────────────────────────────────────────────
   The two Supply Chain Analytics boards.

   Tab 1 is the Power BI report exactly as it was before this page became tabbed: the same
   iframe, the same src, the same sizing. It is shown only to platform admins, which is who
   could reach the whole page until the Travel Portal tab arrived.

   Tab 2 is drawn natively from Postgres and is gated on a travel grant instead. The two
   audiences overlap but neither contains the other, so the tab strip renders what this
   particular reader is entitled to and nothing else — a tab that shows an access-denied card
   is a worse answer than no tab.

   The travel board is pulled in with next/dynamic so recharts stays out of the bundle a
   Power-BI-only reader downloads. Prerendering is left on: it is an ordinary client component
   whose props the server already resolved.
   ───────────────────────────────────────────────────────────── */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { TravelAnalyticsData } from '@/lib/travel-analytics/queries';

const TravelAnalyticsClient = dynamic(() => import('./TravelAnalyticsClient'), {
  loading: () => (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-slate-100" />
    </div>
  ),
});

type TabId = 'power-bi' | 'travel';

export default function AnalyticsTabs({
  embedUrl,
  travel,
  showPowerBi,
}: {
  embedUrl: string;
  travel: TravelAnalyticsData | null;
  showPowerBi: boolean;
}) {
  const [tab, setTab] = useState<TabId>(showPowerBi ? 'power-bi' : 'travel');

  const tabs: { id: TabId; label: string; sub: string }[] = [
    ...(showPowerBi
      ? [
          {
            id: 'power-bi' as const,
            label: 'Supply Chain Health Board',
            sub: 'Power BI · 2026',
          },
        ]
      : []),
    { id: 'travel', label: 'Travel Portal', sub: 'Live from the travel feed' },
  ];

  return (
    <main className="flex flex-1 flex-col">
      {/* ── Tab strip ── */}
      <div className="border-b border-gray-100 bg-white px-6">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-[#307c4c] text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-[11px] font-normal text-slate-400">{t.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The board ── */}
      {tab === 'power-bi' ? (
        /* Unchanged from before the tabs: same container, same iframe, same minimum height. */
        <div className="flex-1 p-6">
          <div className="h-full min-h-[600px] w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
            <iframe
              title="Supply Chain Health Board - 2026"
              src={embedUrl}
              className="h-full min-h-[600px] w-full border-0"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 p-6">
          <TravelAnalyticsClient data={travel} />
        </div>
      )}
    </main>
  );
}
