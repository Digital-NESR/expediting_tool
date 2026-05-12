import type { Metadata } from 'next';
import {
  getShipmentById, getShipmentDocuments,
  getShipmentActivityLog, getShipmentNotificationContacts,
} from '@/app/actions/tite';
import ShipmentDetailClient from './ShipmentDetailClient';

export const metadata: Metadata = { title: 'Shipment Detail — TI-TE | SC Agents' };

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId  = Number(id);

  const [shipment, documents, activityLog, notificationContacts] = await Promise.all([
    getShipmentById(numId),
    getShipmentDocuments(numId),
    getShipmentActivityLog(numId),
    getShipmentNotificationContacts(numId),
  ]);

  return (
    <ShipmentDetailClient
      shipment={shipment}
      rawId={id}
      documents={documents}
      activityLog={activityLog}
      notificationContacts={notificationContacts}
    />
  );
}
