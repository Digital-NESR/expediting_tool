import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { currentActor } from '@/lib/require-access';
import { travelScopeFor } from '@/lib/travel-analytics/grants';
import { loadTravelAnalytics } from '@/lib/travel-analytics/queries';
import type { TravelAnalyticsData } from '@/lib/travel-analytics/queries';
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
   loudly in a review rather than quietly in production. */
export const maxDuration = 30;

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
  let travel: TravelAnalyticsData | null = null;
  if (scope) {
    try {
      travel = await loadTravelAnalytics(scope);
    } catch (err) {
      log.error('travel board unavailable', err);
    }
  }

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
        showPowerBi={actor.isPlatformAdmin}
      />
    </div>
  );
}
