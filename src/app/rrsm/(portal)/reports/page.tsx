import { getRrsmHistory, getRrsmScope } from '@/app/actions/rrsm/overview';
import { getRrsmReport } from '@/app/actions/rrsm/reports';
import RrsmReportsClient from '../../RrsmReportsClient';

export const dynamic = 'force-dynamic';

/**
 * What the country is getting, by supplier, category or cost center, for a month or on hire now;
 * and every month it has run (Cycle history, folded in here on 25 Nov 2026).
 */
export default async function RrsmReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string; month?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const [report, history] = scope.country
    ? await Promise.all([
        getRrsmReport(scope.country.code, sp.month ?? null),
        getRrsmHistory(scope.country.code),
      ])
    : [null, []];
  return <RrsmReportsClient scope={scope} report={report} history={history} />;
}
