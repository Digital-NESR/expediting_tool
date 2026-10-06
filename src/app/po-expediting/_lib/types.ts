/* Shapes shared by the PO Expediting dashboard and the components it renders.
   Lifted out of page.tsx unchanged when that file was split. */

import type { PurchaseOrder } from '@/types/po';

export interface PoGroup {
  poNumber: string;
  supplierName: string;
  country: string;
  deliveryCode: string;
  lineCount: number;
  totalQty: number;
  totalValue: number;
  earliestDate: string;
  /** The PO's release date. One value for the whole PO, taken from its first line. */
  releaseDate: string | null;
  /**
   * The newest dispatch across this PO's lines, or null if none has ever been expedited.
   *
   * At PO level this is the latest of its lines, because the question here is "has anybody
   * chased this PO recently". The per-line date is in the sub-table, where the question is
   * "has anybody chased THIS line", and the two are different: a PO of ten lines is rarely
   * chased whole.
   */
  lastExpedited: string | null;
  lines: PurchaseOrder[];
}

export type PoSortKey = 'totalValue' | 'earliestDate';
export type SortDir = 'asc' | 'desc';
