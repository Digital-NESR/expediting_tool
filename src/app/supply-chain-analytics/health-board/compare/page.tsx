import { buildComparison, categoriesFor } from '@/lib/health-board/calc';
import { kpiByCode } from '@/lib/health-board/definitions';
import { kpiCodeForSlug } from '@/lib/health-board/pages';
import { parseSort } from '@/lib/health-board/compare';
import { kpiFrontiers } from '@/lib/health-board/explain';
import { loadProvenance, loadYearValues, loadYears } from '@/lib/health-board/queries';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../../access';
import BoardShell from '../../BoardShell';
import HealthBoardComparison from '../../HealthBoardComparison';
import { compareHref, detailHref, overviewHref, readMeHref } from '../links';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Health Board · Country comparison' };

/** Power BI opened this page on PC/PR. */
const DEFAULT_KPI = 'KPI - P&L (PC/PR)';

/**
 * One KPI across every country (src/lib/health-board/RULES.md, "Country comparison"). Same access
 * as the overview. The KPI and year come from the URL; an unknown one falls back to PC/PR and the
 * latest year.
 */
export default async function HealthBoardComparePage({
  searchParams,
}: {
  searchParams: Promise<{ kpi?: string; year?: string; sort?: string }>;
}) {
  const access = await analyticsAccess('health-board');
  if (!access) return null;
  const sp = await searchParams;

  const data = await load(sp).catch((err: unknown) => {
    log.error('health board comparison unavailable', err);
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
        <HealthBoardComparison
          comparison={data.comparison}
          years={data.years}
          categories={data.categories}
          sort={parseSort(sp.sort)}
          provenance={data.provenance}
          frontiers={data.frontiers}
          readMeHref={readMeHref()}
          hrefFor={(code, y, s) => compareHref(code, y, undefined, s)}
          overviewHref={overviewHref(data.comparison.year, 'Global')}
          detailHref={(code, y, c) => detailHref(code, y, c)}
        />
      )}
    </BoardShell>
  );
}

async function load(sp: { kpi?: string; year?: string }) {
  const years = await loadYears();
  if (!years.length) return 'empty' as const;
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const kpi = kpiByCode(kpiCodeForSlug(sp.kpi ?? '') ?? DEFAULT_KPI)!;
  const [values, provenance] = await Promise.all([loadYearValues(year), loadProvenance(year)]);
  return {
    years,
    provenance,
    frontiers: kpiFrontiers(values, year),
    categories: categoriesFor(values, year),
    comparison: buildComparison(values, year, kpi),
  };
}
