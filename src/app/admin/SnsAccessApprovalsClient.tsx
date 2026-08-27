'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveSnsAccess,
  deleteSnsAccessRequest,
  getSnsAccessRequests,
  getSnsPendingAccessCount,
  getSnsReferenceData,
  rejectSnsAccess,
  revokeSnsAccess,
} from '@/app/actions/sns';
import { ROLES } from '@/app/sns-registry/lib/constants';
import type { SnsAccessRequestRow, SnsRole } from '@/app/sns-registry/lib/types';

const BRAND = '#2A7E4F';

const STATUS_STYLE: Record<string, { bg: string; col: string }> = {
  Pending: { bg: '#fef3c7', col: '#b45309' },
  Approved: { bg: '#dcfce7', col: '#15803d' },
  Rejected: { bg: '#fee2e2', col: '#b91c1c' },
  Revoked: { bg: '#fee2e2', col: '#b91c1c' },
};

export default function SnsAccessApprovalsClient({
  onPendingCountChange,
}: {
  onPendingCountChange?: (n: number) => void;
}) {
  const [requests, setRequests] = useState<SnsAccessRequestRow[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which request is open in the approve editor, keyed by email. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<SnsRole>(ROLES[0]);
  const [editCountries, setEditCountries] = useState<string[]>([]);

  const reload = useCallback(async () => {
    const [reqs, cnt, ref] = await Promise.all([
      getSnsAccessRequests(),
      getSnsPendingAccessCount(),
      getSnsReferenceData(),
    ]);
    setRequests(reqs);
    setCountries(ref.countries.map((c) => c[0]));
    setLoading(false);
    onPendingCountChange?.(cnt);
  }, [onPendingCountChange]);

  useEffect(() => {
    // Mount-time load from the database — the carve-out this rule allows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.success) { setError(res.error ?? 'Action failed.'); return; }
    setEditing(null);
    await reload();
  }

  /** Opens the approve editor pre-filled with whatever the user asked for. */
  function beginApprove(r: SnsAccessRequestRow) {
    setEditing(r.userEmail);
    setEditRole((r.approvedRole ?? r.requestedRole) as SnsRole);
    setEditCountries(r.approvedCountries.length ? r.approvedCountries : r.requestedCountries);
    setError(null);
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading access requests…</div>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">S&amp;S Registry · Access Approvals</h2>
      <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-slate-500">
        Grant users a role in the Single &amp; Sole Source Registry. You can override both the role and the countries they
        asked for. Leaving the country list empty grants <span className="font-semibold text-slate-600">all countries</span>.
        Emails listed in <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">ADMIN_EMAILS</code> already have full
        access and never appear here.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          No access requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const ss = STATUS_STYLE[r.status] ?? STATUS_STYLE.Rejected;
            const isEditing = editing === r.userEmail;
            return (
              <div key={r.userEmail} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-slate-900">{r.displayName || r.userEmail}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: ss.bg, color: ss.col }}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-slate-500">
                      {r.userEmail}{r.jobTitle ? ` · ${r.jobTitle}` : ''}
                    </div>

                    <dl className="mt-3 grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
                      <div>
                        <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Requested role</dt>
                        <dd className="text-slate-700">{r.requestedRole}</dd>
                      </div>
                      <div>
                        <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Requested countries</dt>
                        <dd className="text-slate-700">{r.requestedCountries.join(', ') || '—'}</dd>
                      </div>
                      {r.status === 'Approved' && (
                        <>
                          <div>
                            <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Approved role</dt>
                            <dd className="font-semibold text-slate-900">{r.approvedRole ?? '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Approved countries</dt>
                            <dd className="font-semibold text-slate-900">
                              {r.approvedCountries.length ? r.approvedCountries.join(', ') : 'All countries'}
                            </dd>
                          </div>
                        </>
                      )}
                      {r.reason && (
                        <div className="sm:col-span-2">
                          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Reason</dt>
                          <dd className="leading-relaxed text-slate-600">{r.reason}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {r.status !== 'Approved' && (
                      <button
                        disabled={busy}
                        onClick={() => beginApprove(r)}
                        className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                        style={{ background: BRAND }}
                      >
                        Approve…
                      </button>
                    )}
                    {r.status === 'Approved' && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => beginApprove(r)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Change role / countries
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => run(() => revokeSnsAccess(r.userEmail))}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </>
                    )}
                    {r.status === 'Pending' && (
                      <button
                        disabled={busy}
                        onClick={() => run(() => rejectSnsAccess(r.userEmail))}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => run(() => deleteSnsAccessRequest(r.userEmail))}
                      title="Remove the row entirely so the user can apply from scratch"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-400 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Grant role</div>
                    <div className="mt-2 space-y-1.5">
                      {ROLES.map((role) => (
                        <label key={role} className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
                          <input
                            type="radio"
                            name={`role-${r.userEmail}`}
                            checked={editRole === role}
                            onChange={() => setEditRole(role)}
                          />
                          {role}
                        </label>
                      ))}
                    </div>

                    <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Countries <span className="font-medium normal-case tracking-normal text-slate-400">(none selected = all countries)</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {countries.map((c) => {
                        const on = editCountries.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              setEditCountries((prev) => (on ? prev.filter((x) => x !== c) : prev.concat([c])))
                            }
                            className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                              on ? 'border-[#2A7E4F] bg-[#2A7E4F] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() => run(() => approveSnsAccess(r.userEmail, editRole, editCountries))}
                        className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                        style={{ background: BRAND }}
                      >
                        {busy ? 'Saving…' : 'Confirm approval'}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
