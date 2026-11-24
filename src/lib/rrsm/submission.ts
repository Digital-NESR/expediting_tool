/**
 * The rules of a supplier's monthly submission that both sides need: which documents exist, what
 * a file may be, what is still missing, and when a supplier has proposed a different rate or
 * pricing unit. Pure, so the supplier page, the staff boards and the actions cannot disagree.
 */

export type DocKind = 'delivery_note' | 'timesheet' | 'invoice';

export const DOC_KINDS: DocKind[] = ['delivery_note', 'timesheet', 'invoice'];

export const DOC_LABEL: Record<DocKind, string> = {
  delivery_note: 'Delivery Note',
  timesheet: 'Timesheet',
  invoice: 'Invoice',
};

/** Which documents an invitation asks for. One flag per DocKind. */
export interface DocRequirements {
  deliveryNote: boolean;
  timesheet: boolean;
  invoice: boolean;
}

/** The `DocRequirements` flag for each kind, so a screen can loop over DOC_KINDS. */
export const DOC_FIELD: Record<DocKind, keyof DocRequirements> = {
  delivery_note: 'deliveryNote',
  timesheet: 'timesheet',
  invoice: 'invoice',
};

export const NO_DOCS: DocRequirements = { deliveryNote: false, timesheet: false, invoice: false };

/**
 * 4 MB. Uploads go through a server action, and on Vercel a function's request body is capped at
 * 4.5 MB whatever `bodySizeLimit` says, so anything near that fails as a bare network error. A
 * scanned delivery note or a timesheet export is well under this.
 */
export const MAX_DOC_BYTES = 4 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};

export const ACCEPT_ATTR = Object.keys(ALLOWED)
  .map((e) => '.' + e)
  .join(',');

/**
 * Is this file acceptable, and as what content type.
 *
 * The type is taken from the extension, never from what the browser claims, because the browser's
 * claim is the uploader's to set and the stored type is what staff browsers later open it as.
 */
export function checkDoc(file: {
  name: string;
  size: number;
}): { ok: true; contentType: string; name: string } | { ok: false; error: string } {
  const name = String(file?.name ?? '')
    .replace(/[\\/\r\n\t]/g, '_')
    .trim()
    .slice(0, 180);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const contentType = ALLOWED[ext];
  if (!name || !contentType) {
    return { ok: false, error: 'Upload a PDF, image (JPG/PNG), Excel, Word or CSV file.' };
  }
  const size = Number(file?.size ?? 0);
  if (!(size > 0)) return { ok: false, error: 'That file is empty.' };
  if (size > MAX_DOC_BYTES) return { ok: false, error: 'Files can be up to 4 MB.' };
  return { ok: true, contentType, name };
}

/** 'the Delivery Note', 'the Delivery Note and the Invoice', 'the Delivery Note, the Timesheet and the Invoice'. */
export function docList(kinds: DocKind[]): string {
  const names = kinds.map((k) => 'the ' + DOC_LABEL[k]);
  return names.length > 1
    ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
    : (names[0] ?? '');
}

/** The mandatory documents not uploaded yet, in display order. */
export function missingDocs(required: DocRequirements, uploaded: DocKind[]): DocKind[] {
  return DOC_KINDS.filter((k) => required[DOC_FIELD[k]] && !uploaded.includes(k));
}

/* ─── a supplier proposing a different rate or pricing unit ──────────────────────────────── */

export interface ProposedTerms {
  rate: number | null;
  uom: string;
}

/**
 * What the supplier proposed, reduced to what actually differs from the agreed terms. A field
 * equal to the agreed value is not a proposal; null for both means there is nothing to review.
 * Rates are compared to the minor unit (three decimals, the register's precision).
 */
export function proposalAgainst(
  agreed: ProposedTerms,
  proposed: ProposedTerms,
): { rate: number | null; uom: string | null } {
  const r = proposed.rate === null || !Number.isFinite(proposed.rate) ? null : proposed.rate;
  const rateDiffers =
    r !== null && (agreed.rate === null || Math.abs(Math.round((r - agreed.rate) * 1000)) > 0);
  const u = String(proposed.uom ?? '').trim();
  const uomDiffers = Boolean(u) && u !== agreed.uom;
  return { rate: rateDiffers ? r : null, uom: uomDiffers ? u : null };
}

export function hasProposal(p: { rate: number | null; uom: string | null }): boolean {
  return p.rate !== null || p.uom !== null;
}
