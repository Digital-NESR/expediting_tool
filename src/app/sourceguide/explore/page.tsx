import type { Metadata } from 'next';
import { getExplorerDataset } from '@/app/actions/sourceguide/explore';
import ExplorerClient from './ExplorerClient';

export const metadata: Metadata = { title: 'NESR | SourceGuide — Explore' };
export const dynamic = 'force-dynamic';

export default async function ExplorePage({
  searchParams,
}: {
  /* `?node=` carries a whole taxonomy path, which is how the command palette hands over a
     sub-category or family. It is the node's identity rather than its label, because `General`
     repeats under nearly every sub-category. */
  searchParams?: Promise<{ node?: string }>;
}) {
  /* One fetch, then every count, filter and supplier list is folded in the browser. See the
     note on `getExplorerDataset` for why the whole relation travels rather than a query per
     expanded node. */
  const [data, sp] = await Promise.all([
    getExplorerDataset(),
    searchParams ? searchParams : Promise.resolve({} as { node?: string }),
  ]);
  return <ExplorerClient data={data} initialNode={sp.node ?? null} />;
}
