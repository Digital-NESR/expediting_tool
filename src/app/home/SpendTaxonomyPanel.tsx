import { ListTree } from 'lucide-react';
import { readSpendTaxonomyFacts, summariseTaxonomy } from '@/lib/sourceguide/taxonomy';

/**
 * The spend taxonomy, as a panel under SCAI rather than a card in the grid.
 *
 * It was a full card and did not earn one: every other card is a tool somebody works inside, and
 * this is a reference list you look something up in and leave. Under SCAI it sits in the column
 * people already read for "things that are not one of the ten applications".
 *
 * Static markup and a single read, so it stays a server component like the SCAI panel beside it
 * and never reaches the browser as JavaScript.
 *
 * The counts are read rather than written down. A hardcoded "1,221 commodities" is right until the
 * catalogue changes and wrong quietly ever after, on the home page of every employee.
 */
export default async function SpendTaxonomyPanel() {
  const { categories, commodities } = summariseTaxonomy(await readSpendTaxonomyFacts());

  return (
    <a
      href="/spend-taxonomy"
      className="group flex flex-1 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-200 hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10"
    >
      <div>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#307c4c]/10">
          <ListTree className="h-5 w-5 text-[#307c4c]" />
        </span>
        <h2 className="mt-3 text-[17px] font-bold leading-tight text-slate-900 group-hover:underline">
          Spend Taxonomy
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {commodities > 0
            ? `Look up any commodity across ${categories} categories and ${commodities.toLocaleString('en-US')} lines.`
            : 'Look up any commodity in the four-level hierarchy NESR buys against.'}
        </p>
      </div>
      <span className="mt-4 text-sm font-semibold text-[#307c4c]">Open →</span>
    </a>
  );
}
