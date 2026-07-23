import type { Metadata } from 'next';
import {
  getSuppliersWithStats,
  getCatalogActor,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import SuppliersListClient from './SuppliersListClient';

export const metadata: Metadata = { title: 'NESR | Suppliers - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const [suppliers, actor, pendingCount] = await Promise.all([
    getSuppliersWithStats(),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  return (
    <SuppliersListClient
      suppliers={suppliers}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
