/* ─── Low-level database access for Laptop Procurement: the `?`-placeholder query helpers,
   their transaction-bound twins, and the file limits the upload path enforces. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { createSqlHelpers } from '@/lib/db/sql';
import { uploadMimeTypeFor } from '@/lib/documents';
import type { PoolClient, QueryResultRow } from 'pg';

export type QueryParam = string | number | boolean | null | Date | Buffer | undefined;

export type QueryParams = QueryParam[];

export type ExecResult = { rowCount: number; insertId: number };

export const MEANINGFUL_ACTIVITY_WHERE = "request_id > 0 AND action NOT ILIKE '%seeded%'";

export const MAX_LAPTOP_FILE_BYTES = 10 * 1024 * 1024;

export function fileBaseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').trim() || 'Attachment';
}

export function detectMime(file: File): string {
  return uploadMimeTypeFor(file.name, file.type);
}

export const { sql, exec } = createSqlHelpers(laptopProcurementPool);

// Same `?`-placeholder contract as sql()/exec() above, but bound to one transaction's
// client. Everything inside a withTransaction callback has to go through these —
// sql()/exec() reach for the pool, so they'd run on a different connection, outside
// the transaction, and would not roll back with it.
export function sqlTx<T extends QueryResultRow[]>(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<T> {
  return createSqlHelpers(client).sql<T>(statement, params);
}

export function execTx(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<ExecResult> {
  return createSqlHelpers(client).exec(statement, params);
}

/* ── Actor / access ───────────────────────────────────────────── */
