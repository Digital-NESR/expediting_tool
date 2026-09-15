import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/lib/require-access';
import { findAdminApp, resolveSection } from '../adminNav';
import AdminAppContent, { type AdminAppContentProps } from './AdminAppContent';
import { getTeamAnalyticsData } from '@/app/actions/teamAnalytics';
import { getShipmentsForAnalytics } from '@/app/actions/tite';
import {
  getProcureGuardAdminData,
  getProcureGuardAnalyticsData,
  getProcureGuardAdminAnalyticsData,
} from '@/app/actions/procureGuard';
import { getLaptopAdminData, getLaptopAnalyticsData } from '@/app/actions/laptopProcurement';
import { getLearningHubAdminData, getLearningHubAnalytics } from '@/app/actions/learning-hub';

/* One admin app per route. The ADMIN_EMAILS gate is enforced by the
   layout AND again here (see below), then we resolve the section and
   fetch the data THAT ONE SECTION needs — nothing else. Most sections'
   panels self-fetch, so most fetch nothing. */
export default async function AdminAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ app: string }>;
  searchParams?: Promise<{ section?: string }>;
}) {
  const { app: appId } = await params;
  const app = findAdminApp(appId);
  if (!app) notFound();

  /* The layout gates this segment, but layouts do not re-render on
     navigation and layout/page render in parallel — so the gate is
     re-checked HERE too, before any data fetch below runs. Same rule
     as the layout (ADMIN_EMAILS, via the shared helper); when it fails
     the layout is the one that renders the Access Denied card, so this
     page just renders nothing. */
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!actor.isPlatformAdmin) return null;

  const sp = searchParams ? await searchParams : {};
  const section = resolveSection(app, sp.section);

  const base: AdminAppContentProps = {
    app: app.id,
    section,
  };

  /* Fetch ONLY the data the current section renders. Switching sections
     changes the URL, so this server component re-runs — fetching all of
     an app's datasets here would re-pull data the section never shows. */
  switch (`${app.id}/${section}`) {
    case 'po-expediting/analytics':
      /* Unfiltered team analytics. getExpeditingAnalytics was a drifting clone of
         this; the platform-admin gate on this route is enforced above, not by the
         action. */
      base.poAnalytics = await getTeamAnalyticsData({});
      break;
    case 'tite/analytics':
      /* Admins see all shipments (no country filter). Narrowed to the columns
         the panel actually charts — it filters client-side, so every column
         fetched here is serialised into the page payload. */
      base.titeShipments = await getShipmentsForAnalytics();
      break;
    case 'procureguard/admin':
      base.pgAdminData = await getProcureGuardAdminData();
      break;
    case 'procureguard/analytics':
      base.pgAnalyticsData = await getProcureGuardAnalyticsData();
      break;
    case 'procureguard/usage':
      base.pgUsageData = await getProcureGuardAdminAnalyticsData();
      break;
    case 'laptop/admin':
      base.laptopAdminData = await getLaptopAdminData();
      break;
    case 'laptop/analytics':
      base.laptopAnalyticsData = await getLaptopAnalyticsData();
      break;
    case 'learning-hub/admin':
      base.learningHubAdminData = await getLearningHubAdminData();
      break;
    case 'learning-hub/analytics':
      base.learningHubAnalytics = await getLearningHubAnalytics();
      break;
    default:
      // Access-approvals, SourceGuide, Catalog, SNS, TI-TE migration /
      // default-notifiers: the panels self-fetch — no server data needed.
      break;
  }

  return <AdminAppContent {...base} />;
}
