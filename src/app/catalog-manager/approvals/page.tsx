import type { Metadata } from 'next';
import { listCatalogEntries, getCatalogActor, getCountries, getApprovableEntryIds } from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import ApprovalsClient from './ApprovalsClient';

export const metadata: Metadata = { title: 'NESR | Approvals - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country = 'ALL' } = await searchParams;
  // Only the pending rows are needed here — filtered in SQL, not by shipping the whole catalog
  // to this page and discarding most of it.
  const [pending, actor, countries] = await Promise.all([
    listCatalogEntries({ country, status: 'Pending Approval' }),
    getCatalogActor(),
    getCountries(),
  ]);
  // Server-computed: which of these the caller actually holds authority over
  // (country AND spend category). Never re-derived in the client.
  const approvableIds = await getApprovableEntryIds(pending.map((e) => e.id));

  return (
    <ApprovalsClient
      pending={pending}
      scope={country}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      approvableIds={approvableIds}
      delegatedFrom={actor.delegatedFrom ?? []}
    />
  );
}
