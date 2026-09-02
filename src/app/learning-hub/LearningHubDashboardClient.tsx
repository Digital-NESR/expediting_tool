'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowRight } from 'lucide-react';
import LearningHubSidebar from './components/LearningHubSidebar';
import LearningHubLogo from './components/LearningHubLogo';
import LearningHubHero from './components/LearningHubHero';
import LearningHubHomeButton from './components/LearningHubHomeButton';
import TrackIcon from './components/TrackIcon';
import type { LearningHubDashboardData } from '@/types/learning-hub';

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TrackCard({ track }: { track: LearningHubDashboardData['tracks'][number] }) {
  const color = track.color || '#307c4c';
  return (
    <Link
      href={`/learning-hub/${track.key}`}
      className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
          <TrackIcon icon={track.icon} className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{track.name}</h3>
          <p className="text-xs text-slate-400">{track.course_count} course{track.course_count === 1 ? '' : 's'}</p>
        </div>
      </div>
      {track.description && <p className="text-sm leading-relaxed text-slate-500">{track.description}</p>}
      <div className="mt-auto space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">{track.completed_count} / {track.lesson_count} lessons</span>
          <span className="font-semibold" style={{ color }}>{track.progress_pct}%</span>
        </div>
        <ProgressBar pct={track.progress_pct} color={color} />
      </div>
    </Link>
  );
}

export default function LearningHubDashboardClient({ data }: { data: LearningHubDashboardData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const overallPct = data.totalLessons > 0 ? Math.round((data.totalCompleted / data.totalLessons) * 100) : 0;

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">Learning Hub Dashboard</span>
      </header>
      <main className="mx-auto max-w-[1220px] space-y-6 px-4 py-6 sm:px-6">
        <LearningHubHero
          title="Learning Hub"
          subtitle="Build your NESR supply chain knowledge across SAP, general Supply Chain fundamentals, and NESR-specific practice — at your own pace."
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 sm:col-span-2 xl:col-span-1">
            <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Overall Progress</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{overallPct}%</p>
            <p className="mt-1 text-sm text-slate-500">{data.totalCompleted} of {data.totalLessons} lessons completed</p>
          </div>

          {data.continueLesson ? (
            <Link
              href={`/learning-hub/${data.continueLesson.track_key}/${data.continueLesson.course_id}/${data.continueLesson.lesson_id}`}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 sm:col-span-2 xl:col-span-2"
            >
              <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Continue Learning</p>
                  <p className="mt-2 truncate text-lg font-bold text-slate-900">{data.continueLesson.lesson_title}</p>
                  <p className="mt-1 text-sm text-slate-500">{data.continueLesson.track_name} · {data.continueLesson.course_title}</p>
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
                  <p className="text-sm text-slate-500">Every published lesson across all tracks is complete.</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <Link
            href="/learning-hub/red-bull-game"
            className="group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-white/10 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-300/50 sm:p-6"
            style={{ background: 'linear-gradient(110deg,#0a1a4f 0%,#0a1a4f 52%,#12276e 100%)' }}
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-[#DB0007]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-[#DB0007] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">New</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Supply Chain Simulator</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">Red Bull Distribution Game</h3>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/70">
                Run one stage of a four-stage supply chain, weather the demand swings, and watch the bullwhip effect build in real time. Outsmart the AI and climb the leaderboard.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0a1a4f] transition-transform group-hover:translate-x-0.5">
                Play now <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/red-bull-can.png"
              alt=""
              className="h-28 w-auto shrink-0 self-center object-contain drop-shadow-2xl sm:h-40"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Tracks</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.tracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
