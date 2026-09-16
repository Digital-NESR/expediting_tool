import { NextRequest, NextResponse } from 'next/server';
import catalogManagerPool from '@/lib/db-catalog-manager';
import { requireSchema } from '@/lib/db/schema-version';
import { fileDownloadResponse } from '@/lib/documents';
import { getCatalogActor } from '@/app/actions/catalog-manager';

/**
 * Proof-of-agreement download.
 *
 * `getCatalogActor` is the catalog's own gate, and it is already an exported member of the
 * `'use server'` actions module — so it is already a public POST endpoint whether or not this file
 * imports it. Importing it therefore adds no new endpoint and duplicates no rule; it is the same
 * thing the Laptop Procurement route does with `canViewLaptopRequest`. The guards themselves
 * (`requireCatalogActor` / `optionalCatalogActor`) are module-private and stay that way: exporting
 * one of those to reach it from here would have created a new POST endpoint out of a guard.
 *
 * The gate the replaced server action applied was "any signed-in catalog user, and the document
 * must hang off a real catalog entry" — this route applies exactly that and no less. A signed-out
 * caller gets 401; everything else a caller is not entitled to see is a 404, so walking `id` cannot
 * distinguish "not yours" from "does not exist".
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCatalogActor();
  if (!actor.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) {
    return new NextResponse('Invalid document ID', { status: 400 });
  }

  try {
    // The bytes live in a column 002 adds; assert it rather than 500ing on a missing column.
    await requireSchema(catalogManagerPool, 'catalog-manager', '002_entry_document_bytea');

    // Metadata first, judge, and only then pull the BYTEA — the same order the Laptop route uses.
    // Selecting the blob up front would drag up to 5 MB out of Postgres for every refused request
    // and every link prefetch before anyone had decided whether the caller may have it.
    // The JOIN is load-bearing: a document row whose parent entry is gone is not downloadable.
    const { rows } = await catalogManagerPool.query(
      `SELECT d.file_name, d.content_type, (d.content IS NOT NULL) AS has_content
       FROM entry_document d
       JOIN catalog_entry e ON e.id = d.entry_id
       WHERE d.id = $1
       LIMIT 1`,
      [docId],
    );

    const doc = rows[0];
    // A seeded placeholder row carries metadata but no bytes; there is nothing to serve.
    if (!doc || !doc.has_content) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const { rows: contentRows } = await catalogManagerPool.query(
      `SELECT content FROM entry_document WHERE id = $1 LIMIT 1`,
      [docId],
    );
    const content = contentRows[0]?.content;
    if (content === undefined || content === null) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // Content type comes from the METADATA row read above; the second query fetches nothing but
    // the blob. BYTEA decode, MIME resolution and the headers are the shared plumbing.
    return fileDownloadResponse(content, doc.file_name, doc.content_type);
  } catch (err) {
    console.error('[Catalog Manager] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
