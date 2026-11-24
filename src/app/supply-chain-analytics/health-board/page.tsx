import { buildOverview } from '@/lib/health-board/calc';
import { COUNTRIES, type Country } from '@/lib/health-board/definitions';
import { loadYearValues, loadYears } from '@/lib/health-board/queries';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../access';
import BoardShell from '../BoardShell';
import HealthBoardOverview from '../HealthBoardOverview';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Supply Chain Health Board' };

function hrefFor(year: number, country: Country): string {
  const q = new URLSearchParams({ year: String(year), country });
  return `/supply-chain-analytics/health-board?${q.toString()}`;
}

/**
 * The Supply Chain Health Board, built natively from `all_kpis` (src/lib/health-board/RULES.md).
 * Platform admins only, as the Power BI board was. The year and country come from the URL; an
 * unknown one falls back to the latest year and Global rather than an error.
 */
export default async function HealthBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; country?: string }>;
}) {
  const access = await analyticsAccess('health-board');
  if (!access) return null;
  const sp = await searchParams;

  const data = await load(sp).catch((err: unknown) => {
    log.error('health board unavailable', err);
    return 'unreachable' as const;
  });

  return (
    <BoardShell section="health-board" adminPreview={access.actor.isPlatformAdmin}>
      {data === 'unreachable' ? (
        <Unavailable message="The KPI database could not be reached." />
      ) : data === 'empty' ? (
        <Unavailable message="No KPI values have been loaded yet." />
      ) : (
        <HealthBoardOverview overview={data.overview} years={data.years} hrefFor={hrefFor} />
      )}
    </BoardShell>
  );
}

async function load(sp: { year?: string; country?: string }) {
  const years = await loadYears();
  if (!years.length) return 'empty' as const;
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const country = (COUNTRIES as readonly string[]).includes(sp.country ?? '')
    ? (sp.country as Country)
    : 'Global';
  return { years, overview: buildOverview(await loadYearValues(year), year, country) };
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
      <p className="text-[15px] font-semibold text-slate-900">Health Board unavailable</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">{message}</p>
    </div>
  );
}
