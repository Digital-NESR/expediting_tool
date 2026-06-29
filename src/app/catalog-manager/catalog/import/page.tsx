import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCatalogActor, getPendingApprovalCount } from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogImportClient from './CatalogImportClient';

export const metadata: Metadata = { title: 'Bulk import | NESR Catalog Repo' };
export const dynamic = 'force-dynamic';

export default async function CatalogImportPage() {
  const [actor, pendingCount] = await Promise.all([getCatalogActor(), getPendingApprovalCount()]);
  if (!actor.canCreate) redirect('/catalog-manager/catalog');

  return (
    <CatalogImportClient
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
