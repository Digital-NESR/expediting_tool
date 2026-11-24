/*
 * One KPI's native Health Board page, signed out, for development only. Same component and data
 * as /supply-chain-analytics/health-board/<kpi>. Dev-only: `notFound()` in production, and the
 * `/dev-preview` entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import HealthBoardDetail from '@/app/supply-chain-analytics/HealthBoardDetail';
import { detailHref, overviewHref } from '@/app/supply-chain-analytics/health-board/links';
import { buildDetail } from '@/lib/health-board/calc';
import { COUNTRIES, kpiByCode, type Country } from '@/lib/health-board/definitions';
import { KPI_PAGES, kpiCodeForSlug } from '@/lib/health-board/pages';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';

const BASE = '/dev-preview/health-board';

export default async function HealthBoardKpiPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ kpi: string }>;
  searchParams: Promise<{ year?: string; country?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const code = kpiCodeForSlug((await params).kpi);
  const kpi = code ? kpiByCode(code) : undefined;
  if (!code || !kpi) notFound();
  const sp = await searchParams;
  const years = await loadYears();
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const country = (COUNTRIES as readonly string[]).includes(sp.country ?? '')
    ? (sp.country as Country)
    : 'Global';

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
        Development preview
      </p>
      <HealthBoardDetail
        detail={buildDetail(await loadYearValues(year), year, country, kpi)}
        page={KPI_PAGES[code]}
        years={years}
        hrefFor={(y, c) => detailHref(code, y, c, BASE)!}
        overviewHref={overviewHref(year, country, BASE)}
      />
    </main>
  );
}
