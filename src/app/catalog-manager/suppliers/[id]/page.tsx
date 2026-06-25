import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getSupplierProfile,
  getCatalogActor,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import SupplierProfileClient from './SupplierProfileClient';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getSupplierProfile(Number(id));
  return { title: `${p?.name ?? 'Supplier'} | NESR Catalog Manager` };
}

export const dynamic = 'force-dynamic';

export default async function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, actor, pendingCount] = await Promise.all([
    getSupplierProfile(Number(id)),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);
  if (!profile) notFound();
  return (
    <SupplierProfileClient
      profile={profile}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
