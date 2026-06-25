import type { Metadata } from 'next';
import { getAuditLog, getCatalogActor, getPendingApprovalCount } from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import AuditClient from './AuditClient';

export const metadata: Metadata = { title: 'Audit log | NESR Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const [log, actor, pendingCount] = await Promise.all([
    getAuditLog(200),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  return (
    <AuditClient
      log={log}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
