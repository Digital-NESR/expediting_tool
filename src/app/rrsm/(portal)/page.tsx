/*
 * The RRSM dashboard.
 *
 * Inside the (portal) route group so that `/rrsm/submit/[token]` can live outside it: the layout
 * beside this file redirects anyone without an RRSM grant, which is right for the staff pages and
 * fatal for the supplier one.
 *
 * `/rrsm?view=` was how the four tabs were addressed before each became its own page, and renewal
 * reminders already in people's inboxes carry it. Those links are redirected rather than broken.
 *
 * A country that runs only recurrent services (HQ Dubai) gets the recurrent dashboard here. A
 * reader who is only a service requester has no dashboard: they land on their own services.
 */
import { redirect } from 'next/navigation';
import { getRrsmOverview, getRrsmScope } from '@/app/actions/rrsm/overview';
import { getRecurrentBoard } from '@/app/actions/rrsm/recurrent';
import { legacyViewPath, rrsmHref } from '@/lib/rrsm/nav';
import RrsmDashboardClient from '../RrsmDashboardClient';
import RecurrentDashboardClient from '../RecurrentDashboardClient';

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
  const requesterOnly = !scope.canBuy && !scope.canValidate && !scope.isAdmin;
  if (scope.country?.recurrentEnabled && requesterOnly) {
    redirect(rrsmHref('/rrsm/recurrent', scope.country.code));
  }
  if (scope.country?.recurrentEnabled && !scope.country.rentalsEnabled) {
    const board = await getRecurrentBoard(scope.country.code);
    return <RecurrentDashboardClient board={board} />;
  }
  const overview = scope.country ? await getRrsmOverview(scope.country.code) : null;
  return <RrsmDashboardClient scope={scope} overview={overview} />;
}
