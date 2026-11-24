import { categoriesFor } from '@/lib/health-board/calc';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../../access';
import BoardShell from '../../BoardShell';
import HealthBoardReadMe from '../../HealthBoardReadMe';
import { detailHref, overviewHref } from '../links';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Health Board · Read Me' };

/**
 * What each KPI measures, grouped by the latest year's areas, each linking to its page; and how
 * the board calculates (src/lib/health-board/RULES.md, "Read Me"). Same access as the overview.
 */
export default async function HealthBoardReadMePage() {
  const access = await analyticsAccess('health-board');
  if (!access) return null;

  const data = await load().catch((err: unknown) => {
    log.error('health board read me unavailable', err);
    return null;
  });

  return (
    <BoardShell section="health-board" adminPreview={access.actor.isPlatformAdmin}>
      {data ? (
        <HealthBoardReadMe
          categories={data.categories}
          year={data.year}
          overviewHref={overviewHref(data.year, 'Global')}
          detailHref={(code) => detailHref(code, data.year, 'Global')}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <p className="text-[15px] font-semibold text-slate-900">Health Board unavailable</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
            The KPI database could not be reached, or holds no values yet.
          </p>
        </div>
      )}
    </BoardShell>
  );
}

async function load() {
  const [year] = await loadYears();
  if (!year) return null;
  return { year, categories: categoriesFor(await loadYearValues(year), year) };
}
