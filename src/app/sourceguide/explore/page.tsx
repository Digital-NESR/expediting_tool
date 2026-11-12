import type { Metadata } from 'next';
import { getExplorerDataset } from '@/app/actions/sourceguide/explore';
import ExplorerClient from './ExplorerClient';

export const metadata: Metadata = { title: 'NESR | SourceGuide — Explore' };
export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  /* One fetch, then every count, filter and supplier list is folded in the browser. See the
     note on `getExplorerDataset` for why the whole relation travels rather than a query per
     expanded node. */
  const data = await getExplorerDataset();
  return <ExplorerClient data={data} />;
}
