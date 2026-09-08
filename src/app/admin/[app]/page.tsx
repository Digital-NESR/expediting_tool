import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
import { getLearningHubAdminData } from '@/app/actions/learning-hub';

/* One admin app per route. The layout has already enforced the
   ADMIN_EMAILS gate for this whole segment, so here we only resolve
   the section and fetch the data THIS app needs — nothing else. */
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

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const sp = searchParams ? await searchParams : {};
  const section = resolveSection(app, sp.section);

  /* Fetch ONLY the data this app's sections consume. Most panels
     self-fetch (they take just userEmail), so most apps fetch nothing. */
  const base: AdminAppContentProps = {
    app: app.id,
    section,
    userEmail: session.user.email,
  };

  switch (app.id) {
    case 'po-expediting': {
      base.poAnalytics = await getExpeditingAnalytics();
      break;
    }
    case 'tite': {
      // Admins see all shipments (no country filter)
      base.titeShipments = await getAllShipments();
      break;
    }
    case 'procureguard': {
      const [pgAdminData, pgAnalyticsData, pgUsageData] = await Promise.all([
        getProcureGuardAdminData(),
        getProcureGuardAnalyticsData(),
        getProcureGuardAdminAnalyticsData(),
      ]);
      base.pgAdminData = pgAdminData;
      base.pgAnalyticsData = pgAnalyticsData;
      base.pgUsageData = pgUsageData;
      break;
    }
    case 'laptop': {
      const [laptopAdminData, laptopAnalyticsData] = await Promise.all([
        getLaptopAdminData(),
        getLaptopAnalyticsData(),
      ]);
      base.laptopAdminData = laptopAdminData;
      base.laptopAnalyticsData = laptopAnalyticsData;
      break;
    }
    case 'learning-hub': {
      base.learningHubAdminData = await getLearningHubAdminData();
      break;
    }
    // sourceguide, catalog, sns: every panel self-fetches — no server data needed.
    default:
      break;
  }

  return <AdminAppContent {...base} />;
}
