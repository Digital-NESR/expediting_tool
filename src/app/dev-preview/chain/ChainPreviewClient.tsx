'use client';

/* The client half of the dev preview: stubs for the two props the chain takes from
   ToolLauncher, which it cannot have here because both need a session. */

import { useState } from 'react';
import dynamic from 'next/dynamic';

const ProcessChain = dynamic(() => import('@/app/home/chain/ProcessChain'), { ssr: false });

export default function ChainPreviewClient({ offChainToolIds }: { offChainToolIds: string[] }) {
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <>
      <ProcessChain
        offChainToolIds={offChainToolIds}
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
