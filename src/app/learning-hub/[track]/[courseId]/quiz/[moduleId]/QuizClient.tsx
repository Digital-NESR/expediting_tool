'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ClipboardCheck, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import LearningHubSidebar from '../../../../components/LearningHubSidebar';
import LearningHubLogo from '../../../../components/LearningHubLogo';
import LearningHubHomeButton from '../../../../components/LearningHubHomeButton';
import { submitQuizAttempt } from '@/app/actions/learning-hub';
import type { ModuleQuizPageData, QuizAttemptResult } from '@/types/learning-hub';

export default function QuizClient({ data }: { data: ModuleQuizPageData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { track, course, module: mod, quiz } = data;
  const color = track.color || '#307c4c';

  const allAnswered = quiz.questions.every((q) => answers[q.id] != null);

  function selectOption(questionId: number, optionId: number) {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function submit() {
    startTransition(async () => {
      const res = await submitQuizAttempt(
        quiz.id,
        quiz.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] ?? null })),
      );
      setResult(res);
    });
  }

  function retake() {
    setAnswers({});
    setResult(null);
  }

  const resultByQuestion = new Map((result?.results ?? []).map((r) => [r.questionId, r]));

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
      <main className="mx-auto max-w-[720px] space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            <ClipboardCheck className="h-4 w-4" />
            <span>{mod.title}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{quiz.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result ? 'Here’s how you did — retake anytime, this doesn’t affect your progress.' : 'Answer every question, then submit to see your score.'}
          </p>

          <div className="mt-6 space-y-6">
            {quiz.questions.map((q, qIdx) => {
              const qResult = resultByQuestion.get(q.id);
              return (
                <div key={q.id}>
                  <p className="text-sm font-semibold text-slate-900">{qIdx + 1}. {q.question_text}</p>
                  <div className="mt-3 space-y-2">
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt.id;
                      const isCorrectOption = qResult?.correctOptionId === opt.id;
                      const isWrongSelected = Boolean(qResult) && selected && !qResult!.correct;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => selectOption(q.id, opt.id)}
                          disabled={Boolean(result)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                            result
                              ? isCorrectOption
                                ? 'border-green-200 bg-green-50 text-green-800'
                                : isWrongSelected
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-slate-200 text-slate-500'
                              : selected
                                ? 'border-[#307c4c] bg-[#307c4c]/5 text-slate-900'
                                : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {result ? (
                            isCorrectOption ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                              : isWrongSelected ? <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                              : <span className="h-4 w-4 shrink-0" />
                          ) : (
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[#307c4c]' : 'border-slate-300'}`}
                            >
                              {selected && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                            </span>
                          )}
                          <span className="flex-1">{opt.option_text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
            {result ? (
              <>
                <div className="text-sm font-semibold text-slate-900">
                  Score: <span style={{ color }}>{result.correctCount}/{result.total}</span> ({result.scorePct}%)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={retake}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" /> Retake
                  </button>
                  <Link
                    href={`/learning-hub/${track.key}/${course.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
                    style={{ background: color }}
                  >
                    Back to course
                  </Link>
                </div>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-400">{Object.keys(answers).length}/{quiz.questions.length} answered</span>
                <button
                  onClick={submit}
                  disabled={!allAnswered || isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ background: color }}
                >
                  {isPending ? 'Grading…' : 'Submit'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
