'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  deleteIcsaActionPlan,
  generateIcsaGapReview,
  saveIcsaActionPlan,
  suggestIcsaActions,
} from '@/app/actions/icsa/analytics';
import type { ActionSuggestion, CountryGap, GapReview, Severity } from '@/lib/icsa/ai';
import type { ActionPlan, SavedReview } from '@/lib/icsa/analytics';
import { fmtDate } from '@/lib/icsa/model';
import {
  BTN,
  BTN_QUIET,
  BTN_SM,
  Banner,
  CARD,
  INPUT,
  LABEL,
  ResponseChip,
} from '../../components/ui';
import { RatingChip, SeverityChip } from '../RatingChip';

/* ─── AI review ─────────────────────────────────────────────────────────────────────────── */

export function AiReviewCard({
  enrollmentId,
  review,
  stale,
  forms,
  gapCount,
  aiReady,
}: {
  enrollmentId: number;
  review: SavedReview | null;
  stale: boolean;
  forms: number;
  gapCount: number;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await generateIcsaGapReview(enrollmentId);
    setBusy(false);
    if (!res.success) return setError(res.error ?? 'The review did not work.');
    router.refresh();
  }

  const r = review?.review;
  const canRun = aiReady && forms > 0 && gapCount > 0;
  return (
    <div className={`${CARD} mb-6 border-l-4 border-l-violet-400 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            <Sparkles className="h-4 w-4 text-violet-500" /> AI review of the gaps
            {r && <RatingChip rating={r.rating} />}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {review
              ? `Based on ${review.responsesCount} submitted form${review.responsesCount === 1 ? '' : 's'}, ${fmtDate(review.createdAt)}, asked by ${review.createdBy}. Advice only: check it against the answers.`
              : 'Claude reads every No and Partial answer with its remarks, rates the country, groups the gaps into themes and says how serious each one is.'}
          </p>
        </div>
        <button className={BTN} disabled={!canRun || busy} onClick={run}>
          <Sparkles className="h-4 w-4" />
          {busy ? 'Reviewing… (up to a minute)' : review ? 'Review again' : 'Review the gaps'}
        </button>
      </div>
      {!aiReady && (
        <p className="mt-3 text-xs text-slate-500">
          AI is not set up here yet (the n8n &ldquo;icsa ai&rdquo; webhook).
        </p>
      )}
      {aiReady && !forms && <p className="mt-3 text-xs text-slate-500">No forms submitted yet.</p>}
      {aiReady && forms > 0 && !gapCount && (
        <p className="mt-3 text-xs text-slate-500">No gaps: every answer is Yes or N/A.</p>
      )}
      {stale && (
        <div className="mt-3">
          <Banner tone="warn">
            More forms have come in since this review. Review again to include them.
          </Banner>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {r && <ReviewBody r={r} />}
    </div>
  );
}

function ReviewBody({ r }: { r: GapReview }) {
  const count = (s: Severity) => r.gaps.filter((g) => g.severity === s).length;
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm leading-relaxed text-slate-700">{r.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {(['high', 'medium', 'low'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <SeverityChip severity={s} /> {count(s)}
          </span>
        ))}
      </div>
      {r.themes.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {r.themes.map((t) => (
            <div key={t.title} className="rounded-xl bg-violet-50/60 p-3">
              <p className="text-sm font-semibold text-slate-800">{t.title}</p>
              <p className="mt-1 text-sm text-slate-600">{t.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Gaps, action plans and the suggestions panel ──────────────────────────────────────── */

interface Draft {
  id?: number;
  questionRef: string;
  action: string;
  owner: string;
  dueDate: string;
  status: ActionPlan['status'];
  fromAi: boolean;
}

const STATUS_LABEL: Record<ActionPlan['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
};
const STATUS_TONE: Record<ActionPlan['status'], string> = {
  open: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-50 text-amber-700',
  done: 'bg-[#2a7e4f]/10 text-[#2a7e4f]',
};

function inDays(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function GapWorkspace({
  enrollmentId,
  gaps,
  plans,
  findings,
  aiReady,
}: {
  enrollmentId: number;
  gaps: CountryGap[];
  plans: ActionPlan[];
  findings: GapReview['gaps'];
  aiReady: boolean;
}) {
  const router = useRouter();
  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  /* Once reviewed, the most severe gaps come first. */
  const ordered = useMemo(() => {
    const f = new Map(findings.map((x) => [x.ref, x]));
    return [...gaps].sort((a, b) => {
      const sa = f.get(a.ref)?.severity;
      const sb = f.get(b.ref)?.severity;
      return (sa ? sevRank[sa] : 3) - (sb ? sevRank[sb] : 3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaps, findings]);
  const [selected, setSelected] = useState<string | null>(ordered[0]?.ref ?? null);
  const [open, setOpen] = useState<Set<string>>(new Set(ordered[0] ? [ordered[0].ref] : []));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unplanned'>('all');

  const [suggestions, setSuggestions] = useState<Record<string, ActionSuggestion[]>>({});
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  if (!gaps.length) return null;

  const findingOf = (ref: string) => findings.find((f) => f.ref === ref);
  const plansOf = (ref: string) => plans.filter((p) => p.questionRef === ref);
  const shown = filter === 'all' ? ordered : ordered.filter((g) => !plansOf(g.ref).length);
  const current = gaps.find((g) => g.ref === selected) ?? null;

  function toggle(ref: string) {
    setSelected(ref);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  function startNew(ref: string, from?: ActionSuggestion) {
    setSelected(ref);
    setOpen((prev) => new Set(prev).add(ref));
    setError(null);
    setDraft({
      questionRef: ref,
      action: from ? `${from.action}${from.evidence ? `\nEvidence: ${from.evidence}` : ''}` : '',
      owner: from?.owner ?? '',
      dueDate: from ? inDays(from.dueInDays) : '',
      status: 'open',
      fromAi: !!from,
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const res = await saveIcsaActionPlan(enrollmentId, draft);
    setBusy(false);
    if (!res.success) return setError(res.error ?? 'Could not save.');
    setDraft(null);
    router.refresh();
  }

  async function remove(p: ActionPlan) {
    if (!window.confirm('Delete this action plan?')) return;
    const res = await deleteIcsaActionPlan(enrollmentId, p.id);
    if (!res.success) return setError(res.error ?? 'Could not delete.');
    router.refresh();
  }

  async function suggest(ref: string) {
    setSelected(ref);
    setSuggesting(ref);
    setSuggestError(null);
    const res = await suggestIcsaActions(enrollmentId, ref);
    setSuggesting(null);
    if (!res.success) return setSuggestError(res.error ?? 'No suggestions.');
    setSuggestions((prev) => ({ ...prev, [ref]: res.data!.suggestions }));
  }

  const form = (ref: string) =>
    draft && draft.questionRef === ref ? (
      <div className="mt-3 space-y-3 rounded-xl border border-[#307c4c]/30 bg-[#307c4c]/5 p-3">
        {draft.fromAi && (
          <p className="flex items-center gap-1.5 text-xs text-violet-700">
            <Sparkles className="h-3.5 w-3.5" /> Started from an AI suggestion. Edit it to fit.
          </p>
        )}
        <div>
          <label className={LABEL} htmlFor={`ap-a-${ref}`}>
            Action
          </label>
          <textarea
            id={`ap-a-${ref}`}
            rows={3}
            className={INPUT}
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor={`ap-o-${ref}`}>
              Owner
            </label>
            <input
              id={`ap-o-${ref}`}
              className={INPUT}
              value={draft.owner}
              placeholder="Name or role"
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`ap-d-${ref}`}>
              Due
            </label>
            <input
              id={`ap-d-${ref}`}
              type="date"
              className={INPUT}
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`ap-s-${ref}`}>
              Status
            </label>
            <select
              id={`ap-s-${ref}`}
              className={INPUT}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}
            >
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex gap-2">
          <button className={`${BTN} ${BTN_SM}`} disabled={busy} onClick={save}>
            <Check className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Save action plan'}
          </button>
          <button className={`${BTN_QUIET} ${BTN_SM}`} onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-800">Gaps and action plans</h2>
            <p className="text-xs text-slate-500">
              Each question answered No or Partial. Open one to read the answers and plan what will
              close it.
            </p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            {(['all', 'unplanned'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 ${filter === f ? 'bg-[#307c4c] text-white' : 'text-slate-600'}`}
              >
                {f === 'all'
                  ? `All (${gaps.length})`
                  : `No plan yet (${gaps.filter((g) => !plansOf(g.ref).length).length})`}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {shown.map((g) => {
            const f = findingOf(g.ref);
            const mine = plansOf(g.ref);
            const isOpen = open.has(g.ref);
            return (
              <article
                key={g.ref}
                className={`${CARD} p-4 ${selected === g.ref ? 'ring-2 ring-violet-300' : ''}`}
              >
                <button
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => toggle(g.ref)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {g.ref}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{g.question}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {f && <SeverityChip severity={f.severity} />}
                      <span>
                        {g.no} No · {g.partial} Partial of {g.askedOf}
                      </span>
                      <span>· {g.sectionTitle}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${mine.length ? 'bg-[#2a7e4f]/10 text-[#2a7e4f]' : 'bg-red-50 text-red-700'}`}
                      >
                        {mine.length
                          ? `${mine.length} plan${mine.length > 1 ? 's' : ''}`
                          : 'No plan'}
                      </span>
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-3 pl-7">
                    {f && (
                      <div className="rounded-lg bg-violet-50/60 p-3 text-sm">
                        <p className="text-slate-800">
                          <b>Finding:</b> {f.finding}
                        </p>
                        {f.risk && (
                          <p className="mt-1 text-slate-600">
                            <b>Risk:</b> {f.risk}
                          </p>
                        )}
                      </div>
                    )}
                    <ul className="space-y-2">
                      {g.responses.map((r, i) => (
                        <li key={i} className="rounded-lg border border-slate-100 p-2.5 text-sm">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <ResponseChip value={r.response} />
                            <span className="font-semibold text-slate-700">{r.respondent}</span>
                            {r.role && <span>{r.role}</span>}
                          </div>
                          <p className="mt-1 text-slate-700">
                            {r.remarks || <i className="text-slate-400">No remarks</i>}
                          </p>
                          {r.proposedAction && (
                            <p className="mt-1 text-xs text-slate-500">
                              Their proposed action: {r.proposedAction}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    {mine.length > 0 && (
                      <div className="space-y-2">
                        {mine.map((p) =>
                          draft?.id === p.id ? (
                            <div key={p.id}>{form(g.ref)}</div>
                          ) : (
                            <div
                              key={p.id}
                              className="rounded-lg border border-[#307c4c]/20 bg-white p-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="whitespace-pre-line text-slate-800">{p.action}</p>
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    className="rounded p-1 text-slate-400 hover:text-[#307c4c]"
                                    aria-label="Edit action plan"
                                    onClick={() =>
                                      setDraft({
                                        id: p.id,
                                        questionRef: g.ref,
                                        action: p.action,
                                        owner: p.owner ?? '',
                                        dueDate: p.dueDate ?? '',
                                        status: p.status,
                                        fromAi: p.fromAi,
                                      })
                                    }
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="rounded p-1 text-slate-400 hover:text-red-600"
                                    aria-label="Delete action plan"
                                    onClick={() => remove(p)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span
                                  className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[p.status]}`}
                                >
                                  {STATUS_LABEL[p.status]}
                                </span>
                                {p.owner && <span>Owner: {p.owner}</span>}
                                {p.dueDate && <span>Due {fmtDate(p.dueDate)}</span>}
                                {p.fromAi && (
                                  <span className="flex items-center gap-1 text-violet-600">
                                    <Sparkles className="h-3 w-3" /> AI-assisted
                                  </span>
                                )}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    )}

                    {draft && draft.questionRef === g.ref && !draft.id ? (
                      form(g.ref)
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`${BTN_QUIET} ${BTN_SM}`}
                          onClick={() => startNew(g.ref)}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add action plan
                        </button>
                        {aiReady && (
                          <button
                            className={`${BTN_QUIET} ${BTN_SM}`}
                            disabled={suggesting === g.ref}
                            onClick={() => suggest(g.ref)}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                            {suggesting === g.ref ? 'Thinking…' : 'AI suggestions'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <aside className="lg:sticky lg:top-0 lg:self-start">
        <div className={`${CARD} border-t-4 border-t-violet-400 p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              <Sparkles className="h-4 w-4 text-violet-500" /> AI suggestions
            </h2>
            {current && suggestions[current.ref] && (
              <button
                className="text-slate-400 hover:text-slate-600"
                aria-label="Clear suggestions"
                onClick={() =>
                  setSuggestions((prev) => {
                    const next = { ...prev };
                    delete next[current.ref];
                    return next;
                  })
                }
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!aiReady ? (
            <p className="mt-2 text-sm text-slate-500">AI is not set up here yet.</p>
          ) : !current ? (
            <p className="mt-2 text-sm text-slate-500">Pick a gap to get ideas for closing it.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-slate-500">
                For <b>{current.ref}</b>: {current.question}
              </p>
              {suggestError && suggesting === null && !suggestions[current.ref] && (
                <div className="mt-3">
                  <Banner tone="error">{suggestError}</Banner>
                </div>
              )}
              {suggestions[current.ref] ? (
                <ol className="mt-3 space-y-3">
                  {suggestions[current.ref].map((s, i) => (
                    <li key={i} className="rounded-xl bg-violet-50/60 p-3 text-sm">
                      <p className="text-slate-800">{s.action}</p>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Owner: {s.owner || '–'} · within {s.dueInDays} days
                      </p>
                      {s.evidence && (
                        <p className="mt-1 text-xs text-slate-500">Evidence: {s.evidence}</p>
                      )}
                      {s.why && <p className="mt-1 text-xs italic text-slate-500">{s.why}</p>}
                      <button
                        className={`${BTN} ${BTN_SM} mt-2`}
                        onClick={() => startNew(current.ref, s)}
                      >
                        Use this
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <button
                  className={`${BTN} mt-3 w-full`}
                  disabled={suggesting === current.ref}
                  onClick={() => suggest(current.ref)}
                >
                  <Sparkles className="h-4 w-4" />
                  {suggesting === current.ref ? 'Thinking…' : 'Suggest action plans'}
                </button>
              )}
              <p className="mt-3 text-[0.6875rem] text-slate-400">
                Suggestions are a starting point. Nothing is saved until you use one and save it.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
