import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, ArrowRight, Sparkles } from 'lucide-react';
import { getLearningHubDashboardData } from '@/lib/learning-hub-queries';
import LearningHubShell from './components/LearningHubShell';
import LearningHubHero from './components/LearningHubHero';
import RedBullCanImage from './components/RedBullCanImage';
import TrackIcon from './components/TrackIcon';
import { isComingSoon, DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';
import type { LearningHubDashboardData } from '@/types/learning-hub';

export const metadata: Metadata = { title: 'Learning Hub' };

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function TrackCard({ track }: { track: LearningHubDashboardData['tracks'][number] }) {
  const color = track.color || DEFAULT_TRACK_COLOR;
  // Badged from the track's own published content, not from a list of keys.
  const comingSoon = isComingSoon(track);
  return (
    <Link
      href={`/learning-hub/${track.key}`}
      className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18` }}
        >
          <TrackIcon icon={track.icon} className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-slate-900">{track.name}</h3>
            {comingSoon && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Coming Soon
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {track.course_count} course{track.course_count === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      {track.description && (
        <p className="text-sm leading-relaxed text-slate-500">{track.description}</p>
      )}
      <div className="mt-auto space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">
            {track.completed_count} / {track.lesson_count} lessons
          </span>
          <span className="font-semibold" style={{ color }}>
            {track.progress_pct}%
          </span>
        </div>
        <ProgressBar pct={track.progress_pct} color={color} />
      </div>
    </Link>
  );
}

function RedBullGameCard() {
  const color = '#12276e';
  return (
    <Link
      href="/learning-hub/red-bull-game"
      className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18` }}
        >
          <RedBullCanImage />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">Red Bull Game</h3>
          <p className="text-xs text-slate-400">Supply chain simulator</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-slate-500">
        A hands-on distribution game: manage inventory and orders across a four-stage supply chain
        and watch the bullwhip effect play out.
      </p>
      <div className="mt-auto flex items-center justify-between text-xs">
        <span className="font-medium text-slate-500">Interactive simulator</span>
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color }}>
          Play{' '}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function AIVerseCard() {
  const color = '#7c3aed';
  return (
    <a
      href="https://aiverse.nesr.com"
      className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18` }}
        >
          <Sparkles className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">AI Verse</h3>
          <p className="text-xs text-slate-400">General AI knowledge</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-slate-500">
        Build general AI skills across multiple tracks, from beginner to intermediate to expert.
      </p>
      <div className="mt-auto flex items-center justify-between text-xs">
        <span className="font-medium text-slate-500">Opens aiverse.nesr.com</span>
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color }}>
          Open{' '}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </a>
  );
}

export default async function LearningHubDashboardPage() {
  const data = await getLearningHubDashboardData();
  const overallPct =
    data.totalLessons > 0 ? Math.round((data.totalCompleted / data.totalLessons) * 100) : 0;

  return (
    <LearningHubShell
      title={<span className="text-sm font-semibold text-slate-900">Learning Hub Dashboard</span>}
      mainClassName="max-w-[1220px] py-6"
    >
      <LearningHubHero
        title="Learning Hub"
        subtitle="Build your NESR supply chain knowledge across SAP, General Supply Chain fundamentals, and NESR-specific practice, at your own pace."
        badge={
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            Under Development
          </span>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 sm:col-span-2 xl:col-span-1">
          <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Overall Progress
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{overallPct}%</p>
          <p className="mt-1 text-sm text-slate-500">
            {data.totalCompleted} of {data.totalLessons} lessons completed
          </p>
        </div>

        {data.continueLesson ? (
          <Link
            href={`/learning-hub/${data.continueLesson.track_key}/${data.continueLesson.course_id}/${data.continueLesson.lesson_id}`}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 sm:col-span-2 xl:col-span-2"
          >
            <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Continue Learning
                </p>
                <p className="mt-2 truncate text-lg font-bold text-slate-900">
                  {data.continueLesson.lesson_title}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.continueLesson.track_name} · {data.continueLesson.course_title}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#307c4c] transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
          </Link>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-2">
            <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#307c4c]">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">You&apos;re all caught up</p>
                <p className="text-sm text-slate-500">
                  Every published lesson across all modules is complete.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Modules</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* General Supply Chain first, then the interactive/AI modules, then the remaining tracks. */}
          {data.tracks.slice(0, 1).map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
          <RedBullGameCard />
          <AIVerseCard />
          {data.tracks.slice(1).map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </div>
      </section>
    </LearningHubShell>
  );
}
