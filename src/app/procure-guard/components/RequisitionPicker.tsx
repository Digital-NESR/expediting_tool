'use client';

import { useEffect, useRef, useState } from 'react';
import { searchReleasedPurchaseRequisitions } from '@/app/actions/procure-guard/released-prs';
import type { ReleasedPrOption } from '@/lib/procure-guard/released-prs';
import {
  formatRequisitionNumbers,
  parseRequisitionNumbers,
  REQUISITION_PATTERN,
} from '@/lib/procure-guard/requisition';

const BOX =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400';
const BOX_ERR =
  'w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 placeholder:text-slate-400';

/**
 * The requisition field: numbers already on the request as chips, and one box to add the next.
 *
 * A request can cite several PRs and always could — people were typing
 * `1005034844/1005035231/1005034844` into a free-text box, repeat and all. Each is now its own
 * chip, which is what makes a repeat visible and removable.
 *
 * THE PICKER SUGGESTS, IT DOES NOT DECIDE. The list comes from RFx Officer's released PRs, which
 * cover about one in ten of the numbers requesters actually file, so a PR that is not in the list
 * is an ordinary thing: type the ten digits and it is accepted. What is enforced is the shape,
 * and it is enforced again on the server, because this component is a convenience and not a
 * guard.
 *
 * THE DRAFT COUNTS AS PART OF THE VALUE. Whatever is half-typed in the box is included in what
 * the parent holds, so a requester who types a good number and submits without pressing Enter
 * keeps it, and one who types rubbish is told rather than having it silently dropped.
 */
export default function RequisitionPicker({
  value,
  onChange,
  country,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Sorts the suggestions; never filters them. See `released-prs.ts`. */
  country?: string;
  invalid?: boolean;
}) {
  const [chips, setChips] = useState<string[]>(() => parseRequisitionNumbers(value).numbers);
  /* Seeded with anything in the stored value that is not a PR number, which is how an old
     request reading "NA" or "07-2026" opens for editing: visible in the box, with the error
     under it, rather than silently discarded on open and lost on save. */
  const [draft, setDraft] = useState(() => parseRequisitionNumbers(value).invalid.join(' '));
  const [results, setResults] = useState<ReleasedPrOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);

  /* What the parent holds is the chips plus whatever is in the box. Emitted from an effect so a
     render is never the thing that calls setState on the parent. */
  useEffect(() => {
    const next = formatRequisitionNumbers([...chips, draft.trim()].filter(Boolean));
    if (next === emitted.current) return;
    emitted.current = next;
    onChange(next);
  }, [chips, draft, onChange]);

  /* The parent reset the field to something this component did not produce - the edit form
     loading a different request. Re-derive rather than keep showing the old one's chips.
 
     The second guard matters more than it looks. This effect and the one above write to each
     other, so the only thing standing between them and a render loop is that both stop when
     nothing changed. Comparing the parsed result rather than the string means a parent that
     rewrites what it is given - trimming it, reordering it, storing it differently - settles
     here instead of bouncing the value back and forth forever. */
  useEffect(() => {
    if (emitted.current === null || value === emitted.current) return;
    const parsed = parseRequisitionNumbers(value);
    emitted.current = value;
    const nextDraft = parsed.invalid.join(' ');
    const sameChips =
      parsed.numbers.length === chips.length && parsed.numbers.every((n, i) => n === chips[i]);
    if (sameChips && nextDraft === draft.trim()) return;
    setChips(parsed.numbers);
    setDraft(nextDraft);
  }, [value, chips, draft]);

  /* Only while the list is open. Searching on mount would put a round trip to another team's
     database on every load of a form most of whose visitors never touch this field. */
  useEffect(() => {
    if (!open) return;
    const q = draft.trim();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchReleasedPurchaseRequisitions(q, country ?? null);
      if (cancelled) return;
      setResults(rows);
      setHighlight(0);
      setLoading(false);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, country, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const add = (pr: string) => {
    setChips((current) => (current.includes(pr) ? current : [...current, pr]));
    setDraft('');
    setOpen(false);
  };

  const remove = (pr: string) => setChips((current) => current.filter((c) => c !== pr));

  /** Shown above the list when what is typed is already a usable number. */
  const typedIsUsable = REQUISITION_PATTERN.test(draft.trim()) && !chips.includes(draft.trim());

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      const typed = draft.trim();
      /* Enter inside a form submits it. Only taken over when there is something to commit, so
         Enter on an empty box still submits the request the way it always did. */
      const picked = open && results.length > 0 && !typedIsUsable ? results[highlight] : null;
      if (picked) {
        if (e.key !== 'Tab') e.preventDefault();
        add(picked.pr);
        return;
      }
      if (REQUISITION_PATTERN.test(typed)) {
        if (e.key !== 'Tab') e.preventDefault();
        add(typed);
      }
      return;
    }
    if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
      setChips((current) => current.slice(0, -1));
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((pr) => (
            <span
              key={pr}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#307c4c]/30 bg-[#307c4c]/10 py-1 pl-2.5 pr-1.5 text-sm font-semibold text-[#1f5733]"
            >
              <span className="font-mono">{pr}</span>
              <button
                type="button"
                onClick={() => remove(pr)}
                aria-label={`Remove requisition ${pr}`}
                className="rounded px-1 text-base leading-none text-[#1f5733]/60 transition hover:bg-[#307c4c]/20 hover:text-[#1f5733]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={invalid ? BOX_ERR : BOX}
        value={draft}
        placeholder={
          chips.length ? 'Add another requisition…' : 'Search or type a 10-digit PR number…'
        }
        aria-label="Requisition number"
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {/* Offered first, because a requester who knows their PR number and types it should not
              have to notice whether it happens to be in the list. */}
          {typedIsUsable && (
            <button
              type="button"
              onClick={() => add(draft.trim())}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50"
            >
              <span className="font-mono text-sm font-semibold text-slate-900">{draft.trim()}</span>
              <span className="text-xs text-slate-500">Use this number</span>
            </button>
          )}
          {loading && results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400">Searching released PRs…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-400">
              {draft.trim()
                ? 'No released PR matches. You can still enter any 10-digit number.'
                : 'Start typing a PR number or a description.'}
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.pr}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => add(r.pr)}
                disabled={chips.includes(r.pr)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition disabled:opacity-40 ${
                  i === highlight && !typedIsUsable ? 'bg-[#307c4c]/10' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{r.pr}</span>
                  {r.releasedOn && <span className="text-[0.6875rem] text-slate-400">{r.releasedOn}</span>}
                </span>
                {r.description && (
                  <span className="line-clamp-1 text-xs text-slate-600">{r.description}</span>
                )}
                <span className="text-[0.6875rem] text-slate-400">
                  {[
                    r.country,
                    r.requisitioner,
                    `${r.lines} ${r.lines === 1 ? 'line' : 'lines'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
