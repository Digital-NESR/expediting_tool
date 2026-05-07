import type { Metadata } from 'next';
import NewShipmentClient from './NewShipmentClient';

export const metadata: Metadata = { title: 'Add Shipment — TI-TE | SC Agents' };

export default function NewShipmentPage() {
  return <NewShipmentClient />;
}
