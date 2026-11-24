import { NextRequest, NextResponse } from 'next/server';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { exportWorkbook } from '@/lib/health-board/export-request';
import { logger } from '@/lib/logger';
import { currentActor } from '@/lib/require-access';

export const dynamic = 'force-dynamic';

const log = logger('supply-chain-analytics');

/**
 * The Health Board as an Excel file: ?view=overview (one country), ?view=compare (one KPI, every
 * country) or ?view=kpi (one KPI, one country, by month). Same access as the board: platform
 * admins only (the owner's decision, 24 Nov 2026); anyone else gets a 404, as for the pages.
 */
export async function GET(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  if (!actor.isPlatformAdmin) return new NextResponse('Not found', { status: 404 });
  try {
    const file = await exportWorkbook(req.nextUrl.searchParams);
    if (!file) return new NextResponse('Nothing to export', { status: 404 });
    log.info('health-board.export', { by: actor.email, query: req.nextUrl.search });
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentContentDisposition(file.fileName),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    log.error('health-board.export.failed', err);
    return new NextResponse('The export could not be built.', { status: 500 });
  }
}
