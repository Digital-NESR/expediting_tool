'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  addIcsaQuestion,
  addIcsaSection,
  moveIcsaQuestion,
  setIcsaQuestionActive,
  setIcsaSectionActive,
  updateIcsaQuestion,
  updateIcsaSection,
} from '@/app/actions/icsa/questions';
import type { AdminQuestion, AdminSection } from '@/lib/icsa/catalog';
import { BTN, BTN_QUIET, BTN_SM, Banner, CARD, INPUT, LABEL } from '../components/ui';

type Result = { success: boolean; error?: string };

/**
 * Admin panel → Supply Chain Self-Assessment → Questions. Edits the live question bank: changes
 * show on every form straight away, including forms people are filling in now.
 */
export default function QuestionBankPanel({ bank }: { bank: AdminSection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSection, setNewSection] = useState({ short: '', title: '' });

  const live = bank.filter((s) => s.active);
  const archivedSections = bank.filter((s) => !s.active);
  const total = live.reduce((n, s) => n + s.questions.filter((q) => q.active).length, 0);

  async function run(fn: () => Promise<Result>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'That did not work.');
      return false;
    }
    router.refresh();
    return true;
  }

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Question bank</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {live.length} sections, {total} questions. Changes apply straight away to every form,
            including ones being filled in now. Removing a question takes it off the forms and out
            of the scores; answers already given are kept and come back if you restore it. Write{' '}
            <code className="rounded bg-slate-100 px-1">{'{country}'}</code> to insert the
            respondent&apos;s country.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show removed
          </label>
          <button className={`${BTN_QUIET} ${BTN_SM}`} onClick={() => setAddingSection(true)}>
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {addingSection && (
        <div className={`${CARD} space-y-3 p-4`}>
          <h3 className="font-bold text-slate-800">New section</h3>
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div>
              <label className={LABEL} htmlFor="ns-short">
                Short name
              </label>
              <input
                id="ns-short"
                className={INPUT}
                value={newSection.short}
                placeholder="e.g. Contracts"
                onChange={(e) => setNewSection({ ...newSection, short: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="ns-title">
                Title
              </label>
              <input
                id="ns-title"
                className={INPUT}
                value={newSection.title}
                placeholder="e.g. Contract Management & Renewals"
                onChange={(e) => setNewSection({ ...newSection, title: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={`${BTN} ${BTN_SM}`}
              disabled={busy}
              onClick={async () => {
                if (await run(() => addIcsaSection(newSection.short, newSection.title))) {
                  setAddingSection(false);
                  setNewSection({ short: '', title: '' });
                }
              }}
            >
              Add section
            </button>
            <button className={`${BTN_QUIET} ${BTN_SM}`} onClick={() => setAddingSection(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {[...live, ...(showArchived ? archivedSections : [])].map((s) => (
        <SectionCard
          key={s.key}
          s={s}
          open={open.has(s.key)}
          onToggle={() => toggle(s.key)}
          showArchived={showArchived}
          busy={busy}
          run={run}
        />
      ))}
    </div>
  );
}

function SectionCard({
  s,
  open,
  onToggle,
  showArchived,
  busy,
  run,
}: {
  s: AdminSection;
  open: boolean;
  onToggle: () => void;
  showArchived: boolean;
  busy: boolean;
  run: (fn: () => Promise<Result>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ short: s.short, title: s.title });
  const [newText, setNewText] = useState('');
  const active = s.questions.filter((q) => q.active);
  const shown = showArchived ? s.questions : active;

  return (
    <div className={`${CARD} ${s.active ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggle}>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#307c4c]/10 text-sm font-bold text-[#307c4c]">
            {s.num}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-800">{s.title}</span>
            <span className="block text-xs text-slate-500">
              {s.short} · {active.length} question{active.length === 1 ? '' : 's'}
              {!s.active && ' · removed'}
            </span>
          </span>
        </button>
        <div className="flex gap-1">
          {s.active ? (
            <>
              <IconButton label="Edit section" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Remove section"
                danger
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove section ${s.num} (${s.short})? It leaves every form and score. Answers are kept and come back if you restore it.`,
                    )
                  )
                    void run(() => setIcsaSectionActive(s.key, false));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <button
              className={`${BTN_QUIET} ${BTN_SM}`}
              disabled={busy}
              onClick={() => run(() => setIcsaSectionActive(s.key, true))}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore section
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div>
              <label className={LABEL} htmlFor={`s-short-${s.key}`}>
                Short name
              </label>
              <input
                id={`s-short-${s.key}`}
                className={INPUT}
                value={draft.short}
                onChange={(e) => setDraft({ ...draft, short: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`s-title-${s.key}`}>
                Title
              </label>
              <input
                id={`s-title-${s.key}`}
                className={INPUT}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={`${BTN} ${BTN_SM}`}
              disabled={busy}
              onClick={async () => {
                if (await run(() => updateIcsaSection(s.key, draft.short, draft.title)))
                  setEditing(false);
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </button>
            <button className={`${BTN_QUIET} ${BTN_SM}`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-100">
          <ol className="divide-y divide-slate-100">
            {shown.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                first={q.id === s.questions[0]?.id}
                last={q.id === s.questions[s.questions.length - 1]?.id}
                busy={busy}
                run={run}
                editable={s.active}
              />
            ))}
            {!shown.length && (
              <li className="px-4 py-3 text-sm text-slate-500">
                No questions in this section yet.
              </li>
            )}
          </ol>
          {s.active && (
            <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row">
              <textarea
                rows={2}
                className={`${INPUT} flex-1`}
                value={newText}
                aria-label={`New question for section ${s.num}`}
                placeholder={`New question for section ${s.num}…`}
                onChange={(e) => setNewText(e.target.value)}
              />
              <button
                className={`${BTN} self-start`}
                disabled={busy || !newText.trim()}
                onClick={async () => {
                  if (await run(() => addIcsaQuestion(s.key, newText))) setNewText('');
                }}
              >
                <Plus className="h-4 w-4" /> Add question
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  q,
  first,
  last,
  busy,
  run,
  editable,
}: {
  q: AdminQuestion;
  first: boolean;
  last: boolean;
  busy: boolean;
  run: (fn: () => Promise<Result>) => Promise<boolean>;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);

  return (
    <li className={`flex gap-3 px-4 py-3 ${q.active ? '' : 'bg-slate-50 opacity-70'}`}>
      <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
        {q.ref}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-2">
            <textarea
              rows={3}
              className={INPUT}
              value={text}
              aria-label={`Text of ${q.ref}`}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className={`${BTN} ${BTN_SM}`}
                disabled={busy}
                onClick={async () => {
                  if (await run(() => updateIcsaQuestion(q.id, text))) setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button
                className={`${BTN_QUIET} ${BTN_SM}`}
                onClick={() => {
                  setText(q.text);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-800">{q.text}</p>
            {!q.active && <p className="mt-1 text-xs font-semibold text-red-700">Removed</p>}
          </>
        )}
      </div>
      {!editing && editable && (
        <div className="flex shrink-0 items-start gap-1">
          {q.active ? (
            <>
              <IconButton
                label={`Move ${q.ref} up`}
                disabled={busy || first}
                onClick={() => run(() => moveIcsaQuestion(q.id, 'up'))}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={`Move ${q.ref} down`}
                disabled={busy || last}
                onClick={() => run(() => moveIcsaQuestion(q.id, 'down'))}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
              <IconButton label={`Edit ${q.ref}`} onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={`Remove ${q.ref}`}
                danger
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${q.ref}? It leaves every form and score. Answers already given are kept and come back if you restore it.`,
                    )
                  )
                    void run(() => setIcsaQuestionActive(q.id, false));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <button
              className={`${BTN_QUIET} ${BTN_SM}`}
              disabled={busy}
              onClick={() => run(() => setIcsaQuestionActive(q.id, true))}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-slate-400 transition disabled:opacity-30 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-[#307c4c]'
      }`}
    >
      {children}
    </button>
  );
}
