import { NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { canAccessCountry, currentRrsmActor } from '@/lib/rrsm/access';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { DOC_LABEL, type DocKind } from '@/lib/rrsm/submission';
import { StoredZip, safeZipName } from '@/lib/zip-store';
import { logger } from '@/lib/logger';

const log = logger('rrsm-cycle-documents-zip');

export const dynamic = 'force-dynamic';

/**
 * Every supplier document on one cycle, as a single ZIP: one folder per supplier
 * ("Automak Automotive Co. KSC (1101066)"), holding what that supplier uploaded
 * ("Delivery Note - DN-Nov.pdf", "Invoice - INV 4471.pdf").
 *
 * Access is the same as opening each file on its own (see ../../../documents/[id]): an RRSM grant
 * in the cycle's country, read from the row and never from the URL. Anyone who could click every
 * file one by one may have them in one go.
 *
 * STREAMED, one document at a time: each file is read from the database, written to the response
 * and dropped before the next is read. Holding a month's uploads in memory at once (up to 4 MB
 * each) is what this avoids, and a streamed response is not held to the platform's buffered
 * response-size limit.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await currentRrsmActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const cycleId = Number(id);
  if (!Number.isInteger(cycleId)) return new NextResponse('Not found', { status: 404 });

  let cycle: QueryResultRow | undefined;
  let docs: QueryResultRow[];
  try {
    cycle = (
      await rrsmPool.query<QueryResultRow>(
        `SELECT cy.country_code, to_char(cy.period, 'YYYY-MM') AS period, c.name AS country_name
           FROM rrsm_cycles cy JOIN rrsm_countries c ON c.code = cy.country_code
          WHERE cy.id = $1`,
        [cycleId],
      )
    ).rows[0];
    if (!cycle || !canAccessCountry(actor, String(cycle.country_code), 'buyer')) {
      return new NextResponse('Not found', { status: 404 });
    }
    /* The list only: names and ids. The bytes are read one file at a time while streaming. */
    docs = (
      await rrsmPool.query<QueryResultRow>(
        `SELECT d.id, d.kind, d.file_name, d.uploaded_at, l.supplier_code, s.name AS supplier_name
           FROM rrsm_submission_documents d
           JOIN rrsm_supplier_links l ON l.id = d.link_id
           JOIN rrsm_suppliers s      ON s.code = l.supplier_code
          WHERE l.cycle_id = $1
          ORDER BY s.name, l.supplier_code, d.kind`,
        [cycleId],
      )
    ).rows;
  } catch (err) {
    log.error('zip.list.failed', err, { cycleId });
    return new NextResponse('Server error', { status: 500 });
  }

  if (!docs.length) {
    return new NextResponse('No supplier has uploaded a document on this cycle yet.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const zip = new StoredZip();
  let next = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        /* Every call enqueues something: one file, or the closing directory. A document removed
           since the list was read is skipped inside the loop rather than by returning empty. */
        while (next < docs.length) {
          const d = docs[next++];
          const { rows } = await rrsmPool.query<QueryResultRow>(
            `SELECT content FROM rrsm_submission_documents WHERE id = $1`,
            [Number(d.id)],
          );
          if (!rows[0]) continue;
          const folder = `${safeZipName(String(d.supplier_name), 'Supplier')} (${safeZipName(String(d.supplier_code))})`;
          const label = DOC_LABEL[String(d.kind) as DocKind] ?? 'Document';
          const file = `${label} - ${safeZipName(String(d.file_name))}`;
          const when = d.uploaded_at instanceof Date ? d.uploaded_at : new Date();
          const bytes = new Uint8Array(rows[0].content as Buffer);
          controller.enqueue(zip.add(`${folder}/${file}`, bytes, when));
          return;
        }
        controller.enqueue(zip.finish());
        controller.close();
      } catch (err) {
        log.error('zip.stream.failed', err, { cycleId });
        controller.error(err);
      }
    },
  });

  const name = `RRSM ${String(cycle.country_name)} ${String(cycle.period)} supplier documents.zip`;
  log.info('zip.download', { cycleId, files: docs.length, by: actor.email });
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': attachmentContentDisposition(name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
