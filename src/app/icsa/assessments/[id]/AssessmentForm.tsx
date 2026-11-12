'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import {
  deleteIcsaEvidence,
  reviewIcsaAssessment,
  saveIcsaAssessment,
  submitIcsaAssessment,
  uploadIcsaEvidence,
} from '@/app/actions/icsa/assessments';
import {
  MAX_EVIDENCE_BYTES,
  MAX_FILES_PER_QUESTION,
  RESPONSES,
  answerKey,
  fmtDate,
  isGap,
  pct,
  questionText,
  scoreAnswers,
  sectionsByKeys,
  submissionIssues,
  type Answer,
  type Answers,
  type IcsaQuestion,
} from '@/lib/icsa/model';
import type { AssessmentWithContext, EvidenceFile } from '@/lib/icsa/queries';
import {
  AssessmentPill,
  BTN,
  BTN_QUIET,
  Banner,
  CARD,
  INPUT,
  LABEL,
  RateChip,
  ResponseChip,
  TD,
  TH,
} from '../../components/ui';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  dirty: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Could not save. Retrying on your next change.',
};

const RESPONSE_HELP: [string, string][] = [
  ['Yes', 'The control is in place and operating consistently.'],
  ['No', 'The control is not in place or is not operating. Remarks are required.'],
  [
    'Partial',
    'The control exists but is incomplete, inconsistently applied or not fully documented. Remarks are required.',
  ],
  ['N/A', 'The question does not apply to your operations. Briefly explain why.'],
];

const OPTION_ON: Record<string, string> = {
  Yes: 'border-[#2a7e4f] bg-[#2a7e4f] text-white',
  No: 'border-red-600 bg-red-600 text-white',
  Partial: 'border-amber-500 bg-amber-500 text-white',
  'N/A': 'border-slate-500 bg-slate-500 text-white',
};

export default function AssessmentForm({
  assessment: a,
  evidence: initialEvidence,
  canEdit,
  canReview,
}: {
  assessment: AssessmentWithContext;
  evidence: EvidenceFile[];
  canEdit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const sections = useMemo(() => sectionsByKeys(a.sections), [a.sections]);
  const [answers, setAnswers] = useState<Answers>(a.answers ?? {});
  const [designation, setDesignation] = useState(a.designation ?? '');
  const [evidence, setEvidence] = useState(initialEvidence);
  const [step, setStep] = useState<string>(canEdit ? 'details' : 'summary');
  const [save, setSave] = useState<SaveState>('idle');
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirtyKeys = useRef(new Set<string>());
  const dirtyDesignation = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const latest = useRef({ answers, designation });
  useEffect(() => {
    latest.current = { answers, designation };
  }, [answers, designation]);

  const score = useMemo(() => scoreAnswers(answers, sections), [answers, sections]);
  const issues = useMemo(
    () => submissionIssues({ designation, answers }, sections),
    [designation, answers, sections],
  );

  const flash = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 4200);
  };

  const flush = useCallback(async (): Promise<boolean> => {
    if (!dirtyKeys.current.size && !dirtyDesignation.current) return true;
    if (saving.current) {
      timer.current = setTimeout(() => void flushRef.current(), 400);
      return false;
    }
    const keys = [...dirtyKeys.current];
    const withDesignation = dirtyDesignation.current;
    dirtyKeys.current.clear();
    dirtyDesignation.current = false;
    saving.current = true;
    setSave('saving');
    const patch: Answers = {};
    for (const k of keys) patch[k] = latest.current.answers[k] ?? {};
    const res = await saveIcsaAssessment(a.id, {
      answers: patch,
      ...(withDesignation ? { designation: latest.current.designation } : {}),
    });
    saving.current = false;
    if (!res.success) {
      keys.forEach((k) => dirtyKeys.current.add(k));
      if (withDesignation) dirtyDesignation.current = true;
      setSave('error');
      if (res.error && !res.error.startsWith('Could not save')) flash('error', res.error);
      return false;
    }
    setSave(dirtyKeys.current.size || dirtyDesignation.current ? 'dirty' : 'saved');
    return true;
  }, [a.id]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const touch = useCallback(() => {
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyKeys.current.size || dirtyDesignation.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flush]);

  const setField = (ref: string, field: keyof Answer, value: string) => {
    const k = answerKey(ref);
    setAnswers((prev) => ({ ...prev, [k]: { ...(prev[k] ?? {}), [field]: value } }));
    dirtyKeys.current.add(k);
    touch();
  };

  const go = (s: string) => {
    setStep(s);
    document.querySelector('main')?.scrollTo({ top: 0 });
  };

  async function upload(ref: string, files: File[]) {
    for (const f of files) {
      if (evidence.filter((e) => e.questionRef === ref).length >= MAX_FILES_PER_QUESTION) {
        flash('error', `Up to ${MAX_FILES_PER_QUESTION} files per question.`);
        break;
      }
      if (f.size > MAX_EVIDENCE_BYTES) {
        flash(
          'error',
          `${f.name} is over 5 MB. Put it on SharePoint and paste the link as the evidence reference.`,
        );
        continue;
      }
      const fd = new FormData();
      fd.set('assessmentId', String(a.id));
      fd.set('questionRef', ref);
      fd.set('file', f);
      const res = await uploadIcsaEvidence(fd);
      if (res.success && res.data) {
        const d = res.data;
        setEvidence((prev) => [
          ...prev,
          {
            id: d.id,
            questionRef: ref,
            fileName: d.fileName,
            sizeBytes: d.sizeBytes,
            contentType: d.contentType,
            uploadedAt: new Date().toISOString(),
          },
        ]);
      } else flash('error', res.error ?? `Could not upload ${f.name}.`);
    }
  }

  async function removeFile(id: number) {
    const res = await deleteIcsaEvidence(id);
    if (res.success) setEvidence((prev) => prev.filter((e) => e.id !== id));
    else flash('error', res.error ?? 'Could not remove the file.');
  }

  async function submit() {
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    const ok = await flush();
    if (!ok) {
      setBusy(false);
      flash('error', 'Your last changes did not save. Try again in a moment.');
      return;
    }
    const res = await submitIcsaAssessment(a.id);
    setBusy(false);
    if (!res.success) return flash('error', res.error ?? 'Could not submit.');
    flash('ok', 'Assessment submitted.');
    router.refresh();
  }

  const statusBar = (
    <div className={`${CARD} mb-4 flex flex-wrap items-center gap-4 px-4 py-3`}>
      <AssessmentPill status={a.status} />
      <div className="min-w-[200px] flex-1">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Completion</span>
          <span>
            {score.total.done} of {score.total.n} answered
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-[#2a7e4f]"
            style={{ width: `${Math.round(score.total.comp * 100)}%` }}
          />
        </div>
      </div>
      {canEdit && (
        <span
          className={`text-xs ${save === 'error' ? 'text-red-700' : 'text-slate-500'}`}
          aria-live="polite"
        >
          {SAVE_LABEL[save]}
        </span>
      )}
    </div>
  );

  const banner = (() => {
    if (a.status === 'returned')
      return (
        <Banner tone="warn">
          <b>Returned for changes.</b> {a.reviewerNote || 'The reviewer asked for updates.'} Update
          your answers and submit again.
        </Banner>
      );
    if (a.status === 'submitted')
      return (
        <Banner tone="info">
          <b>Submitted {fmtDate(a.submittedAt)}.</b> The answers are locked while the review is in
          progress.
        </Banner>
      );
    if (a.status === 'reviewed')
      return (
        <Banner tone="ok">
          <b>
            Reviewed{a.reviewedBy ? ` by ${a.reviewedBy}` : ''} on {fmtDate(a.reviewedAt)}.
          </b>{' '}
          {a.reviewerNote}
        </Banner>
      );
    if (a.status === 'not_completed')
      return (
        <Banner tone="error">
          <b>Not completed.</b> {a.country} was closed for {a.cycleLabel} before this assessment was
          submitted.
        </Banner>
      );
    if (canEdit && a.enrollmentStatus !== 'open')
      return <Banner tone="error">{a.country} is closed for this cycle.</Banner>;
    return null;
  })();

  const steps = (
    <nav className={`${CARD} h-fit p-2 lg:sticky lg:top-0`} aria-label="Sections">
      <StepButton
        current={step === 'details'}
        onClick={() => go('details')}
        label="Respondent details"
      />
      {score.per.map(({ section: s, tally: c }) => {
        const ok = c.un === 0 && c.miss === 0;
        return (
          <StepButton
            key={s.key}
            current={step === s.key}
            onClick={() => go(s.key)}
            label={`${s.id}. ${s.short}`}
            right={
              <span
                className={`text-xs font-semibold ${ok ? 'text-[#2a7e4f]' : c.miss ? 'text-red-600' : 'text-slate-400'}`}
              >
                {ok ? 'Done' : `${c.done}/${c.n}`}
              </span>
            }
          />
        );
      })}
      <StepButton
        current={step === 'summary'}
        onClick={() => go('summary')}
        label="Summary & submit"
      />
    </nav>
  );

  let panel: React.ReactNode;
  if (step === 'details') {
    panel = (
      <div className="space-y-4">
        <Head eyebrow="Respondent details" title="Start here">
          This Internal Control Self-Assessment (ICSA) covers the operations of the Supply Chain
          function and supports NESR&apos;s compliance with established procedures in line with SOX
          controls. Review each question and respond with one of the options below.
        </Head>
        {banner}
        <div className={`${CARD} p-5`}>
          <h3 className="mb-4 font-bold text-slate-800">About you</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnly label="Country / Business Unit" value={a.country} />
            <ReadOnly
              label="Assessment cycle"
              value={`${a.cycleLabel} (${fmtDate(a.periodStart)} – ${fmtDate(a.periodEnd)})`}
            />
            <ReadOnly label="Completed by" value={a.respondentName || a.respondentEmail} />
            <div>
              <label className={LABEL} htmlFor="designation">
                Designation
              </label>
              <input
                id="designation"
                className={INPUT}
                value={designation}
                disabled={!canEdit}
                placeholder={a.jobTitle ?? 'Your job title'}
                onChange={(e) => {
                  setDesignation(e.target.value);
                  dirtyDesignation.current = true;
                  touch();
                }}
              />
            </div>
            <ReadOnly label="Due" value={fmtDate(a.deadline)} />
            <ReadOnly label="Champion" value={a.championName || a.championEmail} />
          </div>
        </div>
        <div className={`${CARD} p-5`}>
          <h3 className="mb-2 font-bold text-slate-800">How to complete</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Work through each section assigned to you ({sections.length}).</li>
            <li>Choose a response for every question.</li>
            <li>Add remarks to support your answer. They are required for No and Partial.</li>
            <li>
              For a gap, attach evidence and record an action plan under &ldquo;Evidence &amp;
              action plan&rdquo;.
            </li>
            <li>Check Summary &amp; submit to confirm nothing is missing, then submit.</li>
          </ol>
        </div>
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={TH}>Response</th>
                <th className={TH}>When to use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RESPONSE_HELP.map(([r, t]) => (
                <tr key={r}>
                  <td className={TD}>
                    <ResponseChip value={r} />
                  </td>
                  <td className={TD}>{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sections[0] && (
          <div className="flex justify-end">
            <button className={BTN} onClick={() => go(sections[0].key)}>
              Start section {sections[0].id}
            </button>
          </div>
        )}
      </div>
    );
  } else if (step === 'summary') {
    const gaps = sections.flatMap((s) =>
      s.questions.filter((q) => isGap(answers[answerKey(q.ref)]?.r)),
    );
    panel = (
      <div className="space-y-4">
        <Head eyebrow="Summary of responses" title={`${a.country} · ${a.cycleLabel}`}>
          {a.respondentName || a.respondentEmail}
          {designation ? `, ${designation}` : ''}
        </Head>
        {banner}
        {canReview && (a.status === 'submitted' || a.status === 'reviewed') && (
          <ReviewCard
            id={a.id}
            status={a.status}
            note={a.reviewerNote}
            enrollmentOpen={a.enrollmentStatus === 'open'}
            onDone={(m, tone) => {
              flash(tone, m);
              router.refresh();
            }}
          />
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniKpi
            label="Completion"
            value={pct(score.total.comp)}
            sub={`${score.total.done} of ${score.total.n} questions`}
          />
          <MiniKpi
            label="Compliance (Yes rate)"
            value={pct(score.total.rate)}
            sub="Yes ÷ (Yes + No + Partial)"
          />
          <MiniKpi label="Open items" value={score.total.open} sub="No + Partial" />
          <MiniKpi label="Remarks missing" value={score.total.miss} />
        </div>
        <SectionTable score={score} onOpen={go} />
        {gaps.length > 0 && (
          <div className={`${CARD} overflow-x-auto`}>
            <h3 className="px-4 pt-4 font-bold text-slate-800">Gaps and action plan</h3>
            <table className="mt-2 w-full min-w-[720px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Ref', 'Question', 'Response', 'Action', 'Owner', 'Due'].map((h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gaps.map((q) => {
                  const ans = answers[answerKey(q.ref)] ?? {};
                  const sec = sections.find((s) => s.questions.includes(q))!;
                  return (
                    <tr key={q.ref}>
                      <td className={TD}>
                        <button
                          className="font-semibold text-[#307c4c] hover:underline"
                          onClick={() => go(sec.key)}
                        >
                          {q.ref}
                        </button>
                      </td>
                      <td className={TD}>{questionText(q, a.country)}</td>
                      <td className={TD}>
                        <ResponseChip value={ans.r} />
                      </td>
                      <td className={TD}>{ans.ac || '–'}</td>
                      <td className={TD}>{ans.ow || '–'}</td>
                      <td className={TD}>{fmtDate(ans.du)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={`${CARD} p-5`}>
          <h3 className="font-bold text-slate-800">{canEdit ? 'Ready to submit?' : 'Downloads'}</h3>
          {canEdit && issues.length > 0 && (
            <>
              <p className="mt-2 text-sm text-slate-500">Fix these before you submit:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {issues.map((i) => (
                  <li key={i.text}>
                    <button
                      className="text-left text-red-700 hover:underline"
                      onClick={() => go(i.step)}
                    >
                      {i.text}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {canEdit && !issues.length && (
            <p className="mt-2 text-sm text-slate-600">
              Every question is answered and all No / Partial responses have remarks.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {canEdit && (
              <button className={BTN} disabled={busy || issues.length > 0} onClick={submit}>
                {busy ? 'Submitting…' : 'Submit assessment'}
              </button>
            )}
            <a className={BTN_QUIET} href={`/api/icsa/export?assessment=${a.id}`}>
              <Download className="h-4 w-4" /> Download Excel
            </a>
          </div>
        </div>
      </div>
    );
  } else {
    const s = sections.find((x) => x.key === step)!;
    const i = sections.indexOf(s);
    const c = score.per[i].tally;
    panel = (
      <div className="space-y-4">
        <Head eyebrow={`Section ${i + 1} of ${sections.length}`} title={s.title}>
          {c.done} of {c.n} answered.
        </Head>
        {banner}
        {s.questions.map((q) => (
          <QuestionCard
            key={q.ref}
            q={q}
            country={a.country}
            ans={answers[answerKey(q.ref)] ?? {}}
            files={evidence.filter((e) => e.questionRef === q.ref)}
            locked={!canEdit}
            onField={setField}
            onUpload={upload}
            onRemove={removeFile}
          />
        ))}
        <div className="flex justify-between">
          {i > 0 ? (
            <button className={BTN_QUIET} onClick={() => go(sections[i - 1].key)}>
              Previous section
            </button>
          ) : (
            <span />
          )}
          {i < sections.length - 1 ? (
            <button className={BTN} onClick={() => go(sections[i + 1].key)}>
              Next section
            </button>
          ) : (
            <button className={BTN} onClick={() => go('summary')}>
              Review summary
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {statusBar}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {steps}
        <section className="min-w-0">{panel}</section>
      </div>
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.tone === 'ok' ? 'bg-[#1d4f31]' : 'bg-red-700'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function StepButton({
  current,
  onClick,
  label,
  right,
}: {
  current: boolean;
  onClick: () => void;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? 'step' : undefined}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
        current
          ? 'bg-[#307c4c]/10 font-semibold text-[#1d4f31]'
          : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <span>{label}</span>
      {right}
    </button>
  );
}

function Head({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#307c4c]">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
        {value}
      </p>
    </div>
  );
}

function MiniKpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className={`${CARD} border-t-4 border-t-[#2a7e4f] p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#2a7e4f]">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SectionTable({
  score,
  onOpen,
}: {
  score: ReturnType<typeof scoreAnswers>;
  onOpen: (k: string) => void;
}) {
  const t = score.total;
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {[
              '#',
              'Section',
              'Qs',
              'Yes',
              'No',
              'Partial',
              'N/A',
              'Unanswered',
              'Completion',
              'Compliance',
              'Remarks missing',
            ].map((h, i) => (
              <th key={h} className={`${TH} ${i > 1 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {score.per.map(({ section: s, tally: c }) => (
            <tr key={s.key}>
              <td className={TD}>{s.id}</td>
              <td className={TD}>
                <button
                  className="text-left font-medium text-[#307c4c] hover:underline"
                  onClick={() => onOpen(s.key)}
                >
                  {s.title}
                </button>
              </td>
              {[c.n, c.Yes, c.No, c.Partial, c['N/A'], c.un].map((v, i) => (
                <td key={i} className={`${TD} text-right`}>
                  {v}
                </td>
              ))}
              <td className={`${TD} text-right`}>{pct(c.comp)}</td>
              <td className={`${TD} text-right`}>
                <RateChip rate={c.rate} />
              </td>
              <td className={`${TD} text-right ${c.miss ? 'font-semibold text-red-700' : ''}`}>
                {c.miss}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
          <tr>
            <td className={TD} />
            <td className={TD}>Total</td>
            {[t.n, t.Yes, t.No, t.Partial, t['N/A'], t.un].map((v, i) => (
              <td key={i} className={`${TD} text-right`}>
                {v}
              </td>
            ))}
            <td className={`${TD} text-right`}>{pct(t.comp)}</td>
            <td className={`${TD} text-right`}>
              <RateChip rate={t.rate} />
            </td>
            <td className={`${TD} text-right`}>{t.miss}</td>
          </tr>
        </tfoot>
      </table>
      <p className="px-4 py-2 text-xs text-slate-500">
        Compliance = Yes ÷ (Yes + No + Partial). N/A and unanswered are excluded; Partial is not
        counted as compliant.
      </p>
    </div>
  );
}

function QuestionCard({
  q,
  country,
  ans,
  files,
  locked,
  onField,
  onUpload,
  onRemove,
}: {
  q: IcsaQuestion;
  country: string;
  ans: Answer;
  files: EvidenceFile[];
  locked: boolean;
  onField: (ref: string, f: keyof Answer, v: string) => void;
  onUpload: (ref: string, files: File[]) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const r = ans.r || '';
  const gap = isGap(r);
  const need = gap && !String(ans.m ?? '').trim();
  const [open, setOpen] = useState(gap || files.length > 0 || !!ans.rf);
  const [uploading, setUploading] = useState(false);
  const k = answerKey(q.ref);

  return (
    <article className={`${CARD} p-4 ${r ? '' : 'border-l-4 border-l-amber-300'}`} id={`q-${k}`}>
      <div className="flex gap-3">
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {q.ref}
        </span>
        <p className="text-sm font-medium text-slate-800">{questionText(q, country)}</p>
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-2">
        <legend className="sr-only">Response for {q.ref}</legend>
        {RESPONSES.map((v) => (
          <label
            key={v}
            className={`cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-semibold transition ${
              r === v
                ? OPTION_ON[v]
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            } ${locked ? 'cursor-not-allowed opacity-80' : ''}`}
          >
            <input
              type="radio"
              className="sr-only"
              name={`r-${k}`}
              value={v}
              checked={r === v}
              disabled={locked}
              onChange={() => {
                onField(q.ref, 'r', v);
                if (isGap(v)) setOpen(true);
              }}
            />
            {v}
          </label>
        ))}
      </fieldset>
      <div className="mt-3">
        <div className="mb-1 flex justify-between">
          <label className="text-xs font-semibold text-slate-600" htmlFor={`m-${k}`}>
            Remarks / Justification
          </label>
          <span className={`text-xs ${gap ? 'font-semibold text-red-700' : 'text-slate-400'}`}>
            {gap
              ? `Required for ${r}`
              : r === 'N/A'
                ? 'Explain why this does not apply'
                : 'Optional'}
          </span>
        </div>
        <textarea
          id={`m-${k}`}
          rows={2}
          className={`${INPUT} ${need ? 'border-red-300 bg-red-50/40' : ''}`}
          value={ans.m ?? ''}
          disabled={locked}
          onChange={(e) => onField(q.ref, 'm', e.target.value)}
        />
        {need && !locked && (
          <p className="mt-1 text-xs text-red-700">Add remarks to explain this {r} response.</p>
        )}
      </div>
      <details
        className="mt-3"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[#307c4c]">
          Evidence &amp; action plan
        </summary>
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <div>
            <label className={LABEL} htmlFor={`rf-${k}`}>
              Evidence reference (document name or link)
            </label>
            <input
              id={`rf-${k}`}
              className={INPUT}
              value={ans.rf ?? ''}
              disabled={locked}
              onChange={(e) => onField(q.ref, 'rf', e.target.value)}
            />
          </div>
          <div>
            <p className={LABEL}>
              Attached evidence (up to {MAX_FILES_PER_QUESTION} files, 5 MB each)
            </p>
            {files.length > 0 && (
              <ul className="mb-2 space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                    <a
                      className="text-[#307c4c] hover:underline"
                      href={`/api/icsa/evidence/${f.id}`}
                    >
                      {f.fileName}
                    </a>
                    <span className="text-xs text-slate-400">
                      ({Math.max(1, Math.round(f.sizeBytes / 1024))} KB)
                    </span>
                    {!locked && (
                      <button
                        className="ml-auto text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${f.fileName}`}
                        onClick={() => onRemove(f.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!locked && (
              <input
                type="file"
                multiple
                disabled={uploading}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt,.msg,.eml,.ppt,.pptx"
                className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#307c4c]/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#307c4c]"
                onChange={async (e) => {
                  const list = [...(e.target.files ?? [])];
                  e.target.value = '';
                  setUploading(true);
                  await onUpload(q.ref, list);
                  setUploading(false);
                }}
              />
            )}
            {uploading && <p className="text-xs text-slate-500">Uploading…</p>}
            {locked && !files.length && <p className="text-sm text-slate-400">None</p>}
          </div>
          {gap && (
            <div className="grid gap-3 sm:grid-cols-[1fr_200px_160px]">
              <div>
                <label className={LABEL} htmlFor={`ac-${k}`}>
                  Action plan to close the gap
                </label>
                <input
                  id={`ac-${k}`}
                  className={INPUT}
                  value={ans.ac ?? ''}
                  disabled={locked}
                  onChange={(e) => onField(q.ref, 'ac', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor={`ow-${k}`}>
                  Action owner
                </label>
                <input
                  id={`ow-${k}`}
                  className={INPUT}
                  value={ans.ow ?? ''}
                  disabled={locked}
                  onChange={(e) => onField(q.ref, 'ow', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor={`du-${k}`}>
                  Due date
                </label>
                <input
                  id={`du-${k}`}
                  type="date"
                  className={INPUT}
                  value={ans.du ?? ''}
                  disabled={locked}
                  onChange={(e) => onField(q.ref, 'du', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

function ReviewCard({
  id,
  status,
  note: initial,
  enrollmentOpen,
  onDone,
}: {
  id: number;
  status: string;
  note: string | null;
  enrollmentOpen: boolean;
  onDone: (msg: string, tone: 'ok' | 'error') => void;
}) {
  const [note, setNote] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  async function decide(decision: 'reviewed' | 'returned') {
    setBusy(true);
    const res = await reviewIcsaAssessment(id, decision, note);
    setBusy(false);
    if (!res.success) return onDone(res.error ?? 'Could not record the review.', 'error');
    const extra = res.data?.emailError ? ` (${res.data.emailError})` : '';
    onDone(
      decision === 'reviewed' ? 'Marked as reviewed.' : `Returned to the respondent.${extra}`,
      'ok',
    );
  }
  return (
    <div className={`${CARD} border-l-4 border-l-[#307c4c] p-5`}>
      <h3 className="font-bold text-slate-800">Reviewer decision</h3>
      <label className={`${LABEL} mt-3`} htmlFor="review-note">
        Note to the respondent (required when returning)
      </label>
      <textarea
        id="review-note"
        rows={2}
        className={INPUT}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={BTN}
          disabled={busy || status === 'reviewed'}
          onClick={() => decide('reviewed')}
        >
          Mark as reviewed
        </button>
        <button
          className={BTN_QUIET}
          disabled={busy || !enrollmentOpen}
          onClick={() => decide('returned')}
          title={enrollmentOpen ? '' : 'The country is closed'}
        >
          Return for changes
        </button>
      </div>
    </div>
  );
}
