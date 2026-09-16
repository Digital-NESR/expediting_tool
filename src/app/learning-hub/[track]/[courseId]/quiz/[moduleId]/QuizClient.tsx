'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ClipboardCheck, RotateCcw } from 'lucide-react';
import LearningHubShell from '../../../../components/LearningHubShell';
import QuizOptionButton, { type QuizOptionState } from '../../../../components/QuizOptionButton';
import { submitQuizAttempt } from '@/app/actions/learning-hub';
import type { ModuleQuizPageData, QuizAttemptResult } from '@/types/learning-hub';
import { DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';

export default function QuizClient({ data }: { data: ModuleQuizPageData }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { track, course, module: mod, quiz } = data;
  const color = track.color || DEFAULT_TRACK_COLOR;

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
    <LearningHubShell
      backHref={`/learning-hub/${track.key}/${course.id}`}
      title={
        <Link
          href={`/learning-hub/${track.key}/${course.id}`}
          className="truncate text-sm font-medium text-slate-400 hover:text-slate-600"
        >
          {course.title}
        </Link>
      }
      mainClassName="max-w-[720px] py-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div
          className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          <ClipboardCheck className="h-4 w-4" />
          <span>{mod.title}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{quiz.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {result
            ? 'Here’s how you did, retake anytime, this doesn’t affect your progress.'
            : 'Answer every question, then submit to see your score.'}
        </p>

        <div className="mt-6 space-y-6">
          {quiz.questions.map((q, qIdx) => {
            const qResult = resultByQuestion.get(q.id);
            return (
              <div key={q.id}>
                <p className="text-sm font-semibold text-slate-900">
                  {qIdx + 1}. {q.question_text}
                </p>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt.id;
                    const isCorrectOption = qResult?.correctOptionId === opt.id;
                    const isWrongSelected = Boolean(qResult) && selected && !qResult!.correct;
                    // A module check is feedback-only, so it always shows the right answer.
                    let state: QuizOptionState = 'idle';
                    if (result)
                      state = isCorrectOption
                        ? 'correct'
                        : isWrongSelected
                          ? 'incorrect'
                          : 'graded';
                    else if (selected) state = 'selected';
                    return (
                      <QuizOptionButton
                        key={opt.id}
                        variant="module"
                        state={state}
                        chosen={selected}
                        label={opt.option_text}
                        accentColor={color}
                        disabled={Boolean(result)}
                        onClick={() => selectOption(q.id, opt.id)}
                      />
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
                Score:{' '}
                <span style={{ color }}>
                  {result.correctCount}/{result.total}
                </span>{' '}
                ({result.scorePct}%)
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
              <span className="text-xs text-slate-400">
                {Object.keys(answers).length}/{quiz.questions.length} answered
              </span>
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
    </LearningHubShell>
  );
}
