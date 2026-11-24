/*
 * The Health Board Read Me, signed out, for development only. Same component and data as
 * /supply-chain-analytics/health-board/read-me. Dev-only: `notFound()` in production, and the
 * `/dev-preview` entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import HealthBoardReadMe from '@/app/supply-chain-analytics/HealthBoardReadMe';
import { detailHref, overviewHref } from '@/app/supply-chain-analytics/health-board/links';
import { categoriesFor } from '@/lib/health-board/calc';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';

const BASE = '/dev-preview/health-board';

export default async function HealthBoardReadMePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [year] = await loadYears();
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
        Development preview
      </p>
      <HealthBoardReadMe
        categories={categoriesFor(await loadYearValues(year), year)}
        year={year}
        overviewHref={overviewHref(year, 'Global', BASE)}
        detailHref={(code) => detailHref(code, year, 'Global', BASE)}
      />
    </main>
  );
}
