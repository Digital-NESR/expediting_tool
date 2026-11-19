'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Supplier validation: asking suppliers to confirm their
   month.

   One row per supplier with lines on the cycle, showing how far
   their invitation has got: never asked, asked and waiting, or
   done. The three states are kept visibly apart because a chase
   turns on the difference.

   Documents: each supplier has its own Delivery Note / Timesheet
   ticks, remembered for the next cycle, and the ticks in the
   toolbar set them for everyone listed at once. Buyers send;
   Ops see the same page read-only.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Check,
  Copy,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  getRrsmInvitations,
  sendRrsmInvitations,
  sendRrsmReminders,
  setRrsmDocRequirements,
  type InvitationBoard,
  type InvitationRow,
} from '@/app/actions/rrsm/invitations';
import { DOC_LABEL, type DocKind } from '@/lib/rrsm/submission';

const BRAND = '#307c4c';

const SHORT: Record<DocKind, string> = { delivery_note: 'DN', timesheet: 'TS' };

type Field = 'deliveryNote' | 'timesheet';
const FIELD_OF: Record<DocKind, Field> = { delivery_note: 'deliveryNote', timesheet: 'timesheet' };

/** '2026-11-19' → '19 Nov'. */
function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * A board supplied instead of fetched, for `/dev-preview/rrsm-invitations` only. With `preview`
 * set the panel renders what it is given and makes no server call.
 */
export default function InvitationsPanel({
  countryCode,
  preview,
}: {
  countryCode: string;
  preview?: InvitationBoard;
}) {
  const [board, setBoard] = useState<InvitationBoard | null>(preview ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    sent: number;
    failed: { supplier: string; reason: string }[];
    label: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let live = true;
    void getRrsmInvitations(countryCode).then((b) => {
      if (live) setBoard(b);
    });
    return () => {
      live = false;
    };
  }, [countryCode, preview]);

  const rows = useMemo(() => board?.rows ?? [], [board]);
  /* A submitted supplier's documents are settled; only the others can still be changed. */
  const editable = useMemo(() => rows.filter((r) => !r.submittedAt), [rows]);

  const counts = useMemo(
    () => ({
      never: rows.filter((r) => !r.sentAt && !r.submittedAt).length,
      waiting: rows.filter((r) => r.sentAt && !r.submittedAt).length,
      done: rows.filter((r) => r.submittedAt).length,
    }),
    [rows],
  );

  /* One button: with nothing ticked it selects everyone not yet asked (a resend is deliberate,
     so a supplier already chased is not ticked by habit); with anything ticked it clears. */
  function toggleSelection() {
    if (picked.size) {
      setPicked(new Set());
      return;
    }
    setPicked(
      new Set(
        rows
          .filter((r) => !r.sentAt && !r.submittedAt && r.contacts.length)
          .map((r) => r.supplierCode),
      ),
    );
  }

  function toggle(code: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Set a document requirement for some suppliers: shown at once, saved, undone if refused. */
  async function setRequirement(codes: string[], field: Field, value: boolean) {
    if (!board?.cycleId || !codes.length) return;
    const before = board;
    const touched = new Set(codes);
    setBoard({
      ...board,
      rows: board.rows.map((r) =>
        touched.has(r.supplierCode) ? { ...r, requires: { ...r.requires, [field]: value } } : r,
      ),
    });
    setError('');
    if (preview) return;
    const r = await setRrsmDocRequirements(board.cycleId, codes, { [field]: value });
    if (!r.success) {
      setBoard(before);
      setError(r.error ?? 'That change was not saved.');
    }
  }

  /* What is ticked splits by state: suppliers never asked get the invitation, suppliers asked
     and silent get a reminder. Neither button touches the other group. */
  const pickedInvite = rows.filter(
    (r) => picked.has(r.supplierCode) && !r.sentAt && !r.submittedAt,
  );
  const pickedRemind = rows.filter((r) => picked.has(r.supplierCode) && r.sentAt && !r.submittedAt);

  function selectWaiting() {
    setPicked(new Set(rows.filter((r) => r.sentAt && !r.submittedAt).map((r) => r.supplierCode)));
  }

  async function run(kind: 'invite' | 'remind', codes: string[], label: (n: number) => string) {
    if (!board?.cycleId || !codes.length) return;
    setBusy(kind === 'invite' ? 'invite' : codes.length === 1 ? 'remind:' + codes[0] : 'remind');
    setError('');
    setResult(null);
    const r =
      kind === 'invite'
        ? await sendRrsmInvitations(board.cycleId, codes)
        : await sendRrsmReminders(board.cycleId, codes);
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
    } else {
      setResult({ sent: r.sent ?? 0, failed: r.failed ?? [], label: label(r.sent ?? 0) });
      setPicked((prev) => {
        const next = new Set(prev);
        for (const c of codes) next.delete(c);
        return next;
      });
      const fresh = await getRrsmInvitations(countryCode);
      setBoard(fresh);
    }
    setBusy(null);
  }

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  async function copy(url: string, code: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* Some app views refuse the clipboard. Select the text instead of claiming it copied. */
      setError('Could not copy. Select the link and copy it by hand.');
    }
  }

  if (!board) {
    return (
      <div className="flex items-center gap-2 py-12 text-[13.5px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading suppliers…
      </div>
    );
  }

  if (!board.cycleId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center">
        <h2 className="text-[16px] font-semibold text-slate-900">No cycle is open</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] text-slate-500">
          Open a cycle first. Until then there is nothing to ask suppliers about.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="whitespace-nowrap text-[13.5px] text-slate-600">
          <b className="text-slate-900">{counts.never}</b> not asked ·{' '}
          <b className="text-slate-900">{counts.waiting}</b> waiting ·{' '}
          <b className="text-slate-900">{counts.done}</b> submitted
        </p>
        <div className="flex-1" />

        {board.canSend && editable.length > 0 && (
          <div className="flex items-center gap-3 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-700">
            <span className="font-semibold text-slate-500">Everyone must upload:</span>
            {(['delivery_note', 'timesheet'] as DocKind[]).map((kind) => (
              <AllTick
                key={kind}
                label={DOC_LABEL[kind]}
                on={editable.filter((r) => r.requires[FIELD_OF[kind]]).length}
                of={editable.length}
                onChange={(v) =>
                  void setRequirement(
                    editable.map((r) => r.supplierCode),
                    FIELD_OF[kind],
                    v,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {board.canSend && (
          <button
            onClick={toggleSelection}
            disabled={!picked.size && !counts.never}
            className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-40"
          >
            {picked.size ? `Deselect all (${picked.size})` : 'Select everyone not asked'}
          </button>
        )}
        {board.canSend && !picked.size && (
          <button
            onClick={selectWaiting}
            disabled={!counts.waiting}
            className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-40"
          >
            Select everyone not responded
          </button>
        )}
        <div className="flex-1" />
        {board.canSend && (
          <button
            onClick={() =>
              void run(
                'remind',
                pickedRemind.map((r) => r.supplierCode),
                (n) => `Sent ${plural(n, 'reminder')}.`,
              )
            }
            disabled={!pickedRemind.length || busy !== null}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-900 disabled:opacity-40"
          >
            {busy === 'remind' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            Send {pickedRemind.length || ''} reminder{pickedRemind.length === 1 ? '' : 's'}
          </button>
        )}
        <button
          onClick={() =>
            void run(
              'invite',
              pickedInvite.map((r) => r.supplierCode),
              (n) => `Sent ${plural(n, 'invitation')}.`,
            )
          }
          disabled={!pickedInvite.length || busy !== null || !board.canSend}
          title={board.canSend ? undefined : 'Only a buyer or an admin sends invitations'}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          {busy === 'invite' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send {pickedInvite.length || ''} invitation{pickedInvite.length === 1 ? '' : 's'}
        </button>
      </div>

      {board.configError && (
        <Note tone="bad">
          Links cannot be built: {board.configError} Until that is set, invitations will fail for
          everyone.
        </Note>
      )}
      {error && <Note tone="bad">{error}</Note>}
      {result && (
        <Note tone={result.failed.length ? 'warn' : 'good'}>
          {result.label}
          {result.failed.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {result.failed.map((f, i) => (
                <li key={i}>
                  <b>{f.supplier}</b> — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </Note>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] table-fixed text-[13px]">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-14" />
              <col className="w-[15rem]" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-[8.5rem]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2.5"></th>
                <th className="px-3 py-2.5 text-left font-semibold">Supplier</th>
                <th className="px-2 py-2.5 text-right font-semibold">Lines</th>
                <th className="px-3 py-2.5 text-left font-semibold">Goes to</th>
                <th className="px-3 py-2.5 text-left font-semibold">State</th>
                <th
                  className="px-3 py-2.5 text-left font-semibold"
                  title="DN = Delivery Note, TS = Timesheet. Ticked = the supplier must upload it."
                >
                  Must upload
                </th>
                <th className="px-3 py-2.5 text-right font-semibold">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row
                  key={r.supplierCode}
                  row={r}
                  picked={picked.has(r.supplierCode)}
                  onToggle={() => toggle(r.supplierCode)}
                  onCopy={copy}
                  reminding={busy === 'remind:' + r.supplierCode}
                  onRemind={() =>
                    void run('remind', [r.supplierCode], (n) =>
                      n ? `Reminder sent to ${r.supplierName}.` : 'No reminder was sent.',
                    )
                  }
                  copied={copied === r.supplierCode}
                  canSend={board.canSend}
                  onRequire={(field, v) => void setRequirement([r.supplierCode], field, v)}
                />
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13.5px] text-slate-500">
                    No supplier has anything on hire this cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-slate-400">
        DN = Delivery Note, TS = Timesheet. A supplier&rsquo;s ticks are remembered for next month.
      </p>
    </div>
  );
}

/** The toolbar tick that sets one document for every supplier; half-ticked when they differ. */
function AllTick({
  label,
  on,
  of,
  onChange,
}: {
  label: string;
  on: number;
  of: number;
  onChange: (v: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const mixed = on > 0 && on < of;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label
      className="inline-flex items-center gap-1.5"
      title={mixed ? `${on} of ${of}` : undefined}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={on === of && of > 0}
        onChange={() => onChange(!(on === of))}
        className="h-4 w-4 accent-[#307c4c]"
      />
      {label}
    </label>
  );
}

function Row({
  row,
  picked,
  onToggle,
  onCopy,
  copied,
  canSend,
  onRequire,
  reminding,
  onRemind,
}: {
  row: InvitationRow;
  picked: boolean;
  onToggle: () => void;
  onCopy: (url: string, code: string) => void;
  copied: boolean;
  canSend: boolean;
  onRequire: (field: Field, value: boolean) => void;
  reminding: boolean;
  onRemind: () => void;
}) {
  const noAddress = row.contacts.length === 0;
  const to = row.sentAt && row.sentTo.length ? row.sentTo : row.contacts;

  return (
    <tr className="border-t border-slate-100 align-middle">
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={picked}
          onChange={onToggle}
          disabled={!canSend || Boolean(row.submittedAt)}
          aria-label={`Select ${row.supplierName}`}
          className="h-4 w-4 accent-[#307c4c] disabled:opacity-30"
        />
      </td>

      <td className="px-3 py-2">
        <div className="truncate font-medium text-slate-800" title={row.supplierName}>
          {row.supplierName}
        </div>
        <div className="font-mono text-[10.5px] text-slate-400">{row.supplierCode}</div>
      </td>

      <td className="px-2 py-2 text-right font-mono text-[12.5px] text-slate-600">
        {row.lines}
        {row.awaiting > 0 && row.awaiting !== row.lines && (
          <div className="text-[10.5px] text-amber-700">{row.awaiting} open</div>
        )}
      </td>

      <td className="px-3 py-2">
        {noAddress ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> No address on file
          </span>
        ) : (
          <div className="truncate font-mono text-[11.5px] text-slate-500" title={to.join(', ')}>
            {to[0]}
            {to.length > 1 && <span className="text-slate-400"> +{to.length - 1}</span>}
          </div>
        )}
      </td>

      <td className="px-3 py-2">
        {row.submittedAt ? (
          <Chip tone="good" icon={<Check className="h-3 w-3" />}>
            Done {shortDate(row.submittedAt)}
          </Chip>
        ) : row.sentAt ? (
          <Chip tone="warn" icon={<MailCheck className="h-3 w-3" />}>
            Sent {shortDate(row.sentAt)}
          </Chip>
        ) : (
          <Chip tone="plain" icon={<Mail className="h-3 w-3" />}>
            Not asked
          </Chip>
        )}
        {row.reminders > 0 && !row.submittedAt && (
          <div className="mt-0.5 whitespace-nowrap text-[10.5px] text-amber-700">
            Reminded {shortDate(row.remindedAt)}
            {row.reminders > 1 ? ` (${row.reminders})` : ''}
          </div>
        )}
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {(['delivery_note', 'timesheet'] as DocKind[]).map((kind) => {
            const doc = row.documents.find((d) => d.kind === kind);
            const required = row.requires[FIELD_OF[kind]];
            if (doc) {
              return (
                <a
                  key={kind}
                  href={`/api/rrsm/documents/${doc.id}`}
                  title={`${DOC_LABEL[kind]} uploaded: ${doc.fileName}`}
                  className="inline-flex items-center gap-0.5 rounded bg-[#e6f1ea] px-1.5 py-0.5 text-[11px] font-semibold text-[#1d4f31] hover:underline"
                >
                  <Check className="h-3 w-3" />
                  {SHORT[kind]}
                </a>
              );
            }
            return (
              <label
                key={kind}
                title={`${DOC_LABEL[kind]}: ${required ? 'required' : 'not required'}`}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  required ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={required}
                  disabled={!canSend || Boolean(row.submittedAt)}
                  onChange={(e) => onRequire(FIELD_OF[kind], e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#307c4c]"
                />
                {SHORT[kind]}
              </label>
            );
          })}
        </div>
      </td>

      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {canSend && row.sentAt && !row.submittedAt && (
            <button
              onClick={onRemind}
              disabled={reminding}
              title="Email this supplier a reminder with their link"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11.5px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            >
              {reminding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BellRing className="h-3 w-3" />
              )}
              Remind
            </button>
          )}
          {row.url ? (
            <button
              onClick={() => onCopy(row.url!, row.supplierCode)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50"
              title={row.url}
            >
              {copied ? <Check className="h-3 w-3 text-[#1d4f31]" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : (
            <span className="text-[11.5px] text-slate-300">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function Chip({
  tone,
  icon,
  children,
}: {
  tone: 'good' | 'warn' | 'plain';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'good'
      ? 'bg-[#e6f1ea] text-[#1d4f31]'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-500';
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {icon}
      {children}
    </span>
  );
}

function Note({ tone, children }: { tone: 'good' | 'bad' | 'warn'; children: React.ReactNode }) {
  const cls =
    tone === 'bad'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-[#a9d3bb] bg-[#e6f1ea] text-[#1d4f31]';
  return (
    <div className={`mb-4 rounded-lg border px-3.5 py-2.5 text-[13px] ${cls}`}>
      <div className="flex items-start gap-2">
        {tone === 'good' ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
        ) : tone === 'warn' ? (
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
