'use client';

import PirCatalogClient from '@/app/catalog-manager/pir/PirCatalogClient';
import type { PirExpiring, PirStatus } from '@/app/actions/catalog-manager';
import type { PirEntry } from '@/types/catalog-manager';

/**
 * The real PirCatalogClient with stub data, so the filter row and the stat cards can be looked
 * at. Figures are the live ones measured on 9 Nov 2026 — 5,268 records, 1,321 active, 3,947
 * expired, 42 expiring inside 30 days — so the "of N · filtered" lines read as they will in
 * production rather than as round numbers that happen to fit.
 */

const ROW: PirEntry = {
  info_record_number: '5300001234',
  product_number: '000000000010045678',
  material_description: 'VALVE GATE 6IN CLASS 1500 FLANGED RF',
  supplier_name: 'GULF ENGINEERING TRADING LLC',
  suppliers_account_number: '0001000456',
  plant: 'AE01',
  purchasing_organization: 'AE10',
  country: 'Dubai',
  material_group: 'MRO',
  base_unit_of_measure: 'EA',
  unit_price: 10900,
  currency: 'AED',
  valid_till_expiry_date: '2026-12-31T00:00:00',
} as unknown as PirEntry;

const STATS: Record<
  string,
  { total: number; suppliers: number; plants: number; countries: number }
> = {
  '': { total: 5268, suppliers: 94, plants: 7, countries: 11 },
  active: { total: 1321, suppliers: 61, plants: 6, countries: 11 },
  expired: { total: 3947, suppliers: 78, plants: 7, countries: 11 },
  '30': { total: 42, suppliers: 9, plants: 2, countries: 3 },
};

const TOTALS = { total: 5268, suppliers: 94, plants: 7, countries: 11 };

export default function PirPreview({ status, expiring }: { status: string; expiring: string }) {
  const key = expiring || status || '';
  const stats = STATS[key] ?? STATS[''];

  return (
    <PirCatalogClient
      rows={[ROW, { ...ROW, info_record_number: '5300001235', unit_price: 880 }]}
      total={stats.total}
      page={1}
      pageSize={50}
      stats={stats}
      totals={TOTALS}
      facets={{
        countries: ['Dubai', 'Egypt', 'Iraq', 'KSA', 'Oman'],
        porgs: ['AE10', 'EG10', 'IQ10'],
        plants: ['AE01', 'EG01'],
        mgroups: ['MRO', 'CHEM', 'SERVICES'],
      }}
      filters={{
        q: '',
        country: '',
        porg: '',
        plant: '',
        mgroup: '',
        status: status as PirStatus,
        expiring: expiring as PirExpiring,
        sort: 'supplier',
        page: 1,
      }}
      roleLabel="Viewer — read only"
      canApprove={false}
      canAdmin={false}
      pendingCount={0}
    />
  );
}
