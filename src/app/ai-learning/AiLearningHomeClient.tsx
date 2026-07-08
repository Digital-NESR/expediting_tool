'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, CheckCircle2, Clock, GraduationCap, Cpu, Briefcase } from 'lucide-react';
import type { Track } from './content';
import { readProgress, type ProgressMap } from './progress';

function TrackIcon({ trackId, className }: { trackId: string; className?: string }) {
  return trackId === 'technical' ? <Cpu className={className} /> : <Briefcase className={className} />;
}

/* ─── A single module row inside a track ─────────────────────────────── */

function ModuleRow({
  href,
  part,
  title,
  tagline,
  minutes,
  accent,
  accentSoft,
  result,
  onOpen,
}: {
  href: string;
  part: number;
  title: string;
  tagline: string;
  minutes: number;
  accent: string;
  accentSoft: string;
  result?: { score: number; total: number };
  onOpen: (href: string) => void;
}) {
  const done = !!result;
  return (
    <button
      onClick={() => onOpen(href)}
      className="group w-full text-left flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 hover:shadow-md"
      style={{ ['--accent' as string]: accent }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
        style={{ background: accentSoft, color: accent }}
      >
        {part}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-[15px] font-semibold text-slate-900 truncate">{title}</h4>
        <p className="text-[13px] text-slate-500 mt-0.5 line-clamp-1">{tagline}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {done ? (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: accentSoft, color: accent }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {result!.score}/{result!.total}
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {minutes} min
          </span>
        )}
        <ArrowRight
          className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform"
          style={{ color: done ? accent : undefined }}
        />
      </div>
    </button>
  );
}

/* ─── A track column ─────────────────────────────────────────────────── */

function TrackCard({
  track,
  progress,
  onOpen,
}: {
  track: Track;
  progress: ProgressMap;
  onOpen: (href: string) => void;
}) {
  const completed = track.modules.filter(m => progress[m.id]).length;
  const total = track.modules.length;

  return (
    <section className="flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Track header */}
      <div className="p-6 border-b border-gray-100" style={{ background: track.accentSoft }}>
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#ffffff', color: track.accent, border: `1px solid ${track.accent}22` }}
          >
            <TrackIcon trackId={track.id} className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p
              className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: track.accent }}
            >
              {track.eyebrow}
            </p>
            <h2 className="text-xl font-bold text-slate-900 leading-tight mt-1">{track.title}</h2>
          </div>
        </div>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{track.subtitle}</p>

        {/* progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1.5">
            <span>
              {completed} of {total} parts complete
            </span>
            <span>{Math.round((completed / total) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/70 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%`, background: track.accent }}
            />
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="p-4 flex flex-col gap-3">
        {track.modules.map(m => (
          <ModuleRow
            key={m.id}
            href={`/ai-learning/${m.id}`}
            part={m.part}
            title={m.title}
            tagline={m.tagline}
            minutes={m.minutes}
            accent={track.accent}
            accentSoft={track.accentSoft}
            result={progress[m.id]}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function AiLearningHomeClient({
  tracks,
  totalModules,
}: {
  tracks: Track[];
  totalModules: number;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    setProgress(readProgress());
  }, []);

  const completedCount = Object.keys(progress).length;

  function open(href: string) {
    router.push(href);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-slate-900">
      {/* Hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 pt-12 pb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f0f9f4] border border-[#b6ddc8] mb-5">
            <GraduationCap className="w-4 h-4 text-[#307c4c]" />
            <span className="text-[11px] font-semibold tracking-widest uppercase text-[#307c4c]">
              AI Learning Series
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            Learn AI — for business and for building.
          </h1>
          <p className="text-lg text-slate-500 mt-3 max-w-2xl leading-relaxed">
            Two beginner tracks, three short parts each. Read the material, then take a quick quiz
            after every part to check what stuck.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
              <BookOpen className="w-4 h-4 text-slate-400" />
              {totalModules} parts · 6 quizzes
            </span>
            {completedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#307c4c]">
                <CheckCircle2 className="w-4 h-4" />
                {completedCount} of {totalModules} completed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tracks */}
      <main className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-10">
          <div className="grid md:grid-cols-2 gap-6 items-start">
            {tracks.map(track => (
              <TrackCard key={track.id} track={track} progress={progress} onOpen={open} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
