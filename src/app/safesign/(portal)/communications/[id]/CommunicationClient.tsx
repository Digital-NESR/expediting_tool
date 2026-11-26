'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, ChevronRight, Clock, Download, FileText, Lock, Send, ShieldCheck, Trash2, Unlock } from 'lucide-react';
import { submitForApproval } from '@/app/actions/safesign/approvals';
import type { ApprovalInfo } from '@/lib/safesign/approvals';
import {
  changeDeadline,
  deleteDraft,
  remindSuppliers,
  reviewSubmission,
  sendCommunication,
  setCommunicationClosed,
} from '@/app/actions/safesign/communications';
import {
  ATTACHMENT_LABEL,
  formatBytes,
  formatDay,
  formatStamp,
  RESPONSE_TYPE_LABEL,
  type DisplayStatus,
} from '@/lib/safesign/model';
import type { CommunicationDetail, RequestDetail } from '@/lib/safesign/read';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT } from '../../../components/SafeSignShell';
import StatusPill from '../../../components/StatusPill';

const EVENT_LABEL: Record<string, string> = {
  'request.sent': 'Request emailed',
  'reminder.sent': 'Reminder emailed',
  'reminder.failed': 'Reminder failed',
  'code.sent': 'Verification code sent',
  'code.verified': 'Opened the request',
  'document.downloaded': 'Downloaded a document',
  'response.submitted': 'Responded',
  'review.accepted': 'Accepted by NESR',
  'review.changes_requested': 'Changes requested by NESR',
};

const FILE_KIND: Record<string, string> = {
  signed_letter: 'Signed letter',
  plan: 'Action plan',
  document: 'Document',
  supporting: 'Supporting',
};

const FILTERS: { id: 'all' | DisplayStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'under_review', label: 'To review' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'completed', label: 'Completed' },
];

export default function CommunicationClient({ comm, approval }: { comm: CommunicationDetail; approval: ApprovalInfo | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<'all' | DisplayStatus>('all');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [deadline, setDeadline] = useState(comm.deadline);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: comm.requests.length };
    for (const r of comm.requests) c[r.display] = (c[r.display] ?? 0) + 1;
    return c;
  }, [comm.requests]);

  const rows = comm.requests.filter((r) => filter === 'all' || r.display === filter);
  const remindable = (r: RequestDetail) =>
    comm.status === 'sent' && r.sentAt && (r.status === 'pending' || r.status === 'changes_requested');

  function run(fn: () => Promise<{ success: boolean; error?: string; message?: string }>, after?: () => void) {
    setNotice(null);
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.success, text: r.success ? r.message ?? 'Done.' : [r.message, r.error].filter(Boolean).join(' ') });
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ── summary ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:col-span-2`}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                comm.status === 'draft' ? 'bg-slate-100 text-slate-600' : comm.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-800 text-white'
              }`}
            >
              {comm.status}
            </span>
            <span className="text-xs text-slate-500">
              {comm.sentAt ? `Sent ${formatStamp(comm.sentAt)} by ${comm.sentBy}` : `Created by ${comm.createdBy}`}
            </span>
          </div>
          {comm.message && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{comm.message}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Fact label="Response" value={RESPONSE_TYPE_LABEL[comm.responseType]} />
            <Fact label="Supplier files" value={ATTACHMENT_LABEL[comm.attachments]} />
            <Fact label="Deadline" value={formatDay(comm.deadline)} />
            <Fact
              label="Reminders"
              value={`${comm.remindDaysBefore.length ? comm.remindDaysBefore.join(', ') + ' days before' : 'none before'}${comm.overdueEveryDays ? `, every ${comm.overdueEveryDays}d overdue` : ''}`}
            />
          </dl>
          {comm.documents.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {comm.documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/safesign/files/document/${d.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-[#307c4c]/40 hover:text-[#307c4c]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {d.filename}
                    <span className="text-slate-400">{formatBytes(d.sizeBytes)}</span>
                    {d.isLetter && <span className="rounded bg-[#307c4c]/10 px-1 text-[10px] font-semibold text-[#1d4f31]">to sign</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} flex flex-col p-5`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Compliance</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">
            {comm.compliance.done} <span className="text-lg text-slate-400">/ {comm.compliance.total}</span>
          </p>
          <p className="text-xs text-slate-500">suppliers complete ({comm.compliance.pct}%)</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#307c4c]" style={{ width: `${comm.compliance.pct}%` }} />
          </div>

          <div className="mt-auto space-y-2 pt-4">
            {comm.status === 'draft' && (
              <>
                {(approval?.state === 'not_submitted' || approval?.state === 'rejected') && (
                  <button
                    className={`${BUTTON} w-full`}
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Submit this communication for approval?')) run(() => submitForApproval(comm.id));
                    }}
                  >
                    <ShieldCheck className="h-4 w-4" /> {approval.state === 'rejected' ? 'Submit again' : 'Submit for approval'}
                  </button>
                )}
                {(approval?.state === 'pending_scm' || approval?.state === 'pending_final') && (
                  <p className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    <Clock className="h-4 w-4" /> Waiting for approval
                  </p>
                )}
                {approval?.state === 'approved' && (
                  <button
                    className={`${BUTTON} w-full`}
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Email ${comm.requests.length} supplier(s) now?`)) run(() => sendCommunication(comm.id));
                    }}
                  >
                    <Send className="h-4 w-4" /> Send to {comm.requests.length} supplier{comm.requests.length === 1 ? '' : 's'}
                  </button>
                )}
                <button
                  className={`${BUTTON_SECONDARY} w-full`}
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Delete this draft?'))
                      start(async () => {
                        const r = await deleteDraft(comm.id);
                        if (r.success) router.push('/safesign/communications');
                        else setNotice({ ok: false, text: r.error ?? 'Could not delete.' });
                      });
                  }}
                >
                  <Trash2 className="h-4 w-4" /> {approval?.state === 'pending_scm' || approval?.state === 'pending_final' ? 'Withdraw and delete' : 'Delete draft'}
                </button>
              </>
            )}
            {comm.status === 'sent' && comm.requests.some((r) => !r.sentAt) && (
              <button className={`${BUTTON} w-full`} disabled={pending} onClick={() => run(() => sendCommunication(comm.id))}>
                <Send className="h-4 w-4" /> Retry unsent suppliers
              </button>
            )}
            {comm.status !== 'draft' && (
              <div className="flex min-w-0 flex-wrap gap-2">
                <input type="date" className={`${INPUT} min-w-[140px] flex-1`} value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline" />
                <button
                  className={`${BUTTON_SECONDARY} flex-1`}
                  disabled={pending || deadline === comm.deadline}
                  onClick={() => run(() => changeDeadline(comm.id, deadline))}
                >
                  Move
                </button>
              </div>
            )}
            {comm.status === 'sent' && (
              <button
                className={`${BUTTON_SECONDARY} w-full`}
                disabled={pending}
                onClick={() => {
                  if (confirm('Close this communication? Suppliers can no longer respond and reminders stop.'))
                    run(() => setCommunicationClosed(comm.id, true));
                }}
              >
                <Lock className="h-4 w-4" /> Close cycle
              </button>
            )}
            {comm.status === 'closed' && (
              <button className={`${BUTTON_SECONDARY} w-full`} disabled={pending} onClick={() => run(() => setCommunicationClosed(comm.id, false))}>
                <Unlock className="h-4 w-4" /> Reopen
              </button>
            )}
            {comm.status !== 'draft' && (
              <a href={`/api/safesign/export?communication=${comm.id}`} className={`${BUTTON_SECONDARY} w-full`}>
                <Download className="h-4 w-4" /> Export to Excel
              </a>
            )}
          </div>
        </section>
      </div>

      {notice && (
        <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>
      )}

      {/* ── suppliers ───────────────────────────────────────── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  filter === f.id ? 'bg-[#307c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label} {counts[f.id] ?? 0}
              </button>
            ))}
          </div>
          {comm.status === 'sent' && (
            <div className="ml-auto flex items-center gap-2">
              <button
                className="text-xs font-semibold text-[#307c4c] hover:underline"
                onClick={() => setPicked(new Set(comm.requests.filter(remindable).map((r) => r.id)))}
              >
                Select all waiting
              </button>
              <button
                className={BUTTON}
                disabled={pending || picked.size === 0}
                onClick={() => run(() => remindSuppliers(comm.id, [...picked]), () => setPicked(new Set()))}
              >
                <Bell className="h-4 w-4" /> Remind {picked.size || ''}
              </button>
            </div>
          )}
        </div>

        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} id={`request-${r.id}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                {comm.status === 'sent' && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.vendorName}`}
                    disabled={!remindable(r)}
                    checked={picked.has(r.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  />
                )}
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {open === r.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{r.vendorName}</span>
                    <span className="block truncate text-xs text-slate-400">{r.category}</span>
                  </span>
                </button>
                <span className="hidden w-56 truncate text-xs text-slate-500 md:block">
                  {r.respondedAt ? `${r.respondedName} · ${formatStamp(r.respondedAt)}` : r.reminderCount ? `${r.reminderCount} reminder${r.reminderCount === 1 ? '' : 's'}, last ${formatStamp(r.lastRemindedAt)}` : ''}
                </span>
                <StatusPill status={r.display} />
              </div>
              {open === r.id && <RequestPanel r={r} canAct={comm.status !== 'draft'} pending={pending} run={run} />}
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">No suppliers with this status.</li>}
        </ul>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value}</dd>
    </div>
  );
}

function RequestPanel({
  r,
  canAct,
  pending,
  run,
}: {
  r: RequestDetail;
  /** False on a draft, where there is nothing to review yet. */
  canAct: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string; message?: string }>) => void;
}) {
  const [comment, setComment] = useState('');
  const rounds = [...new Set(r.files.map((f) => f.round))].sort((a, b) => b - a);

  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4 lg:grid-cols-2">
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sent to</p>
          <p className="text-slate-700">{r.sentTo.join(', ') || '—'}</p>
          {r.sentCc.length > 0 && <p className="text-xs text-slate-500">CC: {r.sentCc.join(', ')}</p>}
        </div>
        {r.respondedAt && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Response</p>
            <p className="text-slate-700">
              <b>{r.respondedName}</b>
              {r.respondedTitle ? `, ${r.respondedTitle}` : ''}
            </p>
            <p className="text-xs text-slate-500">
              {r.respondedEmail} · {formatStamp(r.respondedAt)}
              {r.respondedIp ? ` · IP ${r.respondedIp}` : ''}
            </p>
            {r.comment && <p className="mt-1 whitespace-pre-line rounded-lg bg-white p-2 text-slate-700 ring-1 ring-slate-200">{r.comment}</p>}
          </div>
        )}
        {rounds.map((round) => (
          <div key={round}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Files{rounds.length > 1 ? ` · version ${round}` : ''}
            </p>
            <ul className="mt-1 space-y-1">
              {r.files
                .filter((f) => f.round === round)
                .map((f) => (
                  <li key={f.id}>
                    <a href={`/api/safesign/files/response/${f.id}`} className="inline-flex items-center gap-1.5 text-[#307c4c] hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {f.filename}
                    </a>
                    <span className="ml-2 text-xs text-slate-400">
                      {FILE_KIND[f.kind] ?? f.kind} · {formatBytes(f.sizeBytes)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {canAct && r.status === 'under_review' && (
          <div className="rounded-xl border border-sky-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-800">Review this action plan</p>
            <textarea
              className={`${INPUT} mt-2 min-h-[80px]`}
              placeholder="Comment for the supplier (required if you request changes)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className={BUTTON} disabled={pending} onClick={() => run(() => reviewSubmission(r.id, 'accept', comment))}>
                Accept
              </button>
              <button className={BUTTON_SECONDARY} disabled={pending} onClick={() => run(() => reviewSubmission(r.id, 'changes', comment))}>
                Request changes
              </button>
            </div>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">History</p>
        <ol className="mt-1 space-y-1.5 border-l border-slate-200 pl-3">
          {r.events.map((e, i) => (
            <li key={i} className="text-xs">
              <span className="font-semibold text-slate-700">{EVENT_LABEL[e.kind] ?? e.kind}</span>
              <span className="text-slate-500"> · {e.actor} · {formatStamp(e.at)}</span>
              {typeof e.detail.comment === 'string' && e.detail.comment && (
                <span className="block text-slate-500">&ldquo;{e.detail.comment}&rdquo;</span>
              )}
            </li>
          ))}
          {r.events.length === 0 && <li className="text-xs text-slate-400">Nothing yet.</li>}
        </ol>
      </div>
    </div>
  );
}
