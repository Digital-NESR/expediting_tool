import { NextRequest, NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import laptopProcurementPool from '@/lib/db-laptop';
import { canViewLaptopRequest } from '@/app/actions/laptopProcurement';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

function extOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getProcureGuardUser();
  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) {
    return new NextResponse('Invalid document ID', { status: 400 });
  }

  try {
    const { rows } = await laptopProcurementPool.query(
      `SELECT request_id, document_name, original_name, file_content, file_type, file_size
       FROM laptop_documents WHERE id = $1 LIMIT 1`,
      [docId],
    );
    const doc = rows[0];
    if (!doc) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const canView = await canViewLaptopRequest(doc.request_id);
    if (!canView) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const nameForExt: string = doc.original_name || doc.document_name;
    const ext = extOf(nameForExt);
    let contentType: string = doc.file_type || '';
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = MIME_MAP[ext] || 'application/octet-stream';
    }

    let fileBuffer: Buffer;
    if (Buffer.isBuffer(doc.file_content)) {
      fileBuffer = doc.file_content;
    } else {
      const str = String(doc.file_content);
      fileBuffer = str.startsWith('\\x') ? Buffer.from(str.slice(2), 'hex') : Buffer.from(str, 'binary');
    }

    const dlFilename = (doc.original_name || doc.document_name).replace(/"/g, '_');
    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="' + dlFilename + '"',
        'Content-Length': String(fileBuffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[Laptop Procurement] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
