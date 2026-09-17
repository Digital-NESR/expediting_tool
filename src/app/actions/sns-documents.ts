'use server';

import { revalidatePath } from 'next/cache';
import snsPool from '@/lib/db-sns';
import { logger } from '@/lib/logger';
import { getSnsViewer } from './sns';
import type { ActionResult } from './sns';

const log = logger('sns-registry');

/**
 * Attachments on a registry record.
 *
 * Bytes live in the row (BYTEA), matching procure_guard_documents: the registry
 * holds a handful of small files per record, and keeping them in the table puts
 * them behind the same permission check and inside the same backup as the
 * record itself.
 */

export type SnsDocumentKind = 'evidence' | 'review';

export interface SnsDocument {
  id: number;
  recordRid: number;
  kind: SnsDocumentKind;
  name: string;
  originalName: string | null;
  fileType: string;
  fileSize: number;
  uploadedByName: string;
  uploadedByEmail: string;
  uploadedAt: string;
}

/** 15 MB — comfortably above a scanned OEM letter, below anything that belongs in SharePoint. */
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'msg',
  'eml',
  'png',
  'jpg',
  'jpeg',
  'txt',
  'csv',
  'zip',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

function extensionOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : '';
}

function mapDocument(r: Record<string, unknown>): SnsDocument {
  return {
    id: Number(r.id),
    recordRid: Number(r.record_rid),
    kind: String(r.kind) as SnsDocumentKind,
    name: String(r.document_name),
    originalName: r.original_name ? String(r.original_name) : null,
    fileType: String(r.file_type ?? 'application/octet-stream'),
    fileSize: Number(r.file_size ?? 0),
    uploadedByName: String(r.uploaded_by_name ?? ''),
    uploadedByEmail: String(r.uploaded_by_email ?? ''),
    uploadedAt:
      r.uploaded_at instanceof Date ? r.uploaded_at.toISOString() : String(r.uploaded_at ?? ''),
  };
}

/** Metadata only — never the bytes, which are served by the download route. */
export async function getSnsRecordDocuments(rid: number): Promise<SnsDocument[]> {
  const viewer = await getSnsViewer();
  if (!viewer) return [];
  try {
    const { rows } = await snsPool.query(
      `SELECT id, record_rid, kind, document_name, original_name, file_type, file_size,
              uploaded_by_name, uploaded_by_email, uploaded_at
         FROM sns_record_document
        WHERE record_rid = $1
        ORDER BY kind, id`,
      [rid],
    );
    return rows.map(mapDocument);
  } catch (err) {
    log.error('documents.list.failed', err);
    return [];
  }
}

/** Every review document on a record, for the renewal reminder emails. */
export async function getSnsReviewDocumentSummary(
  rid: number,
): Promise<{ name: string; uploadedAt: string }[]> {
  try {
    const { rows } = await snsPool.query(
      `SELECT document_name, uploaded_at FROM sns_record_document
        WHERE record_rid = $1 AND kind = 'review'
        ORDER BY id`,
      [rid],
    );
    return rows.map((r) => ({
      name: String(r.document_name),
      uploadedAt:
        r.uploaded_at instanceof Date
          ? r.uploaded_at.toISOString().slice(0, 10)
          : String(r.uploaded_at ?? ''),
    }));
  } catch (err) {
    log.error('documents.reviewSummary.failed', err);
    return [];
  }
}

/**
 * Stores one attachment against a record.
 *
 * Takes FormData rather than a Buffer so the file never has to be base64'd
 * through the action boundary — the browser streams it as multipart.
 */
export async function uploadSnsRecordDocument(
  formData: FormData,
): Promise<ActionResult & { document?: SnsDocument }> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };

  const rid = Number(formData.get('rid'));
  const kind = String(formData.get('kind') ?? 'evidence') as SnsDocumentKind;
  const file = formData.get('file');

  if (!Number.isFinite(rid)) return { success: false, error: 'Missing record.' };
  if (kind !== 'evidence' && kind !== 'review')
    return { success: false, error: 'Unknown attachment type.' };
  if (!(file instanceof File) || file.size === 0)
    return { success: false, error: 'Choose a file to attach.' };
  if (file.size > MAX_BYTES) return { success: false, error: 'That file is larger than 15 MB.' };

  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      success: false,
      error: `${extension ? `.${extension}` : 'That'} files cannot be attached to a registry record.`,
    };
  }

  try {
    const { rows: recordRows } = await snsPool.query(
      `SELECT r.created_by, COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1`,
      [rid],
    );
    if (!recordRows.length) return { success: false, error: 'Record not found.' };

    const code = String(recordRows[0].resolved_country_code ?? '');
    const isOwner =
      String(recordRows[0].created_by ?? '').toLowerCase() === viewer.email.toLowerCase();
    // Empty countryCodes means unrestricted; a record whose country will not
    // resolve is never in scope for a country-scoped role.
    const scoped =
      viewer.isAdmin ||
      viewer.countryCodes.length === 0 ||
      (!!code && viewer.countryCodes.includes(code));
    // Read-only roles can open a record but must not change what it evidences.
    const mayAttach =
      viewer.isAdmin ||
      (scoped &&
        (isOwner ||
          viewer.roleKind === 'req' ||
          viewer.roleKind === 'l1' ||
          viewer.roleKind === 'l2'));
    if (!mayAttach) return { success: false, error: 'You cannot attach files to this record.' };

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await snsPool.query(
      `INSERT INTO sns_record_document
         (record_rid, kind, document_name, original_name, file_type, file_size,
          file_content, uploaded_by_name, uploaded_by_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, record_rid, kind, document_name, original_name, file_type, file_size,
                 uploaded_by_name, uploaded_by_email, uploaded_at`,
      [
        rid,
        kind,
        file.name,
        null,
        MIME_BY_EXTENSION[extension] ?? file.type ?? 'application/octet-stream',
        file.size,
        buffer,
        viewer.name,
        viewer.email,
      ],
    );

    // The record's `evidence` column is the one-line summary the registry list
    // and the wizard review pane show; keep it pointing at the newest evidence.
    if (kind === 'evidence') {
      await snsPool.query(
        `UPDATE sns_record SET evidence = $2, updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid, file.name],
      );
    }

    revalidatePath('/sns-registry');
    return { success: true, document: mapDocument(rows[0]) };
  } catch (err) {
    log.error('documents.upload.failed', err);
    return { success: false, error: 'Could not attach the file.' };
  }
}

export async function deleteSnsRecordDocument(documentId: number): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };

  try {
    const { rows } = await snsPool.query(
      `SELECT d.record_rid, d.uploaded_by_email, r.country, r.base_status
         FROM sns_record_document d
         JOIN sns_record r ON r.rid = d.record_rid
        WHERE d.id = $1`,
      [documentId],
    );
    if (!rows.length) return { success: false, error: 'Attachment not found.' };

    const isUploader =
      String(rows[0].uploaded_by_email ?? '').toLowerCase() === viewer.email.toLowerCase();
    if (!viewer.isAdmin && !isUploader) {
      return {
        success: false,
        error: 'Only the person who attached a file, or an admin, can remove it.',
      };
    }
    // A published record's evidence is part of the audit trail.
    const base = String(rows[0].base_status);
    if (!viewer.isAdmin && (base === 'Active' || base === 'Extended')) {
      return { success: false, error: 'Attachments on a published record cannot be removed.' };
    }

    await snsPool.query(`DELETE FROM sns_record_document WHERE id = $1`, [documentId]);
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('documents.delete.failed', err);
    return { success: false, error: 'Could not remove the attachment.' };
  }
}

/* ═══ Reminder log ═════════════════════════════════════════ */

export interface SnsNotificationLogRow {
  daysBeforeExpiry: number;
  cycleExpiry: string;
  status: string;
  sentAt: string;
}

/**
 * Which expiry reminders have gone out for a record.
 *
 * Read-only on purpose. The rows are written by the n8n reminder workflow,
 * which queries this database directly on its own schedule; the app's only job
 * is to show what happened, the same way TI-TE renders notification_log on a
 * shipment.
 */
export async function getSnsRecordNotifications(rid: number): Promise<SnsNotificationLogRow[]> {
  const viewer = await getSnsViewer();
  if (!viewer) return [];
  try {
    const { rows } = await snsPool.query(
      `SELECT days_before_expiry, cycle_expiry, status, sent_at
         FROM sns_notification_log
        WHERE record_rid = $1
        ORDER BY days_before_expiry DESC`,
      [rid],
    );
    return rows.map((r) => ({
      daysBeforeExpiry: Number(r.days_before_expiry),
      cycleExpiry:
        r.cycle_expiry instanceof Date
          ? r.cycle_expiry.toISOString().slice(0, 10)
          : String(r.cycle_expiry).slice(0, 10),
      status: String(r.status ?? 'sent'),
      sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at ?? ''),
    }));
  } catch (err) {
    log.error('notifications.list.failed', err);
    return [];
  }
}
