import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getShipmentById, getShipmentDocuments,
  getShipmentActivityLog, getShipmentNotificationContacts,
  getShipmentNotificationStatus, getShipmentStats,
} from '@/app/actions/tite';
import type { NotificationLogRow } from '@/app/actions/tite';
import ShipmentDetailClient from './ShipmentDetailClient';

export const metadata: Metadata = { title: 'NESR | Shipment Detail - TI-TE' };

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId  = Number(id);

  const session = await getServerSession(authOptions);
  const email   = session?.user?.email ?? '';
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

  console.log('[TI-TE] shipment detail — titeViewOnly:', titeViewOnly, '| session.titeViewOnly:', session?.user?.titeViewOnly, '| approvedCountries:', titeApprovedCountries);

  /* View-only users see all countries, same as admin, but cannot mutate */
  const approvedCountries = (isAdmin || titeViewOnly)
    ? undefined
    : titeApprovedCountries;

  const [shipment, documents, activityLog, notificationContacts, notificationLog, stats] = await Promise.all([
    getShipmentById(numId),
    getShipmentDocuments(numId),
    getShipmentActivityLog(numId),
    getShipmentNotificationContacts(numId),
    getShipmentNotificationStatus(numId),
    getShipmentStats(approvedCountries),
  ]);

  const activeCount = stats?.active_count ?? 0;
  const urgentCount = (stats?.overdue_count ?? 0) + (stats?.urgent_count ?? 0) + (stats?.action_count ?? 0);

  return (
    <ShipmentDetailClient
      shipment={shipment}
      rawId={id}
      documents={documents}
      activityLog={activityLog}
      notificationContacts={notificationContacts}
      notificationLog={notificationLog}
      activeCount={activeCount}
      urgentCount={urgentCount}
      viewOnly={titeViewOnly}
    />
  );
}
