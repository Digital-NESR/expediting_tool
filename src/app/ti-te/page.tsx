import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllShipments, getShipmentStats } from '@/app/actions/tite';
import TiteDashboardClient from './TiteDashboardClient';

export const metadata: Metadata = { title: 'Dashboard — TI-TE | SC Agents' };

export default async function TiteDashboardPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());
  const approvedCountries = isAdmin
    ? undefined
    : (session?.user?.toolAccess?.tite?.approvedCountries ?? []);

  const [stats, shipments] = await Promise.all([
    getShipmentStats(approvedCountries),
    getAllShipments(approvedCountries),
  ]);
  return <TiteDashboardClient stats={stats} shipments={shipments} />;
}
