'use client';

/* Catalog Manager's New / Edit page for a Service Registry item. The form itself is shared with
   RRSM (src/components/service-registry/ServiceRegistryItemForm.tsx); this page supplies the
   Catalog's shell, its own save actions (which check Catalog access) and its supplier search. */

import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import {
  createCatalogEntry,
  searchSupplierDirectory,
  updateCatalogEntry,
} from '@/app/actions/catalog-manager';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';
import type { ApprovalThresholdRule, CatalogEntry } from '@/types/catalog-manager';
import ServiceRegistryItemForm from '@/components/service-registry/ServiceRegistryItemForm';

export default function CatalogEntryFormClient({
  initial,
  countries,
  currencies,
  uoms,
  managers,
  scope,
  pendingCount,
  roleLabel,
  canApprove,
  canAdmin,
  thresholds,
  approvalsEnabled = true,
  taxonomy,
}: {
  initial: CatalogEntry | null;
  /**
   * The full spend taxonomy, handed down by the server page. It used to be imported straight
   * into this client component, which put ~197 KB of generated TypeScript into the browser
   * bundle for every visitor. Passing it as a prop keeps every lookup synchronous.
   */
  taxonomy: TaxCategory[];
  countries: ScopeCountry[];
  /** Rates come from the `currency` table, so the preview follows an admin's edit like the server does. */
  currencies: { code: string; usd_rate: number }[];
  uoms: { name: string }[];
  managers: string[];
  scope: string;
  pendingCount: number;
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  /** The configured approval thresholds. */
  thresholds: ApprovalThresholdRule[];
  /** False while approvals are paused. */
  approvalsEnabled?: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  return (
    <CatalogManagerShell
      title={isEdit ? `Edit ${initial!.code}` : 'New registry item'}
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {isEdit ? `Edit item ${initial!.code}` : 'New Service Registry item'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEdit
              ? 'Saving creates a new version; history is retained.'
              : 'Add a supplier service or indirect-item rate. It shows in RRSM too.'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <ServiceRegistryItemForm
            initial={initial}
            defaults={scope !== 'ALL' ? { country_code: scope } : undefined}
            taxonomy={taxonomy}
            countries={countries}
            currencies={currencies}
            uoms={uoms}
            managers={managers}
            thresholds={thresholds}
            approvalsEnabled={approvalsEnabled}
            searchSuppliers={(q) => searchSupplierDirectory(q)}
            onCancel={() => router.back()}
            onSubmit={async (input, mode) => {
              const res = isEdit
                ? await updateCatalogEntry(input, mode)
                : await createCatalogEntry(input, mode);
              router.push(`/catalog-manager/catalog/${res.id}`);
              router.refresh();
            }}
          />
        </div>
      </div>
    </CatalogManagerShell>
  );
}
