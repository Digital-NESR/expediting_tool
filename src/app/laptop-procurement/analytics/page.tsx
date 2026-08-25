import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopAnalyticsData, getLaptopGlobalAnalyticsData } from '@/app/actions/laptopProcurement';
import { canUseLaptopAnalytics } from '@/lib/laptopProcurement-utils';
import LaptopAnalyticsPageClient from './LaptopAnalyticsPageClient';

export default async function LaptopAnalyticsPage() {
  const actor = await getLaptopActor();
  if (!actor || !canUseLaptopAnalytics(actor.effectiveAccessView)) {
    redirect('/laptop-procurement');
  }

  const [personal, globalData] = await Promise.all([
    getLaptopAnalyticsData(),
    getLaptopGlobalAnalyticsData(),
  ]);

  return <LaptopAnalyticsPageClient personal={personal} globalData={globalData} accessView={actor.effectiveAccessView} />;
}
