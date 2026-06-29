import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSupplierProfile, getCommoditiesByIds, getCountries } from '@/app/actions/sourceguide';
import SupplierProfileClient from './SupplierProfileClient';

export const metadata: Metadata = { title: 'Supplier · SourceGuide | SC Agents' };

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const profile = await getSupplierProfile(numId);
  if (!profile) notFound();

  const [commodities, countries] = await Promise.all([
    getCommoditiesByIds([...new Set(profile.mappings.map(m => m.commodityId))]),
    getCountries(),
  ]);

  return <SupplierProfileClient profile={profile} commodities={commodities} countries={countries} />;
}
