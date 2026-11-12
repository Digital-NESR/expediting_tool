'use client';

import { ToolCard } from '@/app/home/ToolCard';
import { TOOLS } from '@/app/home/tools';

/**
 * Catalog Repo beside the two cards it was made to match, and the one tool still in preview.
 *
 * Reading them together is the point: "the format we are following on /home" is not a thing you
 * can check on a card by itself, only against its neighbours.
 */
const SHOWN = [
  'catalog-manager',
  'learning-hub',
  'rrsm',
  'soa-consolidation',
  'supply-chain-analytics',
];

function Row({ isAdmin }: { isAdmin: boolean }) {
  const tools = SHOWN.map((id) => TOOLS.find((t) => t.id === id)).filter(
    (t): t is (typeof TOOLS)[number] => Boolean(t),
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          status="new"
          isAdmin={isAdmin}
          procureGuardAccessType="requester"
          onOpen={() => {}}
          isFavourite={false}
          onToggleFavourite={() => {}}
        />
      ))}
    </div>
  );
}

/* Both audiences, one above the other. An `adminPreview` card renders two different ways and
   the diff shows only one of them: for a plain employee it has to be greyed and inert, and for
   an administrator it has to be clickable. Rendering a single row would check half the rule. */
export default function ToolCardPreview() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          As a plain employee
        </h2>
        <Row isAdmin={false} />
      </section>
      <section>
        <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          As a platform administrator
        </h2>
        <Row isAdmin />
      </section>
    </div>
  );
}
