import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentTiteUser, isTiteApproved, canViewTiteCountry } from '@/lib/tite-auth';
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

  /* Identity and country scope come from the shared TI-TE guard, never from
     props or the URL. An out-of-scope id must look exactly like a missing one. */
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) notFound();

  const titeViewOnly = user.viewOnly;

  /* View-only users see all countries, same as admin, but cannot mutate */
  const approvedCountries = (user.isAdmin || titeViewOnly)
    ? undefined
    : user.approvedCountries;

  const [shipment, documents, activityLog, notificationContacts, notificationLog, stats] = await Promise.all([
    getShipmentById(numId),
    getShipmentDocuments(numId),
    getShipmentActivityLog(numId),
    getShipmentNotificationContacts(numId),
    getShipmentNotificationStatus(numId),
    getShipmentStats(approvedCountries),
  ]);

  if (!shipment || !canViewTiteCountry(user, shipment.country)) notFound();

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
