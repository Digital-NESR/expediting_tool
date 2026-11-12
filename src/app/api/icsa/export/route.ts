import { NextRequest, NextResponse } from 'next/server';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { logger } from '@/lib/logger';
import { getIcsaActor } from '@/lib/icsa/access';
import { getAssessment, listManagedAssessments } from '@/lib/icsa/queries';
import { assessmentWorkbook, consolidatedWorkbook, safeName } from '@/lib/icsa/export';
import { todayInDubai } from '@/lib/icsa/model';

/**
 * Excel downloads.
 *   ?assessment=ID                       one respondent's workbook (the respondent, their
 *                                        champion, or an admin)
 *   ?cycle=ID&country=X&champion=EMAIL   consolidated workbook over what the viewer manages
 */

const log = logger('icsa-export');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const actor = await getIcsaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  const p = req.nextUrl.searchParams;

  try {
    const one = Number(p.get('assessment'));
    if (one) {
      const found = await getAssessment(actor, one);
      if (!found) return new NextResponse('Not found', { status: 404 });
      const a = found.assessment;
      const file = await assessmentWorkbook(a);
      return xlsx(
        file,
        `ICSA_${safeName(a.country)}_${safeName(a.cycleLabel)}_${safeName(a.respondentName || a.respondentEmail)}.xlsx`,
      );
    }

    if (!actor.isAdmin && !actor.championCountries.length) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    const cycleId = Number(p.get('cycle')) || null;
    const list = await listManagedAssessments(actor, {
      cycleId,
      country: p.get('country') || null,
      champion: p.get('champion') || null,
    });
    const file = await consolidatedWorkbook(list);
    const label = list[0] && cycleId ? safeName(list[0].cycleLabel) : 'All';
    return xlsx(file, `ICSA_Consolidated_${label}_${todayInDubai()}.xlsx`);
  } catch (err) {
    log.error('export.failed', err);
    return new NextResponse('Could not build the file.', { status: 500 });
  }
}

function xlsx(file: Buffer, name: string) {
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': attachmentContentDisposition(name),
      'Cache-Control': 'no-store',
    },
  });
}
