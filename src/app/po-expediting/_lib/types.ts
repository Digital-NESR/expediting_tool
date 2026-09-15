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
  lines: PurchaseOrder[];
}

export type PoSortKey = 'totalValue' | 'earliestDate';
export type SortDir = 'asc' | 'desc';
