import type { Metadata } from 'next';
import { readSpendTaxonomyFacts } from '@/lib/sourceguide/taxonomy';
import DecompositionClient from '@/app/sourceguide/taxonomy/DecompositionClient';

export const metadata: Metadata = { title: 'NESR | Spend Taxonomy' };

/**
 * The spend taxonomy on its own, for anybody signed in.
 *
 * The same drill-down SourceGuide draws, reached without a SourceGuide grant. Somebody raising a
 * purchase request has to name the commodity they are buying, and until now that list existed only
 * inside a sourcing tool most of them will never otherwise open.
 *
 * A server component rather than a client page calling an action: the read is a plain module
 * function, so no new public POST endpoint is created for it, and the proxy has already put this
 * route behind sign-in.
 *
 * No `onSearch`, so the footer link into the guide's search is not drawn here.
 */
export default async function SpendTaxonomyPage() {
  const rows = await readSpendTaxonomyFacts();
  return <DecompositionClient rows={rows} />;
}
