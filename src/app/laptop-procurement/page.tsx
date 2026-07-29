import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopDashboardData } from '@/app/actions/laptopProcurement';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopDashboardClient from './LaptopDashboardClient';

export const metadata: Metadata = { title: 'NESR | Laptop Procurement' };

export default async function LaptopProcurementDashboardPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopOperationalPages(actor.effectiveAccessView)) {
    redirect('/laptop-procurement/analytics');
  }
  const data = await getLaptopDashboardData();
  return <LaptopDashboardClient data={data} />;
}
