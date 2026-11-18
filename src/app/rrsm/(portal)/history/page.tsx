import { getRrsmHistory, getRrsmScope } from '@/app/actions/rrsm/overview';
import RrsmHistoryClient from '../../RrsmHistoryClient';

export const dynamic = 'force-dynamic';

/** Every cycle the country has run, newest first. */
export default async function RrsmHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const rows = scope.country ? await getRrsmHistory(scope.country.code) : [];
  return <RrsmHistoryClient scope={scope} rows={rows} />;
}
