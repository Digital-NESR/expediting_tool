/**
 * Learner-facing display rules shared by the Learning Hub client components.
 *
 * Client-safe on purpose (no `pg` import), so the sidebar, the dashboard cards and
 * the track page can all apply the SAME rule instead of each keeping its own list.
 */

/**
 * "Coming Soon": there is genuinely nothing to open yet.
 *
 * Derived from the counts, never from a hard-coded list of track keys - a track/course
 * that gains published content stops being badged on its own. `course_count` is only
 * present for tracks; a course is judged on its lessons alone.
 */
export function isComingSoon(item: { course_count?: number; lesson_count: number }): boolean {
  return item.course_count === 0 || item.lesson_count === 0;
}
