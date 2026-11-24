import { analyticsAccess } from './access';
import AnalyticsHeader from './AnalyticsHeader';
import SectionDirectory from './SectionDirectory';
import { visibleSections } from './sections';

/**
 * The Supply Chain Analytics directory: one card per board, each opening on its own route.
 *
 * The boards used to be tabs on this page, all loaded up front. Each route now loads only what
 * its own board needs, so this page reads nothing but the reader's access.
 */
export default async function SupplyChainAnalyticsPage() {
  const access = await analyticsAccess();
  if (!access) return null;
  const { actor } = access;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-slate-900">
      <AnalyticsHeader adminPreview={actor.isPlatformAdmin} />
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Supply Chain Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose a board. Each one opens on its own page.
            </p>
          </div>
          <SectionDirectory sections={visibleSections(actor.isPlatformAdmin)} />
        </div>
      </main>
    </div>
  );
}
