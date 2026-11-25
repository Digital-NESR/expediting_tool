import { getRrsmScope } from '@/app/actions/rrsm/overview';
import { getRrsmReport } from '@/app/actions/rrsm/reports';
import RrsmReportsClient from '../../RrsmReportsClient';

export const dynamic = 'force-dynamic';

/** What the country is getting, by supplier and by category, for a month or on hire now. */
export default async function RrsmReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string; month?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const report = scope.country ? await getRrsmReport(scope.country.code, sp.month ?? null) : null;
  return <RrsmReportsClient scope={scope} report={report} />;
}
