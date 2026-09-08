'use client';

/* ─────────────────────────────────────────────────────────────
   Client dispatcher for one admin app. The server route
   (/admin/[app]/page.tsx) fetches only this app's data and passes
   it here; this component renders the section selected in the URL.
   Every tool panel below is reused as-is from its own feature
   folder — nothing about the tools themselves changed, only how
   they are loaded (one app at a time instead of all at once).
   ───────────────────────────────────────────────────────────── */

import PoAnalyticsPanel from '../PoAnalyticsPanel';
import AccessApprovalsClient from '../AccessApprovalsClient';
import TiteMigrationClient from '../TiteMigrationClient';
import TiteAccessApprovalsClient from '../TiteAccessApprovalsClient';
import TiteDefaultNotifiersClient from '../TiteDefaultNotifiersClient';
import TiteAnalyticsClient from '../TiteAnalyticsClient';
import ProcureGuardAccessApprovalsClient from '../ProcureGuardAccessApprovalsClient';
import ProcureGuardAdminPanelClient from '../../procure-guard/admin/AdminPanelClient';
import ProcureGuardAnalyticsClient from '../../procure-guard/analytics/AnalyticsClient';
import ProcureGuardAdminAnalyticsClient from '../../procure-guard/admin-analytics/AdminAnalyticsClient';
import { SourceGuideAccessApprovalsClient, SourceGuideGuidesClient, SourceGuideAnalyticsClient, SourceGuideChampionsClient } from '../SourceGuideAdmin';
import { CatalogAccessApprovalsClient, CatalogAdminPanelClient, CatalogSyncHealthClient } from '../CatalogRepoAdmin';
import SnsAccessApprovalsClient from '../SnsAccessApprovalsClient';
import SnsReferenceDataClient from '../SnsReferenceDataClient';
import LaptopAdminClient from '../../laptop-procurement/admin/LaptopAdminClient';
import LaptopAnalyticsClient from '../../laptop-procurement/analytics/LaptopAnalyticsClient';
import LaptopApproverMatrixClient from '../LaptopApproverMatrixClient';
import LaptopAccessApprovalsClient from '../LaptopAccessApprovalsClient';
import LearningHubAdminClient from '../../learning-hub/admin/AdminClient';
import LearningHubAnalyticsClient from '../LearningHubAnalyticsClient';
import type { Shipment } from '@/types/tite';
import type { ProcureGuardAdminAnalyticsData, ProcureGuardAdminData, ProcureGuardAnalyticsData } from '@/types/procureGuard';
import type { LaptopAdminData, LaptopAnalyticsData } from '@/types/laptopProcurement';
import type { LearningHubAdminData } from '@/types/learning-hub';
import type { LearningHubAnalytics } from '@/app/actions/learning-hub';
import type { ExpeditingAnalytics } from '@/app/actions/adminAnalytics';

export interface AdminAppContentProps {
  app: string;
  section: string;
  userEmail: string;
  poAnalytics?: ExpeditingAnalytics;
  titeShipments?: Shipment[] | null;
  pgAdminData?: ProcureGuardAdminData | null;
  pgAnalyticsData?: ProcureGuardAnalyticsData | null;
  pgUsageData?: ProcureGuardAdminAnalyticsData | null;
  laptopAdminData?: LaptopAdminData | null;
  laptopAnalyticsData?: LaptopAnalyticsData | null;
  learningHubAdminData?: LearningHubAdminData;
  learningHubAnalytics?: LearningHubAnalytics;
}

/* Badges live in the sidebar (server-fetched in the layout), so the
   access panels no longer drive a live count here. */
const noop = () => {};

export default function AdminAppContent(props: AdminAppContentProps) {
  const { app, section } = props;
  const key = `${app}/${section}`;

  switch (key) {
    /* ── PO Expediting ── */
    case 'po-expediting/analytics':
      return <PoAnalyticsPanel analytics={props.poAnalytics!} />;
    case 'po-expediting/access-approvals':
      return <AccessApprovalsClient onPendingCountChange={noop} />;

    /* ── TI-TE ── */
    case 'tite/migration':
      return <TiteMigrationClient userEmail={props.userEmail} />;
    case 'tite/default-notifiers':
      return <TiteDefaultNotifiersClient userEmail={props.userEmail} />;
    case 'tite/analytics':
      return <TiteAnalyticsClient shipments={props.titeShipments ?? null} />;
    case 'tite/access-approvals':
      return <TiteAccessApprovalsClient userEmail={props.userEmail} onPendingCountChange={noop} />;

    /* ── ProcureGuard ── */
    case 'procureguard/admin':
      return <ProcureGuardAdminPanelClient data={props.pgAdminData ?? null} embedded />;
    case 'procureguard/analytics':
      return <ProcureGuardAnalyticsClient data={props.pgAnalyticsData ?? null} embedded />;
    case 'procureguard/usage':
      return <ProcureGuardAdminAnalyticsClient data={props.pgUsageData ?? null} embedded />;
    case 'procureguard/access':
      return <ProcureGuardAccessApprovalsClient userEmail={props.userEmail} onPendingCountChange={noop} />;

    /* ── SourceGuide ── */
    case 'sourceguide/guides':
      return <SourceGuideGuidesClient />;
    case 'sourceguide/champions':
      return <SourceGuideChampionsClient />;
    case 'sourceguide/analytics':
      return <SourceGuideAnalyticsClient />;
    case 'sourceguide/access':
      return <SourceGuideAccessApprovalsClient userEmail={props.userEmail} onPendingCountChange={noop} />;

    /* ── Catalog Repo ── */
    case 'catalog/admin':
      return <CatalogAdminPanelClient />;
    case 'catalog/sync':
      return <CatalogSyncHealthClient />;
    case 'catalog/access':
      return <CatalogAccessApprovalsClient userEmail={props.userEmail} onPendingCountChange={noop} />;

    /* ── S&S Registry ── */
    case 'sns/access':
      return <SnsAccessApprovalsClient onPendingCountChange={noop} />;
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
          <LaptopAccessApprovalsClient userEmail={props.userEmail} onPendingCountChange={noop} />
          <div className="border-t border-slate-200 pt-8">
            <LaptopApproverMatrixClient />
          </div>
        </div>
      );

    /* ── Learning Hub ── */
    case 'learning-hub/admin':
      return <LearningHubAdminClient data={props.learningHubAdminData!} embedded />;
    case 'learning-hub/analytics':
      return <LearningHubAnalyticsClient data={props.learningHubAnalytics!} />;

    default:
      return (
        <div className="text-sm text-slate-500">
          Unknown section.
        </div>
      );
  }
}
