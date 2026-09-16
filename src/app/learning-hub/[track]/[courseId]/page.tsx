import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, Clock, ExternalLink, ClipboardCheck, Lock } from 'lucide-react';
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

  const { track, course, modules, completed_count, lesson_count, progress_pct } = data;
  const color = track.color || DEFAULT_TRACK_COLOR;

  // First not-yet-completed lesson across the whole course, for a "Resume" CTA.
  const nextLesson = modules.flatMap((m) => m.lessons).find((l) => !l.completed);
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
          ) : undefined
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">
            {completed_count} / {lesson_count} lessons complete
          </span>
          <span className="font-semibold" style={{ color }}>
            {progress_pct}%
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress_pct}%`, background: color }}
          />
        </div>
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
