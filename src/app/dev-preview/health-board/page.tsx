/*
 * The native Health Board, signed out, for development only.
 *
 * /supply-chain-analytics/health-board is behind SSO and platform-admin access, so this renders
 * the same component from the same all_kpis data, so the table can be checked against the Power
 * BI report on a developer machine.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import HealthBoardOverview from '@/app/supply-chain-analytics/HealthBoardOverview';
import { buildOverview } from '@/lib/health-board/calc';
import { COUNTRIES, type Country } from '@/lib/health-board/definitions';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';

function hrefFor(year: number, country: Country): string {
  return `/dev-preview/health-board?${new URLSearchParams({ year: String(year), country }).toString()}`;
}

export default async function HealthBoardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; country?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = await searchParams;
  const years = await loadYears();
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const country = (COUNTRIES as readonly string[]).includes(sp.country ?? '')
    ? (sp.country as Country)
    : 'Global';
  const values = await loadYearValues(year);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
        Development preview
      </p>
      <HealthBoardOverview
        overview={buildOverview(values, year, country)}
        years={years}
        hrefFor={hrefFor}
      />
    </main>
  );
}
