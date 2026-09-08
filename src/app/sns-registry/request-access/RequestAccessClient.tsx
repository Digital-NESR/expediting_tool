'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { submitSnsAccessRequest } from '@/app/actions/sns';
import { ROLES } from '../lib/constants';
import type { SnsAccessRequestRow, SnsRole } from '../lib/types';

const ROLE_HELP: Record<SnsRole, string> = {
  'Requestor — Sourcing / Procurement': 'Raise new single/sole-source records and start periodic reviews.',
  'Validator L1 — Country Supply Chain Manager': 'First-level validation for your countries — approve to Level 2, or reject to draft.',
  'Validator L2 — Category Manager / SC Director': 'Final sign-off that publishes the Registry ID, and confirms periodic reviews.',
  'Read-only — Procurement Officer / Auditor': 'Search and export the registry. No submissions, no validations.',
  'Supply Chain Leadership': 'Registry plus the leadership dashboard. No submissions, no validations.',
};

export default function RequestAccessClient({
  myRequest,
  countries,
}: {
  myRequest: SnsAccessRequestRow | null;
  countries: string[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<SnsRole>((myRequest?.requestedRole as SnsRole) ?? ROLES[0]);
  const [selected, setSelected] = useState<string[]>(myRequest?.requestedCountries ?? []);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isPending = myRequest?.status === 'Pending' && !done;
  const wasRejected = myRequest?.status === 'Rejected';
  const wasRevoked = myRequest?.status === 'Revoked';

  function toggleCountry(c: string) {
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : prev.concat([c])));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await submitSnsAccessRequest(role, selected, reason.trim());
    if (!res.success) {
      setError(res.error ?? 'Something went wrong.');
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6">
        <Link href="/home" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
          ← Back to Home
        </Link>
        <div className="h-5 w-px bg-gray-200" />
        <span className="text-sm font-semibold text-slate-900">S&amp;S Registry</span>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Request access</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          The Single &amp; Sole Source Registry is the system of record for single-quotation compliance. Tell us which
          role you need and which countries you cover — a platform admin reviews the request before it takes effect.
        </p>

        {done || isPending ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-slate-900">Your request is pending review</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
              You asked for <span className="font-semibold text-slate-700">{done ? role : myRequest?.requestedRole}</span>
              {' '}access covering{' '}
              <span className="font-semibold text-slate-700">
                {(done ? selected : myRequest?.requestedCountries ?? []).join(', ') || '—'}
              </span>. You&rsquo;ll be able to open the tool as soon as an admin approves it.
            </p>
            <Link
              href="/home"
              className="mt-6 inline-block rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#26663e]"
            >
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
            {(wasRejected || wasRevoked) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
                Your previous request was {wasRejected ? 'rejected' : 'revoked'}. Submitting again replaces it and puts
                you back in the review queue.
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Role</label>
              <div className="mt-2 space-y-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      role === r ? 'border-[#307c4c] bg-[#f0f9f4]' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        role === r ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'
                      }`}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-900">{r}</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-500">{ROLE_HELP[r]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Countries / entities
              </label>
              <p className="mt-1 text-[12px] text-slate-500">
                Pick every country you need to work in. Validators can only act on records in their approved countries.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {countries.map((c) => {
                  const on = selected.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCountry(c)}
                      className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        on
                          ? 'border-[#307c4c] bg-[#307c4c] text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Reason <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Anything that helps the admin review this — your team, what you'll use it for."
                className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-[13px] text-slate-900 outline-none focus:border-[#307c4c]"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || !selected.length}
              className="w-full rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#26663e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
