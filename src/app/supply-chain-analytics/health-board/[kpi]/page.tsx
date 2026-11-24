import { notFound } from 'next/navigation';
import { buildDetail } from '@/lib/health-board/calc';
import { COUNTRIES, kpiByCode, type Country } from '@/lib/health-board/definitions';
import { KPI_PAGES, kpiCodeForSlug } from '@/lib/health-board/pages';
import { loadProvenance, loadYearValues, loadYears } from '@/lib/health-board/queries';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../../access';
import BoardShell from '../../BoardShell';
import HealthBoardDetail from '../../HealthBoardDetail';
import { compareHref, detailHref, overviewHref } from '../links';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Supply Chain Health Board' };

/**
 * One KPI's detail page (src/lib/health-board/RULES.md, "Detail pages"). Same access as the
 * overview; an unknown KPI is a 404, an unknown year or country falls back to the latest year and
 * Global.
 */
export default async function HealthBoardKpiPage({
  params,
  searchParams,
}: {
  params: Promise<{ kpi: string }>;
  searchParams: Promise<{ year?: string; country?: string }>;
}) {
  const access = await analyticsAccess('health-board');
  if (!access) return null;
  const { kpi: slug } = await params;
  const code = kpiCodeForSlug(slug);
  const kpi = code ? kpiByCode(code) : undefined;
  if (!code || !kpi) notFound();
  const sp = await searchParams;

  const data = await load(sp, code).catch((err: unknown) => {
    log.error('health board detail unavailable', err, { slug });
    return 'unreachable' as const;
  });

  return (
    <BoardShell section="health-board" adminPreview={access.actor.isPlatformAdmin}>
      {data === 'unreachable' || data === 'empty' ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <p className="text-[15px] font-semibold text-slate-900">Health Board unavailable</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
            {data === 'empty'
              ? 'No KPI values have been loaded yet.'
              : 'The KPI database could not be reached.'}
          </p>
        </div>
      ) : (
        <HealthBoardDetail
          detail={data.detail}
          previous={data.previous}
          provenance={data.provenance}
          countries={data.countries}
          page={KPI_PAGES[code]}
          years={data.years}
          hrefFor={(y, c) => detailHref(code, y, c)!}
          overviewHref={overviewHref(data.detail.year, data.detail.country)}
          compareHref={compareHref(code, data.detail.year)}
        />
      )}
    </BoardShell>
  );
}

async function load(sp: { year?: string; country?: string }, code: string) {
  const years = await loadYears();
  if (!years.length) return 'empty' as const;
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const country = (COUNTRIES as readonly string[]).includes(sp.country ?? '')
    ? (sp.country as Country)
    : 'Global';
  const kpi = kpiByCode(code)!;
  const [values, prior, provenance] = await Promise.all([
    loadYearValues(year),
    years.includes(year - 1) ? loadYearValues(year - 1) : Promise.resolve(null),
    loadProvenance(year, country),
  ]);
  return {
    years,
    provenance,
    detail: buildDetail(values, year, country, kpi),
    previous: prior ? buildDetail(prior, year - 1, country, kpi) : null,
    countries: COUNTRIES.map((c) => buildDetail(values, year, c, kpi)),
  };
}
