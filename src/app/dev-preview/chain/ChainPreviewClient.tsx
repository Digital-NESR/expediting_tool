'use client';

/* The client half of the dev preview: stubs for the props the chain takes from ToolLauncher,
   which it cannot have here because they need a session.

   The search box is a stand-in for the launcher's own, which sits above both home views and
   is passed down as `query`. It is here so the search can be driven on this page rather than
   only behind SSO -- it was reported broken in the chain, and it was: the box fed the card
   grid and nothing else. */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ToolStatus } from '@/app/home/tools';

const ProcessChain = dynamic(() => import('@/app/home/chain/ProcessChain'), { ssr: false });

export default function ChainPreviewClient({ offChainToolIds }: { offChainToolIds: string[] }) {
  const [opened, setOpened] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /* Stand-ins for the session. Every per-user access state has to be reachable here, because
     this page exists precisely so the chain can be looked at without one. */
  const [status, setStatus] = useState<ToolStatus>('new');
  const [isAdmin, setIsAdmin] = useState(false);
  const [favourites, setFavourites] = useState<string[]>(['procure-guard']);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
        <span className="font-semibold text-amber-800">Pretend session:</span>
        {(['new', 'pending', 'approved', 'denied'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${
              status === s
                ? 'border-transparent bg-amber-600 text-white'
                : 'border-amber-200 bg-white text-amber-800 hover:border-amber-400'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsAdmin((on) => !on)}
          className={`ml-2 rounded-full border px-2.5 py-1 font-semibold transition-colors ${
            isAdmin
              ? 'border-transparent bg-amber-600 text-white'
              : 'border-amber-200 bg-white text-amber-800 hover:border-amber-400'
          }`}
        >
          admin
        </button>
      </div>

      <div className="mb-4 max-w-md">
        <label htmlFor="chain-search" className="sr-only">
          Search applications
        </label>
        <input
          id="chain-search"
          type="text"
          placeholder="Search applications..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors placeholder-slate-400 focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20"
        />
      </div>

      <ProcessChain
        query={query}
        offChainToolIds={offChainToolIds}
        statusOf={() => status}
        isAdmin={isAdmin}
        favouriteIds={favourites}
        onToggleFavourite={(id) =>
          setFavourites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
        }
        onOpenTool={(tool, newTab) => setOpened(`${tool.name}${newTab ? ' (new tab)' : ''}`)}
        renderToolCard={(tool) => (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-bold text-slate-900">{tool.name}</p>
            <p className="mt-1 text-xs leading-snug text-slate-500">{tool.description}</p>
          </div>
        )}
      />
      {opened && (
        <p className="mt-3 text-xs text-slate-500">
          Would have opened: <span className="font-semibold text-slate-700">{opened}</span>
        </p>
      )}
    </>
  );
}
