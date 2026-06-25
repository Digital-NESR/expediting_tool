'use client';

import Link from 'next/link';
import CatalogManagerShell from '../../components/CatalogManagerShell';
import { Icon } from '../../components/CatalogManagerUI';
import BulkImportPanel from './BulkImportPanel';

export default function CatalogImportClient({
  roleLabel, canApprove, canAdmin, pendingCount,
}: {
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  return (
    <CatalogManagerShell
      title="Bulk import"
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
      headerAction={
        <Link href="/catalog-manager/catalog/add" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="arrowRight" className="h-4 w-4 rotate-180" /> <span className="hidden sm:inline">Back</span>
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-xl font-bold tracking-tight text-slate-900">Bulk import catalog entries</h1>
        <BulkImportPanel />
      </div>
    </CatalogManagerShell>
  );
}
