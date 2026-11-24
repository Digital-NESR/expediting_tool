import { loadTravelAnalytics } from '@/lib/travel-analytics/queries';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../access';
import BoardShell from '../BoardShell';
import TravelAnalyticsClient from '../TravelAnalyticsClient';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Travel Analytics' };

/* The travel board reads five tables across two databases, and the slowest part is the
   cost-centre mapping. Well inside the platform default today — this is here because the figure
   that will grow is the bookings table, and a page that starts timing out should do so loudly in
   a review rather than quietly in production. */
export const maxDuration = 60;

/**
 * The travel board, open to every reader the layout admits and scoped to their grant.
 *
 * A travel feed that is unreachable renders the same card as no access, which is the honest
 * answer — there is nothing to show either way — and the reason is logged. A platform admin with
 * no travel grant of their own gets that card too, as they did on the tab.
 */
export default async function TravelBoardPage() {
  const access = await analyticsAccess('travel');
  if (!access) return null;
  const { actor, scope } = access;

  const travel = scope
    ? await loadTravelAnalytics(scope).catch((err) => {
        log.error('travel board unavailable', err);
        return null;
      })
    : null;

  return (
    <BoardShell section="travel" adminPreview={actor.isPlatformAdmin}>
      <TravelAnalyticsClient data={travel} />
    </BoardShell>
  );
}
