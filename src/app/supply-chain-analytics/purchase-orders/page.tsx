import { loadPurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import { loadPoFilterOptions } from '@/lib/purchase-orders/options';
import { materialsTarget } from '@/lib/db-materials';
import { describeDbError } from '@/lib/db/describe-error';
import { EMPTY_FILTERS } from '@/lib/purchase-orders/filters';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../access';
import BoardShell from '../BoardShell';
import PurchaseOrderAnalyticsClient from '../PurchaseOrderAnalyticsClient';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Purchase Order Analytics' };

/* Ten aggregates over a 747k-row fact table. Raised to 60s after the board's first load was
   measured at ~17s against a 30s ceiling — close enough that a cold start plus a slow round would
   have tripped it. This is a ceiling, not a wait: a fast page is unaffected. */
export const maxDuration = 60;

/**
 * The PO book from the SAP extract warehouse. Platform admins only: it is company-wide purchasing
 * data with no country scoping of its own, and the travel grant says nothing about who may see it.
 *
 * It needs the overview and the filter option lists, and a failure in either blanks only the
 * piece it feeds. Past due is deliberately NOT loaded here: it is the second of two views behind a
 * switch, and loading it with the rest put ~22 aggregates on this pool in one burst. The client
 * fetches it the first time that view is opened.
 */
export default async function PurchaseOrdersBoardPage() {
  const access = await analyticsAccess('purchase-orders');
  if (!access) return null;

  /* Why the board failed, if it did. A reader who can see the real reason and the connection it
     was attempted on can act, and this page is admin-only. */
  const [purchaseOrders, { poOptions, poFailure }] = await Promise.all([
    loadPurchaseOrderAnalytics(EMPTY_FILTERS).catch((err) => {
      log.error('purchase order board unavailable', err);
      return null;
    }),
    loadPoFilterOptions().then(
      (poOptions) => ({ poOptions, poFailure: null }),
      (err) => {
        log.error('purchase order filters unavailable', err, { target: materialsTarget() });
        return { poOptions: null, poFailure: describeDbError(err) as string | null };
      },
    ),
  ]);

  return (
    <BoardShell section="purchase-orders" adminPreview={access.actor.isPlatformAdmin}>
      {/* Without the option lists there is no filter bar to render, and a board whose filters are
          missing is more confusing than one that says so. */}
      {poOptions ? (
        <PurchaseOrderAnalyticsClient data={purchaseOrders} options={poOptions} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-slate-900">
            Purchase order data unavailable
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
            The SAP extract warehouse could not be reached. The other boards are unaffected.
          </p>
          {/* Admin-only surface, so the actual cause is shown rather than swallowed. */}
          <dl className="mx-auto mt-5 max-w-xl space-y-1.5 rounded-xl bg-slate-50 p-4 text-left">
            <div className="flex gap-2">
              <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Reason
              </dt>
              <dd className="min-w-0 break-words font-mono text-[11.5px] text-red-700">
                {poFailure ?? 'not recorded'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Target
              </dt>
              <dd className="min-w-0 break-words font-mono text-[11.5px] text-slate-500">
                {materialsTarget()}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </BoardShell>
  );
}
