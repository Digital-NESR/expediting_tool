import { NextRequest, NextResponse } from 'next/server';
import { currentTiteUser, isTiteApproved, canViewTiteCountry } from '@/lib/tite-auth';
import titePool from '@/lib/db-tite';
import { fileDownloadResponse } from '@/lib/documents';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentTiteUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  // A signed-in session is not TI-TE access: the request must also be approved.
  if (!isTiteApproved(user)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) {
    return new NextResponse('Invalid document ID', { status: 400 });
  }

  try {
    /* Join the parent shipment so the row carries the country the caller is
       scoped against — without it this is an IDOR on a numeric document id. */
    const { rows } = await titePool.query(
      `SELECT d.document_name, d.original_name, d.file_content, d.file_type, d.file_size,
              s.country
       FROM shipment_documents d
       JOIN shipments s ON s.id = d.shipment_id
       WHERE d.id = $1`,
      [docId],
    );

    if (!rows[0]) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const doc = rows[0];

    if (!canViewTiteCountry(user, doc.country)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    /* Content type, BYTEA decode and headers are the shared plumbing — the country
       check above is this route's own and stays here. */
    return fileDownloadResponse(
      doc.file_content,
      doc.original_name || doc.document_name,
      doc.file_type,
    );
  } catch (err) {
    console.error('[TI-TE] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
