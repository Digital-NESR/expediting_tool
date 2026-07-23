import type { Metadata } from 'next';
import { getTaxonomyFacts } from '@/app/actions/sourceguide';
import DecompositionClient from './DecompositionClient';

export const metadata: Metadata = { title: 'NESR | Spend Taxonomy - SourceGuide' };

export default async function SourceGuideTaxonomyPage() {
  const rows = await getTaxonomyFacts();
  return <DecompositionClient rows={rows} />;
}
