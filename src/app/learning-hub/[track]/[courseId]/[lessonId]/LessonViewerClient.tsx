'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, ArrowLeft, ArrowRight } from 'lucide-react';
import LearningHubSidebar from '../../../components/LearningHubSidebar';
import LearningHubLogo from '../../../components/LearningHubLogo';
import LearningHubHomeButton from '../../../components/LearningHubHomeButton';
import { markLessonComplete, markLessonIncomplete } from '@/app/actions/learning-hub';
import { formatDuration } from '@/lib/learning-hub-utils';
import type { LessonDetailData } from '@/types/learning-hub';

// Renders `[label](url)` markdown-style links inline within otherwise-plain lesson text,
// so lessons can reference external resources (videos, SharePoint pages) as real links.
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderLessonParagraph(text: string, color: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  MARKDOWN_LINK.lastIndex = 0;
  while ((match = MARKDOWN_LINK.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2" style={{ color }}>
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Mirrors the house pattern from ProcureGuardHelpContent: a SharePoint/Stream embed URL
// (https://...) renders in an <iframe> (SharePoint streams it, no load on this app); a local
// file under /public/learning-hub/ renders in a native <video> tag.
function LessonVideo({ videoUrl, title }: { videoUrl: string; title: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      {videoUrl.startsWith('http') ? (
        <iframe
          key={videoUrl}
          src={videoUrl}
          frameBorder="0"
          scrolling="no"
          allowFullScreen
          title={`Lesson video — ${title}`}
          className="h-full w-full"
        />
      ) : (
        <video key={videoUrl} controls preload="metadata" className="h-full w-full object-contain">
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support embedded video. <a href={videoUrl}>Download the video</a> instead.
        </video>
      )}
    </div>
  );
}

export default function LessonViewerClient({ data, userEmail }: { data: LessonDetailData; userEmail: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [completed, setCompleted] = useState(data.completed);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { track, course, lesson, prev, next } = data;
  const color = track.color || '#307c4c';

  function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    startTransition(async () => {
      if (next) await markLessonComplete(lesson.id, userEmail);
      else await markLessonIncomplete(lesson.id, userEmail);
      router.refresh();
    });
  }

  function goNext() {
    if (!completed) {
      setCompleted(true);
      startTransition(async () => {
        await markLessonComplete(lesson.id, userEmail);
        router.refresh();
      });
    }
  }

  const paragraphs = lesson.body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <Link href={`/learning-hub/${track.key}/${course.id}`} className="truncate text-sm font-medium text-slate-400 hover:text-slate-600">
          {course.title}
        </Link>
      </header>
      <main className="mx-auto max-w-[820px] space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            <span>{track.name}</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-slate-400"><Clock className="h-3.5 w-3.5" />{formatDuration(lesson.duration_minutes)}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{lesson.title}</h1>

          {lesson.video_url && (
            <div className="mt-5">
              <LessonVideo videoUrl={lesson.video_url} title={lesson.title} />
            </div>
          )}

          <div className="mt-6 space-y-4">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-slate-700">{renderLessonParagraph(p, color)}</p>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={toggleComplete}
              disabled={isPending}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 ${
                completed ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'text-white hover:opacity-90'
              }`}
              style={completed ? undefined : { background: color }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completed ? 'Completed — mark as not done' : 'Mark as complete'}
            </button>

            <div className="flex items-center gap-2">
              {prev && (
                <Link
                  href={`/learning-hub/${track.key}/${prev.course_id}/${prev.lesson_id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Prev
                </Link>
              )}
              {next ? (
                <Link
                  href={`/learning-hub/${track.key}/${next.course_id}/${next.lesson_id}`}
                  onClick={goNext}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
                  style={{ background: color }}
                >
                  Next <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href={`/learning-hub/${track.key}/${course.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
                  style={{ background: color }}
                >
                  Back to course
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
