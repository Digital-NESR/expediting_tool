import { NextResponse } from 'next/server';
import rrsmPool from '@/lib/db-rrsm';
import { currentRrsmActor, rolesIn } from '@/lib/rrsm/access';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';

const log = logger('rrsm-recurrent-documents');

export const dynamic = 'force-dynamic';

/**
 * Serves one recurrent-service document (contract, quotation, other).
 *
 * Open to a buyer or admin in the service's country, and to the service's own requester, the same
 * people who can see the service. Read from the rows, never from the URL. Always an attachment
 * with nosniff, never inline.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await currentRrsmActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) return new NextResponse('Not found', { status: 404 });

  try {
    const { rows } = await rrsmPool.query(
      `SELECT d.file_name, d.content_type, d.content, s.country_code, s.requester_email
         FROM rrsm_recurrent_documents d
         JOIN rrsm_recurrent_services s ON s.id = d.service_id
        WHERE d.id = $1`,
      [documentId],
    );
    const row = rows[0];
    if (!row) return new NextResponse('Not found', { status: 404 });
    const mine =
      row.requester_email &&
      String(row.requester_email).toLowerCase() === actor.email.toLowerCase();
    if (!mine && !rolesIn(actor, String(row.country_code)).canBuy) {
      return new NextResponse('Not found', { status: 404 });
    }

    const content = row.content as Buffer;
    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': String(row.content_type || 'application/octet-stream'),
        'Content-Length': String(content.length),
        'Content-Disposition': attachmentContentDisposition(String(row.file_name)),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    log.error('download.failed', err, { documentId });
    return new NextResponse('Server error', { status: 500 });
  }
}
