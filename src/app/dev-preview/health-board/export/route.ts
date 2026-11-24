import { NextRequest, NextResponse } from 'next/server';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { exportWorkbook } from '@/lib/health-board/export-request';

export const dynamic = 'force-dynamic';

/**
 * The Health Board export, signed out, for development only: the same workbook as
 * /supply-chain-analytics/health-board/export. A 404 in production, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not found', { status: 404 });
  const file = await exportWorkbook(req.nextUrl.searchParams);
  if (!file) return new NextResponse('Nothing to export', { status: 404 });
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': attachmentContentDisposition(file.fileName),
    },
  });
}
