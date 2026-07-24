import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getExpeditingAnalytics } from '@/app/actions/adminAnalytics';
import { getPendingAccessCount } from '@/app/actions/adminAccess';
import { getTitePendingCount, getAllShipments } from '@/app/actions/tite';
import {
  getProcureGuardAdminAnalyticsData,
  getProcureGuardAdminData,
  getProcureGuardAnalyticsData,
  getProcureGuardPendingAccessCount,
} from '@/app/actions/procureGuard';
import { getSourceGuidePendingCount } from '@/app/actions/sourceguide';
import { getCatalogAccessPendingCount } from '@/app/actions/catalog-manager';
import { getLaptopAdminData, getLaptopAnalyticsData, getLaptopPendingAccessCount } from '@/app/actions/laptopProcurement';
import AdminClient from './AdminClient';

export const metadata = { title: 'NESR | Admin' };
// Per-tab titles are set client-side via useEffect in AdminClient

const ADMIN_TOOLS = new Set([
  'po-expediting',
  'access-approvals',
  'tite-migration',
  'tite-default-notifiers',
  'tite-analytics',
  'tite-access-approvals',
  'procureguard-admin',
  'procureguard-analytics',
  'procureguard-usage',
  'procureguard-access',
  'sourceguide-guides',
  'sourceguide-champions',
  'sourceguide-analytics',
  'sourceguide-access',
  'catalog-admin',
  'catalog-sync',
  'catalog-access',
  'laptop-procurement-admin',
  'laptop-procurement-analytics',
  'laptop-procurement-access',
]);

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tool?: string }>;
}) {
  /* ── Auth check ── */
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  /* ── Access denied ── */
  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-9v4m-6.364 5.364A9 9 0 1118.364 5.636 9 9 0 015.636 18.364z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const initialTool = params.tool && ADMIN_TOOLS.has(params.tool) ? params.tool : 'po-expediting';

  /* ── Fetch analytics + pending counts + TI-TE shipments ── */
  const [
    analytics,
    pendingCount,
    titePendingCount,
    titeShipments,
    procureGuardPendingCount,
    procureGuardAdminData,
    procureGuardAnalyticsData,
    procureGuardAdminAnalyticsData,
    sourceGuidePendingCount,
    catalogPendingCount,
    laptopAdminData,
    laptopAnalyticsData,
    laptopPendingAccessCount,
  ] = await Promise.all([
    getExpeditingAnalytics(),
    getPendingAccessCount(),
    getTitePendingCount(),
    getAllShipments(), // admins see all shipments (no country filter)
    getProcureGuardPendingAccessCount(),
    getProcureGuardAdminData(),
    getProcureGuardAnalyticsData(),
    getProcureGuardAdminAnalyticsData(),
    getSourceGuidePendingCount(),
    getCatalogAccessPendingCount(),
    getLaptopAdminData(),
    getLaptopAnalyticsData(),
    getLaptopPendingAccessCount(),
  ]);

  return (
    <AdminClient
      analytics={analytics}
      userEmail={session.user.email}
      userName={session.user.name ?? session.user.email}
      pendingCount={pendingCount}
      titePendingCount={titePendingCount}
      titeShipments={titeShipments}
      procureGuardPendingCount={procureGuardPendingCount}
      procureGuardAdminData={procureGuardAdminData}
      procureGuardAnalyticsData={procureGuardAnalyticsData}
      procureGuardAdminAnalyticsData={procureGuardAdminAnalyticsData}
      sourceGuidePendingCount={sourceGuidePendingCount}
      catalogPendingCount={catalogPendingCount}
      laptopAdminData={laptopAdminData}
      laptopAnalyticsData={laptopAnalyticsData}
      laptopPendingAccessCount={laptopPendingAccessCount}
      initialTool={initialTool}
    />
  );
}
