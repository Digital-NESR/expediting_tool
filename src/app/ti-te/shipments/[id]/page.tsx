import type { Metadata } from 'next';
import { getShipmentById, getShipmentDocuments, getShipmentActivityLog } from '@/app/actions/tite';
import ShipmentDetailClient from './ShipmentDetailClient';

export const metadata: Metadata = { title: 'Shipment Detail — TI-TE | SC Agents' };

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId  = Number(id);

  const [shipment, documents, activityLog] = await Promise.all([
    getShipmentById(numId),
    getShipmentDocuments(numId),
    getShipmentActivityLog(numId),
  ]);

  return (
    <ShipmentDetailClient
      shipment={shipment}
      rawId={id}
      documents={documents}
      activityLog={activityLog}
    />
  );
}
