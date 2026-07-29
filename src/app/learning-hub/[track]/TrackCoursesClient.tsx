'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import LearningHubSidebar from '../components/LearningHubSidebar';
import LearningHubLogo from '../components/LearningHubLogo';
import LearningHubHero from '../components/LearningHubHero';
import LearningHubHomeButton from '../components/LearningHubHomeButton';
import TrackIcon from '../components/TrackIcon';
import type { TrackDetailData } from '@/types/learning-hub';

export default function TrackCoursesClient({ data }: { data: TrackDetailData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { track, courses } = data;
  const color = track.color || '#307c4c';

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">{track.name}</span>
      </header>
      <main className="mx-auto max-w-[1220px] space-y-6 px-4 py-6 sm:px-6">
        <LearningHubHero title={track.name} subtitle={track.description ?? undefined} />

        {courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No published courses in this track yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/learning-hub/${track.key}/${course.id}`}
                className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: color }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                    <TrackIcon icon={track.icon} className="h-5 w-5" style={{ color }} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">{course.title}</h3>
                  {course.description && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{course.description}</p>}
                </div>
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">{course.completed_count} / {course.lesson_count} lessons</span>
                    <span className="font-semibold" style={{ color }}>{course.progress_pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full transition-all" style={{ width: `${course.progress_pct}%`, background: color }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
