import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';
import { buildTaxonomyWorkbook, taxonomyExportFileName } from '@/lib/sourceguide/taxonomy-export';
import { readSpendTaxonomyForExport } from '@/lib/sourceguide/taxonomy';

/**
 * The spend taxonomy as a workbook.
 *
 * Gated on nothing but being signed in, which is the same gate the two pages that offer it carry
 * between them: the standalone /spend-taxonomy page is open to every employee, and SourceGuide's
 * copy is behind a grant. If this route demanded the grant, the open page would offer a button
 * that refuses most of the people who can see it. The rows are the same either way, and the
 * reasoning for why they are ungated is in `readSpendTaxonomyFacts`.
 *
 * Built per request rather than cached. It is a few thousand rows, it is asked for rarely, and a
 * stale taxonomy is worse than a slow one.
 */

const log = logger('spend-taxonomy-export');

/** The white wordmark for the green masthead. Traced into the bundle via next.config.ts. */
const LOGO = path.join(process.cwd(), 'assets', 'brand', 'nesr-logo-white.png');

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const rows = await readSpendTaxonomyForExport();
    if (!rows.length) return new NextResponse('The taxonomy is empty', { status: 503 });

    /* Best-effort: a workbook that arrives without its logo is still the workbook somebody asked
       for, while a download that 500s because an image was missing is not. */
    let logo: Buffer | null = null;
    try {
      logo = await readFile(LOGO);
    } catch (err) {
      log.warn('logoUnavailable', { error: err instanceof Error ? err.message : String(err) });
    }

    const exportedAt = new Date();
    const file = await buildTaxonomyWorkbook(rows, { logo, exportedAt });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentContentDisposition(taxonomyExportFileName(exportedAt)),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    log.error('export.failed', err);
    return new NextResponse('Could not build the export', { status: 500 });
  }
}
