'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  CheckCircle2,
  RotateCcw,
  Lightbulb,
  ClipboardCheck,
} from 'lucide-react';
import AiLearningHeader from '../components/AiLearningHeader';
import type { ContentBlock, Module, Track } from '../content';
import { saveModuleResult } from '../progress';

/* ══════════════════════════════════════════════════════════════════════
   Lesson content rendering
   ══════════════════════════════════════════════════════════════════════ */

function SectionHeading({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="w-1.5 h-5 rounded-full" style={{ background: accent }} />
      <h3 className="text-lg font-bold text-slate-900">{children}</h3>
    </div>
  );
}

function Block({ block, accent, accentSoft }: { block: ContentBlock; accent: string; accentSoft: string }) {
  switch (block.kind) {
    case 'lead':
      return (
        <div className="rounded-2xl p-6" style={{ background: accentSoft }}>
          <p className="text-xl font-bold text-slate-900 leading-snug" style={{ color: accent }}>
            {block.text}
          </p>
          <p className="text-[15px] text-slate-700 mt-3 leading-relaxed">{block.body}</p>
        </div>
      );

    case 'cards':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {block.cards.map(c => (
              <div key={c.title} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="font-semibold text-slate-900" style={{ color: accent }}>
                  {c.title}
                </p>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case 'compare':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <div className="grid sm:grid-cols-2 gap-4">
            {[block.left, block.right].map((col, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="font-semibold text-slate-900 mb-3">{col.title}</p>
                <ul className="flex flex-col gap-2">
                  {col.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                        style={{ background: accent }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );

    case 'steps':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <div className="flex flex-col gap-3">
            {block.steps.map((s, i) => (
              <div
                key={s.title}
                className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{ background: accentSoft, color: accent }}
                >
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-[15px]">{s.title}</p>
                  {s.body && <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">{s.body}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'flow':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          {block.body && <p className="text-[15px] text-slate-700 leading-relaxed mb-4">{block.body}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {block.nodes.map((node, i) => (
              <div key={node} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium border"
                  style={{ background: accentSoft, color: accent, borderColor: `${accent}33` }}
                >
                  {node}
                </span>
                {i < block.nodes.length - 1 && (
                  <ArrowRight className="w-4 h-4 shrink-0" style={{ color: accent }} />
                )}
              </div>
            ))}
          </div>
        </div>
      );

    case 'glossary':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <dl className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {block.terms.map(t => (
              <div key={t.term} className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-4 p-4">
                <dt className="font-semibold text-slate-900" style={{ color: accent }}>
                  {t.term}
                </dt>
                <dd className="text-sm text-slate-600 leading-relaxed">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case 'list':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <div className="flex flex-col gap-3">
            {block.items.map(item => (
              <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-slate-900 text-[15px]">{item.title}</p>
                <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case 'checklist':
      return (
        <div>
          {block.heading && <SectionHeading accent={accent}>{block.heading}</SectionHeading>}
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {block.items.map(item => (
              <li key={item} className="flex items-start gap-3 p-4">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
                <span className="text-sm text-slate-700 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Quiz
   ══════════════════════════════════════════════════════════════════════ */

function Quiz({
  module,
  accent,
  accentSoft,
  onComplete,
}: {
  module: Module;
  accent: string;
  accentSoft: string;
  onComplete: (score: number, total: number) => void;
}) {
  const total = module.quiz.length;
  const [answers, setAnswers] = useState<(number | null)[]>(() => module.quiz.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = answers.every(a => a !== null);
  const score = useMemo(
    () => module.quiz.reduce((n, q, i) => (answers[i] === q.answer ? n + 1 : n), 0),
    [answers, module.quiz],
  );

  function select(qi: number, oi: number) {
    if (submitted) return;
    setAnswers(prev => {
      const next = [...prev];
      next[qi] = oi;
      return next;
    });
  }

  function submit() {
    if (!allAnswered) return;
    setSubmitted(true);
    onComplete(score, total);
    // reveal results at the top of the quiz
    if (typeof document !== 'undefined') {
      document.getElementById('quiz-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function retake() {
    setAnswers(module.quiz.map(() => null));
    setSubmitted(false);
    if (typeof document !== 'undefined') {
      document.getElementById('quiz-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const passed = score === total;

  return (
    <section id="quiz-top" className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-1">
        <ClipboardCheck className="w-5 h-5" style={{ color: accent }} />
        <h2 className="text-xl font-bold text-slate-900">Quick quiz</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {total} questions. Answer each, then submit to see how you did.
      </p>

      {submitted && (
        <div
          className="rounded-2xl border p-5 mb-6 flex items-center gap-4"
          style={{
            background: passed ? accentSoft : '#fffbeb',
            borderColor: passed ? `${accent}44` : '#fde68a',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
            style={{ background: passed ? accent : '#d97706' }}
          >
            {score}/{total}
          </div>
          <div>
            <p className="font-bold text-slate-900">
              {passed ? 'Perfect score!' : score >= Math.ceil(total / 2) ? 'Nice work!' : 'Good try!'}
            </p>
            <p className="text-sm text-slate-600">
              {passed
                ? 'You nailed every question in this part.'
                : 'Review the explanations below, then retake to lock it in.'}
            </p>
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-6">
        {module.quiz.map((q, qi) => {
          const chosen = answers[qi];
          return (
            <li key={qi} className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="font-semibold text-slate-900 flex gap-2">
                <span style={{ color: accent }}>{qi + 1}.</span>
                <span>{q.prompt}</span>
              </p>

              <div className="mt-4 flex flex-col gap-2">
                {q.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === q.answer;

                  // styling states
                  let ring = 'border-gray-200 hover:border-gray-300';
                  let bg = 'bg-white';
                  if (!submitted && isChosen) {
                    ring = '';
                    bg = '';
                  }
                  let markStyle: React.CSSProperties | undefined;
                  if (!submitted && isChosen) {
                    markStyle = { borderColor: accent, background: accentSoft };
                  } else if (submitted && isCorrect) {
                    markStyle = { borderColor: '#16a34a', background: '#f0fdf4' };
                  } else if (submitted && isChosen && !isCorrect) {
                    markStyle = { borderColor: '#dc2626', background: '#fef2f2' };
                  }

                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => select(qi, oi)}
                      disabled={submitted}
                      className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 text-sm transition-colors ${ring} ${bg} ${
                        submitted ? 'cursor-default' : 'cursor-pointer'
                      }`}
                      style={markStyle}
                    >
                      <span
                        className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                        style={
                          submitted && isCorrect
                            ? { borderColor: '#16a34a', background: '#16a34a', color: '#fff' }
                            : submitted && isChosen && !isCorrect
                              ? { borderColor: '#dc2626', background: '#dc2626', color: '#fff' }
                              : isChosen
                                ? { borderColor: accent, background: accent, color: '#fff' }
                                : { borderColor: '#cbd5e1' }
                        }
                      >
                        {submitted && isCorrect && <Check className="w-3.5 h-3.5" />}
                        {submitted && isChosen && !isCorrect && <X className="w-3.5 h-3.5" />}
                        {!submitted && isChosen && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span className={isChosen || (submitted && isCorrect) ? 'text-slate-900 font-medium' : 'text-slate-700'}>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {submitted && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-slate-600 leading-relaxed">{q.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            onClick={submit}
            disabled={!allAnswered}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-sm disabled:cursor-not-allowed"
            style={{ background: allAnswered ? accent : '#cbd5e1' }}
          >
            Submit answers
          </button>
        ) : (
          <button
            onClick={retake}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-gray-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retake quiz
          </button>
        )}
        {!allAnswered && !submitted && (
          <span className="text-sm text-slate-400">
            {answers.filter(a => a !== null).length}/{total} answered
          </span>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════════════ */

export default function ModuleClient({
  module,
  track,
  next,
}: {
  module: Module;
  track: Track;
  next: { id: string; title: string; trackTitle: string } | null;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(false);

  function handleComplete(score: number, total: number) {
    saveModuleResult(module.id, { score, total, completedAt: new Date().toISOString() });
    setCompleted(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-slate-900">
      <AiLearningHeader />

      {/* Module hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 pt-8 pb-8">
          <Link
            href="/ai-learning"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All parts
          </Link>

          <div className="mt-5 flex items-center gap-2">
            <span
              className="text-[11px] font-semibold tracking-widest uppercase"
              style={{ color: track.accent }}
            >
              {track.eyebrow}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-[11px] font-medium tracking-wide uppercase text-slate-400">
              {module.partLabel}
            </span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-2 leading-tight">
            {module.title}
          </h1>
          <p className="text-lg text-slate-500 mt-2 leading-relaxed">{module.tagline}</p>
        </div>
      </div>

      {/* Lesson content */}
      <main className="flex-1 w-full">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-10">
          <div className="flex flex-col gap-8">
            {module.sections.map((block, i) => (
              <Block key={i} block={block} accent={track.accent} accentSoft={track.accentSoft} />
            ))}
          </div>

          <hr className="my-10 border-gray-200" />

          <Quiz
            module={module}
            accent={track.accent}
            accentSoft={track.accentSoft}
            onComplete={handleComplete}
          />

          {/* Footer nav */}
          <div className="mt-10 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <Link
              href="/ai-learning"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to all parts
            </Link>

            {next ? (
              <button
                onClick={() => router.push(`/ai-learning/${next.id}`)}
                className="group inline-flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 text-left transition-all hover:shadow-md"
                style={completed ? { borderColor: track.accent } : undefined}
              >
                <span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Next part
                  </span>
                  <span className="block text-sm font-semibold text-slate-900">{next.title}</span>
                </span>
                <ArrowRight
                  className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition-transform"
                  style={completed ? { color: track.accent } : undefined}
                />
              </button>
            ) : (
              <Link
                href="/ai-learning"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm"
                style={{ background: track.accent }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Finish — back to series
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
