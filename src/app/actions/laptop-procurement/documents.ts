'use server';

/* ─── Attachments on a request. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { asSerialised } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import { canUseLaptopReviewerQueue } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type { ActionResult, LaptopDocument } from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { laptopActingIdentities } from '@/lib/laptop-procurement/access';
import { anyMatrixCapabilityForCountry, getActor } from '@/lib/laptop-procurement/actor';
import {
  MAX_LAPTOP_FILE_BYTES,
  detectMime,
  execTx,
  fileBaseName,
  sql,
  sqlTx,
} from '@/lib/laptop-procurement/db';
import { LAPTOP_DOCUMENT_TYPES, writeActivity } from '@/lib/laptop-procurement/internals';

const log = logger('laptop-procurement');

export async function uploadLaptopDocument(
  formData: FormData,
): Promise<{ success: boolean; document?: LaptopDocument; error?: string }> {
  try {
    const actor = await getActor();
    // Viewer is read-only oversight: it can see every request but must never attach
    // anything to one. Uploading needs either create rights or reviewer authority
    // (the latter can arrive via delegation, hence effectiveAccessView).
    if (
      !actor.permissions.canCreateRequests &&
      !canUseLaptopReviewerQueue(actor.effectiveAccessView)
    ) {
      return { success: false, error: 'Read-only access cannot upload attachments.' };
    }
    const requestId = Number(formData.get('request_id'));
    const file = formData.get('file') as File | null;
    const customName =
      ((formData.get('custom_name') as string) || '').trim() ||
      (file ? fileBaseName(file.name) : 'Attachment');
    const documentType = ((formData.get('document_type') as string) || 'request_attachment').trim();

    if (!Number.isFinite(requestId) || requestId <= 0 || !file) {
      return { success: false, error: 'Missing required upload fields.' };
    }
    if (!LAPTOP_DOCUMENT_TYPES.has(documentType)) {
      return { success: false, error: 'Unsupported attachment type.' };
    }
    if (file.size > MAX_LAPTOP_FILE_BYTES) {
      return { success: false, error: 'File is too large. Maximum size is 10 MB.' };
    }

    const requestRows = await sql<QueryResultRow[]>(
      `SELECT id, reference_number, requested_by_email, country, segment FROM laptop_requests WHERE id = ? LIMIT 1`,
      [requestId],
    );
    if (!requestRows[0]) return { success: false, error: 'Request not found.' };
    const canView = laptopActingIdentities(actor).some((id) =>
      id.permissions.canViewAll
        ? id.permissions.canViewEveryCountry ||
          anyMatrixCapabilityForCountry(id.matrixCapabilities, requestRows[0].country)
        : id.email.toLowerCase() === requestRows[0].requested_by_email?.toLowerCase(),
    );
    if (!canView) {
      return { success: false, error: 'You can only upload files to your own requests.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const docs = await withTransaction(laptopProcurementPool, async (client) => {
      const insert = await execTx(
        client,
        `INSERT INTO laptop_documents
           (request_id, document_name, original_name, document_type, file_type, file_size, file_content, uploaded_by_name, uploaded_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          requestId,
          customName,
          file.name !== customName ? file.name : null,
          documentType,
          detectMime(file),
          file.size,
          buffer,
          actor.name,
          actor.email,
        ],
      );

      const rows = await sqlTx<QueryResultRow[]>(
        client,
        `SELECT id, request_id, document_name, original_name, document_type, file_type, file_size,
                uploaded_by_name, uploaded_by_email, uploaded_at
         FROM laptop_documents WHERE id = ? LIMIT 1`,
        [insert.insertId],
      );

      await writeActivity({
        requestId,
        referenceNumber: requestRows[0].reference_number,
        action: 'Attachment uploaded',
        actor,
        notes: file.name,
        client,
      });
      return rows;
    });
    revalidatePath(`/laptop-procurement/requests/${requestId}`);
    return { success: true, document: asSerialised<LaptopDocument>(docs[0]) };
  } catch (err) {
    log.error('uploadLaptopDocument.failed', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

export async function deleteLaptopDocument(documentId: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const docs = await sql<QueryResultRow[]>(
      `SELECT d.id, d.request_id, d.uploaded_by_email, r.reference_number, r.requested_by_email
       FROM laptop_documents d JOIN laptop_requests r ON d.request_id = r.id
       WHERE d.id = ? LIMIT 1`,
      [documentId],
    );
    const doc = docs[0];
    if (!doc) return { success: false, error: 'Attachment not found.' };
    // The request's owner and whoever uploaded the file can both remove it — a
    // reviewer who attached a quote to someone else's request would otherwise be
    // unable to undo their own upload.
    const actorEmail = actor.email.toLowerCase();
    const ownsAttachment =
      doc.requested_by_email?.toLowerCase() === actorEmail ||
      doc.uploaded_by_email?.toLowerCase() === actorEmail;
    if (!actor.permissions.canManageData && !ownsAttachment) {
      return { success: false, error: 'You cannot remove this attachment.' };
    }
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(client, `DELETE FROM laptop_documents WHERE id = ?`, [documentId]);
      await writeActivity({
        requestId: doc.request_id,
        referenceNumber: doc.reference_number,
        action: 'Attachment removed',
        actor,
        client,
      });
    });
    revalidatePath(`/laptop-procurement/requests/${doc.request_id}`);
    return { success: true };
  } catch (err) {
    log.error('deleteLaptopDocument.failed', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

/* ── Permissions admin ────────────────────────────────────────── */
