import { redirect } from 'next/navigation';
import { rrsmHref } from '@/lib/rrsm/nav';

export const dynamic = 'force-dynamic';

/** Cycle history is part of Reports now (25 Nov 2026); old links and bookmarks land there. */
export default async function RrsmHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  redirect(rrsmHref('/rrsm/reports', sp.country));
}
