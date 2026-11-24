'use client';

/* RRSM · add or change a Service Registry item, with the same form the Catalog uses. The form's
   lists (taxonomy, units, currencies) are fetched when the drawer opens: ~100 KB nobody needs
   until they add an item. */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getRrsmRegistryFormRefs, saveRrsmRegistryItem } from '@/app/actions/rrsm/registry';
import { searchRecurrentSuppliers } from '@/app/actions/rrsm/recurrent';
import ServiceRegistryItemForm from '@/components/service-registry/ServiceRegistryItemForm';
import type { RegistryFormRefs } from '@/lib/service-registry/registry';
import type { CatalogEntry } from '@/types/catalog-manager';
import { Drawer } from './RegisterEditor';

export default function RegistryItemDrawer({
  countryCode,
  item,
  type = 'rental',
  preview,
  previewRefs,
  onClose,
  onSaved,
}: {
  countryCode: string;
  /** Null to add a new item. */
  item: CatalogEntry | null;
  type?: 'rental' | 'recurrent';
  /** Dev preview: the form's lists come from here and nothing is saved. */
  preview?: boolean;
  previewRefs?: RegistryFormRefs;
  onClose: () => void;
  onSaved: (message: string, code: string) => void;
}) {
  const [refs, setRefs] = useState<RegistryFormRefs | null | undefined>(previewRefs);

  useEffect(() => {
    if (previewRefs) return;
    let live = true;
    void getRrsmRegistryFormRefs().then((r) => live && setRefs(r));
    return () => {
      live = false;
    };
  }, [previewRefs]);

  return (
    <Drawer
      title={item ? `${item.item_name}` : 'Add a Service Registry item'}
      subtitle={
        item
          ? `${item.code} · ${item.supplier_name} · shared with the Catalog`
          : 'Shared with the Catalog. Units on hire go under it.'
      }
      onClose={onClose}
    >
      {refs === undefined ? (
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the registry form…
        </p>
      ) : refs === null ? (
        <p className="text-[13px] text-red-700">
          The Service Registry could not be reached just now. Try again in a moment.
        </p>
      ) : (
        <ServiceRegistryItemForm
          initial={item}
          defaults={{ country_code: countryCode }}
          lockCountry
          allowDraft={false}
          taxonomy={refs.taxonomy}
          countries={refs.countries}
          currencies={refs.currencies}
          uoms={refs.uoms}
          managers={refs.managers}
          thresholds={refs.thresholds}
          approvalsEnabled={refs.approvalsEnabled}
          searchSuppliers={async (q) =>
            preview
              ? []
              : (await searchRecurrentSuppliers({ countryCode, query: q })).map((s) => ({
                  code: s.code,
                  name: s.name,
                  email: s.email,
                  blocked: s.blocked,
                }))
          }
          onCancel={onClose}
          onSubmit={async (input) => {
            if (preview) {
              onSaved('Item checked (preview, nothing saved).', item?.code ?? 'CAT-PREVIEW');
              return;
            }
            const r = await saveRrsmRegistryItem({
              countryCode,
              code: item?.code ?? null,
              type,
              item: input,
            });
            if (!r.success) throw new Error(r.error ?? 'That did not save.');
            onSaved(
              item ? `${r.code} saved.` : `${r.code} added to the Service Registry.`,
              r.code!,
            );
          }}
        />
      )}
    </Drawer>
  );
}
