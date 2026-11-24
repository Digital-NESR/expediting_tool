import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { fileDownloadResponse } from '@/lib/documents';
import { canUseCountry, hasAccess, currentSafeSignActor } from '@/lib/safesign/access';
import { ensureSafeSignSchema, safesignPool } from '@/lib/safesign/db';

/**
 * Staff download of a SafeSign file: a document NESR sent (`document`) or something a supplier
 * sent back (`response`). Any SafeSign user in the communication's country may read; suppliers never come through here (their
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
  const { rows } = await safesignPool.query<QueryResultRow>(
    kind === 'document'
      ? `SELECT d.filename, d.mime, d.data, c.country_id
           FROM ss_documents d JOIN ss_communications c ON c.id = d.communication_id
          WHERE d.id = $1`
      : `SELECT f.filename, f.mime, f.data, c.country_id
           FROM ss_response_files f
           JOIN ss_requests r ON r.id = f.request_id
           JOIN ss_communications c ON c.id = r.communication_id
          WHERE f.id = $1`,
    [fileId],
  );
  if (!rows[0] || !canUseCountry(actor, String(rows[0].country_id))) {
    return new NextResponse('Not found', { status: 404 });
  }
  return fileDownloadResponse(rows[0].data, String(rows[0].filename), String(rows[0].mime));
}
