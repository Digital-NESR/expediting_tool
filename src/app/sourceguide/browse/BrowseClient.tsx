'use client';

import { useRouter } from 'next/navigation';
import SpendTaxonomyTree from '@/components/SpendTaxonomyTree';
import { SG_BRAND } from '../constants';
import type { SgTaxonomyCategory } from '@/app/actions/sourceguide';

/**
 * SourceGuide's view of the taxonomy.
 *
 * The tree itself is shared with the launcher's standalone Spend Taxonomy page; what belongs to
 * SourceGuide is the framing and the click: from here a commodity opens its own page, with the
 * countries sourcing it and the suppliers behind each.
 */
export default function BrowseClient({
  tree,
  countryCount,
}: {
  tree: SgTaxonomyCategory[];
  countryCount: number;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[980px] px-6 py-8 lg:px-8">
      <div className="mb-6">
        <div
          className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: SG_BRAND }}
        >
          Taxonomy
        </div>
        <h1 className="text-[30px] font-bold tracking-tight">Browse the sourcing catalogue</h1>
        <p className="mt-2 max-w-[580px] text-[15px] leading-relaxed text-slate-500">
          Drill through the four-level hierarchy (Category → Sub-Category → Family → Commodity) to
          discover sourcing options across all {countryCount} country guides.
        </p>
      </div>

      <SpendTaxonomyTree
        tree={tree}
        onSelectCommodity={(id) => router.push(`/sourceguide/commodity/${id}`)}
      />
    </div>
  );
}
