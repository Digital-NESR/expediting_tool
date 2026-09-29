import type { Metadata } from 'next';
import { countGuideCountries, readSpendTaxonomy } from '@/lib/sourceguide/taxonomy';
import SpendTaxonomyTree from '@/components/SpendTaxonomyTree';

export const metadata: Metadata = { title: 'NESR | Spend Taxonomy' };

/**
 * The spend taxonomy on its own, for anybody signed in.
 *
 * The same tree SourceGuide draws, reached without a SourceGuide grant. Somebody raising a
 * purchase request needs to name the commodity they are buying, and until now the only place that
 * list existed was inside a sourcing tool most of them will never otherwise open.
 *
 * A server component rather than a client page calling an action: the read is a plain module
 * function, so no new public POST endpoint is created for it, and the proxy has already put this
 * route behind sign-in.
 *
 * Commodity rows do not link anywhere here. The page they would open is SourceGuide's, which needs
 * a grant this reader may not hold.
 */
export default async function SpendTaxonomyPage() {
  const [tree, countryCount] = await Promise.all([readSpendTaxonomy(), countGuideCountries()]);
  const commodities = tree.reduce((n, cat) => n + cat.count, 0);

  return (
    <div className="mx-auto max-w-[980px] px-6 py-8 lg:px-8">
      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#307c4c]">
          Taxonomy
        </div>
        <h1 className="text-[30px] font-bold tracking-tight">Spend taxonomy</h1>
        <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-slate-500">
          How NESR describes what it buys, in four levels: Category → Sub-Category → Family →
          Commodity. {commodities.toLocaleString('en-US')} commodities, and the number beside each
          is how many of the {countryCount} country guides source it.
        </p>
      </div>

      <SpendTaxonomyTree tree={tree} />
    </div>
  );
}
