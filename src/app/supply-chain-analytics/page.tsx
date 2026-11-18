import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { currentActor } from '@/lib/require-access';
import { travelScopeFor } from '@/lib/travel-analytics/grants';
import { loadTravelAnalytics } from '@/lib/travel-analytics/queries';
import type { TravelAnalyticsData } from '@/lib/travel-analytics/queries';
import { loadPurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import type { PurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import { loadPoFilterOptions } from '@/lib/purchase-orders/options';
import { materialsTarget } from '@/lib/db-materials';
import { describeDbError } from '@/lib/db/describe-error';
import { EMPTY_FILTERS, type PoFilterOptions } from '@/lib/purchase-orders/filters';
import { logger } from '@/lib/logger';
import AnalyticsTabs from './AnalyticsTabs';

const log = logger('supply-chain-analytics');

/* The Power BI report/tenant/workspace ids are configuration, not source.
   Read server-side (no NEXT_PUBLIC_ prefix) with the previous hard-coded
   values as defaults, so an unset env changes nothing. */
const POWERBI_REPORT_ID =
  process.env.POWERBI_SCA_REPORT_ID ?? 'c1485412-17dc-476d-8c80-dc56714d9e53';
const POWERBI_TENANT_ID = process.env.POWERBI_TENANT_ID ?? '5f13d1c2-10ac-49b8-a85e-4bb3d91135b9';
const POWERBI_WORKSPACE_ID = process.env.POWERBI_SCA_WORKSPACE_ID ?? '';

function embedUrl(): string {
  const params = new URLSearchParams({
    reportId: POWERBI_REPORT_ID,
    autoAuth: 'true',
    ctid: POWERBI_TENANT_ID,
  });
  // Only sent when configured — the report embedded fine without it.
  if (POWERBI_WORKSPACE_ID) params.set('groupId', POWERBI_WORKSPACE_ID);
  return `https://app.powerbi.com/reportEmbed?${params.toString()}`;
}

/* The travel board reads five tables across two databases, and the slowest part is the
   cost-centre mapping. Well inside the platform default today — this is here because the
   figure that will grow is the bookings table, and a page that starts timing out should do so
   loudly in a review rather than quietly in production.

   The PO board is the bigger consumer now: ten aggregates over a 747k-row fact table. Raised
   to 60s after the PO board's first load was measured at ~17s against a 30s ceiling — close
   enough that a cold start plus a slow round would have tripped it. This is a ceiling, not a
   wait: a fast page is unaffected. The work to stay under it was done in the queries and the
   pool, not here. */
export const maxDuration = 60;

export default async function SupplyChainAnalyticsPage() {
  /* The layout gates this segment, but layouts do not re-render on navigation
     and layout/page render in parallel — so the same rule is re-checked here.
     When it fails the layout renders the Access Denied card, so this page
     renders nothing. */
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const scope = await travelScopeFor(actor.email);
  if (!actor.isPlatformAdmin && !scope) return null;

  /* A failure here must not take the Power BI tab down with it: the two boards share a page and
     nothing else. A travel feed that is unreachable renders the same card as no access, which
     is the honest answer — there is nothing to show either way — and the reason is logged. */
  /* Each board is loaded independently and a failure in one renders that board's own
     unavailable card. The warehouse belongs to another pipeline, so it is the most likely of
     the three to be missing, and it must not take the travel board or the Power BI tab with
     it. They resolve in parallel, so the page costs the slower rather than their sum. */
  /* Each board is loaded independently and a failure in one renders that board's own
     unavailable card. The warehouse belongs to another pipeline, so it is the most likely of
     the three to be missing, and it must not take the travel board or the Power BI tab with
     it. They resolve in parallel, so the page costs the slower rather than their sum.

     The PO tab needs three things — overview, past due, and the filter option lists — and a
     failure in any one of them blanks only the piece it feeds. */
  /* Why the PO board failed, if it did. The card used to say "could not be reached" whatever
     happened, which is no help when the same code works locally: a reader who can see the real
     reason and the connection it was attempted on can act, and this page is admin-only. */
  let poFailure: string | null = null;

  /* Past due is deliberately NOT loaded here. It is the second of two views behind a switch,
     and loading it with the rest put ~22 aggregates on this pool in one burst — enough that
     queries at the back of the queue timed out waiting for a connection. The client fetches it
     the first time that view is opened. */
  const [travel, purchaseOrders, poOptions]: [
    TravelAnalyticsData | null,
    PurchaseOrderAnalytics | null,
    PoFilterOptions | null,
  ] = await Promise.all([
    scope
      ? loadTravelAnalytics(scope).catch((err) => {
          log.error('travel board unavailable', err);
          return null;
        })
      : null,
    actor.isPlatformAdmin
      ? loadPurchaseOrderAnalytics(EMPTY_FILTERS).catch((err) => {
          log.error('purchase order board unavailable', err);
          return null;
        })
      : null,
    actor.isPlatformAdmin
      ? loadPoFilterOptions().catch((err) => {
          poFailure = describeDbError(err);
          log.error('purchase order filters unavailable', err, { target: materialsTarget() });
          return null;
        })
      : null,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-slate-900">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#307c4c]" />
          <span className="text-sm font-semibold text-slate-900">Supply Chain Analytics</span>
        </div>
        {actor.isPlatformAdmin && (
          <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
            Admin Preview
          </span>
        )}
      </header>

      {/* The embed url is built only for a reader who gets that tab. It is configuration rather
          than a credential, but a travel reader who never sees the Power BI board has no reason
          to receive the report and tenant ids in their page payload. */}
      <AnalyticsTabs
        embedUrl={actor.isPlatformAdmin ? embedUrl() : ''}
        travel={travel}
        purchaseOrders={purchaseOrders}
        poOptions={poOptions}
        poFailure={poFailure}
        poTarget={materialsTarget()}
        showSourcing={actor.isPlatformAdmin}
        showPowerBi={actor.isPlatformAdmin}
        showPurchaseOrders={actor.isPlatformAdmin}
      />
    </div>
  );
}
