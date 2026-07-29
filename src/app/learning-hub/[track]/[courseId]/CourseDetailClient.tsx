'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Clock, ExternalLink, ClipboardCheck } from 'lucide-react';
import LearningHubSidebar from '../../components/LearningHubSidebar';
import LearningHubLogo from '../../components/LearningHubLogo';
import LearningHubHero from '../../components/LearningHubHero';
import LearningHubHomeButton from '../../components/LearningHubHomeButton';
import { formatDuration } from '@/lib/learning-hub-utils';
import type { CourseDetailData } from '@/types/learning-hub';

export default function CourseDetailClient({ data }: { data: CourseDetailData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { track, course, modules, completed_count, lesson_count, progress_pct } = data;
  const color = track.color || '#307c4c';

  // First not-yet-completed lesson across the whole course, for a "Resume" CTA.
  const nextLesson = modules.flatMap((m) => m.lessons).find((l) => !l.completed);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <Link href={`/learning-hub/${track.key}`} className="text-sm font-medium text-slate-400 hover:text-slate-600">{track.name}</Link>
        <span className="text-slate-300">/</span>
        <span className="truncate text-sm font-semibold text-slate-900">{course.title}</span>
      </header>
      <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
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
            <span className="font-medium text-slate-500">{completed_count} / {lesson_count} lessons complete</span>
            <span className="font-semibold" style={{ color }}>{progress_pct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress_pct}%`, background: color }} />
          </div>
        </div>

        <div className="space-y-5">
          {modules.map((mod, modIdx) => (
            <div key={mod.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Module {modIdx + 1}</p>
                <h2 className="text-sm font-bold text-slate-900">{mod.title}</h2>
              </div>
              {mod.resource_label && mod.resource_url && (
                <a
                  href={mod.resource_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  style={{ background: `${color}0d` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
                    <ExternalLink className="h-4 w-4" style={{ color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>Module resource</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{mod.resource_label}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold" style={{ color }}>Open →</span>
                </a>
              )}
              <div className="divide-y divide-slate-100">
                {mod.lessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    href={`/learning-hub/${track.key}/${course.id}/${lesson.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    {lesson.completed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <span className={`flex-1 text-sm ${lesson.completed ? 'text-slate-500 line-through decoration-slate-300' : 'font-medium text-slate-800'}`}>
                      {lesson.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(lesson.duration_minutes)}
                    </span>
                  </Link>
                ))}
              </div>
              {mod.has_quiz && (
                <Link
                  href={`/learning-hub/${track.key}/${course.id}/quiz/${mod.id}`}
                  className="flex items-center gap-3 border-t border-slate-100 px-5 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <ClipboardCheck className="h-5 w-5 shrink-0" style={{ color }} />
                  <span className="flex-1 text-sm font-semibold" style={{ color }}>Knowledge check</span>
                  <span className="shrink-0 text-xs font-semibold" style={{ color }}>Take it →</span>
                </Link>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
