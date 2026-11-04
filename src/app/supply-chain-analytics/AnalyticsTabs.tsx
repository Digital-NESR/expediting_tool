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

   Tab 3 is the PO book from the SAP extract warehouse. Admin-only, like the Power BI tab:
   it is company-wide purchasing data with no country scoping of its own, and the travel grant
   says nothing about who may see it.

   Both native boards are pulled in with next/dynamic so recharts stays out of the bundle a
   Power-BI-only reader downloads. Prerendering is left on: they are ordinary client components
   whose props the server already resolved.
   ───────────────────────────────────────────────────────────── */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { TravelAnalyticsData } from '@/lib/travel-analytics/queries';
import type { PurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import type { PastDueAnalysis } from '@/lib/purchase-orders/past-due';
import type { PoFilterOptions } from '@/lib/purchase-orders/filters';

const boardSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-slate-100" />
      ))}
    </div>
    <div className="h-80 rounded-2xl bg-slate-100" />
  </div>
);

const TravelAnalyticsClient = dynamic(() => import('./TravelAnalyticsClient'), {
  loading: boardSkeleton,
});

const PurchaseOrderAnalyticsClient = dynamic(() => import('./PurchaseOrderAnalyticsClient'), {
  loading: boardSkeleton,
});

type TabId = 'power-bi' | 'travel' | 'purchase-orders';

export default function AnalyticsTabs({
  embedUrl,
  travel,
  purchaseOrders,
  pastDue,
  poOptions,
  showPowerBi,
  showPurchaseOrders,
}: {
  embedUrl: string;
  travel: TravelAnalyticsData | null;
  purchaseOrders: PurchaseOrderAnalytics | null;
  pastDue: PastDueAnalysis | null;
  poOptions: PoFilterOptions | null;
  showPowerBi: boolean;
  showPurchaseOrders: boolean;
}) {
  const tabs: { id: TabId; label: string; sub: string }[] = [
    ...(showPowerBi
      ? [{ id: 'power-bi' as const, label: 'Supply Chain Health Board', sub: 'Power BI · 2026' }]
      : []),
    { id: 'travel' as const, label: 'Travel Portal', sub: 'Live from the travel feed' },
    ...(showPurchaseOrders
      ? [
          {
            id: 'purchase-orders' as const,
            label: 'Purchase Orders',
            sub: 'SAP extract · refreshed daily',
          },
        ]
      : []),
  ];

  /* Unchanged: a platform admin lands on the Power BI board, everyone else on the travel one. */
  const [tab, setTab] = useState<TabId>(showPowerBi ? 'power-bi' : 'travel');

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
      ) : tab === 'travel' ? (
        <div className="flex-1 p-6">
          <TravelAnalyticsClient data={travel} />
        </div>
      ) : (
        <div className="flex-1 p-6">
          {/* Without the option lists there is no filter bar to render, and a board whose
              filters are missing is more confusing than one that says so. */}
          {poOptions ? (
            <PurchaseOrderAnalyticsClient
              data={purchaseOrders}
              pastDue={pastDue}
              options={poOptions}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
              <p className="text-[15px] font-semibold text-slate-900">
                Purchase order data unavailable
              </p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
                The SAP extract warehouse could not be reached. The other boards on this page are
                unaffected.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
