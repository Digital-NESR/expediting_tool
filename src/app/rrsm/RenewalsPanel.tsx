'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · annual renewals.

   The question that arrives once a year per line rather than once
   a month: this contract ends — do we extend it?

   Sorted by how close the date is, because that is the only order
   anybody wants it in. Twelve months of actual use sits beside
   each one, since the decision worth taking is informed by whether
   the thing was used at all, and a line that ran at zero for a
   year is the one most worth arguing about.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Loader2, X } from 'lucide-react';
import {
  decideRrsmRenewal,
  getRrsmRenewals,
  type RenewalBoard,
  type RenewalRow,
} from '@/app/actions/rrsm/renewals';
import {
  RENEWAL_STATUS_LABEL,
  daysUntil,
  urgencyOf,
  type RenewalDecision,
  type Urgency,
} from '@/lib/rrsm/renewals';

const BRAND = '#307c4c';

const URGENCY_TONE: Record<Urgency, string> = {
  overdue: 'bg-red-50 text-red-700',
  urgent: 'bg-amber-50 text-amber-800',
  soon: 'bg-slate-100 text-slate-600',
  ahead: 'bg-slate-50 text-slate-500',
};

const DECISIONS: { id: RenewalDecision; label: string; tone: 'go' | 'warn' | 'stop' }[] = [
  { id: 'extended', label: 'Extend 12 months', tone: 'go' },
  { id: 'scope_change', label: 'Extend with scope change', tone: 'warn' },
  { id: 'not_extended', label: 'Do not extend', tone: 'stop' },
];

export default function RenewalsPanel({
  countryCode,
  preview,
}: {
  countryCode: string;
  /** Supplied instead of fetched, for `/dev-preview/rrsm-renewals` only. Buttons then do nothing. */
  preview?: RenewalBoard;
}) {
  const [board, setBoard] = useState<RenewalBoard | null>(preview ?? null);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  /* Today is read once and passed down, so every row on the screen is measured against the same
     day. Reading it per row would let a list rendered over midnight disagree with itself. */
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (preview) return;
    let live = true;
    void getRrsmRenewals(countryCode).then((b) => {
      if (live) setBoard(b);
    });
    return () => {
      live = false;
    };
  }, [countryCode, preview]);

  async function decide(row: RenewalRow, decision: RenewalDecision) {
    setBusy(row.id);
    setError('');
    const r = await decideRrsmRenewal({ renewalId: row.id, decision, note });
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
    } else {
      setOpen(null);
      setNote('');
      if (!preview) setBoard(await getRrsmRenewals(countryCode));
    }
    setBusy(null);
  }

  if (!board) {
    return (
      <div className="flex items-center gap-2 py-12 text-[13.5px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading renewals…
      </div>
    );
  }

  const pending = board.rows.filter((r) => r.status === 'pending');

  if (!board.rows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center">
        <CalendarClock className="mx-auto h-7 w-7 text-slate-300" />
        <h2 className="mt-3 text-[16px] font-semibold text-slate-900">Nothing is coming up</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500">
          No contract in {board.countryName} ends within the next 90 days. Lines with no end date on
          the register never appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13.5px] text-slate-600">
          <b className="text-slate-900">{pending.length}</b> awaiting a decision ·{' '}
          {board.rows.length - pending.length} decided · next 90 days
        </p>
        {!board.canDecide && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-500">
            Read-only — extending is a buyer&apos;s decision
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2.5">
        {board.rows.map((r) => {
          const left = daysUntil(new Date(r.dueOn + 'T00:00:00Z'), today);
          const urgency = urgencyOf(new Date(r.dueOn + 'T00:00:00Z'), today);
          const isOpen = open === r.id;
          const decided = r.status !== 'pending';

          return (
            <div
              key={r.id}
              className={`rounded-xl border bg-white ${
                isOpen ? 'border-[#6AAF8E]' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[14rem] flex-1">
                  <div className="font-medium text-slate-800">{r.description}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-slate-400">
                    {r.assetRef && <span>{r.assetRef}</span>}
                    <span>{r.segment}</span>
                    <span>{r.supplierName}</span>
                  </div>
                </div>

                <div className="text-[12.5px]">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${URGENCY_TONE[urgency]}`}>
                    {left < 0
                      ? `${Math.abs(left)} days overdue`
                      : left === 0
                        ? 'Ends today'
                        : `${left} days left`}
                  </span>
                  <span className="ml-2 font-mono text-slate-400">{r.dueOn}</span>
                </div>

                <div className="min-w-[9rem] text-[12.5px] text-slate-500">
                  {r.monthsUsed === 0 ? (
                    <span className="font-semibold text-amber-700">Unused for 12 months</span>
                  ) : (
                    <>
                      Used <b className="text-slate-700">{r.monthsUsed}</b> of 12 months
                    </>
                  )}
                </div>

                {decided ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                      r.status === 'not_extended'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-[#e6f1ea] text-[#1d4f31]'
                    }`}
                  >
                    {RENEWAL_STATUS_LABEL[r.status]}
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setOpen(isOpen ? null : r.id);
                      setNote('');
                    }}
                    disabled={!board.canDecide}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-40"
                  >
                    {isOpen ? 'Close' : 'Decide'}
                  </button>
                )}
              </div>

              {decided && (r.note || r.decidedBy) && (
                <div className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
                  {r.decidedBy && (
                    <>
                      {r.decidedBy} on {r.decidedAt}
                      {r.extendsTo && ` · now ends ${r.extendsTo}`}
                    </>
                  )}
                  {r.note && <div className="mt-0.5 italic">{r.note}</div>}
                </div>
              )}

              {isOpen && !decided && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
                  <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-slate-600">
                    <span>
                      Rate{' '}
                      <b className="font-mono text-slate-800">
                        {r.rate === null ? '—' : r.rate} {board.currency}
                      </b>{' '}
                      per {r.uom}
                    </span>
                    <span>
                      Total quantity over 12 months{' '}
                      <b className="font-mono text-slate-800">{r.qtyTotal}</b>
                    </span>
                    {r.requesterEmail && <span>Requester {r.requesterEmail}</span>}
                  </div>

                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Why — the one thing somebody reading this next year will want."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#6AAF8E]"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {DECISIONS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => void decide(r, d.id)}
                        disabled={busy === r.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-40 ${
                          d.tone === 'go'
                            ? 'text-white'
                            : d.tone === 'stop'
                              ? 'bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border border-slate-300 text-slate-700 hover:bg-white'
                        }`}
                        style={d.tone === 'go' ? { background: BRAND } : undefined}
                      >
                        {busy === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : d.tone === 'go' ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : d.tone === 'stop' ? (
                          <X className="h-3.5 w-3.5" />
                        ) : null}
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] text-slate-400">
                    An extension runs twelve months from {r.dueOn}, not from today, so the
                    anniversary does not drift. Declining leaves the end date alone — somebody still
                    has to off-hire the line when it arrives.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
