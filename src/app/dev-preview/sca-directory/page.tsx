/*
 * The Supply Chain Analytics directory, signed out, for development only.
 *
 * /supply-chain-analytics is behind SSO and the admin/travel-grant gate, so this renders the real
 * header and the real directory from the real section list, as a platform admin sees it and as a
 * travel-grant reader sees it, plus one board's header. `?as=travel` shows the travel reader alone.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import AnalyticsHeader from '@/app/supply-chain-analytics/AnalyticsHeader';
import SectionDirectory from '@/app/supply-chain-analytics/SectionDirectory';
import { sectionById, visibleSections } from '@/app/supply-chain-analytics/sections';

export default async function ScaDirectoryPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const admin = (await searchParams).as !== 'travel';

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-slate-900">
      <AnalyticsHeader adminPreview={admin} />
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
            Development preview · {admin ? 'platform admin' : 'travel-grant reader'}
          </p>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Supply Chain Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose a board. Each one opens on its own page.
            </p>
          </div>
          <SectionDirectory sections={visibleSections(admin)} />

          <p className="mb-2 mt-12 text-xs font-semibold uppercase tracking-wide text-amber-600">
            A board&apos;s header
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <AnalyticsHeader section={sectionById('purchase-orders')} adminPreview={admin} />
          </div>
        </div>
      </main>
    </div>
  );
}
