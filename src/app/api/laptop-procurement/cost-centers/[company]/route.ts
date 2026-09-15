import { NextRequest, NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import { getDepartmentsForCompany } from '@/lib/laptopCostCenters.server';

/**
 * Departments + cost centers for ONE company from the Cost Center Mapping workbook.
 *
 * The whole mapping is ~138 KB and used to be bundled into the request form's client chunk,
 * even though the form only ever shows the departments of the single company currently
 * selected (the largest company's slice is under 7 KB). The form prefetches its opening
 * company server-side and hits this route only when the user picks a different one.
 *
 * Static reference data, so it is cached hard — but `private`, since the route is auth-gated.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  const user = await getProcureGuardUser();
  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { company } = await params;
  // Unknown codes legitimately yield [] — that is exactly what the old in-bundle
  // getDepartmentsForCompany() returned, so the form's behaviour is unchanged.
  return NextResponse.json(getDepartmentsForCompany(company), {
    headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' },
  });
}
