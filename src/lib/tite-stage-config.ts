/* ─── Document stage configuration ─────────────────────────────────────
   Safe to import in both server and client components — no DB imports.
   ────────────────────────────────────────────────────────────────────── */

export interface DocumentTypeConfig {
  key: string;
  label: string;
  required: boolean;
}

export interface StageConfig {
  label: string;
  stageIcon: string;
  documents: DocumentTypeConfig[];
}

export const DOCUMENT_STAGES: Record<string, StageConfig> = {
  creation: {
    label:     'At Creation',
    stageIcon: '📋',
    documents: [
      { key: 'commercial_invoice',        label: 'Commercial Invoice',       required: true },
      { key: 'packing_list',              label: 'Packing List',             required: true },
      { key: 'customs_docs',              label: 'Customs Docs',             required: true },
      { key: 'customs_inspection_report', label: 'Customs Inspection Report', required: true },
      { key: 'customs_approval_email',    label: 'Customs Approval \u2013 Email', required: true },
    ],
  },
  extension: {
    label:     'At Extension',
    stageIcon: '📅',
    documents: [
      { key: 'customs_approval_email', label: 'Customs Approval \u2013 Email',      required: true },
      { key: 'customs_declaration',    label: 'Customs Declaration Document', required: true },
    ],
  },
  closure: {
    label:     'At Closure',
    stageIcon: '✅',
    documents: [
      { key: 'customs_approval_email', label: 'Customs Approval \u2013 Email', required: true },
    ],
  },
  refund: {
    label:     'Refund Complete',
    stageIcon: '💰',
    documents: [
      { key: 'deposit_receipt', label: 'Deposit Receipt', required: true },
    ],
  },
};

/* ─── Status transitions ───────────────────────────────────────────────
   The statuses a shipment may move to from its current one. The update-status
   modal builds its dropdown from this, and `updateShipmentStatus` validates
   against it server-side so a hand-crafted POST cannot skip a step.
   ────────────────────────────────────────────────────────────────────── */

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  'Open':                     ['Open - Extended', 'Closed'],
  'Open - Extended':          ['Open - Extended', 'Closed', 'Closed - Refund Recovered'],
  'Closed':                   ['Closed - Refund Recovered'],
};

/** The statuses reachable from `currentStatus`; empty when it is terminal. */
export function getNextStatusOptions(currentStatus: string): string[] {
  return STATUS_TRANSITIONS[currentStatus] ?? [];
}

export type DocumentStage = 'creation' | 'extension' | 'closure' | 'refund';

export interface PendingUpload {
  docTypeKey: string;
  file: File;
  customName: string;
  originalName: string;
}
