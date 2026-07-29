import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopWorkQueueData } from '@/app/actions/laptopProcurement';
import { canUseLaptopReviewerQueue } from '@/lib/laptopProcurement-utils';
import LaptopMyWorkClient from './LaptopMyWorkClient';

export const metadata: Metadata = { title: 'NESR | My Work - Laptop Procurement' };

export default async function LaptopMyWorkPage() {
  const actor = await getLaptopActor();
  if (actor && !canUseLaptopReviewerQueue(actor.effectiveAccessView)) {
    redirect('/laptop-procurement');
  }
  const data = await getLaptopWorkQueueData();
  return <LaptopMyWorkClient data={data} />;
}
