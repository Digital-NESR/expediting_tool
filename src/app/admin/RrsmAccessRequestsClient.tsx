'use client';

/*
 * Admin -> RRSM -> Access requests. People without a grant ask for buyer access in a country
 * from the RRSM page; approving here writes the buyer grant, and the person is emailed either way.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import {
  decideRrsmAccessRequest,
  getRrsmAccessRequests,
  type RrsmAccessRequestRow,
} from '@/app/actions/rrsm/access-requests';

const BRAND = '#307c4c';

export default function RrsmAccessRequestsClient() {
  const [rows, setRows] = useState<RrsmAccessRequestRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    try {
      setRows(await getRrsmAccessRequests());
    } catch (err) {
      setError((err as Error).message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    void getRrsmAccessRequests()
      .then((r) => live && setRows(r))
      .catch((err: Error) => {
        if (!live) return;
        setError(err.message);
        setRows([]);
      });
    return () => {
      live = false;
    };
  }, []);

  async function decide(id: number, approve: boolean) {
    setBusy(id);
    setError('');
    const r = await decideRrsmAccessRequest({ id, approve, note: notes[id] });
    if (!r.success) setError(r.error ?? 'That did not work.');
    await reload();
    setBusy(null);
  }

  if (!rows) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading access requests…
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Access requests</h2>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500">
          Requests for <b>buyer</b> access, one country each, made from the RRSM page. Approving
          grants buyer access in that country; the person is emailed either way. Service requesters
          of recurrent services never appear here: being named on a service is their access.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-900">
          Waiting <span className="text-slate-400">({pending.length})</span>
        </h3>
        {!pending.length ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-400">No requests waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[14rem] flex-1">
                  <div className="text-[13.5px] font-semibold text-slate-800">
                    {r.name || r.email}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {r.email}
                    {r.jobTitle && ` · ${r.jobTitle}`}
                    {r.department && ` · ${r.department}`}
                  </div>
                  {r.reason && (
                    <div className="mt-0.5 text-[12px] italic text-slate-500">“{r.reason}”</div>
                  )}
                </div>
                <div className="text-[12.5px] text-slate-600">
                  Buyer · <b>{r.countryName}</b>
                  <div className="text-[11px] text-slate-400">asked {r.requestedAt}</div>
                </div>
                <input
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  placeholder="Note (optional)"
                  className="w-48 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#307c4c]"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decide(r.id, true)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    style={{ background: BRAND }}
                  >
                    {busy === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decide(r.id, false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-[12.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-900">
            Decided
          </h3>
          <ul className="divide-y divide-slate-100">
            {decided.slice(0, 50).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 px-4 py-2 text-[12.5px] text-slate-600"
              >
                <span className="min-w-[12rem] flex-1">{r.name || r.email}</span>
                <span>Buyer · {r.countryName}</span>
                <span
                  className={
                    r.status === 'approved'
                      ? 'font-semibold text-[#1d4f31]'
                      : 'font-semibold text-red-600'
                  }
                >
                  {r.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
                <span className="text-slate-400">
                  {r.decidedAt} by {r.decidedBy}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
