'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, ArrowLeft, ArrowRight, Lock, ClipboardCheck, RotateCcw } from 'lucide-react';
import LearningHubSidebar from '../../../components/LearningHubSidebar';
import LearningHubLogo from '../../../components/LearningHubLogo';
import LearningHubHomeButton from '../../../components/LearningHubHomeButton';
import { markLessonComplete, markLessonIncomplete, submitLessonQuiz } from '@/app/actions/learning-hub';
import { formatDuration } from '@/lib/learning-hub-utils';
import type { LessonDetailData, LessonQuiz, LessonQuizAttemptResult, QuizAnswerInput } from '@/types/learning-hub';

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

function LessonVideo({ videoUrl, title }: { videoUrl: string; title: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      {videoUrl.startsWith('http') ? (
        <iframe key={videoUrl} src={videoUrl} frameBorder="0" scrolling="no" allowFullScreen title={`Lesson video — ${title}`} className="h-full w-full" />
      ) : (
        <video key={videoUrl} controls preload="metadata" className="h-full w-full object-contain">
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support embedded video. <a href={videoUrl}>Download the video</a> instead.
        </video>
      )}
    </div>
  );
}

function Shell({ track, course, children }: { track: LessonDetailData['track']; course: LessonDetailData['course']; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <Link href={`/learning-hub/${track.key}/${course.id}`} className="truncate text-sm font-medium text-slate-400 hover:text-slate-600">{course.title}</Link>
      </header>
      <main className="mx-auto max-w-[820px] space-y-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

/* ── Inline knowledge check ──────────────────────────────────────────── */
function QuizBlock({
  quiz, initiallyPassed, color, onPassed,
}: {
  quiz: LessonQuiz; initiallyPassed: boolean; color: string; onPassed: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<LessonQuizAttemptResult | null>(null);
  const [submitting, startSubmit] = useTransition();

  const allAnswered = quiz.questions.every((q) => answers[q.id] != null);
  const passed = result ? result.passed : initiallyPassed;

  const correctByQ = new Map<number, number>();
  const selectedByQ = new Map<number, number | null>();
  if (result) for (const r of result.results) { correctByQ.set(r.questionId, r.correctOptionId); selectedByQ.set(r.questionId, r.selectedOptionId); }

  function submit() {
    startSubmit(async () => {
      const payload: QuizAnswerInput[] = quiz.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] ?? null }));
      const r = await submitLessonQuiz(quiz.id, payload);
      setResult(r);
      if (r?.passed) onPassed();
    });
  }
  function retake() { setAnswers({}); setResult(null); }

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border-2" style={{ borderColor: `${color}66` }}>
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ background: `${color}0d`, borderColor: `${color}22` }}>
        <ClipboardCheck className="h-5 w-5" style={{ color }} />
        <div>
          <p className="text-sm font-bold text-slate-900">Knowledge check</p>
          <p className="text-xs text-slate-500">Score {quiz.pass_pct}% or higher to unlock the next video.</p>
        </div>
      </div>

      <div className="p-5">
        {passed && !result && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> You&apos;ve passed this quiz. You can retake it to review.
          </div>
        )}
        {result && (
          <div className={`mb-4 rounded-lg px-3.5 py-2.5 text-sm font-semibold ${result.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {result.passed
              ? `Passed — ${result.correctCount}/${result.total} correct (${result.scorePct}%). The next video is unlocked.`
              : `${result.correctCount}/${result.total} correct (${result.scorePct}%). You need ${result.pass_pct}% — review the answers below, rewatch the video, and try again.`}
          </div>
        )}

        <div className="space-y-5">
          {quiz.questions.map((q, qi) => (
            <div key={q.id}>
              <p className="text-[15px] font-semibold text-slate-900">{qi + 1}. {q.text}</p>
              <div className="mt-2.5 space-y-2">
                {q.options.map((o) => {
                  const chosen = result ? selectedByQ.get(q.id) === o.id : answers[q.id] === o.id;
                  const isCorrect = result != null && correctByQ.get(q.id) === o.id;
                  const isWrongChosen = result != null && chosen && !isCorrect;
                  let cls = 'border-slate-200 bg-white hover:bg-slate-50';
                  if (result) {
                    if (isCorrect) cls = 'border-emerald-300 bg-emerald-50';
                    else if (isWrongChosen) cls = 'border-red-300 bg-red-50';
                    else cls = 'border-slate-200 bg-white';
                  } else if (chosen) {
                    cls = 'bg-white';
                  }
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={result != null || submitting}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${cls}`}
                      style={!result && chosen ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${chosen ? '' : 'border-slate-300'}`} style={chosen && !result ? { borderColor: color, background: color } : undefined}>
                        {chosen && !result && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="flex-1 text-slate-700">{o.text}</span>
                      {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                      {isWrongChosen && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          {!result ? (
            <button
              type="button"
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: color }}
            >
              {submitting ? 'Checking…' : 'Submit answers'}
            </button>
          ) : (
            <button
              type="button"
              onClick={retake}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> {result.passed ? 'Retake quiz' : 'Try again'}
            </button>
          )}
          {!result && !allAnswered && <span className="text-xs text-slate-400">Answer all {quiz.questions.length} questions to submit.</span>}
        </div>
      </div>
    </div>
  );
}

export default function LessonViewerClient({ data, userEmail }: { data: LessonDetailData; userEmail: string }) {
  const [completed, setCompleted] = useState(data.completed);
  const [passed, setPassed] = useState(data.quiz_passed);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { track, course, lesson, prev, next, quiz } = data;
  const color = track.color || '#307c4c';
  const hasQuiz = !!quiz;
  const canProceed = hasQuiz ? passed : true;

  function toggleComplete() {
    const nextVal = !completed;
    setCompleted(nextVal);
    startTransition(async () => {
      if (nextVal) await markLessonComplete(lesson.id, userEmail);
      else await markLessonIncomplete(lesson.id, userEmail);
      router.refresh();
    });
  }
  function goNext() {
    if (!hasQuiz && !completed) {
      setCompleted(true);
      startTransition(async () => { await markLessonComplete(lesson.id, userEmail); router.refresh(); });
    }
  }
  function onPassed() { setPassed(true); router.refresh(); }

  // ── Locked lesson: an earlier quiz hasn't been passed ──
  if (data.locked) {
    return (
      <Shell track={track} course={course}>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Lock className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">This lesson is locked</h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
            Pass the knowledge check on the previous video (score at least {data.pass_pct}%) to unlock it.
          </p>
          <Link href={`/learning-hub/${track.key}/${course.id}`} className="mt-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90" style={{ background: color }}>
            <ArrowLeft className="h-4 w-4" /> Back to course
          </Link>
        </div>
      </Shell>
    );
  }

  const paragraphs = lesson.body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <Shell track={track} course={course}>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          <span>{track.name}</span>
          {lesson.duration_minutes != null && (
            <>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1 text-slate-400"><Clock className="h-3.5 w-3.5" />{formatDuration(lesson.duration_minutes)}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{lesson.title}</h1>

        {lesson.video_url && (
          <div className="mt-5"><LessonVideo videoUrl={lesson.video_url} title={lesson.title} /></div>
        )}

        <div className="mt-6 space-y-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-slate-700">{renderLessonParagraph(p, color)}</p>
          ))}
        </div>

        {quiz && <QuizBlock quiz={quiz} initiallyPassed={passed} color={color} onPassed={onPassed} />}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
          {hasQuiz ? (
            <span className={`inline-flex items-center gap-2 text-sm font-semibold ${passed ? 'text-emerald-600' : 'text-slate-400'}`}>
              {passed ? <><CheckCircle2 className="h-4 w-4" /> Quiz passed</> : <><Lock className="h-4 w-4" /> Pass the quiz to continue</>}
            </span>
          ) : (
            <button
              type="button"
              onClick={toggleComplete}
              disabled={isPending}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 ${completed ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'text-white hover:opacity-90'}`}
              style={completed ? undefined : { background: color }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completed ? 'Completed — mark as not done' : 'Mark as complete'}
            </button>
          )}

          <div className="flex items-center gap-2">
            {prev && (
              <Link href={`/learning-hub/${track.key}/${prev.course_id}/${prev.lesson_id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" /> Prev
              </Link>
            )}
            {next ? (
              canProceed ? (
                <Link href={`/learning-hub/${track.key}/${next.course_id}/${next.lesson_id}`} onClick={goNext} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90" style={{ background: color }}>
                  Next <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400" title="Pass the quiz to continue">
                  <Lock className="h-3.5 w-3.5" /> Next
                </span>
              )
            ) : (
              <Link href={`/learning-hub/${track.key}/${course.id}`} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90" style={{ background: color }}>
                Back to course
              </Link>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
