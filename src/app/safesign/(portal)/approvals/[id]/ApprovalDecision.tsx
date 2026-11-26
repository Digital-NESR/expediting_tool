'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { approveCommunication, rejectCommunication } from '@/app/actions/safesign/approvals';
import { BUTTON, BUTTON_SECONDARY, INPUT } from '../../../components/ui';

/** Approve, or reject with a reason that is emailed to the sender. */
export default function ApprovalDecision({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ success: boolean; error?: string; message?: string }>) {
    setNotice(null);
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.success, text: r.success ? r.message ?? 'Done.' : r.error ?? 'Could not save.' });
      if (r.success) router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-1 flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">
          {rejecting ? 'Reason for rejection (required, emailed to the sender)' : 'Comment (optional)'}
        </span>
        <textarea
          className={`${INPUT} min-h-[96px]`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={rejecting ? 'What needs to change before this can go to suppliers?' : 'Anything the sender should know'}
          maxLength={2000}
        />
      </label>
      {rejecting ? (
        <div className="flex gap-2">
          <button
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={pending || !comment.trim()}
            onClick={() => run(() => rejectCommunication(id, comment))}
          >
            <X className="h-4 w-4" /> Reject and email sender
          </button>
          <button className={BUTTON_SECONDARY} disabled={pending} onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className={`${BUTTON} flex-1`} disabled={pending} onClick={() => run(() => approveCommunication(id, comment))}>
            <Check className="h-4 w-4" /> Approve
          </button>
          <button
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            <X className="h-4 w-4" /> Reject
          </button>
        </div>
      )}
      {notice && (
        <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>
      )}
    </div>
  );
}
