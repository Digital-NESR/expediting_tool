import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import { attachmentFileName, buildSupplierWorkbook } from '@/lib/soa/attachment';
import { ensureSoaSchema, sql } from '@/lib/soa/db';

/**
 * The blank statement template for one supplier, as they were sent it.
 *
 * A champion needs this when a supplier says the attachment never arrived, or asks for it again
 * at the wrong address, or wants it forwarded to their own accounts team. Rebuilt rather than
 * stored, so it is always the current template with the current AP contacts on its instructions.
 *
 * Carries the supplier's name on the instructions and in the file name. Nothing else about them:
 * no invoice rows are pre-filled, and their identity is stamped onto the rows from our own record
 * when the file comes back.
 *
 * Viewer level, so Accounts Payable can take a copy too. It holds nothing about the supplier that
 * is not already on the screen they downloaded it from.
 */

const log = logger('soa-vendor-template');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ entry: string }> }) {
  const actor = await getSoaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { entry } = await params;
  const entryId = Number(entry);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return new NextResponse('Not found', { status: 404 });
  }

  await ensureSoaSchema();
  /* The entry id arrives from the browser and is not a capability: the country that owns it is
     read back from the database and the caller is checked against that, never against a country
     the request named. */
  const rows = await sql<QueryResultRow[]>(
    `SELECT v.vendor_no, v.name AS vendor_name, cc.country_id, c.name AS country_name,
            cy.label AS cycle_label,
            (SELECT ARRAY_AGG(cu.email ORDER BY cu.name)
               FROM country_users cu
              WHERE cu.country_id = cc.country_id AND cu.role = 'ap') AS ap_emails,
            (SELECT ARRAY_AGG(cu.email ORDER BY cu.name)
               FROM country_users cu
              WHERE cu.country_id = cc.country_id AND cu.role = 'champion') AS champion_emails
       FROM vendor_cycle_entries vce
       JOIN vendors v         ON v.id = vce.vendor_id
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
       JOIN countries c       ON c.id = cc.country_id
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

  const vendor = { vendorNo: String(r.vendor_no), vendorName: String(r.vendor_name) };
  const file = await buildSupplierWorkbook(
    countryId,
    String(r.country_name),
    (r.ap_emails as string[] | null) ?? [],
    (r.champion_emails as string[] | null) ?? [],
    vendor,
  );
  const name = attachmentFileName(String(r.cycle_label), vendor);
  log.info('vendorTemplate.built', { entryId, vendorNo: vendor.vendorNo, by: actor.email });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': attachmentContentDisposition(name),
      'Cache-Control': 'no-store',
    },
  });
}
