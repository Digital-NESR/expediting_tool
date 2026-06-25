import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getCatalogActor,
  getCatalogEntry,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogEntryDetailClient from './CatalogEntryDetailClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const entry = await getCatalogEntry(Number(id));
  return { title: `${entry?.code ?? 'Entry'} | NESR Catalog Manager` };
}

export const dynamic = 'force-dynamic';

export default async function CatalogEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [entry, actor, pendingCount] = await Promise.all([
    getCatalogEntry(Number(id)),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  if (!entry) notFound();

  const canApproveThis =
    actor.canApprove && (actor.role === 'Admin' || actor.approverCountries.length === 0 || actor.approverCountries.includes(entry.country_code));

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
    />
  );
}
