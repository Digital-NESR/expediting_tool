import { notFound, redirect } from 'next/navigation';
import { getCachedSession } from '@/lib/session';
import { findAdminApp, resolveSection } from '../adminNav';
import AdminAppContent, { type AdminAppContentProps } from './AdminAppContent';
import { getExpeditingAnalytics } from '@/app/actions/adminAnalytics';
import { getAllShipments } from '@/app/actions/tite';
import {
  getProcureGuardAdminData,
  getProcureGuardAnalyticsData,
  getProcureGuardAdminAnalyticsData,
} from '@/app/actions/procureGuard';
import { getLaptopAdminData, getLaptopAnalyticsData } from '@/app/actions/laptopProcurement';
import { getLearningHubAdminData, getLearningHubAnalytics } from '@/app/actions/learning-hub';

/* One admin app per route. The layout has already enforced the
   ADMIN_EMAILS gate for this whole segment, so here we only resolve
   the section and fetch the data THAT ONE SECTION needs — nothing
   else. Most sections' panels self-fetch, so most fetch nothing. */
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

  const session = await getCachedSession();
  if (!session?.user?.email) redirect('/login');

  const sp = searchParams ? await searchParams : {};
  const section = resolveSection(app, sp.section);

  const base: AdminAppContentProps = {
    app: app.id,
    section,
    userEmail: session.user.email,
  };

  /* Fetch ONLY the data the current section renders. Switching sections
     changes the URL, so this server component re-runs — fetching all of
     an app's datasets here would re-pull data the section never shows. */
  switch (`${app.id}/${section}`) {
    case 'po-expediting/analytics':
      base.poAnalytics = await getExpeditingAnalytics();
      break;
    case 'tite/analytics':
      // Admins see all shipments (no country filter)
      base.titeShipments = await getAllShipments();
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
