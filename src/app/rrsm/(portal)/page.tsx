/*
 * The RRSM dashboard.
 *
 * Inside the (portal) route group so that `/rrsm/submit/[token]` can live outside it: the layout
 * beside this file redirects anyone without an RRSM grant, which is right for the staff pages and
 * fatal for the supplier one.
 *
 * `/rrsm?view=` was how the four tabs were addressed before each became its own page, and renewal
 * reminders already in people's inboxes carry it. Those links are redirected rather than broken.
 */
import { redirect } from 'next/navigation';
import { getRrsmOverview, getRrsmScope } from '@/app/actions/rrsm/overview';
import { legacyViewPath, rrsmHref } from '@/lib/rrsm/nav';
import RrsmDashboardClient from '../RrsmDashboardClient';

export const dynamic = 'force-dynamic';

export default async function RrsmPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string; view?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};

  const legacy = legacyViewPath(sp.view);
  if (legacy) redirect(rrsmHref(legacy, sp.country));

  const scope = await getRrsmScope(sp.country ?? null);
  const overview = scope.country ? await getRrsmOverview(scope.country.code) : null;
  return <RrsmDashboardClient scope={scope} overview={overview} />;
}
