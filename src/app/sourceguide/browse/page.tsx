import type { Metadata } from 'next';
import { getTaxonomy, getStats } from '@/app/actions/sourceguide';
import BrowseClient from './BrowseClient';

export const metadata: Metadata = { title: 'NESR | Browse - SourceGuide' };

export default async function SourceGuideBrowsePage() {
  const [tree, stats] = await Promise.all([getTaxonomy(), getStats()]);
  return <BrowseClient tree={tree} countryCount={stats.countries} />;
}
