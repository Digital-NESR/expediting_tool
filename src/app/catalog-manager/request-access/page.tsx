import type { Metadata } from 'next';
import {
  getCatalogActor,
  getCountries,
  getMyCatalogAccessRequest,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import RequestAccessClient from './RequestAccessClient';

export const metadata: Metadata = { title: 'Request Access | NESR Catalog Repo' };
export const dynamic = 'force-dynamic';

export default async function CatalogRequestAccessPage() {
  const [actor, countries, myRequest, pendingCount] = await Promise.all([
    getCatalogActor(),
    getCountries(),
    getMyCatalogAccessRequest(),
    getPendingApprovalCount(),
  ]);

  return (
    <RequestAccessClient
      actor={actor}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      myRequest={myRequest}
      roleLabel={getPermissionProfile(actor.role).description}
      pendingCount={pendingCount}
    />
  );
}
