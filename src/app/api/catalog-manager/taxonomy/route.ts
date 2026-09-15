import { NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy.server';

/**
 * The full NESR spend taxonomy (Category → Sub-category → Commodity), ~100 KB minified.
 *
 * The three catalog entry forms receive it as a prop from their server page, so they stay
 * fully synchronous. This route exists for BulkImportPanel, which is rendered by two client
 * components (CatalogImportClient and AdminClient) with no server page to prop-drill through,
 * and which only touches the taxonomy inside its already-async `downloadTemplate()`.
 *
 * Static reference data, so it is cached hard — but `private`, since the route is auth-gated.
 */
export async function GET() {
  const user = await getProcureGuardUser();
  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return NextResponse.json(SPEND_TAXONOMY, {
    headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' },
  });
}
