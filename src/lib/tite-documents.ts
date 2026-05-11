import titePool from '@/lib/db-tite';
import type { ShipmentDocument, ActivityLogRow } from '@/types/tite';

/* ─── Document helpers ──────────────────────────────────────────── */

export async function dbInsertDocument(params: {
  shipment_id: number;
  document_name: string;
  document_type: string | null;
  document_stage: 'creation' | 'extension' | 'closure' | 'refund';
  file_type: string | null;
  file_size: number | null;
  file_content: Buffer;
  uploaded_by: string | null;
}): Promise<ShipmentDocument> {
  const { rows } = await titePool.query<ShipmentDocument>(
    `INSERT INTO shipment_documents
       (shipment_id, document_name, document_type, document_stage,
        file_type, file_size, file_content, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, shipment_id, document_name, document_type, document_stage,
               file_type, file_size, uploaded_by,
               uploaded_at::text AS uploaded_at`,
    [
      params.shipment_id,
      params.document_name,
      params.document_type,
      params.document_stage,
      params.file_type,
      params.file_size,
      params.file_content,
      params.uploaded_by,
    ],
  );
  return rows[0];
}

export async function dbGetDocuments(shipment_id: number): Promise<ShipmentDocument[]> {
  const { rows } = await titePool.query<ShipmentDocument>(
    `SELECT id, shipment_id, document_name, document_type, document_stage,
            file_type, file_size, uploaded_by,
            uploaded_at::text AS uploaded_at
     FROM shipment_documents
     WHERE shipment_id = $1
     ORDER BY uploaded_at DESC`,
    [shipment_id],
  );
  return rows;
}

export async function dbDeleteDocument(id: number): Promise<void> {
  await titePool.query(`DELETE FROM shipment_documents WHERE id = $1`, [id]);
}

export async function dbGetDocumentFile(id: number): Promise<{
  document_name: string;
  file_type: string | null;
  file_content: Buffer;
} | null> {
  const { rows } = await titePool.query(
    `SELECT document_name, file_type, file_content
     FROM shipment_documents WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    document_name: rows[0].document_name,
    file_type:     rows[0].file_type,
    file_content:  rows[0].file_content as Buffer,
  };
}

/* ─── Activity log helpers ──────────────────────────────────────── */

export async function dbInsertActivityLog(params: {
  shipment_id: number;
  action: string;
  details: string | null;
  performed_by: string | null;
}): Promise<void> {
  await titePool.query(
    `INSERT INTO shipment_activity_log (shipment_id, action, details, performed_by)
     VALUES ($1, $2, $3, $4)`,
    [params.shipment_id, params.action, params.details, params.performed_by],
  );
}

export async function dbGetActivityLog(shipment_id: number): Promise<ActivityLogRow[]> {
  const { rows } = await titePool.query<ActivityLogRow>(
    `SELECT id, shipment_id, action, details, performed_by,
            performed_at::text AS performed_at
     FROM shipment_activity_log
     WHERE shipment_id = $1
     ORDER BY performed_at DESC`,
    [shipment_id],
  );
  return rows;
}

/* ─── Shipment update with log ──────────────────────────────────── */

export async function dbUpdateShipmentWithLog(params: {
  shipment_id: number;
  fields: Record<string, unknown>;
  action: string;
  details: string | null;
  performed_by: string | null;
}): Promise<void> {
  const keys   = Object.keys(params.fields);
  const values = Object.values(params.fields);
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

  await titePool.query(
    `UPDATE shipments SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [params.shipment_id, ...values],
  );

  await dbInsertActivityLog({
    shipment_id:  params.shipment_id,
    action:       params.action,
    details:      params.details,
    performed_by: params.performed_by,
  });
}
