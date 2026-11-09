'use client';

import { ToolCard } from '@/app/home/ToolCard';
import { TOOLS } from '@/app/home/tools';

/**
 * Catalog Repo beside the two cards it was made to match, and the one tool still in preview.
 *
 * Reading them together is the point: "the format we are following on /home" is not a thing you
 * can check on a card by itself, only against its neighbours.
 */
const SHOWN = ['catalog-manager', 'learning-hub', 'soa-consolidation', 'supply-chain-analytics'];

export default function ToolCardPreview() {
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
          /* Rendered as a plain employee, not an admin: the question is what a normal person
             sees now the admin-preview gate is gone. */
          isAdmin={false}
          procureGuardAccessType="requester"
          onOpen={() => {}}
          isFavourite={false}
          onToggleFavourite={() => {}}
        />
      ))}
    </div>
  );
}
