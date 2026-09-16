'use server';

/* ─── Customs and shipping attachments. ─── */

import titePool from '@/lib/db-tite';
import { uploadMimeTypeFor } from '@/lib/documents';
import { forbidden } from '@/lib/require-access';
import { currentTiteUser, isTiteApproved, requireTiteUser } from '@/lib/tite-auth';
import { dbDeleteDocument, dbGetDocuments, dbInsertDocument } from '@/lib/tite-documents';
import type { ShipmentDocument } from '@/types/tite';
import { canReadShipment, denyShipmentEdit } from '@/lib/tite/access';
import { log } from '@/lib/tite/internals';

/* ─── getShipmentDocuments ────────────────────────────────────── */

export async function getShipmentDocuments(shipmentId: number): Promise<ShipmentDocument[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
    return await dbGetDocuments(shipmentId);
  } catch (err) {
    log.error('getShipmentDocuments.failed', err);
    return [];
  }
}

/* ─── uploadShipmentDocument ──────────────────────────────────── */

export async function uploadShipmentDocument(
  formData: FormData,
): Promise<{ success: boolean; document?: ShipmentDocument; error?: string }> {
  const user = await requireTiteUser();
  try {
    const uploadedBy = user.name;
    const shipmentId = Number(formData.get('shipment_id'));
    const stage = (formData.get('stage') as string) || 'creation';
    const file = formData.get('file') as File | null;
    const customName =
      ((formData.get('custom_name') as string) || '').trim() || file?.name || 'Untitled';
    const docType = (formData.get('document_type') as string | null) || null;

    if (!file || !shipmentId || !Number.isFinite(shipmentId)) {
      return { success: false, error: 'Missing required fields.' };
    }

    const denied = await denyShipmentEdit(user, shipmentId);
    if (denied) return forbidden(denied);

    /* Detect MIME from extension — more reliable than browser-reported file.type */
    const detectedMime = uploadMimeTypeFor(file.name, file.type);

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const doc = await dbInsertDocument({
      shipment_id: shipmentId,
      document_name: customName,
      original_name: file.name !== customName ? file.name : null,
      document_type: docType,
      document_stage: stage as 'creation' | 'extension' | 'closure' | 'refund',
      file_type: detectedMime,
      file_size: file.size,
      file_content: buffer,
      uploaded_by: uploadedBy,
    });

    return { success: true, document: doc };
  } catch (err) {
    log.error('uploadShipmentDocument.failed', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

/* ─── deleteShipmentDocument ──────────────────────────────────── */

export async function deleteShipmentDocument(
  documentId: number,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    // Scope is carried by the parent shipment, so resolve it before deleting.
    const { rows } = await titePool.query<{ shipment_id: number }>(
      `SELECT shipment_id FROM shipment_documents WHERE id = $1`,
      [documentId],
    );
    if (!rows[0]) return { success: false, error: 'Document not found.' };
    const denied = await denyShipmentEdit(user, rows[0].shipment_id);
    if (denied) return forbidden(denied);

    await dbDeleteDocument(documentId);
    return { success: true };
  } catch (err) {
    log.error('deleteShipmentDocument.failed', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}
