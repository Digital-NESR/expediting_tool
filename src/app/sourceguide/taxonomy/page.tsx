import type { Metadata } from 'next';
import { getDecompositionFacts } from '@/app/actions/sourceguide';
import DecompositionClient from './DecompositionClient';

export const metadata: Metadata = { title: 'Spend Taxonomy · SourceGuide | SC Agents' };

export default async function SourceGuideTaxonomyPage() {
  const rows = await getDecompositionFacts();
  return <DecompositionClient rows={rows} />;
}
