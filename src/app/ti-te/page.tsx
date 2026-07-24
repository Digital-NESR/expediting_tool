import type { Metadata } from 'next';
import { authOptions, getServerSession } from '@/lib/auth';
import { getAllShipments, getShipmentStats, getRecentActivity } from '@/app/actions/tite';
import TiteDashboardClient from './TiteDashboardClient';

export const metadata: Metadata = { title: 'NESR | TI-TE' };

export default async function TiteDashboardPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const userName = session?.user?.name ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());

  const titeApprovedCountries = session?.user?.toolAccess?.tite?.approvedCountries ?? [];
  const titeViewOnly =
    session?.user?.titeViewOnly === true ||
    titeApprovedCountries.includes('All Countries - View Only');

  const approvedCountries = (isAdmin || titeViewOnly)
    ? undefined
    : titeApprovedCountries;

  const [stats, shipments, recentActivity] = await Promise.all([
    getShipmentStats(approvedCountries),
    getAllShipments(approvedCountries),
    getRecentActivity(userName, 7),
  ]);
  return <TiteDashboardClient stats={stats} shipments={shipments} recentActivity={recentActivity} viewOnly={titeViewOnly} />;
}
