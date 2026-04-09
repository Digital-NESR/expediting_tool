import { create } from 'zustand';
import type { PurchaseOrder } from '@/types/po';

/* ─── Key function ────────────────────────────────────────────
   Composite identity: PO Number + PO Line + SAP MAT ID
   Handles cases where any part might be undefined.           */
function itemKey(item: PurchaseOrder): string {
  return `${item['PO Number']}::${item['PO Line'] ?? ''}::${item['SAP MAT ID'] ?? ''}`;
}

/* ─── Store Shape ─────────────────────────────────────────── */
interface ExpediteState {
  selectedItems: PurchaseOrder[];
}

interface ExpediteActions {
  toggleSelection: (item: PurchaseOrder) => void;
  clearSelection: () => void;
  isSelected: (item: PurchaseOrder) => boolean;
}

export type ExpediteStore = ExpediteState & ExpediteActions;

/* ─── Store ──────────────────────────────────────────────── */
export const useExpediteStore = create<ExpediteStore>((set, get) => ({
  selectedItems: [],

  toggleSelection: (item) => {
    const key = itemKey(item);
    const current = get().selectedItems;
    const exists = current.some((i) => itemKey(i) === key);
    set({
      selectedItems: exists
        ? current.filter((i) => itemKey(i) !== key)
        : [...current, item],
    });
  },

  clearSelection: () => set({ selectedItems: [] }),

  isSelected: (item) => {
    const key = itemKey(item);
    return get().selectedItems.some((i) => itemKey(i) === key);
  },
}));
