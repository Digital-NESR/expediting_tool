/*
 * PO Expediting's gated UI, signed out, for development only.
 *
 * Same reason as the chain preview next door: /po-expediting and its analytics page are behind
 * SSO, so a control added to either would otherwise ship on the strength of a type-check and a
 * careful read — and neither tsc nor vitest can see that two buttons collide at phone width or
 * that a figure wraps out of its card. This renders the real components with stub props.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production, so the auth gate still covers it.
 */
import { notFound } from 'next/navigation';
import KpiPreview from './KpiPreview';

export default function PoExpeditingPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Development preview
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">PO Expediting UI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Components from the SSO-gated pages, with stub props. Not reachable in production.
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Dashboard KPI cards
          </h2>
          <KpiPreview />
        </section>
      </div>
    </main>
  );
}
