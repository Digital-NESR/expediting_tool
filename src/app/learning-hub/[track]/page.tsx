import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BookOpen } from 'lucide-react';
import { getTrackDetail, getTrackName } from '@/lib/learning-hub-queries';
import LearningHubShell from '../components/LearningHubShell';
import LearningHubHero from '../components/LearningHubHero';
import TrackIcon from '../components/TrackIcon';
import { isComingSoon, DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';

type PageProps = { params: Promise<{ track: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { track } = await params;
  const name = await getTrackName(track);
  return { title: name ?? track.replace(/_/g, ' ') };
}

export default async function TrackPage({ params }: PageProps) {
  const { track: trackKey } = await params;
  const data = await getTrackDetail(trackKey);
  if (!data) notFound();

  const { track, courses } = data;
  const color = track.color || DEFAULT_TRACK_COLOR;

  return (
    <LearningHubShell
      backHref="/learning-hub"
      title={<span className="text-sm font-semibold text-slate-900">{track.name}</span>}
      mainClassName="max-w-[1220px] py-6"
    >
      <LearningHubHero title={track.name} subtitle={track.description ?? undefined} />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">
            No published courses in this track yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((course) => {
            // A course with no lessons yet is shown greyed with a "Coming Soon" pill
            // and is not clickable (nothing to open).
            if (isComingSoon(course)) {
              return (
                <div
                  key={course.id}
                  className="relative flex cursor-default select-none flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 opacity-70 shadow-sm"
                >
                  <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-slate-200" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                      <TrackIcon icon={track.icon} className="h-5 w-5 text-slate-400" />
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                      Coming Soon
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-500">{course.title}</h3>
                    {course.description && (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                        {course.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={course.id}
                href={`/learning-hub/${track.key}/${course.id}`}
                className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <span
                  className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                  style={{ background: color }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${color}18` }}
                  >
                    <TrackIcon icon={track.icon} className="h-5 w-5" style={{ color }} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">{course.title}</h3>
                  {course.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                      {course.description}
                    </p>
                  )}
                </div>
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">
                      {course.completed_count} / {course.lesson_count} lessons
                    </span>
                    <span className="font-semibold" style={{ color }}>
                      {course.progress_pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${course.progress_pct}%`, background: color }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </LearningHubShell>
  );
}
