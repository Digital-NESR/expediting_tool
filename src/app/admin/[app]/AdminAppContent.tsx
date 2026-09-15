'use client';

/* ─────────────────────────────────────────────────────────────
   Client dispatcher for one admin app. The server route
   (/admin/[app]/page.tsx) fetches only this app's data and passes
   it here; this component renders the section selected in the URL.
   Every tool panel below is reused as-is from its own feature
   folder — nothing about the tools themselves changed, only how
   they are loaded.

   Each panel is pulled in with next/dynamic so Webpack emits ONE
   CHUNK PER PANEL instead of folding all 24 (recharts twice, plus
   lucide) into a single bundle every admin route had to download.
   Prerendering is left ON (no `ssr: false`): these are ordinary
   client components that already rendered on the server before this
   change, so the server-fetched props and the moment data appears
   are exactly as they were — only the client chunk boundary moved.
   ───────────────────────────────────────────────────────────── */

import dynamic from 'next/dynamic';
import type { TiteAnalyticsShipment } from '@/types/tite';
import type {
  ProcureGuardAdminAnalyticsData,
  ProcureGuardAdminData,
  ProcureGuardAnalyticsData,
} from '@/types/procureGuard';
import type { LaptopAdminData, LaptopAnalyticsData } from '@/types/laptopProcurement';
import type { LearningHubAdminData } from '@/types/learning-hub';
import type { LearningHubAnalytics } from '@/types/learning-hub';
import type { ExpeditingAnalytics } from '@/app/actions/adminAnalytics';

/* Same shape as ./loading.tsx — the skeleton the route already shows
   while a section's server data loads — so a panel chunk arriving a
   beat later looks like a continuation of that, not a new state. */
function PanelSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-6 w-56 rounded-md bg-slate-200" />
      <div className="mb-6 h-20 w-full rounded-xl bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="mt-6 h-64 w-full rounded-xl bg-slate-100" />
    </div>
  );
}

const loading = () => <PanelSkeleton />;

/* ── PO Expediting ── */
const PoAnalyticsPanel = dynamic(() => import('../PoAnalyticsPanel'), { loading });
const AccessApprovalsClient = dynamic(() => import('../AccessApprovalsClient'), { loading });

/* ── TI-TE ── */
const TiteMigrationClient = dynamic(() => import('../TiteMigrationClient'), { loading });
const TiteAccessApprovalsClient = dynamic(() => import('../TiteAccessApprovalsClient'), {
  loading,
});
const TiteDefaultNotifiersClient = dynamic(() => import('../TiteDefaultNotifiersClient'), {
  loading,
});
const TiteAnalyticsClient = dynamic(() => import('../TiteAnalyticsClient'), { loading });

/* ── ProcureGuard ── */
const ProcureGuardAccessApprovalsClient = dynamic(
  () => import('../ProcureGuardAccessApprovalsClient'),
  { loading },
);
const ProcureGuardAdminPanelClient = dynamic(
  () => import('../../procure-guard/admin/AdminPanelClient'),
  { loading },
);
const ProcureGuardAnalyticsClient = dynamic(
  () => import('../../procure-guard/analytics/AnalyticsClient'),
  { loading },
);
const ProcureGuardAdminAnalyticsClient = dynamic(
  () => import('../../procure-guard/admin-analytics/AdminAnalyticsClient'),
  { loading },
);

/* ── SourceGuide (named exports of one module) ── */
const SourceGuideAccessApprovalsClient = dynamic(
  () => import('../SourceGuideAdmin').then((m) => m.SourceGuideAccessApprovalsClient),
  { loading },
);
const SourceGuideGuidesClient = dynamic(
  () => import('../SourceGuideAdmin').then((m) => m.SourceGuideGuidesClient),
  { loading },
);
const SourceGuideAnalyticsClient = dynamic(
  () => import('../SourceGuideAdmin').then((m) => m.SourceGuideAnalyticsClient),
  { loading },
);
const SourceGuideChampionsClient = dynamic(
  () => import('../SourceGuideAdmin').then((m) => m.SourceGuideChampionsClient),
  { loading },
);

/* ── Catalog Repo (named exports of one module) ── */
const CatalogAccessApprovalsClient = dynamic(
  () => import('../CatalogRepoAdmin').then((m) => m.CatalogAccessApprovalsClient),
  { loading },
);
const CatalogAdminPanelClient = dynamic(
  () => import('../CatalogRepoAdmin').then((m) => m.CatalogAdminPanelClient),
  { loading },
);
const CatalogSyncHealthClient = dynamic(
  () => import('../CatalogRepoAdmin').then((m) => m.CatalogSyncHealthClient),
  { loading },
);

/* ── S&S Registry ── */
const SnsAccessApprovalsClient = dynamic(() => import('../SnsAccessApprovalsClient'), { loading });
const SnsReferenceDataClient = dynamic(() => import('../SnsReferenceDataClient'), { loading });

/* ── Laptop Procurement ── */
const LaptopAdminClient = dynamic(
  () => import('../../laptop-procurement/admin/LaptopAdminClient'),
  { loading },
);
const LaptopAnalyticsClient = dynamic(
  () => import('../../laptop-procurement/analytics/LaptopAnalyticsClient'),
  { loading },
);
const LaptopApproverMatrixClient = dynamic(() => import('../LaptopApproverMatrixClient'), {
  loading,
});
const LaptopAccessApprovalsClient = dynamic(() => import('../LaptopAccessApprovalsClient'), {
  loading,
});

/* ── Learning Hub ── */
const LearningHubAdminClient = dynamic(() => import('../../learning-hub/admin/AdminClient'), {
  loading,
});
const LearningHubAnalyticsClient = dynamic(() => import('../LearningHubAnalyticsClient'), {
  loading,
});

export interface AdminAppContentProps {
  app: string;
  section: string;
  poAnalytics?: ExpeditingAnalytics;
  titeShipments?: TiteAnalyticsShipment[] | null;
  pgAdminData?: ProcureGuardAdminData | null;
  pgAnalyticsData?: ProcureGuardAnalyticsData | null;
  pgUsageData?: ProcureGuardAdminAnalyticsData | null;
  laptopAdminData?: LaptopAdminData | null;
  laptopAnalyticsData?: LaptopAnalyticsData | null;
  learningHubAdminData?: LearningHubAdminData;
  learningHubAnalytics?: LearningHubAnalytics;
}

/* Badges live in the sidebar (server-fetched in the layout), so the access
   panels no longer drive a live count here — the prop is simply not passed.
   Every panel declares it optional, so nothing is called and nothing computes. */

export default function AdminAppContent(props: AdminAppContentProps) {
  const { app, section } = props;
  const key = `${app}/${section}`;

  switch (key) {
    /* ── PO Expediting ── */
    case 'po-expediting/analytics':
      return <PoAnalyticsPanel analytics={props.poAnalytics!} />;
    case 'po-expediting/access-approvals':
      return <AccessApprovalsClient />;

    /* ── TI-TE ── */
    case 'tite/migration':
      return <TiteMigrationClient />;
    case 'tite/default-notifiers':
      return <TiteDefaultNotifiersClient />;
    case 'tite/analytics':
      return <TiteAnalyticsClient shipments={props.titeShipments ?? null} />;
    case 'tite/access-approvals':
      return <TiteAccessApprovalsClient />;

    /* ── ProcureGuard ── */
    case 'procureguard/admin':
      return <ProcureGuardAdminPanelClient data={props.pgAdminData ?? null} embedded />;
    case 'procureguard/analytics':
      return <ProcureGuardAnalyticsClient data={props.pgAnalyticsData ?? null} embedded />;
    case 'procureguard/usage':
      return <ProcureGuardAdminAnalyticsClient data={props.pgUsageData ?? null} embedded />;
    case 'procureguard/access':
      return <ProcureGuardAccessApprovalsClient />;

    /* ── SourceGuide ── */
    case 'sourceguide/guides':
      return <SourceGuideGuidesClient />;
    case 'sourceguide/champions':
      return <SourceGuideChampionsClient />;
    case 'sourceguide/analytics':
      return <SourceGuideAnalyticsClient />;
    case 'sourceguide/access':
      return <SourceGuideAccessApprovalsClient />;

    /* ── Catalog Repo ── */
    case 'catalog/admin':
      return <CatalogAdminPanelClient />;
    case 'catalog/sync':
      return <CatalogSyncHealthClient />;
    case 'catalog/access':
      return <CatalogAccessApprovalsClient />;

    /* ── S&S Registry ── */
    case 'sns/access':
      return <SnsAccessApprovalsClient />;
    case 'sns/reference':
      return <SnsReferenceDataClient />;

    /* ── Laptop Procurement ── */
    case 'laptop/admin':
      return <LaptopAdminClient data={props.laptopAdminData ?? null} embedded />;
    case 'laptop/analytics':
      return <LaptopAnalyticsClient data={props.laptopAnalyticsData ?? null} embedded />;
    case 'laptop/access':
      return (
        <div className="space-y-8">
          <LaptopAccessApprovalsClient />
          <div className="border-t border-slate-200 pt-8">
            <LaptopApproverMatrixClient />
          </div>
        </div>
      );

    /* ── Learning Hub ── */
    case 'learning-hub/admin':
      return <LearningHubAdminClient data={props.learningHubAdminData!} />;
    case 'learning-hub/analytics':
      return <LearningHubAnalyticsClient data={props.learningHubAnalytics!} />;

    default:
      return <div className="text-sm text-slate-500">Unknown section.</div>;
  }
}
