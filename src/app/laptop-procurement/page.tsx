import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopDashboardData } from '@/app/actions/laptopProcurement';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopDashboardClient from './LaptopDashboardClient';

export const metadata: Metadata = { title: 'Laptop Procurement Dashboard | SC Agents' };

export default async function LaptopProcurementDashboardPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopOperationalPages(actor.permissions.accessView)) {
    redirect('/laptop-procurement/analytics');
  }
  const data = await getLaptopDashboardData();
  return <LaptopDashboardClient data={data} />;
}
