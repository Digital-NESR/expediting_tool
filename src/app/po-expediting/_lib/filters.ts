/* Row-level predicates behind the dashboard's cascading filters, plus the sort-column map.
   Pure functions over one row, which is what makes them testable now that they are out of the
   component file. */

import type { PurchaseOrder } from '@/types/po';
import type { PoSortKey } from './types';
import { daysDiff } from './format';

export function rowMatchesStatus(r: PurchaseOrder, statuses: string[]): boolean {
  if (statuses.length === 0) return true;
  const diff = daysDiff(r['Delivery Date']);
  const s = diff < 0 ? 'Past Due' : diff <= 7 ? 'Due Soon' : 'On Track';
  return statuses.includes(s);
}

export function rowMatchesSearch(r: PurchaseOrder, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    String(r['PO Number'] ?? '')
      .toLowerCase()
      .includes(t) ||
    String(r['Supplier Name'] ?? '')
      .toLowerCase()
      .includes(t) ||
    String(r['Supplier ID'] ?? '')
      .toLowerCase()
      .includes(t) ||
    String(r['SAP MAT ID'] ?? '')
      .toLowerCase()
      .includes(t)
  );
}

export function rowMatchesAccountType(r: PurchaseOrder, types: string[]): boolean {
  if (types.length === 0) return true;
  const desc = (r['Account Classification Description'] ?? '').trim();
  return types.includes(desc);
}

/* ─── PO Sort column map ──────────────────────────────────── */
export const PO_SORT_MAP: Record<PoSortKey, string> = {
  totalValue: 'Open PO Value (USD)',
  earliestDate: 'Delivery Date',
};
