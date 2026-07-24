import type { Metadata } from 'next';
import { authOptions, getServerSession } from '@/lib/auth';
import { getAllShipments } from '@/app/actions/tite';
import AlertsClient from './AlertsClient';

export const metadata: Metadata = { title: 'NESR | Alerts - TI-TE' };

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());
  const approvedCountries = isAdmin
    ? undefined
    : (session?.user?.toolAccess?.tite?.approvedCountries ?? []);

  const shipments = await getAllShipments(approvedCountries);
  return <AlertsClient shipments={shipments} />;
}
