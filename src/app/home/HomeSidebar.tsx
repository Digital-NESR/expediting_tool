import ScaiPanel from './ScaiPanel';
import SpendTaxonomyPanel from './SpendTaxonomyPanel';

/**
 * The launcher's right-hand column.
 *
 * Height comes from the content now. It was pinned to 684px so the pair ended level with the
 * bottom of the second card row, and that worked until SCAI grew a fourth agent: a fixed height
 * over content that outgrows it does not compress, it clips, and the third agent was already
 * being cut off mid-sentence.
 *
 * `h-fit` stops the column stretching to the full height of the card grid beside it, which is what
 * `items-stretch` on the row would otherwise do.
 *
 * Full width below xl, where the launcher stacks this under the cards instead of beside them: at
 * 320px wide in a column of its own it left the grid too little to divide three ways.
 */
export default function HomeSidebar() {
  return (
    <aside className="flex h-fit w-full flex-col gap-6 xl:w-80 xl:shrink-0">
      <ScaiPanel />
      <SpendTaxonomyPanel />
    </aside>
  );
}
