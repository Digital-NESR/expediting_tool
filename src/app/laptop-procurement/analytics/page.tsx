import { redirect } from 'next/navigation';
import { getLaptopActor } from '@/app/actions/laptopProcurement';
import { canUseLaptopAnalytics } from '@/lib/laptopProcurement-utils';

export default async function LaptopAnalyticsPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopAnalytics(actor.effectiveAccessView)) {
    redirect('/laptop-procurement');
  }
  redirect('/admin?tool=laptop-procurement-analytics');
}
