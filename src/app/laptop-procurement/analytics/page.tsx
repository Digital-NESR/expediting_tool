import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopAnalyticsData } from '@/app/actions/laptopProcurement';
import { canUseLaptopAnalytics } from '@/lib/laptopProcurement-utils';
import LaptopAnalyticsPageClient from './LaptopAnalyticsPageClient';

export default async function LaptopAnalyticsPage() {
  const actor = await getLaptopActor();
  if (!actor || !canUseLaptopAnalytics(actor.effectiveAccessView)) {
    redirect('/laptop-procurement');
  }

  const data = await getLaptopAnalyticsData();

  return <LaptopAnalyticsPageClient data={data} accessView={actor.effectiveAccessView} />;
}
