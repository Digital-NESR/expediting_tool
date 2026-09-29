import ScaiPanel from './ScaiPanel';
import SpendTaxonomyPanel from './SpendTaxonomyPanel';

/**
 * The launcher's right-hand column.
 *
 * SCAI keeps its own height exactly as it was; the taxonomy panel takes whatever is left, so the
 * pair ends level with the bottom of the second card row. The column's height is stated once here
 * rather than split between two components that would drift apart.
 *
 * 684px is two card rows plus the gap between them, at the content those rows carry today. Card
 * heights follow their own text, so this is close rather than exact, and it is the same kind of
 * fixed number the SCAI panel has always used. It errs a little short on purpose: a column that
 * stops just inside the second row reads as aligned, one that overhangs reads as a mistake.
 */
export default function HomeSidebar() {
  return (
    <aside className="flex h-[684px] w-80 shrink-0 flex-col gap-6">
      <ScaiPanel />
      <SpendTaxonomyPanel />
    </aside>
  );
}
