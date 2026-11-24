import { analyticsAccess } from '../access';
import BoardShell from '../BoardShell';

export const metadata = { title: 'NESR | Supply Chain Health Board' };

/* The Power BI report/tenant/workspace ids are configuration, not source.
   Read server-side (no NEXT_PUBLIC_ prefix) with the previous hard-coded
   values as defaults, so an unset env changes nothing. */
const POWERBI_REPORT_ID =
  process.env.POWERBI_SCA_REPORT_ID ?? 'c1485412-17dc-476d-8c80-dc56714d9e53';
const POWERBI_TENANT_ID = process.env.POWERBI_TENANT_ID ?? '5f13d1c2-10ac-49b8-a85e-4bb3d91135b9';
const POWERBI_WORKSPACE_ID = process.env.POWERBI_SCA_WORKSPACE_ID ?? '';

function embedUrl(): string {
  const params = new URLSearchParams({
    reportId: POWERBI_REPORT_ID,
    autoAuth: 'true',
    ctid: POWERBI_TENANT_ID,
  });
  // Only sent when configured — the report embedded fine without it.
  if (POWERBI_WORKSPACE_ID) params.set('groupId', POWERBI_WORKSPACE_ID);
  return `https://app.powerbi.com/reportEmbed?${params.toString()}`;
}

/**
 * The Supply Chain Health Board: the Power BI report exactly as it was before the analytics page
 * had tabs. Platform admins only; `analyticsAccess` 404s anyone else, so the report and tenant
 * ids never reach a reader who cannot see the board.
 */
export default async function PowerBiBoardPage() {
  const access = await analyticsAccess('power-bi');
  if (!access) return null;

  return (
    <BoardShell section="power-bi" adminPreview={access.actor.isPlatformAdmin}>
      <div className="h-full min-h-[600px] w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
        <iframe
          title="Supply Chain Health Board - 2026"
          src={embedUrl()}
          className="h-full min-h-[600px] w-full border-0"
          allowFullScreen
        />
      </div>
    </BoardShell>
  );
}
