'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · link a monthly line to its PR.

   The one link a person makes. Everything after it (the PO, its
   approval, the service entry) is read from SAP. Suggestions come
   from SAP's service POs for this supplier during the cycle,
   nearest the line's value first; a PR that is not on a PO yet
   has no vendor in SAP, so that one is typed.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import {
  getPrSuggestions,
  linkLinePr,
  type BoardLine,
  type PrSuggestions,
} from '@/app/actions/rrsm/cycle';
import { cleanPrNumber } from '@/lib/rrsm/sap';

type Run = () => Promise<{ success: boolean; error?: string }>;

export default function PrLinkDialog({
  line,
  supplierName,
  siblings,
  money,
  onClose,
  onDone,
}: {
  line: BoardLine;
  supplierName: string;
  siblings: number[];
  money: Intl.NumberFormat;
  onClose: () => void;
  onDone: (fn: Run) => void;
}) {
  const [data, setData] = useState<PrSuggestions | null>(null);
  const [typed, setTyped] = useState(line.prNumber);
  const [alsoOthers, setAlsoOthers] = useState(false);

  useEffect(() => {
    let live = true;
    void getPrSuggestions(line.id).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [line.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const value = (line.qty || 0) * (line.rate || 0);
  const typedOk = typed.trim() === '' || cleanPrNumber(typed) !== null;

  function link(pr: string) {
    const also = alsoOthers ? siblings : [];
    onDone(() => linkLinePr({ lineId: line.id, pr, alsoLineIds: also }));
  }

  const cands = data?.candidates ?? [];
  const only = cands.length === 1;

  /* Portalled to <body>: drawn inside a table cell, a fixed overlay is clipped by the scrolling
     table around it instead of covering the page. */
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link a PR"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900">Link a PR</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
              {supplierName} · {line.description} · {money.format(value)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            From SAP: this supplier&rsquo;s service POs this cycle
          </p>

          {!data ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking in SAP…
            </div>
          ) : data.candidates === null ? (
            <p className="py-4 text-[13px] text-amber-700">
              SAP data could not be read just now. Type the PR number below.
            </p>
          ) : !cands.length ? (
            <p className="py-4 text-[13px] text-slate-500">
              No service PO for this supplier in SAP this cycle yet. If the PR is raised but not on
              a PO, type its number below; RRSM fills in the PO once SAP converts it.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {cands.map((c, i) => {
                const used = data.usedOnLines[c.pr] ?? 0;
                const exact = c.value !== null && Math.abs(c.value - value) < 0.5;
                return (
                  <li key={c.pr}>
                    <button
                      type="button"
                      onClick={() => link(c.pr)}
                      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-[#307c4c]/50 hover:bg-[#307c4c]/[0.04]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[13px] font-semibold text-slate-900">
                            PR {c.pr}
                          </span>
                          {i === 0 && (only || exact) && (
                            <span className="rounded bg-[#e6f1ea] px-1.5 py-0.5 text-[10px] font-semibold text-[#1d4f31]">
                              {only ? 'Only match' : 'Same amount'}
                            </span>
                          )}
                          {used > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              on {used} other line{used === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-slate-500">
                          PO {c.pos.join(', ')} · {c.description || 'no description'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[12.5px] font-semibold text-slate-800">
                          {c.value === null ? '—' : money.format(c.value)} {c.currency}
                        </div>
                        <div className="text-[11px] text-slate-400">{c.createdOn}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Or type a PR number
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                inputMode="numeric"
                placeholder="1016006595"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-[#307c4c]"
              />
              <button
                type="button"
                disabled={!typed.trim() || !typedOk}
                onClick={() => link(typed)}
                className="shrink-0 rounded-lg bg-[#307c4c] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Link
              </button>
            </div>
            {!typedOk && (
              <p className="mt-1 text-[12px] text-red-600">Digits only, like 1016006595.</p>
            )}
          </div>

          {siblings.length > 0 && (
            <label className="mt-4 flex items-start gap-2 text-[13px] text-slate-600">
              <input
                type="checkbox"
                checked={alsoOthers}
                onChange={(e) => setAlsoOthers(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#307c4c]"
              />
              <span>
                Also link it to this supplier&rsquo;s {siblings.length} other line
                {siblings.length === 1 ? '' : 's'} with no PR (one PR often covers several).
              </span>
            </label>
          )}
        </div>

        {line.prNumber && (
          <footer className="border-t border-slate-100 px-5 py-3 text-right">
            <button
              type="button"
              onClick={() => onDone(() => linkLinePr({ lineId: line.id, pr: '' }))}
              className="text-[12.5px] font-semibold text-red-600 hover:underline"
            >
              Remove PR {line.prNumber} from this line
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
