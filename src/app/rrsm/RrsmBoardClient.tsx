'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · the monthly cycle, from both sides.

   One board with two views rather than two screens, because they
   are the same rows: Ops confirm what was used, the buyer puts it
   on a PO, and a line moves between them. Splitting them into two
   routes would make the handover invisible — which is the thing
   the Kuwait workbooks lose by being two separate sheets.

   What Ops may touch and what a buyer may touch do not overlap.
   Ops own on-hire, days, quantity and a note; the buyer owns the
   PR and PO numbers, the SAP status and the invoice. Nobody
   edits the rate here: it comes from the register.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Forklift,
  Loader2,
  Lock,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import {
  closeValidatedLines,
  moveRrsmLine,
  openRrsmCycle,
  saveBuyerRefs,
  saveOpsLine,
  type BoardLine,
  type RrsmBoard,
} from '@/app/actions/rrsm/cycle';
import {
  ERP_STATUS_LABEL,
  STAGE_LABEL,
  compareToPrevious,
  invoiceMatches,
  lineValue,
  movesFor,
  periodLabel,
  type CycleStage,
  type ErpStatus,
} from '@/lib/rrsm/cycle';

const BRAND = '#307c4c';

type View = 'ops' | 'buyer';

const STAGE_TONE: Record<CycleStage, string> = {
  awaiting_supplier: 'bg-slate-100 text-slate-600',
  submitted: 'bg-amber-50 text-amber-700',
  validated: 'bg-[#e6f1ea] text-[#1d4f31]',
  returned: 'bg-red-50 text-red-700',
  closed: 'bg-slate-900 text-white',
};

export default function RrsmBoardClient({ board }: { board: RrsmBoard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  /* Opens on whichever half this person actually does. Somebody who holds both sees Ops first,
     because the cycle starts there and a buyer has nothing to act on until it has. */
  const [view, setView] = useState<View>(board.canValidate ? 'ops' : 'buyer');

  const money = useMemo(
    () =>
      new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );

  const lines = useMemo(() => board.suppliers.flatMap((s) => s.lines), [board.suppliers]);
  const total = useMemo(() => lines.reduce((n, l) => n + lineValue(l.qty, l.rate), 0), [lines]);
  const readyToClose = useMemo(
    () => lines.filter((l) => l.stage === 'validated' && l.poNumber).length,
    [lines],
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(key);
    setError('');
    const r = await fn();
    if (!r.success) setError(r.error ?? 'That did not work.');
    else refresh();
    setBusy(null);
  }

  /* ── nothing to show ─────────────────────────────────────── */

  if (!board.country) {
    return (
      <Shell>
        <Empty
          title="No country is live for you yet"
          body="RRSM is switched on country by country. You hold a grant, but the country it covers has not been switched on, so there is nothing here to work on."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* ── header ──────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: BRAND }}
          >
            <Forklift className="h-3.5 w-3.5" />
            RRSM
          </div>
          <h1 className="mt-1 truncate text-[22px] font-bold tracking-tight text-slate-900">
            {board.cycle
              ? `${periodLabel(new Date(board.cycle.period + 'T00:00:00Z'))} cycle`
              : 'No cycle open'}
          </h1>
          {board.cycle && (
            <p className="mt-0.5 text-[13px] text-slate-500">
              {board.cycle.opensOn} to {board.cycle.closesOn} · {lines.length} lines ·{' '}
              <b className="text-slate-700">
                {money.format(total)} {board.country.currency}
              </b>
            </p>
          )}
        </div>

        <CountryScope board={board} />
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── no cycle yet ────────────────────────────────────── */}
      {!board.cycle ? (
        <Empty
          title={`Nothing open for ${board.country.name}`}
          body={
            board.canValidate
              ? 'Opening a cycle copies every asset still on hire from last month, with today’s rates and the quantity confirmed last time. You then confirm each one.'
              : 'Ops open the cycle. There is nothing to put on a PO until they have.'
          }
          action={
            board.canValidate ? (
              <button
                onClick={() =>
                  void run('open', () => openRrsmCycle(board.country!.code, board.suggestedPeriod))
                }
                disabled={busy === 'open'}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy === 'open' && <Loader2 className="h-4 w-4 animate-spin" />}
                Open {periodLabel(new Date(board.suggestedPeriod + 'T00:00:00Z'))}
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {/* ── view switch ─────────────────────────────────── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(
                [
                  ['ops', 'Ops · what was used', board.canValidate],
                  ['buyer', 'Buyer · PR and PO', board.canBuy],
                ] as [View, string, boolean][]
              ).map(([id, label, allowed]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  disabled={!allowed}
                  title={allowed ? undefined : 'You do not hold that role in this country'}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    view === id ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  style={view === id ? { background: BRAND } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {view === 'buyer' && board.canBuy && (
              <button
                onClick={() => void run('close', () => closeValidatedLines(board.cycle!.id))}
                disabled={!readyToClose || busy === 'close'}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                style={{ background: BRAND }}
                title={
                  readyToClose
                    ? undefined
                    : 'A validated line needs a PO number before it can be closed'
                }
              >
                {busy === 'close' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Close all ready · {readyToClose}
              </button>
            )}
          </div>

          {/* ── the lines, grouped by supplier ──────────────── */}
          <div className="space-y-5">
            {board.suppliers.map((s) => (
              <section
                key={s.code}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                  <h2 className="text-[13.5px] font-semibold text-slate-800">{s.name}</h2>
                  <span className="font-mono text-[11px] text-slate-400">{s.code}</span>
                  {s.paymentTerms && (
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500">
                      {s.paymentTerms}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className="text-[12.5px] text-slate-500">
                    {money.format(s.lines.reduce((n, l) => n + lineValue(l.qty, l.rate), 0))}{' '}
                    {board.country!.currency}
                  </span>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-[13px]">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
                        <th className="px-4 py-2 text-left font-semibold">Asset / service</th>
                        {view === 'ops' ? (
                          <>
                            <th className="px-2 py-2 text-left font-semibold">On hire</th>
                            <th className="px-2 py-2 text-right font-semibold">Days</th>
                            <th className="px-2 py-2 text-right font-semibold">Qty</th>
                            <th className="px-2 py-2 text-right font-semibold">Rate</th>
                            <th className="px-2 py-2 text-right font-semibold">Total</th>
                            <th className="px-2 py-2 text-right font-semibold">vs last month</th>
                          </>
                        ) : (
                          <>
                            <th className="px-2 py-2 text-right font-semibold">Total</th>
                            <th className="px-2 py-2 text-left font-semibold">PR</th>
                            <th className="px-2 py-2 text-left font-semibold">PO</th>
                            <th className="px-2 py-2 text-left font-semibold">SAP status</th>
                            <th className="px-2 py-2 text-left font-semibold">Invoice</th>
                          </>
                        )}
                        <th className="px-4 py-2 text-right font-semibold">Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((l) => (
                        <Row
                          key={l.id}
                          line={l}
                          view={view}
                          currency={board.country!.currency}
                          money={money}
                          canValidate={board.canValidate}
                          canBuy={board.canBuy}
                          busy={busy}
                          onRun={run}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          {!board.suppliers.length && (
            <Empty
              title="The cycle is open and empty"
              body="Nothing was carried forward, which means the register has no active service lines for this country yet."
            />
          )}
        </>
      )}

      {pending && (
        <div className="pointer-events-none fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3.5 py-2 text-[12.5px] font-medium text-white">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing
        </div>
      )}
    </Shell>
  );
}

/* ─── one line ───────────────────────────────────────────────────────────────────────────── */

function Row({
  line,
  view,
  currency,
  money,
  canValidate,
  canBuy,
  busy,
  onRun,
}: {
  line: BoardLine;
  view: View;
  currency: string;
  money: Intl.NumberFormat;
  canValidate: boolean;
  canBuy: boolean;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    onHire: line.onHire,
    days: line.days === null ? '' : String(line.days),
    qty: String(line.qty),
    opsNote: line.opsNote,
    prNumber: line.prNumber,
    poNumber: line.poNumber,
    erpStatus: line.erpStatus ?? '',
    supplierInvoice: line.supplierInvoice === null ? '' : String(line.supplierInvoice),
  });

  const delta = compareToPrevious({ qty: line.qty, rate: line.rate }, line.previous);
  const value = lineValue(line.qty, line.rate);
  const match = invoiceMatches(value, line.supplierInvoice);

  /* Ops may edit only before validation; the buyer only after it. The two windows do not
     overlap, which is what makes "who changed this" answerable. */
  const opsEditable =
    canValidate &&
    (line.stage === 'awaiting_supplier' || line.stage === 'returned' || line.stage === 'submitted');
  const buyerEditable = canBuy && (line.stage === 'validated' || line.stage === 'returned');

  const key = 'line:' + line.id;
  const working = busy === key;

  const moves = [
    ...(canValidate ? movesFor(line.stage, 'ops') : []),
    ...(canBuy ? movesFor(line.stage, 'buyer') : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <tr className="border-t border-slate-100 align-middle">
      <td className="px-4 py-2.5">
        <div className="flex items-start gap-2">
          {!line.onHire && (
            <span className="mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              OFF
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800">{line.description}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-slate-400">
              {line.assetRef && <span>{line.assetRef}</span>}
              <span>{line.segment}</span>
              <span>{line.costCenter}</span>
              {line.serviceNumber && <span>SN {line.serviceNumber}</span>}
            </div>
            {line.opsNote && !opsEditable && (
              <div className="mt-0.5 text-[11.5px] italic text-slate-500">{line.opsNote}</div>
            )}
          </div>
        </div>
      </td>

      {view === 'ops' ? (
        <>
          <td className="px-2 py-2.5">
            <input
              type="checkbox"
              checked={draft.onHire}
              disabled={!opsEditable}
              onChange={(e) => setDraft({ ...draft, onHire: e.target.checked })}
              className="h-4 w-4 accent-[#307c4c] disabled:opacity-40"
              aria-label="Still on hire"
            />
          </td>
          <td className="px-2 py-2.5 text-right">
            <Num
              value={draft.days}
              disabled={!opsEditable}
              onChange={(v) => setDraft({ ...draft, days: v })}
            />
          </td>
          <td className="px-2 py-2.5 text-right">
            <Num
              value={draft.qty}
              disabled={!opsEditable}
              onChange={(v) => setDraft({ ...draft, qty: v })}
            />
          </td>
          <td className="px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-500">
            {line.rate === null ? '—' : money.format(line.rate)}
          </td>
          <td className="px-2 py-2.5 text-right font-mono font-semibold text-slate-800">
            {money.format(value)}
          </td>
          <td className="px-2 py-2.5 text-right">
            <Delta delta={delta} money={money} />
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-2.5 text-right font-mono font-semibold text-slate-800">
            {money.format(value)}
          </td>
          <td className="px-2 py-2.5">
            <Text
              value={draft.prNumber}
              disabled={!buyerEditable}
              placeholder="PR"
              onChange={(v) => setDraft({ ...draft, prNumber: v })}
            />
          </td>
          <td className="px-2 py-2.5">
            <Text
              value={draft.poNumber}
              disabled={!buyerEditable}
              placeholder="PO"
              onChange={(v) => setDraft({ ...draft, poNumber: v })}
            />
          </td>
          <td className="px-2 py-2.5">
            <select
              value={draft.erpStatus}
              disabled={!buyerEditable}
              onChange={(e) => setDraft({ ...draft, erpStatus: e.target.value })}
              className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[12px] outline-none disabled:border-transparent disabled:bg-transparent"
            >
              <option value="">—</option>
              {(Object.keys(ERP_STATUS_LABEL) as ErpStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ERP_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </td>
          <td className="px-2 py-2.5">
            <div className="flex items-center gap-1.5">
              <Num
                value={draft.supplierInvoice}
                disabled={!buyerEditable}
                onChange={(v) => setDraft({ ...draft, supplierInvoice: v })}
              />
              {match === 'mismatch' && (
                <span
                  title={`Invoice does not match the validated ${money.format(value)} ${currency}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </span>
              )}
              {match === 'match' && <Check className="h-3.5 w-3.5 text-[#1d4f31]" />}
            </div>
          </td>
        </>
      )}

      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${STAGE_TONE[line.stage]}`}
          >
            {STAGE_LABEL[line.stage]}
          </span>

          {(opsEditable || buyerEditable) && (
            <button
              onClick={() =>
                void onRun(key, () =>
                  view === 'ops'
                    ? saveOpsLine({
                        lineId: line.id,
                        onHire: draft.onHire,
                        days: draft.days === '' ? null : Number(draft.days),
                        qty: Number(draft.qty || 0),
                        opsNote: draft.opsNote,
                      })
                    : saveBuyerRefs({
                        lineId: line.id,
                        prNumber: draft.prNumber,
                        poNumber: draft.poNumber,
                        erpStatus: (draft.erpStatus || null) as ErpStatus | null,
                        supplierInvoice:
                          draft.supplierInvoice === '' ? null : Number(draft.supplierInvoice),
                      }),
                )
              }
              disabled={working}
              className="rounded border border-slate-200 px-2 py-1 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              {working ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </button>
          )}

          {moves.map((to) => (
            <button
              key={to}
              onClick={() => void onRun(key, () => moveRrsmLine({ lineId: line.id, to }))}
              disabled={working}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-semibold disabled:opacity-40 ${
                to === 'returned'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : 'text-white hover:opacity-90'
              }`}
              style={to === 'returned' ? undefined : { background: BRAND }}
            >
              {to === 'returned' ? <Undo2 className="h-3 w-3" /> : null}
              {to === 'returned' ? 'Return' : STAGE_LABEL[to]}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

/* ─── bits ───────────────────────────────────────────────────────────────────────────────── */

function Num({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono text-[12.5px] outline-none focus:border-[#6AAF8E] disabled:border-transparent disabled:bg-transparent"
    />
  );
}

function Text({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 rounded border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] outline-none focus:border-[#6AAF8E] disabled:border-transparent disabled:bg-transparent"
    />
  );
}

function Delta({
  delta,
  money,
}: {
  delta: ReturnType<typeof compareToPrevious>;
  money: Intl.NumberFormat;
}) {
  if (delta.kind === 'new') {
    return (
      <span className="rounded bg-[#e6f1ea] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#1d4f31]">
        NEW
      </span>
    );
  }
  if (delta.kind === 'same') return <span className="text-[12px] text-slate-300">—</span>;
  const up = delta.kind === 'up';
  return (
    <span className={`font-mono text-[12px] ${up ? 'text-red-600' : 'text-[#1d4f31]'}`}>
      {up ? '+' : ''}
      {money.format(delta.amount ?? 0)}
      {delta.fraction !== null && (
        <span className="ml-1 text-[10.5px] opacity-70">
          {up ? '+' : ''}
          {Math.round(delta.fraction * 100)}%
        </span>
      )}
    </span>
  );
}

/**
 * The country this board is showing.
 *
 * A picker only when there is a choice. A buyer holds one country and has nothing to pick, so
 * they get a label that says what they are looking at — the same rule, and the same shape, as
 * the SourceGuide mappings screen and the SOA board.
 */
function CountryScope({ board }: { board: RrsmBoard }) {
  const router = useRouter();
  if (!board.country) return null;

  if (board.available.length > 1) {
    return (
      <div className="relative">
        <select
          value={board.country.code}
          onChange={(e) => router.push(`/rrsm?country=${encodeURIComponent(e.target.value)}`)}
          className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[13.5px] font-semibold text-slate-800 outline-none"
        >
          {board.available.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f1ea] px-3 py-1.5 text-[12px] font-semibold text-[#1d4f31]">
      <Lock className="h-3 w-3" />
      {board.country.name}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
        <Link
          href="/home"
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Applications
        </Link>
        {children}
      </div>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center">
      <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
