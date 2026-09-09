import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getLaptopDeviceOptions, getLaptopRequestDetail } from '@/app/actions/laptopProcurement';
import LaptopRequestDetailClient from '../../components/LaptopRequestDetailClient';

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// The route param is the primary key, which no longer tracks the PLP reference — a deleted
// row left `id` running ahead, so /requests/31 is PLP00030. The tab has to show the reference
// people actually quote, which means reading the row before rendering. React cache dedupes
// that with the page's own call below, so metadata costs no extra query (fetch memoization
// doesn't apply here — this is a DB read, not a fetch).
const loadRequestDetail = cache(getLaptopRequestDetail);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return { title: 'NESR | Laptop Procurement' };

  // Goes through the same permission-checked loader as the page, so a request someone
  // cannot view never leaks its reference number into the tab title.
  const data = await loadRequestDetail(numericId);
  const reference = data?.request.reference_number;
  return { title: reference ? `NESR | ${reference} - Laptop Procurement` : 'NESR | Laptop Procurement' };
}

export default async function LaptopRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const [data, devices] = await Promise.all([loadRequestDetail(numericId), getLaptopDeviceOptions()]);
  if (!data) notFound();

  return <LaptopRequestDetailClient data={data} devices={devices} />;
}
