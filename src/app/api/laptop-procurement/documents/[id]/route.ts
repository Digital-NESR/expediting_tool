import { NextRequest, NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import laptopProcurementPool from '@/lib/db-laptop';
import { fileDownloadResponse } from '@/lib/documents';
import { canViewLaptopRequest } from '@/app/actions/laptopProcurement';

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
    // Metadata first, authorise, and only then pull the BYTEA. Selecting file_content up
    // front meant every request — including ones about to be refused with a 403, and
    // link prefetches nobody asked for — dragged the whole blob out of Postgres and
    // across the wire before anyone checked whether the caller was allowed to see it.
    const { rows } = await laptopProcurementPool.query(
      `SELECT request_id, document_name, original_name, file_type, file_size
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

    const { rows: contentRows } = await laptopProcurementPool.query(
      `SELECT file_content FROM laptop_documents WHERE id = $1 LIMIT 1`,
      [docId],
    );
    const fileContent = contentRows[0]?.file_content;
    if (fileContent === undefined || fileContent === null) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // Note the content type still comes from the METADATA row read before the
    // authorization check — the second query deliberately fetches nothing but the blob.
    return fileDownloadResponse(
      fileContent,
      doc.original_name || doc.document_name,
      doc.file_type,
    );
  } catch (err) {
    console.error('[Laptop Procurement] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
