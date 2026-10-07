import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BookOpen, Check, CheckCircle2 } from 'lucide-react';
import { getTrackDetail, getTrackName } from '@/lib/learning-hub-queries';
import LearningHubShell from '../components/LearningHubShell';
import LearningHubHero from '../components/LearningHubHero';
import TrackIcon from '../components/TrackIcon';
import TrackGuide from '../components/TrackGuide';
import { isComingSoon, DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';
import { courseInPath, guideForTrack, roleByKey } from '@/lib/learning-hub-guide';
import { getLearnerRole } from '@/app/actions/learning-hub-role';

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
  /* Most modules have no guide; the one that does can curate its course list for whichever role
     the learner picked. The join between the two is the course title. */
  const guide = guideForTrack(track.key);
  const roleKey = guide ? await getLearnerRole(track.key) : null;
  const role = guide ? roleByKey(guide, roleKey) : null;

  /* Courses in the learner's path come first and keep their colour; the rest stay in the list,
     dimmed and labelled, because a role is a recommendation and not a gate. Sorting rather than
     filtering also means somebody who changes role sees the list rearrange rather than refill. */
  const curated = courses.map((course) => ({
    course,
    ...(guide
      ? courseInPath(guide, role, course.title)
      : { level: null, included: false, releases: null }),
  }));
  if (role) {
    curated.sort((a, b) => Number(b.included) - Number(a.included));
  }
  const inPathCount = curated.filter((c) => c.included).length;

  return (
    <LearningHubShell
      backHref="/learning-hub"
      title={<span className="text-sm font-semibold text-slate-900">{track.name}</span>}
      mainClassName="max-w-[1220px] py-6"
    >
      <LearningHubHero title={track.name} subtitle={track.description ?? undefined} />

      {guide && courses.length > 0 && (
        <TrackGuide guide={guide} trackKey={track.key} roleKey={roleKey} color={color} />
      )}

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">
            No published courses in this track yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {curated.map(({ course, included, releases }, idx) => {
            /* The first course outside the path gets a divider above it, so "yours" and "the rest"
               read as two groups rather than as one list that quietly changes tone. */
            const startsTheRest = role != null && !included && idx === inPathCount;
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
              <Fragment key={course.id}>
                {startsTheRest && (
                  <p className="col-span-full -mb-1 mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Beyond your path — available whenever you want them
                  </p>
                )}
                <Link
                  href={`/learning-hub/${track.key}/${course.id}`}
                  className={`group relative flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 ${
                    role && !included ? 'border-slate-200 opacity-65 hover:opacity-100' : 'border-slate-200'
                  }`}
                  style={included && role ? { borderColor: `${color}66` } : undefined}
                >
                <span
                  className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                  style={{ background: role && !included ? '#cbd5e1' : color }}
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
                  {role && (
                    <p className="mb-1.5">
                      {included ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                          style={{ background: color }}
                        >
                          <Check className="h-3 w-3" />
                          {releases
                            ? `${releases.length} of its releases`
                            : 'Yours — all of it'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Beyond your role
                        </span>
                      )}
                    </p>
                  )}
                  <h3 className="text-[15px] font-semibold text-slate-900">{course.title}</h3>
                  {course.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                      {course.description}
                    </p>
                  )}
                  {/* Naming the releases is the part a course list cannot otherwise show: "take
                      Level 2" is not advice, "take the sourcing release of Level 2" is. */}
                  {releases && releases.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {releases.map((r) => (
                        <li
                          key={r}
                          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600"
                        >
                          <Check className="h-3 w-3 shrink-0" style={{ color }} />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">
                      {course.completed_count} / {course.lesson_count} lessons
                    </span>
                    {/* A finished course is worth more than "100%": it gets the word and the
                        colour, so a learner can see at a glance which levels are behind them. */}
                    {course.lesson_count > 0 && course.completed_count >= course.lesson_count ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    ) : (
                      <span className="font-semibold" style={{ color }}>
                        {course.progress_pct}%
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${course.progress_pct}%`,
                        background:
                          course.lesson_count > 0 && course.completed_count >= course.lesson_count
                            ? '#059669'
                            : color,
                      }}
                    />
                  </div>
                </div>
                </Link>
              </Fragment>
            );
          })}
        </div>
      )}
    </LearningHubShell>
  );
}
