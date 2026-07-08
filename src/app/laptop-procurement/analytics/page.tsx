import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopAnalyticsData } from '@/app/actions/laptopProcurement';
import { canUseLaptopAnalytics } from '@/lib/laptopProcurement-utils';
import LaptopAnalyticsClient from './LaptopAnalyticsClient';

export const metadata: Metadata = { title: 'Analytics | Laptop Procurement' };

export default async function LaptopAnalyticsPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopAnalytics(actor.permissions.accessView)) {
    redirect('/laptop-procurement');
  }
  const data = await getLaptopAnalyticsData();
  return <LaptopAnalyticsClient data={data} />;
}
