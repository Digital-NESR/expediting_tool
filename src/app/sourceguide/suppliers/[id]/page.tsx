import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSupplierProfile, getCommoditiesByIds, getCountries } from '@/app/actions/sourceguide';
import SupplierProfileClient from './SupplierProfileClient';

export const metadata: Metadata = { title: 'NESR | Supplier - SourceGuide' };

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = decodeURIComponent(id);   // the dynamic segment is the AVL vendor code
  if (!code) notFound();

  const profile = await getSupplierProfile(code);
  if (!profile) notFound();

  const [commodities, countries] = await Promise.all([
    getCommoditiesByIds([...new Set(profile.mappings.map(m => m.commodityId))]),
    getCountries(),
  ]);

  return <SupplierProfileClient profile={profile} commodities={commodities} countries={countries} />;
}
