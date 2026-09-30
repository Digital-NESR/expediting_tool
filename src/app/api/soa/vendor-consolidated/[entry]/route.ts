import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import {
  NothingToConsolidate,
  buildVendorConsolidatedWorkbook,
  vendorConsolidatedFileName,
} from '@/lib/soa/consolidated';
import { ensureSoaSchema, sql } from '@/lib/soa/db';

/**
 * One supplier's rows, in the consolidated format.
 *
 * The country file is what AP posts from; this is what they attach when they go back to a supplier
 * about a line. Same sixteen columns, so a row from one pastes into the other, and built from the
 * same parsed rows, so the two cannot disagree.
 *
 * Viewer level, as the country file is: it holds a subset of what that one holds.
 */

const log = logger('soa-vendor-consolidated');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ entry: string }> }) {
  const actor = await getSoaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { entry } = await params;
  const entryId = Number(entry);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return new NextResponse('Not found', { status: 404 });
  }

  await ensureSoaSchema();
  // The country is read back from the entry, never taken from the request.
  const rows = await sql<QueryResultRow[]>(
    `SELECT v.vendor_no, cc.country_id, cy.label AS cycle_label
       FROM vendor_cycle_entries vce
       JOIN vendors v         ON v.id = vce.vendor_id
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
       JOIN cycles cy         ON cy.id = cc.cycle_id
      WHERE vce.id = ?`,
    [entryId],
  );
  if (!rows.length) return new NextResponse('Not found', { status: 404 });
  const r = rows[0];

  const countryId = String(r.country_id);
  if (!canAccessCountry(actor, countryId, 'viewer')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { file, vendorName, summary } = await buildVendorConsolidatedWorkbook(
      countryId,
      String(r.vendor_no),
    );
    const name = vendorConsolidatedFileName(
      vendorName,
      String(r.vendor_no),
      String(r.cycle_label),
    );
    log.info('vendorConsolidated.built', {
      entryId,
      vendorNo: String(r.vendor_no),
      lines: summary.lines,
      by: actor.email,
    });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentContentDisposition(name),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof NothingToConsolidate) {
      return new NextResponse(err.message, { status: 409 });
    }
    log.error('vendorConsolidated.failed', err, { entryId });
    return new NextResponse('Could not build that file.', { status: 500 });
  }
}
