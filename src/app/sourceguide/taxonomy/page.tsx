import type { Metadata } from 'next';
import { getTaxonomyFacts } from '@/app/actions/sourceguide';
import TaxonomyWithSearch from './TaxonomyWithSearch';

export const metadata: Metadata = { title: 'NESR | Spend Taxonomy - SourceGuide' };

export default async function SourceGuideTaxonomyPage() {
  const rows = await getTaxonomyFacts();
  return <TaxonomyWithSearch rows={rows} />;
}
