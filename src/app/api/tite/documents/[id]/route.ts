import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import titePool from '@/lib/db-tite';

const MIME_MAP: Record<string, string> = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  txt:  'text/plain',
  csv:  'text/csv',
  zip:  'application/zip',
  msg:  'application/vnd.ms-outlook',
  eml:  'message/rfc822',
};

function extOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (isNaN(docId)) {
    return new NextResponse('Invalid document ID', { status: 400 });
  }

  try {
    const { rows } = await titePool.query(
      `SELECT document_name, original_name, file_content, file_type, file_size
       FROM shipment_documents WHERE id = $1`,
      [docId],
    );

    if (!rows[0]) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const doc = rows[0];

    /* ── Determine content-type ── */
    /* Use stored file_type when it's a specific MIME; otherwise detect from extension */
    const nameForExt: string = doc.original_name || doc.document_name;
    const ext = extOf(nameForExt);

    let contentType: string = doc.file_type || '';
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = MIME_MAP[ext] || 'application/octet-stream';
    }

    /* ── Decode BYTEA ── */
    /* pg may return BYTEA as a hex-escaped string (\x<hexdigits>) rather than a
       Buffer. Passing that string to Buffer.from() without an encoding treats it
       as UTF-8 and corrupts the file — decode from hex instead. */
    let fileBuffer: Buffer;
    if (Buffer.isBuffer(doc.file_content)) {
      fileBuffer = doc.file_content;
    } else {
      const str = String(doc.file_content);
      fileBuffer = str.startsWith('\\x')
        ? Buffer.from(str.slice(2), 'hex')
        : Buffer.from(str, 'binary');
    }

    /* ── Build response ── */
    const dlFilename = (doc.original_name || doc.document_name).replace(/"/g, '_');

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${dlFilename}"`,
        'Content-Length':      String(fileBuffer.byteLength),
        'Cache-Control':       'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[TI-TE] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
