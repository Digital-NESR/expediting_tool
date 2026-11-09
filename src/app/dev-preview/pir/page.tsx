/*
 * The PIR catalogue screen, signed out, for development only.
 *
 * /catalog-manager/pir is behind SSO, so the filter row and the stat cards would otherwise ship
 * on the strength of a diff. That row now carries a search box and seven selects; whether they
 * sit on one line or wrap into a mess is not something tsc or vitest can see.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import PirPreview from './PirPreview';

export default async function PirPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; expiring?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = await searchParams;
  return <PirPreview status={sp.status ?? ''} expiring={sp.expiring ?? ''} />;
}
