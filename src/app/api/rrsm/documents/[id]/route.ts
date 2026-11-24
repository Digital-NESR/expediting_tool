import { NextResponse } from 'next/server';
import rrsmPool from '@/lib/db-rrsm';
import { canAccessCountry, currentRrsmActor } from '@/lib/rrsm/access';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';

const log = logger('rrsm-documents');

export const dynamic = 'force-dynamic';

/**
 * Serves one supplier document (Delivery Note, Timesheet or Invoice) to NESR staff.
 *
 * A route handler rather than a server action because it returns bytes with their own content
 * type and disposition. Access follows the cycle: anyone holding an RRSM grant in the country the
 * document's cycle belongs to may open it, the same people who see the supplier's lines. The
 * country is read from the rows, never from the URL.
 *
 * Always served as an attachment, never inline: the file came from outside NESR, and opening an
 * uploaded file inside the app's own origin is how a crafted file gets to run script.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await currentRrsmActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) return new NextResponse('Not found', { status: 404 });

  try {
    const { rows } = await rrsmPool.query(
      `SELECT d.file_name, d.content_type, d.content, cy.country_code
         FROM rrsm_submission_documents d
         JOIN rrsm_supplier_links l ON l.id = d.link_id
         JOIN rrsm_cycles cy        ON cy.id = l.cycle_id
        WHERE d.id = $1`,
      [documentId],
    );
    const row = rows[0];
    if (!row) return new NextResponse('Not found', { status: 404 });
    if (!canAccessCountry(actor, String(row.country_code), 'buyer')) {
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
    log.error('documents.download.failed', err, { documentId });
    return new NextResponse('Server error', { status: 500 });
  }
}
