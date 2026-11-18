'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · the monthly cycle, from either side.

   One component behind two pages (/rrsm/validation and
   /rrsm/purchasing), because they are the same rows: Ops confirm
   what was used, the buyer puts it on a PO, and a line moves
   between them. Both pages show every line with its stage, so the
   handover stays visible from either side — the thing the Kuwait
   workbooks lose by being two separate sheets.

   What Ops may touch and what a buyer may touch do not overlap.
   Ops own on-hire, days, quantity and a note; the buyer owns the
   PR and PO numbers, the SAP status and the invoice. Nobody
   edits the rate here: it comes from the register.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, Undo2 } from 'lucide-react';
import {
  closeValidatedLines,
  moveRrsmLine,
  openRrsmCycle,
  saveBuyerRefs,
  saveOpsLine,
  type BoardLine,
  type RrsmBoard,
} from '@/app/actions/rrsm/cycle';
import RrsmShell, {
  RrsmEmpty as Empty,
  RrsmNoCountry,
  RrsmNotYourRole,
} from './components/RrsmShell';
import {
  PO_RELEASE_LABEL,
  PR_RELEASE_LABEL,
  RECEIPT_LABEL,
  summarisePos,
  type SapPo,
  type SapPr,
  type SapStatus,
} from '@/lib/rrsm/sap';
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

export type BoardView = 'ops' | 'buyer';
type View = BoardView;

const TITLE: Record<View, string> = { ops: 'Ops validation', buyer: 'PR & PO' };

const STAGE_TONE: Record<CycleStage, string> = {
  awaiting_supplier: 'bg-slate-100 text-slate-600',
  submitted: 'bg-amber-50 text-amber-700',
  validated: 'bg-[#e6f1ea] text-[#1d4f31]',
  returned: 'bg-red-50 text-red-700',
  closed: 'bg-slate-900 text-white',
};

/** What the PR & PO page can narrow itself to, by SAP's state of each line's PO. */
type SapFilter = 'all' | 'under_release' | 'not_in_sap' | 'no_entry';

function sapFilterMatches(filter: SapFilter, line: BoardLine, sap: SapStatus): boolean {
  if (filter === 'all') return true;
  const po = sap.pos[line.poNumber.trim()];
  /* A line with no PO yet is not "missing from SAP"; it just has nothing to look up. */
  if (filter === 'not_in_sap') return Boolean(line.poNumber.trim()) && !po;
  if (filter === 'under_release') return po?.release === 'under_release' || po?.release === 'draft';
  return (
    po?.release === 'released' &&
    (po.receipt === 'no_service_entry' || po.receipt === 'not_received')
  );
}

export default function RrsmBoardClient({ board, view }: { board: RrsmBoard; view: View }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sapFilter, setSapFilter] = useState<SapFilter>('all');

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

  const sapCounts = useMemo(
    () =>
      summarisePos(
        lines.map((l) => l.poNumber),
        board.sap,
      ),
    [lines, board.sap],
  );
  const filterCount = useMemo(() => {
    const n: Record<SapFilter, number> = {
      all: lines.length,
      under_release: 0,
      not_in_sap: 0,
      no_entry: 0,
    };
    for (const l of lines)
      for (const f of ['under_release', 'not_in_sap', 'no_entry'] as const)
        if (sapFilterMatches(f, l, board.sap)) n[f]++;
    return n;
  }, [lines, board.sap]);
  const shownSuppliers = useMemo(
    () =>
      view === 'buyer' && sapFilter !== 'all'
        ? board.suppliers
            .map((s) => ({
              ...s,
              lines: s.lines.filter((l) => sapFilterMatches(sapFilter, l, board.sap)),
            }))
            .filter((s) => s.lines.length)
        : board.suppliers,
    [board.suppliers, board.sap, sapFilter, view],
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

  const title = TITLE[view];

  /* ── nothing to show ─────────────────────────────────────── */

  if (!board.country) {
    return (
      <RrsmShell scope={board} title={title}>
        <RrsmNoCountry />
      </RrsmShell>
    );
  }

  /* The sidebar hides a page the reader's role does not cover, but a typed or shared URL still
     arrives here. The actions refuse the writes regardless; this says why before anyone tries. */
  if (view === 'ops' ? !board.canValidate : !board.canBuy) {
    return (
      <RrsmShell scope={board} title={title}>
        <RrsmNotYourRole what={view === 'ops' ? 'Ops validation' : 'Raising PRs and POs'} />
      </RrsmShell>
    );
  }

  const subtitle = board.cycle ? (
    <>
      {periodLabel(new Date(board.cycle.period + 'T00:00:00Z'))} cycle · {board.cycle.opensOn} to{' '}
      {board.cycle.closesOn} · {lines.length} lines ·{' '}
      <b className="font-semibold text-white">
        {money.format(total)} {board.country.currency}
      </b>
    </>
  ) : (
    'No cycle is open for this country yet.'
  );

  const actions =
    view === 'buyer' && board.cycle ? (
      <button
        onClick={() => void run('close', () => closeValidatedLines(board.cycle!.id))}
        disabled={!readyToClose || busy === 'close'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1d4f31] shadow-sm transition-opacity hover:bg-white/90 disabled:opacity-50"
        title={
          readyToClose ? undefined : 'A validated line needs a PO number before it can be closed'
        }
      >
        {busy === 'close' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Close all ready · {readyToClose}
      </button>
    ) : undefined;

  return (
    <RrsmShell scope={board} title={title} subtitle={subtitle} actions={actions}>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── no cycle yet ────────────────────────────────────── */}
      {!board.cycle ? (
        <Empty
          title={`Nothing open for ${board.country.name}`}
          body={
            view === 'ops'
              ? 'Opening a cycle copies every asset still on hire from last month, with today’s rates and the quantity confirmed last time. You then confirm each one.'
              : 'Ops open the cycle. There is nothing to put on a PO until they have.'
          }
          action={
            view === 'ops' ? (
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
          {/* ── SAP, live: what the buyer used to type by hand ── */}
          {view === 'buyer' && lines.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13.5px] font-semibold text-slate-800">
                  SAP status, live from Materials DB
                </h2>
                {board.sap.loadedAt && (
                  <span className="text-[11.5px] text-slate-400">
                    SAP data as of {board.sap.loadedAt.replace('T', ' ')} UTC
                  </span>
                )}
              </div>
              {board.sap.ok ? (
                <>
                  <p className="mt-1 text-[12.5px] text-slate-600">
                    {sapCounts.total} POs · {sapCounts.released} released · {sapCounts.underRelease}{' '}
                    under release · {sapCounts.notInSap} not found in SAP ·{' '}
                    {sapCounts.serviceEntered} with a service entry or GRN
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {(
                      [
                        ['all', 'All lines'],
                        ['under_release', 'PO under release'],
                        ['no_entry', 'Released, no service entry yet'],
                        ['not_in_sap', 'PO not in SAP'],
                      ] as [SapFilter, string][]
                    ).map(([f, label]) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSapFilter(f)}
                        aria-pressed={sapFilter === f}
                        className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                          sapFilter === f
                            ? 'border-[#307c4c] bg-[#307c4c] text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-[#307c4c]/40'
                        }`}
                      >
                        {label} <span className="opacity-70">{filterCount[f]}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[12.5px] text-amber-700">
                  SAP status is unavailable right now (Materials DB could not be read). The PR and
                  PO numbers below are as recorded.
                </p>
              )}
            </section>
          )}

          {/* ── the lines, grouped by supplier ──────────────── */}
          <div className="space-y-5">
            {shownSuppliers.map((s) => (
              <section
                key={s.code}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
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
                          /* Each page offers only its own side's edits and moves. Somebody who
                             holds both roles switches page to do the other half, which keeps
                             "who changed this" answerable from the page they were on. */
                          canValidate={view === 'ops' && board.canValidate}
                          canBuy={view === 'buyer' && board.canBuy}
                          busy={busy}
                          onRun={run}
                          sapOk={board.sap.ok}
                          sapPo={board.sap.pos[l.poNumber.trim()]}
                          sapPr={board.sap.prs[l.prNumber.trim()]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          {board.suppliers.length > 0 && !shownSuppliers.length && (
            <Empty title="No lines match" body="Nothing in this cycle is in that SAP state." />
          )}

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
    </RrsmShell>
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
  sapOk,
  sapPo,
  sapPr,
}: {
  line: BoardLine;
  view: View;
  currency: string;
  money: Intl.NumberFormat;
  canValidate: boolean;
  canBuy: boolean;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<{ success: boolean; error?: string }>) => Promise<void>;
  sapOk: boolean;
  sapPo?: SapPo;
  sapPr?: SapPr;
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
            {sapPr && (
              <div
                className={`mt-0.5 px-1.5 text-[10.5px] ${sapPr.release === 'released' ? 'text-slate-400' : 'text-amber-700'}`}
                title={sapPr.waitingWith ? `Waiting with ${sapPr.waitingWith}` : undefined}
              >
                {PR_RELEASE_LABEL[sapPr.release]}
                {sapPr.converted ? ' · on PO' : ''}
                {sapPr.release !== 'released' && sapPr.waitingWith ? ` · ${sapPr.waitingWith}` : ''}
              </div>
            )}
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
            {sapPo ? (
              <SapPoCell po={sapPo} money={money} />
            ) : (
              <>
                {sapOk && line.poNumber.trim() && (
                  <div className="mb-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-red-700">
                    PO not in SAP
                  </div>
                )}
                <ManualErpStatus
                  value={draft.erpStatus}
                  disabled={!buyerEditable}
                  onChange={(v) => setDraft({ ...draft, erpStatus: v })}
                />
              </>
            )}
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
        {/* Wraps rather than widening the table: with the sidebar pinned, a validated line's four
            controls would otherwise push Return off the edge into a sideways scroll. */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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

const RELEASE_TONE: Record<SapPo['release'], string> = {
  released: 'bg-[#e6f1ea] text-[#1d4f31]',
  under_release: 'bg-amber-50 text-amber-700',
  draft: 'bg-slate-100 text-slate-600',
  deleted: 'bg-red-50 text-red-700',
};

/** SAP's word on a PO, read live. Replaces the hand-picked status wherever SAP has the PO. */
function SapPoCell({ po, money }: { po: SapPo; money: Intl.NumberFormat }) {
  const receiptDone = po.receipt === 'service_posted' || po.receipt === 'received';
  const dates = [
    po.createdOn && `Created ${po.createdOn}`,
    po.releasedOn && `released ${po.releasedOn}`,
    po.lastReceiptOn && `entry ${po.lastReceiptOn}`,
  ].filter(Boolean);
  return (
    <div className="min-w-[11rem]">
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${RELEASE_TONE[po.release]}`}
      >
        {PO_RELEASE_LABEL[po.release]}
      </span>
      {po.release === 'under_release' && po.waitingWith && (
        <div className="mt-0.5 text-[10.5px] text-amber-700">
          With {po.waitingWith}
          {po.daysWaiting !== null ? ` · ${po.daysWaiting}d` : ''}
        </div>
      )}
      {po.release === 'released' && (
        <div
          className={`mt-0.5 text-[10.5px] ${receiptDone ? 'text-[#1d4f31]' : 'text-slate-500'}`}
        >
          {RECEIPT_LABEL[po.receipt]}
        </div>
      )}
      {po.value !== null && (
        <div className="mt-0.5 font-mono text-[10.5px] text-slate-600">
          {money.format(po.value)} {po.currency}
        </div>
      )}
      {dates.length > 0 && (
        <div className="mt-0.5 text-[10px] leading-snug text-slate-400">{dates.join(' · ')}</div>
      )}
    </div>
  );
}

/** The old hand-picked SAP status, kept for a PO SAP does not have (or none typed yet). */
function ManualErpStatus({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[8.25rem] rounded border border-slate-200 bg-white px-1.5 py-1 text-[12px] outline-none disabled:border-transparent disabled:bg-transparent"
    >
      <option value="">—</option>
      {(Object.keys(ERP_STATUS_LABEL) as ErpStatus[]).map((s) => (
        <option key={s} value={s}>
          {ERP_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

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
      className="w-24 rounded border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] outline-none focus:border-[#6AAF8E] disabled:border-transparent disabled:bg-transparent"
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
