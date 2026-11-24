import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { fileDownloadResponse } from '@/lib/documents';
import { hasAccess, currentSafeSignActor } from '@/lib/safesign/access';
import { ensureSafeSignSchema, safesignPool } from '@/lib/safesign/db';

/**
 * Staff download of a SafeSign file: a document NESR sent (`document`) or something a supplier
 * sent back (`response`). Any SafeSign role may read; suppliers never come through here (their
 * page downloads through its own token-checked action).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const actor = await currentSafeSignActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasAccess(actor)) return new NextResponse('Not found', { status: 404 });

  const { kind, id } = await params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId) || (kind !== 'document' && kind !== 'response')) {
    return new NextResponse('Not found', { status: 404 });
  }

  await ensureSafeSignSchema();
  const table = kind === 'document' ? 'ss_documents' : 'ss_response_files';
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT filename, mime, data FROM ${table} WHERE id = $1`,
    [fileId],
  );
  if (!rows[0]) return new NextResponse('Not found', { status: 404 });
  return fileDownloadResponse(rows[0].data, String(rows[0].filename), String(rows[0].mime));
}
