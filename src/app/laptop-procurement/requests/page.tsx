import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopRequestsData } from '@/app/actions/laptopProcurement';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopRequestsClient from './LaptopRequestsClient';

export const metadata: Metadata = { title: 'NESR | Requests - Laptop Procurement' };

export default async function LaptopRequestsPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopOperationalPages(actor.permissions.accessView)) {
    redirect('/laptop-procurement/analytics');
  }
  const data = await getLaptopRequestsData();
  return <LaptopRequestsClient data={data} />;
}
