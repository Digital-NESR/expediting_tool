import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllShipments } from '@/app/actions/tite';
import ReportsClient from './ReportsClient';

export const metadata: Metadata = { title: 'Reports — TI-TE | SC Agents' };

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());
  const approvedCountries = isAdmin
    ? undefined
    : (session?.user?.toolAccess?.tite?.approvedCountries ?? []);

  const shipments = await getAllShipments(approvedCountries);
  return <ReportsClient shipments={shipments} />;
}
