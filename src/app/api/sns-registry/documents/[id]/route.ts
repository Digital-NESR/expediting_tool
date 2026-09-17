import { NextResponse } from 'next/server';
import snsPool from '@/lib/db-sns';
import { getSnsViewer } from '@/app/actions/sns';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';

const log = logger('sns-registry');

export const dynamic = 'force-dynamic';

/**
 * Serves one registry attachment.
 *
 * A route handler rather than a server action because this returns bytes with
 * their own content type and disposition — an action can only return a
 * serialisable value, which would mean base64 through the RSC payload.
 *
 * Read access follows the record: anyone the registry lets see a record may
 * open its attachments, since evidence is the point of the record.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getSnsViewer();
  if (!viewer) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId)) return new NextResponse('Not found', { status: 404 });

  try {
    const { rows } = await snsPool.query(
      `SELECT d.document_name, d.file_type, d.file_content,
              COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record_document d
         JOIN sns_record r ON r.rid = d.record_rid
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE d.id = $1`,
      [documentId],
    );
    if (!rows.length) return new NextResponse('Not found', { status: 404 });

    const row = rows[0];
    const code = String(row.resolved_country_code ?? '');
    // An empty approved-country list means unrestricted, which is also how
    // admins and the read-only/leadership roles are stored. A record whose
    // country will not resolve is never in scope for a country-scoped role.
    const scoped =
      viewer.isAdmin ||
      viewer.countryCodes.length === 0 ||
      (!!code && viewer.countryCodes.includes(code));
    if (!scoped) return new NextResponse('Forbidden', { status: 403 });

    const content = row.file_content as Buffer;
    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': String(row.file_type ?? 'application/octet-stream'),
        'Content-Length': String(content.length),
        'Content-Disposition': attachmentContentDisposition(String(row.document_name)),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    log.error('documents.download.failed', err);
    return new NextResponse('Server error', { status: 500 });
  }
}
