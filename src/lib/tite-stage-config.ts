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
      { key: 'customs_approval_email', label: 'Customs Approval \u2013 Email', required: true },
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

export type DocumentStage = 'creation' | 'extension' | 'closure' | 'refund';

export interface PendingUpload {
  docTypeKey: string;
  file: File;
  customName: string;
  originalName: string;
}
