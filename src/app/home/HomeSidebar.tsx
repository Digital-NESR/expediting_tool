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
 */
export default function HomeSidebar() {
  return (
    <aside className="flex h-fit w-80 shrink-0 flex-col gap-6">
      <ScaiPanel />
      <SpendTaxonomyPanel />
    </aside>
  );
}
