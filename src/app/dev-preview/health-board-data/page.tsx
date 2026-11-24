/*
 * The Health Board Data admin panel, signed out, for development only. /admin is SSO-gated and
 * the real actions are admin-only, so this renders the same panel with in-browser stand-ins
 * (see HealthBoardDataPreview). Dev-only twice over: `notFound()` in production, and the
 * `/dev-preview` entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import HealthBoardDataPreview from './HealthBoardDataPreview';

export default function HealthBoardDataPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
        Development preview · nothing here reaches a database
      </p>
      <div className="mx-auto max-w-6xl">
        <HealthBoardDataPreview />
      </div>
    </main>
  );
}
