import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCommodityDetail, getCountries } from '@/app/actions/sourceguide';
import CommodityDetailClient from './CommodityDetailClient';

export const metadata: Metadata = { title: 'Commodity · SourceGuide | SC Agents' };

export default async function CommodityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [detail, countries] = await Promise.all([getCommodityDetail(numId), getCountries()]);
  if (!detail) notFound();

  return <CommodityDetailClient detail={detail} countries={countries} />;
}
