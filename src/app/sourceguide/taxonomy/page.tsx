import type { Metadata } from 'next';
import { getCommodityCatalog } from '@/app/actions/sourceguide';
import TaxonomyClient from './TaxonomyClient';

export const metadata: Metadata = { title: 'Spend Taxonomy · SourceGuide | SC Agents' };

export default async function SourceGuideTaxonomyPage() {
  const catalog = await getCommodityCatalog();
  return <TaxonomyClient catalog={catalog} />;
}
