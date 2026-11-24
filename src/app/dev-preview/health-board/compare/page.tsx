/*
 * The Health Board country comparison, signed out, for development only. Same component and data
 * as /supply-chain-analytics/health-board/compare. Dev-only: `notFound()` in production, and the
 * `/dev-preview` entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import HealthBoardComparison from '@/app/supply-chain-analytics/HealthBoardComparison';
import {
  compareHref,
  detailHref,
  overviewHref,
} from '@/app/supply-chain-analytics/health-board/links';
import { buildComparison, categoriesFor } from '@/lib/health-board/calc';
import { kpiByCode } from '@/lib/health-board/definitions';
import { kpiCodeForSlug } from '@/lib/health-board/pages';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';

const BASE = '/dev-preview/health-board';

export default async function HealthBoardComparePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ kpi?: string; year?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = await searchParams;
  const years = await loadYears();
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const kpi = kpiByCode(kpiCodeForSlug(sp.kpi ?? '') ?? 'KPI - P&L (PC/PR)')!;
  const values = await loadYearValues(year);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
        Development preview
      </p>
      <HealthBoardComparison
        comparison={buildComparison(values, year, kpi)}
        years={years}
        categories={categoriesFor(values, year)}
        hrefFor={(code, y) => compareHref(code, y, BASE)}
        overviewHref={overviewHref(year, 'Global', BASE)}
        detailHref={(code, y, c) => detailHref(code, y, c, BASE)}
      />
    </main>
  );
}
