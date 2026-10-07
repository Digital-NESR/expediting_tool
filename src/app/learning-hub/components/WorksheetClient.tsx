'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Info,
  Loader2,
  Lock,
  Pencil,
  Table2,
} from 'lucide-react';
import LearningHubShell from './LearningHubShell';
import WorksheetMark from './WorksheetMark';
import {
  reopenWorksheet,
  saveWorksheetDraft,
  submitWorksheet,
  type WorksheetView,
} from '@/app/actions/learning-hub-worksheets';
import {
  worksheetProgress,
  type WorksheetAnswerSection,
  type WorksheetBlock,
  type WorksheetSection,
} from '@/lib/learning-hub/worksheet-content';
import { DEFAULT_TRACK_COLOR } from '@/lib/learning-hub-display';

/** How long after the last keystroke a draft is written. Long enough not to post per character. */
const AUTOSAVE_MS = 2_000;

type Answers = Record<string, unknown>;

export default function WorksheetClient({
  view,
  trackKey,
  trackName,
  courseId,
  courseTitle,
  color: rawColor,
}: {
  view: WorksheetView;
  trackKey: string;
  trackName: string;
  courseId: number;
  courseTitle: string;
  color: string | null;
}) {
  const { worksheet } = view;
  const color = rawColor || DEFAULT_TRACK_COLOR;

  const [answers, setAnswers] = useState<Answers>(view.response.answers);
  const [status, setStatus] = useState(view.response.status);
  const [savedAt, setSavedAt] = useState<string | null>(view.response.updatedAt);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => worksheetProgress(worksheet, answers), [worksheet, answers]);
  const readOnly = status === 'submitted';

  /* The timer and the latest answers are held in refs so the debounce survives re-renders without
     restarting on every keystroke, and so the save always posts what is on screen now. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);
  latest.current = answers;

  const flush = useCallback(async () => {
    setSaving(true);
    try {
      const res = await saveWorksheetDraft(worksheet.key, latest.current);
      if (res.saved) setSavedAt(res.at);
    } catch {
      /* A failed autosave is not worth an alert: the next keystroke schedules another, and the
         submit at the end posts the whole thing again anyway. */
    } finally {
      setSaving(false);
    }
  }, [worksheet.key]);

  const setField = useCallback(
    (id: string, value: unknown) => {
      if (readOnly) return;
      setAnswers((prev) => ({ ...prev, [id]: value }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush, readOnly],
  );

  // A pending save must not be lost to a navigation; the cleanup writes what is outstanding.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveWorksheetDraft(worksheet.key, latest.current).catch(() => {});
      }
    },
    [worksheet.key],
  );

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      const res = await submitWorksheet(worksheet.key, latest.current);
      if (res.submitted) {
        setStatus('submitted');
        setSavedAt(res.at);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be submitted. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    setBusy(true);
    try {
      await reopenWorksheet(worksheet.key);
      setStatus('draft');
    } finally {
      setBusy(false);
    }
  }

  return (
    <LearningHubShell
      backHref={`/learning-hub/${trackKey}/${courseId}`}
      title={
        <>
          <Link
            href={`/learning-hub/${trackKey}`}
            className="text-sm font-medium text-slate-400 hover:text-slate-600"
          >
            {trackName}
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href={`/learning-hub/${trackKey}/${courseId}`}
            className="truncate text-sm font-medium text-slate-400 hover:text-slate-600"
          >
            {courseTitle}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="truncate text-sm font-semibold text-slate-900">Worksheet</span>
        </>
      }
      mainClassName="max-w-[920px] py-6"
    >
      {/* ── header ── */}
      <div
        className="relative mb-5 overflow-hidden rounded-2xl px-6 py-6 text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        <div className="absolute -right-3 -top-2 opacity-20">
          <WorksheetMark worksheetKey={worksheet.key} className="h-36 w-36" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
          {worksheet.level} · Learner worksheet
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{worksheet.title}</h1>
        <p className="mt-1 text-sm text-white/80">{worksheet.moduleTitle}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/30">
          <Info className="h-3.5 w-3.5" /> Optional — but completing it earns full completion
        </span>
      </div>

      {worksheet.intro && (
        <Callout text={worksheet.intro} color={color} />
      )}

      {status === 'submitted' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Submitted. The worked answers are at the bottom of this page.
          </p>
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 disabled:opacity-60"
          >
            <Pencil className="h-3.5 w-3.5" /> Reopen to edit
          </button>
        </div>
      )}

      {/* ── progress ── */}
      <div className="sticky top-0 z-10 mb-5 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-600">
            {progress.answered} of {progress.total} answered
          </span>
          <span className="text-[11px] text-slate-400">
            {saving ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </span>
            ) : savedAt ? (
              `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            ) : (
              'Nothing saved yet'
            )}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress.total ? (progress.answered / progress.total) * 100 : 0}%`,
              background: color,
            }}
          />
        </div>
      </div>

      <div className="space-y-6">
        {worksheet.sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            answers={answers}
            setField={setField}
            readOnly={readOnly}
            color={color}
          />
        ))}
      </div>

      {/* ── submit ── */}
      {status === 'draft' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Finished?</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            {progress.answered === progress.total
              ? 'Everything is answered. Submitting releases the worked answers and earns full completion for this release.'
              : `You have ${progress.total - progress.answered} unanswered of ${progress.total}. You can still submit — nothing here is marked — but the worked answers are worth more once you have had your own go.`}
          </p>
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: color }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Submit worksheet
          </button>
        </div>
      )}

      <AnswersPanel sections={worksheet.answers} unlocked={status === 'submitted'} color={color} />
    </LearningHubShell>
  );
}

/* ─── blocks ──────────────────────────────────────────────────── */

function Callout({ text, color }: { text: string; color: string }) {
  return (
    <div
      className="mb-5 rounded-xl border-l-4 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700"
      style={{ borderColor: color }}
    >
      {text}
    </div>
  );
}

function SectionCard({
  section,
  answers,
  setField,
  readOnly,
  color,
}: {
  section: WorksheetSection;
  answers: Answers;
  setField: (id: string, value: unknown) => void;
  readOnly: boolean;
  color: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3" style={{ background: `${color}0a` }}>
        <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        {section.blocks.map((block, i) => (
          <Block
            key={blockKey(block, i)}
            block={block}
            answers={answers}
            setField={setField}
            readOnly={readOnly}
            color={color}
          />
        ))}
      </div>
    </section>
  );
}

/** Prose and tables carry no id of their own, so position disambiguates those. */
function blockKey(block: WorksheetBlock, i: number) {
  return 'id' in block && block.id ? block.id : `${block.type}-${i}`;
}

function Block({
  block,
  answers,
  setField,
  readOnly,
  color,
}: {
  block: WorksheetBlock;
  answers: Answers;
  setField: (id: string, value: unknown) => void;
  readOnly: boolean;
  color: string;
}) {
  switch (block.type) {
    case 'prose':
      return <p className="text-[13.5px] leading-relaxed text-slate-700">{block.text}</p>;

    case 'subheading':
      return <h3 className="pt-1 text-[13px] font-bold text-slate-800">{block.text}</h3>;

    case 'callout':
      return (
        <div
          className="rounded-lg border border-dashed px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600"
          style={{ borderColor: `${color}66`, background: `${color}08` }}
        >
          {block.text}
        </div>
      );

    case 'prompts':
      return <PromptList items={block.items} color={color} />;

    case 'caseTable':
      return <CaseTable head={block.head} rows={block.rows} />;

    case 'grid':
      return (
        <GridInput
          head={block.head}
          rows={block.rows}
          value={(answers[block.id] as Record<string, string>) ?? {}}
          onChange={(v) => setField(block.id, v)}
          readOnly={readOnly}
          color={color}
        />
      );

    case 'task':
      return (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-bold text-slate-900">{block.title}</h3>
            {block.pauseMinutes != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <Clock className="h-3 w-3" /> pause {block.pauseMinutes} min
              </span>
            )}
          </div>
          {block.prompts.length > 0 && (
            <div className="mt-2">
              <PromptList items={block.prompts} color={color} />
            </div>
          )}
          {block.field && (
            <div className="mt-3">
              <TextInput
                field={block.field}
                value={String(answers[block.field.id] ?? '')}
                onChange={(v) => setField(block.field!.id, v)}
                readOnly={readOnly}
                color={color}
              />
            </div>
          )}
          {/* Four of the ten Level 2 tasks are worked in a grid further down the sheet. Saying so
              is the difference between a task with no box and a task you have missed. */}
          {!block.field && block.redirect && (
            <p className="mt-2.5 text-[12.5px] font-medium italic text-slate-500">
              {block.redirect}
            </p>
          )}
        </div>
      );

    case 'question':
      return (
        <div>
          <p className="text-[13.5px] leading-relaxed text-slate-800">
            <span className="mr-1.5 font-bold" style={{ color }}>
              {block.mark}
            </span>
            {block.text}
          </p>
          {block.field && (
            <div className="mt-1.5">
              <TextInput
                field={block.field}
                value={String(answers[block.field.id] ?? '')}
                onChange={(v) => setField(block.field!.id, v)}
                readOnly={readOnly}
                color={color}
              />
            </div>
          )}
          {!block.field && block.redirect && (
            <p className="mt-1 text-[12.5px] font-medium italic text-slate-500">{block.redirect}</p>
          )}
        </div>
      );

    case 'freeNote':
      return (
        <div>
          {block.label && (
            <label
              htmlFor={block.field.id}
              className="mb-1 block text-[12px] font-semibold text-slate-700"
            >
              {block.label}
            </label>
          )}
          <TextInput
            field={block.field}
            value={String(answers[block.field.id] ?? '')}
            onChange={(v) => setField(block.field.id, v)}
            readOnly={readOnly}
            color={color}
          />
        </div>
      );

    default:
      return null;
  }
}

function PromptList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
          <CircleDot className="mt-1 h-3 w-3 shrink-0" style={{ color }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CaseTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Table2 className="h-3 w-3" /> Case data — read only
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-slate-500">
              {head.map((h, i) => (
                <th key={`${h}-${i}`} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-1.5 tabular-nums ${ci === 0 ? 'font-medium text-slate-700' : 'text-slate-600'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A table the learner completes.
 *
 * Cells the document already filled stay as text; the blanks become inputs. The value is a map
 * keyed "row:col" rather than a nested array, so adding a row to a definition later does not
 * renumber everybody's existing answers.
 */
function GridInput({
  head,
  rows,
  value,
  onChange,
  readOnly,
  color,
}: {
  head: string[];
  rows: { v?: string; input?: boolean }[][];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  readOnly: boolean;
  color: string;
}) {
  const filled = Object.values(value).filter((v) => String(v ?? '').trim()).length;
  const inputs = rows.flat().filter((c) => c.input).length;

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: `${color}55` }}>
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ borderColor: `${color}33`, background: `${color}0d`, color }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Pencil className="h-3 w-3" /> Complete this table
        </span>
        <span className="font-semibold tabular-nums">
          {filled}/{inputs}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-slate-500">
              {head.map((h, i) => (
                <th key={`${h}-${i}`} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) =>
                  cell.input ? (
                    <td key={ci} className="p-0">
                      <input
                        type="text"
                        aria-label={`${head[ci] ?? `Column ${ci + 1}`}, row ${ri + 1}`}
                        value={value[`${ri}:${ci}`] ?? ''}
                        onChange={(e) => onChange({ ...value, [`${ri}:${ci}`]: e.target.value })}
                        readOnly={readOnly}
                        className="w-full min-w-[86px] bg-amber-50/40 px-3 py-1.5 text-[12.5px] tabular-nums text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-inset read-only:bg-slate-50 read-only:text-slate-500"
                        style={{ '--tw-ring-color': color } as React.CSSProperties}
                      />
                    </td>
                  ) : (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 tabular-nums ${ci === 0 ? 'font-medium text-slate-700' : 'text-slate-600'}`}
                    >
                      {cell.v}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextInput({
  field,
  value,
  onChange,
  readOnly,
  color,
}: {
  field: { id: string; kind: 'short_text' | 'long_text'; rows: number };
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  color: string;
}) {
  const shared =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-relaxed text-slate-800 outline-none transition-shadow placeholder:text-slate-300 focus:border-transparent focus:ring-2 read-only:bg-slate-50 read-only:text-slate-500';
  const ring = { '--tw-ring-color': color } as React.CSSProperties;

  if (field.kind === 'short_text') {
    return (
      <input
        id={field.id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Your answer"
        className={shared}
        style={ring}
      />
    );
  }
  return (
    <textarea
      id={field.id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      rows={Math.min(10, Math.max(3, field.rows))}
      placeholder="Your answer"
      className={`${shared} resize-y`}
      style={ring}
    />
  );
}

/* ─── worked answers ──────────────────────────────────────────── */

/**
 * The answers document, released on submission.
 *
 * The worksheets say so themselves: "work each task before you look at the answers". Reading the
 * worked answer first teaches nothing, and the whole value of these tasks is discovering that your
 * own confident figure moved. So the panel exists either way, and says what unlocks it.
 */
function AnswersPanel({
  sections,
  unlocked,
  color,
}: {
  sections: WorksheetAnswerSection[];
  unlocked: boolean;
  color: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (sections.length === 0) return null;

  if (!unlocked) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center">
        <Lock className="mx-auto h-5 w-5 text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Worked answers — {sections.length} sections
        </p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
          These unlock when you submit. Finding that your own answer moved is the point of the
          exercise, and reading the solution first removes it.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3" style={{ background: `${color}0a` }}>
        <h2 className="text-sm font-bold text-slate-900">Worked answers</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {sections.map((s) => {
          const isOpen = open === s.title;
          return (
            <div key={s.title}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.title)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="text-[13px] font-semibold text-slate-800">{s.title}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="space-y-3 bg-slate-50/60 px-5 py-4">
                  {s.blocks.map((b, i) => (
                    <AnswerBlock key={`${b.type}-${i}`} block={b} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnswerBlock({ block }: { block: WorksheetBlock }) {
  switch (block.type) {
    case 'subheading':
      return <h4 className="pt-1 text-[13px] font-bold text-slate-800">{block.text}</h4>;
    case 'callout':
      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
          {block.text}
        </div>
      );
    case 'prompts':
      return (
        <ul className="ml-4 list-disc space-y-1">
          {block.items.map((item) => (
            <li key={item} className="text-[13px] leading-relaxed text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'caseTable':
      return <CaseTable head={block.head} rows={block.rows} />;
    default:
      return 'text' in block && block.text ? (
        <p className="text-[13.5px] leading-relaxed text-slate-700">{block.text}</p>
      ) : null;
  }
}
