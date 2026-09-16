'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { submitSoaAccessRequest } from '@/app/actions/soa/access';

/**
 * What a signed-in employee without a grant sees instead of the tool.
 *
 * Three of the five gate states land here — no request yet, a request still pending, and a
 * request that was rejected or revoked — because they are the same page with a different header:
 * the form is what a rejected user needs (they are allowed to ask again), and hiding it behind a
 * second click would only make them hunt for it.
 *
 * Only Champion and Viewer are offerable. A manager is appointed in the matrix on /admin and an
 * admin comes from ADMIN_EMAILS; `submitSoaAccessRequest` rejects anything else outright, so
 * offering them here would just produce an error the requester cannot act on.
 */

const ROLES: { id: 'champion' | 'viewer'; label: string; help: string }[] = [
  {
    id: 'champion',
    label: 'SC SOA Champion',
    help: 'Runs your country’s vendor chase — scopes vendors, sends requests, accepts statements and hands the consolidated file to Finance.',
  },
  {
    id: 'viewer',
    label: 'Read-only Viewer',
    help: 'Reads progress and the evidence trail for your country, and changes nothing.',
  },
];

/** The "every country" choice, kept distinct from any country id so it can submit `null`. */
const ALL_COUNTRIES = '__all__';

export type SoaRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Revoked' | null;

export default function AccessGate({
  name,
  status,
  countries,
  existing = null,
}: {
  name: string;
  status: SoaRequestStatus;
  countries: { id: string; name: string }[];
  /** What this person already asked for, when they have a standing request. */
  existing?: { role: string; country: string } | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState<'champion' | 'viewer'>('champion');
  const [country, setCountry] = useState<string>(ALL_COUNTRIES);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* What was asked for. Seeded from the standing request so a cold page load can say it too,
     and replaced when a request goes through in this session. */
  const [submitted, setSubmitted] = useState<{ role: string; country: string } | null>(existing);

  const waiting = submitted !== null || status === 'Pending';
  const refused = status === 'Rejected' || status === 'Revoked';

  const countryLabel = (id: string) =>
    id === ALL_COUNTRIES ? 'All countries' : (countries.find((c) => c.id === id)?.name ?? id);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await submitSoaAccessRequest({
      role,
      countryId: country === ALL_COUNTRIES ? null : country,
      reason: reason.trim() || null,
    });
    if (!res.success) {
      setError(res.error ?? 'Something went wrong.');
      setSubmitting(false);
      return;
    }
    setSubmitted({
      role: ROLES.find((r) => r.id === role)?.label ?? role,
      country: countryLabel(country),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
        <Link
          href="/home"
          className="text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          ← Back to Home
        </Link>
        <div className="h-5 w-px bg-slate-200" />
        <span className="text-[13px] font-semibold text-slate-900">SOA Consolidation</span>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[20px] font-bold tracking-tight text-slate-900">Request access</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          SOA Consolidation coordinates each country&rsquo;s vendor statement chase, from scoping
          through to the consolidated handoff to Finance. Access is granted per country — tell us
          which role you need and where you work, and an SOA administrator reviews it.
        </p>

        {waiting ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-slate-900">
              Your request is waiting for approval
            </p>
            {submitted ? (
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
                You asked for <span className="font-semibold text-slate-700">{submitted.role}</span>{' '}
                access covering{' '}
                <span className="font-semibold text-slate-700">{submitted.country}</span>.
                You&rsquo;ll be able to open the tool as soon as an administrator approves it.
              </p>
            ) : (
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
                {name}, your request is with the SOA administrators. You&rsquo;ll be able to open
                the tool as soon as one of them approves it.
              </p>
            )}
            <Link
              href="/home"
              className="mt-6 inline-block rounded-lg bg-sns-green px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sns-green/90"
            >
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
            {refused && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
                Your access was {status === 'Rejected' ? 'rejected' : 'revoked'}. You can ask again
                — submitting replaces the old request and puts you back in the review queue.
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Role
              </label>
              <div className="mt-2 space-y-2">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      role === r.id
                        ? 'border-sns-green bg-sns-green-wash'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        role === r.id
                          ? 'border-sns-green bg-sns-green'
                          : 'border-slate-300 bg-white'
                      }`}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-900">
                        {r.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-500">
                        {r.help}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Country
              </label>
              <p className="mt-1 text-[12px] text-slate-500">
                Pick the country you run the chase for. Choose{' '}
                <span className="font-semibold text-slate-600">All countries</span> only if you work
                across the region — it keeps covering countries added later.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[{ id: ALL_COUNTRIES, name: 'All countries' }, ...countries].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCountry(c.id)}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      country === c.id
                        ? 'border-sns-green bg-sns-green text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Reason{' '}
                <span className="font-medium normal-case tracking-normal text-slate-400">
                  (optional)
                </span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Anything that helps the review — your team, the entity you cover, what you'll use it for."
                className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-[13px] text-slate-900 outline-none focus:border-sns-green"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full rounded-lg bg-sns-green px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-sns-green/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
