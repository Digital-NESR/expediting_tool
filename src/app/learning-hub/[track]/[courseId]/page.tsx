import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  ClipboardCheck,
  Lock,
  NotebookPen,
  Sparkles,
} from 'lucide-react';
import { getCourseDetail, getCourseTabTitle } from '@/lib/learning-hub-queries';
import LearningHubShell from '../../components/LearningHubShell';
import LearningHubHero from '../../components/LearningHubHero';
import { formatDuration } from '@/lib/learning-hub-utils';
import { DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';

type PageProps = { params: Promise<{ track: string; courseId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { track, courseId } = await params;
  const title = await getCourseTabTitle(track, Number(courseId));
  return { title: title ?? 'Course' };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { track: trackKey, courseId } = await params;
  const numericId = Number(courseId);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const data = await getCourseDetail(trackKey, numericId);
  if (!data) notFound();

  const {
    track,
    course,
    modules,
    completed_count,
    lesson_count,
    progress_pct,
    fully_complete,
    worksheet_count,
    worksheets_submitted,
  } = data;
  const color = track.color || DEFAULT_TRACK_COLOR;

  // First not-yet-completed lesson across the whole course, for a "Resume" CTA.
  const nextLesson = modules.flatMap((m) => m.lessons).find((l) => !l.completed);
  /* Finished means every lesson in it is finished — and for a lesson carrying a quiz, finished
     means the quiz was passed (see lessonProgressFlags). An empty course is not "complete". */
  const courseComplete = lesson_count > 0 && completed_count >= lesson_count;
  const firstLesson = modules.flatMap((m) => m.lessons)[0];
  // A course with a single module is shown as a flat lesson list, no "Module" header.
  const flat = modules.length === 1;

  return (
    <LearningHubShell
      backHref={`/learning-hub/${track.key}`}
      title={
        <>
          <Link
            href={`/learning-hub/${track.key}`}
            className="text-sm font-medium text-slate-400 hover:text-slate-600"
          >
            {track.name}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="truncate text-sm font-semibold text-slate-900">{course.title}</span>
        </>
      }
      mainClassName="max-w-[1000px] py-6"
    >
      <LearningHubHero
        title={course.title}
        subtitle={course.description ?? undefined}
        actions={
          nextLesson ? (
            <Link
              href={`/learning-hub/${track.key}/${course.id}/${nextLesson.id}`}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-white/90"
              style={{ color }}
            >
              {completed_count === 0 ? 'Start course' : 'Resume course'} →
            </Link>
          ) : courseComplete && firstLesson ? (
            /* A finished course used to show no action at all, which read as a dead end rather
               than as an achievement. It says so, and still offers the way back in. */
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/40">
                <CheckCircle2 className="h-4 w-4" /> Course complete
              </span>
              <Link
                href={`/learning-hub/${track.key}/${course.id}/${firstLesson.id}`}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-white/90"
                style={{ color }}
              >
                Review it →
              </Link>
            </div>
          ) : undefined
        }
      />

      <div
        className={`rounded-2xl border bg-white p-5 shadow-sm ${courseComplete ? 'border-emerald-200' : 'border-slate-200'}`}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">
            {completed_count} / {lesson_count} lessons complete
          </span>
          {fully_complete ? (
            /* The second tier. Worksheets are optional, so this is an upgrade on "Completed"
               rather than a bar anybody failed to clear. */
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              <Sparkles className="h-3.5 w-3.5" /> Fully complete
            </span>
          ) : courseComplete ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          ) : (
            <span className="font-semibold" style={{ color }}>
              {progress_pct}%
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress_pct}%`, background: courseComplete ? '#059669' : color }}
          />
        </div>
        {/* Only worth saying when there is something to say: a course with no worksheets has
            nothing to add, and one already fully complete has been told above. */}
        {worksheet_count > 0 && !fully_complete && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-slate-500">
            <NotebookPen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {courseComplete
              ? `Submit ${worksheet_count - worksheets_submitted === worksheet_count ? 'the' : 'the remaining'} ${worksheet_count - worksheets_submitted === 1 ? 'worksheet' : `${worksheet_count - worksheets_submitted} worksheets`} to earn full completion.`
              : `${worksheets_submitted} of ${worksheet_count} worksheets submitted. They are optional, and finishing them all earns full completion.`}
          </p>
        )}
      </div>

      {/* Learner-facing label note: a `learning_modules` row (level 3) is shown
          to learners as a "Track". The display hierarchy is Modules (tracks) ›
          Courses › Tracks (modules) › Lessons; DB table names are intentionally
          left as-is, so table `learning_tracks` is level 1 and `learning_modules`
          is level 3. The admin CMS still calls level 3 "Module" (matches the table). */}
      <div className="space-y-5">
        {modules.map((mod, modIdx) => (
          <div
            key={mod.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {!flat && (
              <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Track {modIdx + 1}
                </p>
                <h2 className="text-sm font-bold text-slate-900">{mod.title}</h2>
              </div>
            )}
            {mod.resource_label && mod.resource_url && (
              <a
                href={mod.resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 transition-colors hover:bg-slate-50"
                style={{ background: `${color}0d` }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${color}18` }}
                >
                  <ExternalLink className="h-4 w-4" style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color }}
                  >
                    Track resource
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {mod.resource_label}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold" style={{ color }}>
                  Open →
                </span>
              </a>
            )}
            <div className="divide-y divide-slate-100">
              {mod.lessons.map((lesson) => {
                const inner = (
                  <>
                    {lesson.locked ? (
                      <Lock className="h-5 w-5 shrink-0 text-slate-300" />
                    ) : lesson.completed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <span
                      className={`flex-1 text-sm ${lesson.locked ? 'text-slate-400' : lesson.completed ? 'text-slate-500 line-through decoration-slate-300' : 'font-medium text-slate-800'}`}
                    >
                      {lesson.title}
                    </span>
                    {lesson.has_quiz && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline-flex">
                        <ClipboardCheck className="h-3 w-3" /> Quiz
                      </span>
                    )}
                    {lesson.duration_minutes != null && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(lesson.duration_minutes)}
                      </span>
                    )}
                  </>
                );
                return lesson.locked ? (
                  <div
                    key={lesson.id}
                    className="flex cursor-not-allowed items-center gap-3 px-5 py-3.5 opacity-70"
                    title="Pass the previous quiz to unlock"
                  >
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={lesson.id}
                    href={`/learning-hub/${track.key}/${course.id}/${lesson.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
            {mod.worksheet && (
              <Link
                href={`/learning-hub/${track.key}/${course.id}/worksheet/${mod.id}`}
                className="flex items-center gap-3 border-t border-slate-100 bg-amber-50/40 px-5 py-3.5 transition-colors hover:bg-amber-50"
              >
                <NotebookPen className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    Worksheet
                    <span className="ml-2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ring-1 ring-inset ring-slate-200">
                      Optional
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    The case studies and tasks for this release, as a form.
                  </p>
                </div>
                {mod.worksheet.status === 'submitted' ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Submitted
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-amber-700">
                    {mod.worksheet.status === 'draft' ? 'Continue →' : 'Start →'}
                  </span>
                )}
              </Link>
            )}
            {mod.has_quiz && (
              <Link
                href={`/learning-hub/${track.key}/${course.id}/quiz/${mod.id}`}
                className="flex items-center gap-3 border-t border-slate-100 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <ClipboardCheck className="h-5 w-5 shrink-0" style={{ color }} />
                <span className="flex-1 text-sm font-semibold" style={{ color }}>
                  Knowledge check
                </span>
                <span className="shrink-0 text-xs font-semibold" style={{ color }}>
                  Take it →
                </span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </LearningHubShell>
  );
}
