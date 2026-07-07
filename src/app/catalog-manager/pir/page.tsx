import type { Metadata } from 'next';
import {
  listPirEntries,
  getCatalogActor,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import PirCatalogClient from './PirCatalogClient';

export const metadata: Metadata = { title: 'PIR / Inventory | NESR Catalog Repo' };
export const dynamic = 'force-dynamic';

export default async function PirCatalogPage() {
  const [entries, actor, pendingCount] = await Promise.all([
    listPirEntries(),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  return (
    <PirCatalogClient
      entries={entries}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
