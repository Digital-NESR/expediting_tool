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
 * and never reaches the browser as JavaScript. It takes SCAI's green tint too: the two belong to
 * the same column, and a white panel under a tinted one reads as a card that fell out of the grid.
 *
 * The counts are read rather than written down. A hardcoded "1,221 commodities" is right until the
 * catalogue changes and wrong quietly ever after, on the home page of every employee.
 */
export default async function SpendTaxonomyPanel() {
  const { categories, commodities } = summariseTaxonomy(await readSpendTaxonomyFacts());

  return (
    <a
      href="/spend-taxonomy"
      className="group flex flex-col gap-2 rounded-2xl border border-[#b6ddc8] bg-[#f0f9f4] p-5 transition-all duration-200 hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10"
    >
      {/* Icon and name on one line. Stacked, this panel took height the SCAI panel above it needed
          more than it did: SCAI carries four agents and this carries one link. */}
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white">
          <ListTree className="h-[18px] w-[18px] text-[#307c4c]" />
        </span>
        <h2 className="text-[15px] font-bold leading-tight text-slate-900 group-hover:underline">
          Spend Taxonomy
        </h2>
      </div>
      <p className="text-[12.5px] leading-relaxed text-slate-500">
        {commodities > 0
          ? `Any commodity across ${categories} categories and ${commodities.toLocaleString('en-US')} lines.`
          : 'Any commodity in the four-level hierarchy NESR buys against.'}
      </p>
      <span className="text-[13px] font-semibold text-[#307c4c]">Open →</span>
    </a>
  );
}
