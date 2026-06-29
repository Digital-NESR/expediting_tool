import type { Metadata } from 'next';
import { listCatalogEntries, getCatalogActor, getCountries } from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import ApprovalsClient from './ApprovalsClient';

export const metadata: Metadata = { title: 'Approvals | NESR Catalog Repo' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country = 'ALL' } = await searchParams;
  const [entries, actor, countries] = await Promise.all([
    listCatalogEntries({ country }),
    getCatalogActor(),
    getCountries(),
  ]);
  const pending = entries.filter((e) => e.status === 'Pending Approval');

  return (
    <ApprovalsClient
      pending={pending}
      scope={country}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      approverCountries={actor.approverCountries}
      isAdmin={actor.role === 'Admin'}
      delegatedFrom={actor.delegatedFrom ?? []}
    />
  );
}
