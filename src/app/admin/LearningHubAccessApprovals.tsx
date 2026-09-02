'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getLearningHubAccessRequests, getLearningHubPendingCount,
  approveLearningHubAccessRequest, rejectLearningHubAccessRequest,
  revokeLearningHubAccess, deleteLearningHubAccessRequest,
  type LearningHubAccessRequest,
} from '@/app/actions/learning-hub';

const BRAND = '#307c4c';

/* Access approvals for the Learning Hub — mirrors the SourceGuide approvals UI. */
export default function LearningHubAccessApprovalsClient({
  onPendingCountChange,
}: {
  onPendingCountChange?: (n: number) => void;
}) {
  const [requests, setRequests] = useState<LearningHubAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [reqs, cnt] = await Promise.all([getLearningHubAccessRequests(), getLearningHubPendingCount()]);
    setRequests(reqs);
    setLoading(false);
    onPendingCountChange?.(cnt);
  }, [onPendingCountChange]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { alert(res.error ?? 'Action failed'); return; }
    await reload();
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading access requests…</div>;

  const statusStyle: Record<string, { bg: string; col: string }> = {
    Pending:  { bg: '#fef3c7', col: '#b45309' },
    Approved: { bg: '#dcfce7', col: '#15803d' },
    Denied:   { bg: '#fee2e2', col: '#b91c1c' },
    Rejected: { bg: '#fee2e2', col: '#b91c1c' },
    Revoked:  { bg: '#fee2e2', col: '#b91c1c' },
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">Learning Hub · Access Approvals</h2>
      <p className="mb-6 text-[13px] text-slate-500">Approve users to access the Learning Hub. Approved users can view all published tracks and courses; admins always have access.</p>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No access requests yet.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const ss = statusStyle[r.status] ?? statusStyle.Denied;
            return (
              <div key={r.user_email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-slate-900">{r.display_name || r.user_email}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ss.bg, color: ss.col }}>{r.status}</span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-slate-500">{r.user_email}{r.job_title ? ` · ${r.job_title}` : ''}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status !== 'Approved' && (
                    <button disabled={busy} onClick={() => run(() => approveLearningHubAccessRequest(r.user_email))}
                      className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: BRAND }}>Approve</button>
                  )}
                  {r.status === 'Pending' && (
                    <button disabled={busy} onClick={() => run(() => rejectLearningHubAccessRequest(r.user_email))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">Reject</button>
                  )}
                  {r.status === 'Approved' && (
                    <button disabled={busy} onClick={() => run(() => revokeLearningHubAccess(r.user_email))}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50">Revoke</button>
                  )}
                  <button disabled={busy} onClick={() => { if (confirm('Delete this request?')) run(() => deleteLearningHubAccessRequest(r.user_email)); }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-400 hover:bg-slate-50">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
