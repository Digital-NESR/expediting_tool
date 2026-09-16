import type { PoolClient } from 'pg';
import titePool from '@/lib/db-tite';
import { withTransaction } from '@/lib/db/tx';
import { requireSchema } from '@/lib/db/schema-version';
import type { ShipmentDocument, ActivityLogRow } from '@/types/tite';

/* ─── Document helpers ──────────────────────────────────────────── */

export async function dbInsertDocument(params: {
  shipment_id: number;
  document_name: string;
  original_name: string | null;
  document_type: string | null;
  document_stage: 'creation' | 'extension' | 'closure' | 'refund';
  file_type: string | null;
  file_size: number | null;
  file_content: Buffer;
  uploaded_by: string | null;
}): Promise<ShipmentDocument> {
  const { rows } = await titePool.query<ShipmentDocument>(
    `INSERT INTO shipment_documents
       (shipment_id, document_name, original_name, document_type, document_stage,
        file_type, file_size, file_content, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, shipment_id, document_name, original_name, document_type, document_stage,
               file_type, file_size, uploaded_by,
               uploaded_at::text AS uploaded_at`,
    [
      params.shipment_id,
      params.document_name,
      params.original_name,
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
    `SELECT id, shipment_id, document_name, original_name, document_type, document_stage,
            file_type, file_size, uploaded_by,
            uploaded_at::text AS uploaded_at
     FROM shipment_documents
     WHERE shipment_id = $1
     ORDER BY document_stage, document_type, uploaded_at ASC`,
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
    file_type: rows[0].file_type,
    file_content: rows[0].file_content as Buffer,
  };
}

/* ─── Activity log helpers ──────────────────────────────────────── */

/**
 * The activity-log column and index now live in `database/migrations/tite/001_baseline.sql`.
 * They used to run here on the first request every serverless instance served, behind a memo
 * and a try/catch that logged and carried on — so a genuinely missing column surfaced later as
 * a confusing INSERT failure rather than as itself.
 *
 * What is left is the assertion that the migrations ran: one cheap memoised row lookup. It can
 * throw where the old helper could not, which is the point.
 */
export function ensureTiteSchema(): Promise<void> {
  return requireSchema(titePool, 'tite', '001_baseline');
}

/**
 * Append an activity-log row. Pass the `client` of a surrounding transaction so
 * the log entry commits with the change it describes; without one it runs on
 * the pool, on its own connection.
 *
 * `performed_by_email` is the authenticated caller's email, resolved from the
 * session by the action BEFORE it opens its transaction — never taken from a
 * payload, and never resolved here, where it would hold a pooled connection
 * while deciding identity.
 */
export async function dbInsertActivityLog(
  params: {
    shipment_id: number;
    action: string;
    details: string | null;
    performed_by: string | null;
    performed_by_email: string | null;
  },
  client?: PoolClient,
): Promise<void> {
  if (!client) await requireSchema(titePool, 'tite', '001_baseline');
  await (client ?? titePool).query(
    `INSERT INTO shipment_activity_log
       (shipment_id, action, details, performed_by, performed_by_email)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.shipment_id,
      params.action,
      params.details,
      params.performed_by,
      params.performed_by_email ? params.performed_by_email.trim().toLowerCase() : null,
    ],
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

/**
 * The only `shipments` columns this helper will write. Its SET clause is built
 * from the keys of the object it is handed, so without a list to check them
 * against the caller decides which column names reach the statement — fine for
 * today's callers, which all pass literals, and a SQL-injection hole for the
 * first one that forwards a parsed request body.
 *
 * Deliberately only what the status-change actions in `@/app/actions/tite.ts`
 * actually set. Anything broader would be guessing at a table whose DDL does
 * not live in this repo, and a column nobody writes is a column this list has
 * no business blessing — extend it when a caller needs one.
 *
 * `updated_at` is absent on purpose: the statement below always stamps it, and
 * a caller that also passed it would produce two SET targets for one column.
 */
export type UpdatableShipmentColumn =
  'status' | 'alert_level' | 'extended_date' | 'last_updated_by';

const UPDATABLE_SHIPMENT_COLUMNS: ReadonlySet<string> = new Set<UpdatableShipmentColumn>([
  'status',
  'alert_level',
  'extended_date',
  'last_updated_by',
]);

export async function dbUpdateShipmentWithLog(params: {
  shipment_id: number;
  fields: Partial<Record<UpdatableShipmentColumn, unknown>>;
  action: string;
  details: string | null;
  performed_by: string | null;
  performed_by_email: string | null;
}): Promise<void> {
  const keys = Object.keys(params.fields);
  const values = Object.values(params.fields);

  /* The type above is erased at run time, so it protects nothing on the path
     that matters — a caller handing us `Record<string, unknown>` from JSON.
     Rejecting rather than dropping the stray key: a silently ignored field is
     an update that reports success and changes nothing, which is the kind of
     bug that surfaces months later as missing data. */
  const rejected = keys.filter((k) => !UPDATABLE_SHIPMENT_COLUMNS.has(k));
  if (rejected.length > 0) {
    throw new Error(
      `dbUpdateShipmentWithLog: refusing to update shipment column(s) outside the allow-list: ${rejected.join(', ')}`,
    );
  }

  /* `updated_at` joins the list rather than being appended to the joined
     string, so an empty `fields` still yields valid SQL. */
  const setClauses = [...keys.map((k, i) => `${k} = $${i + 2}`), 'updated_at = NOW()'].join(', ');

  // Before the transaction opens: fail on an unmigrated database without having
  // taken a connection and opened a unit of work that can only be rolled back.
  await requireSchema(titePool, 'tite', '001_baseline');

  // The row and the log entry describing it land together or not at all.
  await withTransaction(titePool, async (client) => {
    await client.query(`UPDATE shipments SET ${setClauses} WHERE id = $1`, [
      params.shipment_id,
      ...values,
    ]);

    await dbInsertActivityLog(
      {
        shipment_id: params.shipment_id,
        action: params.action,
        details: params.details,
        performed_by: params.performed_by,
        performed_by_email: params.performed_by_email,
      },
      client,
    );
  });
}
