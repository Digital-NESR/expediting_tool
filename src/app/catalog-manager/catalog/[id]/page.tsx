import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getApprovableEntryIds,
  getCatalogActor,
  getCatalogEntry,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogEntryDetailClient from './CatalogEntryDetailClient';
import InRrsmPanel from './InRrsmPanel';
import { readRrsmUsage } from '@/lib/rrsm/registry-usage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await getCatalogEntry(Number(id));
  return { title: `NESR | ${entry?.code ?? 'Entry'} - Catalog Manager` };
}

export const dynamic = 'force-dynamic';

export default async function CatalogEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [entry, actor, pendingCount] = await Promise.all([
    getCatalogEntry(Number(id)),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  if (!entry) notFound();

  // Server-computed (country AND spend category), same rule the decide action enforces.
  const [approvable, usage] = await Promise.all([
    getApprovableEntryIds([entry.id]),
    readRrsmUsage(entry.code),
  ]);
  const canApproveThis = approvable.includes(entry.id);

  return (
    <CatalogEntryDetailClient
      entry={entry}
      pendingCount={pendingCount}
      roleLabel={getPermissionProfile(actor.role).description}
      canCreate={actor.canCreate}
      canApprove={actor.canApprove}
      canApproveThis={canApproveThis}
      canAdmin={actor.canAdmin}
      homeCountry={actor.country_code}
      inRrsm={
        <InRrsmPanel
          usage={usage}
          countryCode={entry.country_code}
          registryType={entry.registry_type}
        />
      }
    />
  );
}
