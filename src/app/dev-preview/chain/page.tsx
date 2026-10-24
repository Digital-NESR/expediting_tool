/*
 * A signed-out view of the process chain, for development only.
 *
 * The chain lives on the home page, which is behind SSO, so every change to it had been
 * shipped on the strength of a test suite and a careful read -- and two label-overlap bugs
 * went out that way, because neither tsc nor vitest can see that a word is drawn on top of
 * another word. This route renders the same component with stub props so it can be opened,
 * looked at and driven on a dev server.
 *
 * It is dev-only twice over: `notFound()` below removes it from a production build, and the
 * matching entry in src/proxy.ts is only added outside production, so the auth gate still
 * covers it even if this file were ever reached. The stubs are deliberately dumb -- opening a
 * tool logs instead of routing, because the real access path needs a session and a session is
 * the thing this page exists to do without.
 */
import { notFound } from 'next/navigation';
import { OFF_CHAIN_TOOL_IDS } from '@/lib/home/process-chain';
import ChainPreviewClient from './ChainPreviewClient';

export default function ChainPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Development preview
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supply chain process view
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The same component the home page renders for admins, with the access path stubbed out.
            Not reachable in production.
          </p>
        </div>
        <ChainPreviewClient offChainToolIds={OFF_CHAIN_TOOL_IDS} />
      </div>
    </main>
  );
}
