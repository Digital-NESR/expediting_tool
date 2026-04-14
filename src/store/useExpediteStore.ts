import { create } from 'zustand';
import type { PurchaseOrder } from '@/types/po';

/* ─── Key function ────────────────────────────────────────────
   Composite identity: PO Number + PO Line + SAP MAT ID
   Handles cases where any part might be undefined.           */
function itemKey(item: PurchaseOrder): string {
  return `${item['PO Number']}::${item['PO Line'] ?? ''}::${item['SAP MAT ID'] ?? ''}`;
}

/* ─── Per-supplier email state ────────────────────────────── */
export interface SupplierEmailState {
  to: string[];
  cc: string[];
}

/* ─── Store Shape ─────────────────────────────────────────── */
interface ExpediteState {
  selectedItems: PurchaseOrder[];
  /** Keyed by supplierId — holds merged To and CC lists per supplier */
  supplierEmails: Record<string, SupplierEmailState>;
}

interface ExpediteActions {
  toggleSelection: (item: PurchaseOrder) => void;
  selectMultipleLines: (items: PurchaseOrder[]) => void;
  deselectMultipleLines: (items: PurchaseOrder[]) => void;
  clearSelection: () => void;
  isSelected: (item: PurchaseOrder) => boolean;
  setSupplierEmails: (supplierId: string, emails: SupplierEmailState) => void;
}

export type ExpediteStore = ExpediteState & ExpediteActions;

/* ─── Store ──────────────────────────────────────────────── */
export const useExpediteStore = create<ExpediteStore>((set, get) => ({
  selectedItems: [],
  supplierEmails: {},

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

  selectMultipleLines: (items) => {
    const current = get().selectedItems;
    const currentKeys = new Set(current.map(itemKey));
    const newItems = items.filter((item) => !currentKeys.has(itemKey(item)));
    if (newItems.length > 0) {
      set({ selectedItems: [...current, ...newItems] });
    }
  },

  deselectMultipleLines: (items) => {
    const current = get().selectedItems;
    const keysToRemove = new Set(items.map(itemKey));
    set({
      selectedItems: current.filter((item) => !keysToRemove.has(itemKey(item))),
    });
  },

  clearSelection: () => set({ selectedItems: [], supplierEmails: {} }),

  isSelected: (item) => {
    const key = itemKey(item);
    return get().selectedItems.some((i) => itemKey(i) === key);
  },

  setSupplierEmails: (supplierId, emails) =>
    set((state) => ({
      supplierEmails: { ...state.supplierEmails, [supplierId]: emails },
    })),
}));
