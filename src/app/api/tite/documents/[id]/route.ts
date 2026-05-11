import { NextRequest, NextResponse } from 'next/server';
import { dbGetDocumentFile } from '@/lib/tite-documents';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const docId = Number(id);
  if (isNaN(docId)) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
  }

  const file = await dbGetDocumentFile(docId);
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contentType = file.file_type || 'application/octet-stream';
  const filename    = encodeURIComponent(file.document_name);

  return new NextResponse(new Uint8Array(file.file_content), {
    status: 200,
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(file.file_content.length),
    },
  });
}
