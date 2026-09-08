import { redirect } from 'next/navigation';
import { DEFAULT_APP, LEGACY_TOOL_MAP } from './adminNav';

/* The ADMIN_EMAILS gate now lives in layout.tsx (it protects the
   whole /admin/* segment). This page only routes the bare /admin
   entry point — and old /admin?tool=<id> deep links — to the new
   per-application routes. */
export default async function AdminIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ tool?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const legacy = params.tool ? LEGACY_TOOL_MAP[params.tool] : undefined;

  if (legacy) {
    redirect(`/admin/${legacy.app}?section=${legacy.section}`);
  }

  redirect(`/admin/${DEFAULT_APP}`);
}
