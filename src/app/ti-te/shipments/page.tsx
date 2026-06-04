import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllShipments } from '@/app/actions/tite';
import ShipmentsClient from './ShipmentsClient';

export const metadata: Metadata = { title: 'Shipments — TI-TE | SC Agents' };

export default async function ShipmentsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());

  // Derive titeViewOnly from BOTH the dedicated JWT field AND approvedCountries directly.
  // The fallback on approvedCountries handles users whose JWT cookie predates the titeViewOnly
  // field — they do not need to re-login for view-only enforcement to work.
  const titeApprovedCountries = session?.user?.toolAccess?.tite?.approvedCountries ?? [];
  const titeViewOnly =
    session?.user?.titeViewOnly === true ||
    titeApprovedCountries.includes('All Countries - View Only');

  console.log('[TI-TE] shipments page — titeViewOnly:', titeViewOnly, '| session.titeViewOnly:', session?.user?.titeViewOnly, '| approvedCountries:', titeApprovedCountries);

  /* View-only users see all countries, same as admin, but cannot mutate */
  const approvedCountries = (isAdmin || titeViewOnly)
    ? undefined
    : titeApprovedCountries;

  const shipments = await getAllShipments(approvedCountries);
  return <ShipmentsClient shipments={shipments} viewOnly={titeViewOnly} />;
}
