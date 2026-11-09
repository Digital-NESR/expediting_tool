/*
 * Home tool cards, signed out, for development only.
 *
 * /home is behind SSO, so a card flipped from preview-grey to live-green would otherwise ship on
 * the strength of a diff. This renders the real ToolCard from the real registry, so the tone,
 * accent, hover class and badge are the ones production will draw.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import ToolCardPreview from './ToolCardPreview';

export default function ToolCardPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Development preview
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Home tool cards</h1>
          <p className="mt-1 text-sm text-slate-500">
            The real cards from the real registry. Not reachable in production.
          </p>
        </div>
        <ToolCardPreview />
      </div>
    </main>
  );
}
