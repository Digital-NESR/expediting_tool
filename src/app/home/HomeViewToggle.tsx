'use client';

/**
 * The switch between the card grid and the process chain.
 *
 * Two segments rather than an icon button, because the two views are peers and a single icon
 * would have to carry "what is the other one" on its own. Admins only for now, so the caller
 * decides whether to render it at all -- this component does not know about access.
 */

import { LayoutGrid, Workflow } from 'lucide-react';
import type { HomeView } from './useHomeView';

const OPTIONS: { id: HomeView; label: string; icon: typeof LayoutGrid; hint: string }[] = [
  { id: 'grid', label: 'Tools', icon: LayoutGrid, hint: 'Every tool, alphabetically' },
  { id: 'chain', label: 'Chain', icon: Workflow, hint: 'Every tool on the process it serves' },
];

export function HomeViewToggle({
  view,
  onChange,
}: {
  view: HomeView;
  onChange: (next: HomeView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Home view"
      className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-0.5 shadow-sm"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = view === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            title={option.hint}
            className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-bold transition-colors ${
              active
                ? 'bg-[#307c4c] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
