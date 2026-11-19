'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · asking suppliers to confirm their month.

   The step between opening a cycle and anything arriving. One row
   per supplier with lines on the cycle, showing how far their
   invitation has got: never asked, asked and waiting, or done.

   The three states are kept visibly apart because a chase turns
   on the difference. "Nobody has asked them" and "they are
   ignoring us" look identical on a list that only counts
   submissions, and they call for opposite actions.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  getRrsmInvitations,
  sendRrsmInvitations,
  type InvitationBoard,
  type InvitationRow,
} from '@/app/actions/rrsm/invitations';
import { DOC_KINDS, DOC_LABEL } from '@/lib/rrsm/submission';

const BRAND = '#307c4c';

/**
 * A board supplied instead of fetched, for `/dev-preview/rrsm-invitations` only.
 *
 * The screen needs an open cycle with lines and links on it, which does not exist until a
 * country goes live. With `preview` set the panel renders what it is given and makes no server
 * call, so the buttons do nothing.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    sent: number;
    failed: { supplier: string; reason: string }[];
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /* What the next send asks for. Both by default: the buyer unticks what a supplier does not owe. */
  const [requireDn, setRequireDn] = useState(true);
  const [requireTs, setRequireTs] = useState(true);

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

  const counts = useMemo(
    () => ({
      never: rows.filter((r) => !r.sentAt && !r.submittedAt).length,
      waiting: rows.filter((r) => r.sentAt && !r.submittedAt).length,
      done: rows.filter((r) => r.submittedAt).length,
    }),
    [rows],
  );

  /* Default selection: everyone who has not submitted and has somewhere to send to. A resend is
     a deliberate act, so a supplier already chased is not ticked by habit. */
  function selectUnasked() {
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

  async function send() {
    if (!board?.cycleId || !picked.size) return;
    setBusy(true);
    setError('');
    setResult(null);
    const r = await sendRrsmInvitations(board.cycleId, [...picked], {
      deliveryNote: requireDn,
      timesheet: requireTs,
    });
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
    } else {
      setResult({ sent: r.sent ?? 0, failed: r.failed ?? [] });
      setPicked(new Set());
      const fresh = await getRrsmInvitations(countryCode);
      setBoard(fresh);
    }
    setBusy(false);
  }

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
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13.5px] text-slate-600">
          <b className="text-slate-900">{counts.never}</b> not asked ·{' '}
          <b className="text-slate-900">{counts.waiting}</b> waiting ·{' '}
          <b className="text-slate-900">{counts.done}</b> submitted
        </p>
        <div className="flex-1" />
        {board.canSend && (
          <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-700">
            <legend className="sr-only">Documents the supplier must upload</legend>
            <span className="font-semibold text-slate-500">Must upload:</span>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={requireDn}
                onChange={(e) => setRequireDn(e.target.checked)}
                className="h-4 w-4 accent-[#307c4c]"
              />
              {DOC_LABEL.delivery_note}
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={requireTs}
                onChange={(e) => setRequireTs(e.target.checked)}
                className="h-4 w-4 accent-[#307c4c]"
              />
              {DOC_LABEL.timesheet}
            </label>
          </fieldset>
        )}
        <button
          onClick={selectUnasked}
          disabled={!counts.never}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-40"
        >
          Select everyone not asked
        </button>
        <button
          onClick={() => void send()}
          disabled={!picked.size || busy || !board.canSend}
          title={board.canSend ? undefined : 'Only a buyer or an admin sends invitations'}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send {picked.size || ''} invitation{picked.size === 1 ? '' : 's'}
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
          Sent {result.sent} invitation{result.sent === 1 ? '' : 's'}.
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
          <table className="w-full min-w-[46rem] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                <th className="w-10 px-3 py-2.5"></th>
                <th className="px-3 py-2.5 text-left font-semibold">Supplier</th>
                <th className="px-2 py-2.5 text-right font-semibold">Lines</th>
                <th className="px-3 py-2.5 text-left font-semibold">Goes to</th>
                <th className="px-3 py-2.5 text-left font-semibold">State</th>
                <th className="px-3 py-2.5 text-left font-semibold">Documents</th>
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
                  copied={copied === r.supplierCode}
                  canSend={board.canSend}
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
    </div>
  );
}

function Row({
  row,
  picked,
  onToggle,
  onCopy,
  copied,
  canSend,
}: {
  row: InvitationRow;
  picked: boolean;
  onToggle: () => void;
  onCopy: (url: string, code: string) => void;
  copied: boolean;
  canSend: boolean;
}) {
  const noAddress = row.contacts.length === 0;

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={picked}
          onChange={onToggle}
          disabled={!canSend || Boolean(row.submittedAt)}
          aria-label={`Select ${row.supplierName}`}
          className="h-4 w-4 accent-[#307c4c] disabled:opacity-30"
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800">{row.supplierName}</div>
        <div className="font-mono text-[10.5px] text-slate-400">{row.supplierCode}</div>
      </td>

      <td className="px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-600">
        {row.lines}
        {row.awaiting > 0 && row.awaiting !== row.lines && (
          <span className="ml-1 text-[11px] text-amber-700">({row.awaiting} open)</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        {noAddress ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> No address on file
          </span>
        ) : (
          <span className="font-mono text-[11.5px] text-slate-500">{row.contacts.join(', ')}</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        {row.submittedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f1ea] px-2 py-0.5 text-[11px] font-semibold text-[#1d4f31]">
            <Check className="h-3 w-3" /> Submitted {row.submittedAt}
          </span>
        ) : row.sentAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            <MailCheck className="h-3 w-3" /> Sent {row.sentAt}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            <Mail className="h-3 w-3" /> Not asked
          </span>
        )}
        {row.sentAt && !row.submittedAt && row.sentTo.length > 0 && (
          <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">
            to {row.sentTo.join(', ')}
          </div>
        )}
      </td>

      <td className="px-3 py-2.5">
        <Documents row={row} />
      </td>

      <td className="px-3 py-2.5 text-right">
        {row.url ? (
          <button
            onClick={() => onCopy(row.url!, row.supplierCode)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50"
            title={row.url}
          >
            {copied ? <Check className="h-3 w-3 text-[#1d4f31]" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        ) : (
          <span className="text-[11.5px] text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

/** Per kind: uploaded (a download link), required and missing, or not asked for. */
function Documents({ row }: { row: InvitationRow }) {
  if (!row.url) return <span className="text-[11.5px] text-slate-300">—</span>;
  return (
    <div className="space-y-0.5">
      {DOC_KINDS.map((kind) => {
        const doc = row.documents.find((d) => d.kind === kind);
        const required =
          kind === 'delivery_note' ? row.requires.deliveryNote : row.requires.timesheet;
        if (doc)
          return (
            <a
              key={kind}
              href={`/api/rrsm/documents/${doc.id}`}
              className="flex items-center gap-1 text-[11.5px] font-medium text-[#1d4f31] hover:underline"
              title={doc.fileName}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{DOC_LABEL[kind]}</span>
            </a>
          );
        return (
          <div
            key={kind}
            className={`text-[11.5px] ${required ? 'text-amber-700' : 'text-slate-300'}`}
          >
            {DOC_LABEL[kind]} {required ? '· required' : '· not asked'}
          </div>
        );
      })}
    </div>
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
