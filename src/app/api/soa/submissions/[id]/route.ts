import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { fileDownloadResponse } from '@/lib/documents';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import { ensureSoaSchema, soaPool } from '@/lib/soa/db';

/**
 * Download a vendor's statement of account.
 *
 * Without this the tool was writing evidence it could never show: `acceptSoaSubmission` stores the
 * file as bytes, coverage moves on the back of it, and there was no way to read it again. An
 * auditor asking "show me the statement behind this vendor's 12% of the coverage figure" is the
 * whole reason the file is kept at all.
 *
 * A statement lists a vendor's invoice numbers and balances, so it is served the way every other
 * document in this app is — bytes from the database through an authenticated route — rather than
 * from a URL that only has to be guessed. Authorisation is per COUNTRY and resolved from the
 * submission id, because the id is the only thing the caller controls: a champion of Oman must not
 * be able to walk ids into Saudi Arabia's statements.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getSoaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const submissionId = Number(id);
  if (!Number.isFinite(submissionId)) {
    return new NextResponse('Invalid submission id', { status: 400 });
  }

  try {
    await ensureSoaSchema();

    /* Metadata first, and the country with it, so an unauthorised caller is turned away before a
       10 MB blob is dragged out of Postgres — the same order the Laptop Procurement route uses. */
    const { rows } = await soaPool.query<QueryResultRow>(
      `SELECT s.file_name, s.content_type, (s.content IS NOT NULL) AS has_content,
              cc.country_id
         FROM soa_submissions s
         JOIN vendor_cycle_entries vce ON vce.id = s.vendor_cycle_entry_id
         JOIN country_cycles cc        ON cc.id = vce.country_cycle_id
        WHERE s.id = $1
        LIMIT 1`,
      [submissionId],
    );

    const doc = rows[0];
    /* 404 rather than 403 for a statement the caller may not see: a different status would confirm
       that a given id exists in a country they have no access to. Consistent with the other
       document routes in this app. */
    if (!doc || !doc.has_content || !canAccessCountry(actor, String(doc.country_id), 'viewer')) {
      return new NextResponse('Statement not found', { status: 404 });
    }

    const { rows: contentRows } = await soaPool.query<QueryResultRow>(
      `SELECT content FROM soa_submissions WHERE id = $1 LIMIT 1`,
      [submissionId],
    );
    const content = contentRows[0]?.content;
    if (content === undefined || content === null) {
      return new NextResponse('Statement not found', { status: 404 });
    }

    return fileDownloadResponse(content, String(doc.file_name), doc.content_type as string | null);
  } catch (err) {
    console.error('[SOA] statement download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
