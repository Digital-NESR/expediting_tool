'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { submitCatalogAccessRequest } from '@/app/actions/catalog-manager';
import type { CatalogAccessRequestRow } from '@/types/catalog-manager';

interface GateCountry {
  code: string;
  name: string;
  flag: string | null;
}

/** Viewer and Contributor only. Approver comes from the country matrix, Admin from ADMIN_EMAILS. */
const ROLES = [
  {
    role: 'Viewer' as const,
    label: 'View only',
    blurb: 'Read the catalogue and its agreed rates. Cannot add or change anything.',
  },
  {
    role: 'Contributor' as const,
    label: 'Contributor',
    blurb: 'Add and edit catalogue entries and submit rate changes for approval.',
  },
];

/**
 * The four states someone without access can be in, and the form that moves them out of the
 * first one. Pending, Rejected and Revoked all still show the form: a decision is not permanent
 * and the alternative is a dead end with a support email in it.
 */
export default function CatalogAccessGateClient({
  countries,
  myRequest,
}: {
  countries: GateCountry[];
  myRequest: CatalogAccessRequestRow | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState<'Viewer' | 'Contributor'>(
    myRequest?.requested_role === 'Contributor' ? 'Contributor' : 'Viewer',
  );
  const [picked, setPicked] = useState<string[]>(myRequest?.requested_countries ?? []);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = myRequest?.status ?? null;
  const pending = status === 'Pending';

  const toggle = (code: string) =>
    setPicked((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  async function submit() {
    if (!picked.length) {
      setError('Choose at least one country you need access to.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await submitCatalogAccessRequest({
        requestedRole: role,
        countries: picked,
        reason: reason.trim() || null,
      });
      if (res.success) router.refresh();
      else setError(res.error ?? 'Could not send the request.');
    } catch {
      setError('Could not send the request. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const banner =
    status === 'Pending'
      ? {
          tone: 'bg-amber-50 border-amber-200 text-amber-900',
          title: 'Your request is with the Catalog Repo admins',
          body: 'You will be able to open the catalogue as soon as it is approved. You can change what you asked for below and send it again.',
        }
      : status === 'Rejected'
        ? {
            tone: 'bg-red-50 border-red-200 text-red-900',
            title: 'Your last request was not approved',
            body: 'If you still need access, say what you need it for and send it again.',
          }
        : status === 'Revoked'
          ? {
              tone: 'bg-slate-50 border-slate-200 text-slate-700',
              title: 'Your access was removed',
              body: 'Ask again below if you need it back.',
            }
          : null;

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link href="/home" className="text-sm font-medium text-[#307c4c] hover:underline">
            ← All tools
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Catalog Repo</h1>
          <p className="mt-1 text-sm text-slate-600">
            Supplier service and indirect item rates. Access is granted per country, so tell us
            which ones you work with and an admin will review it.
          </p>
        </div>

        {banner && (
          <div className={`mb-6 rounded-xl border px-4 py-3 ${banner.tone}`}>
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="mt-0.5 text-[13px]">{banner.body}</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            What access do you need?
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                onClick={() => setRole(r.role)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  role === r.role
                    ? 'border-[#307c4c] bg-[#307c4c]/5 ring-1 ring-[#307c4c]/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="block text-sm font-bold text-slate-900">{r.label}</span>
                <span className="mt-1 block text-[12px] leading-snug text-slate-500">
                  {r.blurb}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Which countries?{' '}
            <span className="normal-case text-slate-400">({picked.length} chosen)</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {countries.map((c) => {
              const on = picked.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    on
                      ? 'border-[#307c4c] bg-[#307c4c] text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {c.flag ? `${c.flag} ` : ''}
                  {c.name}
                </button>
              );
            })}
          </div>

          <label
            htmlFor="catalog-access-reason"
            className="mt-6 block text-xs font-semibold uppercase tracking-wider text-slate-400"
          >
            Anything the admin should know <span className="normal-case">(optional)</span>
          </label>
          <textarea
            id="catalog-access-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What you need it for, or who asked you to."
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20"
          />

          {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !picked.length}
              className="rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#26663e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Sending…' : pending ? 'Update my request' : 'Request access'}
            </button>
            {!picked.length && (
              <span className="text-[12px] text-slate-400">Choose at least one country.</span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
