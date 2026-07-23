'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon, Card, CardHeader, Chip } from '../components/CatalogManagerUI';
import { submitCatalogAccessRequest } from '@/app/actions/catalog-manager';
import type { CatalogAccessRequestRow, CatalogActor } from '@/types/catalog-manager';

const REQUESTABLE_ROLES: { role: 'Contributor' | 'Approver'; label: string; description: string }[] = [
  { role: 'Contributor', label: 'Contributor', description: 'Create and edit catalog entries (Procurement Officer).' },
  { role: 'Approver', label: 'Approver', description: 'Everything Contributor can do, plus sign off on entries above the approval threshold (Country / SCM Manager).' },
];

export default function RequestAccessClient({
  actor, countries, myRequest, roleLabel, pendingCount,
}: {
  actor: CatalogActor;
  countries: ScopeCountry[];
  myRequest: CatalogAccessRequestRow | null;
  roleLabel: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [role, setRole] = useState<'Contributor' | 'Approver'>(myRequest?.requested_role === 'Approver' ? 'Approver' : 'Contributor');
  const [country, setCountry] = useState(myRequest?.country_code ?? actor.country_code ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitCatalogAccessRequest({ requestedRole: role, countryCode: country || null, reason: reason.trim() || null });
      if (!res.success) { setError(res.error ?? 'Something went wrong.'); setSubmitting(false); return; }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  const alreadyElevated = actor.canApprove || actor.canAdmin;
  const isPending = myRequest?.status === 'Pending' && !done;

  return (
    <CatalogManagerShell title="Request access" roleLabel={roleLabel} canApprove={actor.canApprove} canAdmin={actor.canAdmin} pendingCount={pendingCount} showScope={false}>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Request access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone gets read-only Viewer access to the Catalog Repo automatically. Request an upgrade here if you need to create,
            edit, or approve catalog entries — a platform admin reviews it before it takes effect.
          </p>
        </div>

        {alreadyElevated ? (
          <Card className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#307c4c]/10 text-[#307c4c]">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-semibold text-slate-900">You already have {actor.role} access</p>
            <p className="mt-1 text-[13px] text-slate-500">No request needed — you can already create{actor.canApprove ? ' and approve' : ''} catalog entries.</p>
          </Card>
        ) : done || isPending ? (
          <Card className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Icon name="clock" className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-semibold text-slate-900">Request pending review</p>
            <p className="mt-1 text-[13px] text-slate-500">
              You requested <span className="font-semibold text-slate-700">{myRequest?.requested_role ?? role}</span> access.
              A platform admin will review it shortly.
            </p>
          </Card>
        ) : (
          <>
            {myRequest && (myRequest.status === 'Rejected' || myRequest.status === 'Revoked') && (
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  Your last request was <Chip tone={myRequest.status === 'Rejected' ? 'neutral' : 'amber'}>{myRequest.status}</Chip> — you can submit a new one below.
                </span>
              </div>
            )}

            <Card className="p-5">
              <CardHeader className="mb-4" title="Choose the access level you need" />
              <div className="space-y-2.5">
                {REQUESTABLE_ROLES.map((r) => (
                  <label key={r.role} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${role === r.role ? 'border-[#307c4c]/40 bg-[#307c4c]/5' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="role" checked={role === r.role} onChange={() => setRole(r.role)} className="mt-1 h-4 w-4 accent-[#307c4c]" />
                    <span>
                      <span className="block text-[13.5px] font-semibold text-slate-900">{r.label}</span>
                      <span className="block text-[12.5px] text-slate-500">{r.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-slate-600">Home country <span className="font-normal text-slate-400">(optional)</span></span>
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20">
                  <option value="">Not set</option>
                  {countries.map((c) => <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>)}
                </select>
              </label>

              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-slate-600">Reason <span className="font-normal text-slate-400">(optional, helps the reviewer)</span></span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I manage supplier rates for the Drilling segment in Oman." className="min-h-[72px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20" />
              </label>

              {error && <p className="mt-3 text-[12.5px] font-medium text-red-600">{error}</p>}

              <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98] disabled:opacity-50">
                  <Icon name="arrowRight" className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </Card>
          </>
        )}
      </div>
    </CatalogManagerShell>
  );
}
