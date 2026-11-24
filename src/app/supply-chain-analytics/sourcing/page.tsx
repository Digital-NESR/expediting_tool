import { loadPoFilterOptions } from '@/lib/purchase-orders/options';
import { materialsTarget } from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import { analyticsAccess } from '../access';
import BoardShell from '../BoardShell';
import SourcingBoard from '../SourcingBoard';

const log = logger('supply-chain-analytics');

export const metadata = { title: 'NESR | Sourcing Opportunities' };

export const maxDuration = 60;

/**
 * Sourcing opportunities from spend history. Platform admins only, like the PO board it shares
 * a warehouse with; it needs only the filter option lists up front and fetches the rest itself.
 */
export default async function SourcingBoardPage() {
  const access = await analyticsAccess('sourcing');
  if (!access) return null;

  const poOptions = await loadPoFilterOptions().catch((err) => {
    log.error('purchase order filters unavailable', err, { target: materialsTarget() });
    return null;
  });

  return (
    <BoardShell section="sourcing" adminPreview={access.actor.isPlatformAdmin}>
      {poOptions ? (
        <SourcingBoard options={poOptions} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <p className="text-[15px] font-semibold text-slate-900">Sourcing analysis unavailable</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
            The SAP extract warehouse could not be reached.
          </p>
        </div>
      )}
    </BoardShell>
  );
}
