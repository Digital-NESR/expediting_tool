import type { Metadata } from 'next';
import { authOptions, getServerSession } from '@/lib/auth';
import { getAllShipments } from '@/app/actions/tite';
import MapClient from './MapClient';

export const metadata: Metadata = { title: 'NESR | Map View - TI-TE' };

export default async function MapPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());
  const approvedCountries = isAdmin
    ? undefined
    : (session?.user?.toolAccess?.tite?.approvedCountries ?? []);

  const shipments = await getAllShipments(approvedCountries);
  return <MapClient shipments={shipments} />;
}
