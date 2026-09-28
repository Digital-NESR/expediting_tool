import { NextRequest, NextResponse } from 'next/server';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import {
  NothingToConsolidate,
  buildConsolidatedWorkbook,
  consolidatedFileName,
} from '@/lib/soa/consolidated';

/**
 * The consolidated statement file for a country's cycle.
 *
 * Every invoice line every supplier returned, in the sixteen-column format AP already works in,
 * built from the parsed rows rather than by stitching the attachments together. Assembling those
 * by hand is the work this whole pipeline replaces, and building it from the same rows the
 * coverage figure is computed from means the file AP posts from and the number the champion
 * reported cannot disagree.
 *
 * A viewer of the country is enough, for the same reason the evidence pack is: it contains nothing
 * they cannot already read on the screens, and withholding it would only mean somebody rebuilds it
 * in a spreadsheet. Which is how a consolidated file stops matching what it consolidates.
 */

const log = logger('soa-consolidated');

export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ country: string }> }) {
  const actor = await getSoaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });

  const { country } = await params;
  const countryId = decodeURIComponent(country);
  if (!canAccessCountry(actor, countryId, 'viewer')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { file, summary } = await buildConsolidatedWorkbook(countryId);
    log.info('consolidated.built', {
      countryId,
      by: actor.email,
      vendors: summary.vendors,
      lines: summary.lines,
    });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentContentDisposition(
          consolidatedFileName(countryId, summary.cycleLabel),
        ),
        // Built from rows that change as statements arrive, so a cached copy would be wrong the
        // moment the next supplier uploads.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof NothingToConsolidate) {
      return new NextResponse(err.message, { status: 409 });
    }
    log.error('consolidated.failed', err, { countryId });
    return new NextResponse('Could not build the consolidated file.', { status: 500 });
  }
}
