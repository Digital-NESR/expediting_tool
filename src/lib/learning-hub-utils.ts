export function pct(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/*
 * `isAdminEmail()` used to live here — a 28th inline ADMIN_EMAILS parse with no callers
 * anywhere in src/. Deleted rather than re-pointed at `isPlatformAdminEmail()`: this module
 * is imported by client components (CourseDetailClient, LessonViewerClient, for
 * formatDuration), and pulling in `@/lib/require-access` would drag the server-only
 * session module into the client bundle. Learning Hub admin checks go through
 * `isPlatformAdminEmail()` from '@/lib/require-access' on the server.
 */
