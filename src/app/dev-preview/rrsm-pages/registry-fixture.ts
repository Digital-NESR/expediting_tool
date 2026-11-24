/* Sample Service Registry items for the RRSM register preview (Kuwait sample data). Dev only. */

import taxonomy from '@/data/catalog-taxonomy.json';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';
import type { RegistryFormRefs } from '@/lib/service-registry/registry';
import type { CatalogEntry } from '@/types/catalog-manager';

function entry(p: Partial<CatalogEntry> & Pick<CatalogEntry, 'code' | 'item_name'>): CatalogEntry {
  return {
    id: Number(p.code.replace(/\D/g, '')),
    country_code: 'KW',
    country_name: 'Kuwait',
    country_flag: '🇰🇼',
    supplier_id: 1,
    supplier_name: 'Al Mulla Rental Co.',
    supplier_code: '100482',
    manager: null,
    spend_type: 'Indirect',
    category_id: 1,
    category_name: 'Logistics',
    subcategory_id: 1,
    subcategory_name: 'Light Vehicles for Operation',
    family: null,
    commodity: null,
    unspsc_code: null,
    description: null,
    uom_id: 1,
    uom_name: 'Month',
    unit_price: 250,
    currency_code: 'KWD',
    usd_equivalent: 815,
    effective_date: '2025-01-01',
    expiry_date: null,
    status: 'Active',
    tier_label: 'Tier 1 — Auto',
    version_no: 1,
    sirion_contract_id: null,
    sirion_url: null,
    notes: null,
    incoterms: null,
    incoterms_location: null,
    lead_time_days: null,
    approver_name: null,
    approval_comment: null,
    created_by: 'preview',
    created_at: '2026-11-23',
    modified_by: 'preview',
    modified_at: '2026-11-23',
    documents: [],
    history: [],
    sap_service_number: '310000000011',
    registry_type: 'rental',
    registry_source: 'rrsm',
    rate_to_confirm: false,
    ...p,
  };
}

export const PREVIEW_REGISTRY: CatalogEntry[] = [
  entry({ code: 'CAT-2001', item_name: 'Toyota Prado (4x4 SUV)' }),
  entry({ code: 'CAT-2002', item_name: 'Nissan Patrol (4x4 SUV)', unit_price: 310 }),
  entry({
    code: 'CAT-2003',
    item_name: 'Security guard',
    supplier_name: 'Gulf Guarding Services',
    supplier_code: '100911',
    category_name: 'Facility',
    subcategory_name: 'Security',
    uom_name: 'Per Person',
    unit_price: 420,
    sap_service_number: '330000000004',
  }),
  entry({
    code: 'CAT-2004',
    item_name: 'Generator 250 kVA',
    supplier_name: 'Gulf Guarding Services',
    supplier_code: '100911',
    category_name: 'Field Technical Equipment & Services',
    subcategory_name: 'Compressors & Generators',
    unit_price: 0,
    rate_to_confirm: true,
    registry_source: 'catalog',
  }),
];

/** Units 1, 2 and 4 of the sample register sit under the first three items. */
export const PREVIEW_UNIT_LINKS: Record<number, string> = {
  1: 'CAT-2001',
  2: 'CAT-2002',
  4: 'CAT-2003',
};

export const PREVIEW_REFS: RegistryFormRefs = {
  taxonomy: taxonomy as TaxCategory[],
  countries: [{ code: 'KW', name: 'Kuwait', flag: '🇰🇼' }],
  currencies: [
    { code: 'KWD', usd_rate: 3.26 },
    { code: 'USD', usd_rate: 1 },
  ],
  uoms: ['Month', 'Day', 'Hour', 'Per Person', 'Each', 'Year'].map((name) => ({ name })),
  managers: [],
  thresholds: [],
  approvalsEnabled: false,
};
