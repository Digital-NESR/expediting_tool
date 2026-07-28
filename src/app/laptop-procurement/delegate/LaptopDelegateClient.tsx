'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../components/LaptopShell';
import EmployeeAutocomplete from '@/app/procure-guard/components/EmployeeAutocomplete';
import { grantLaptopDelegation, revokeLaptopDelegation } from '@/app/actions/laptopProcurement';
import { fmtDate } from '@/lib/laptopProcurement-utils';
import type { LaptopDelegationData, LaptopDelegationRow } from '@/types/laptopProcurement';

const LBL = 'mb-1 block text-xs font-semibold text-slate-500';
const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

function isLive(d: LaptopDelegationRow): boolean {
  return d.is_active && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

export default function LaptopDelegateClient({ data }: { data: LaptopDelegationData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');

  const canDelegate = data.actor.permissions.canViewAll;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner('');
    setError('');
    startTransition(async () => {
      const result = await grantLaptopDelegation({ delegateEmail: email, delegateName: name, endsAt: endsAt || null });
      if (result.success) {
        setBanner(`Delegated your approvals to ${email}.`);
        setEmail(''); setName(''); setEndsAt('');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to create delegation.');
      }
    });
  }

  function revoke(id: number, who: string) {
    setBanner('');
    setError('');
    startTransition(async () => {
      const result = await revokeLaptopDelegation(id);
      if (result.success) {
        setBanner(`Revoked delegation for ${who}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to revoke delegation.');
      }
    });
  }

  return (
    <LaptopShell
      title="Delegation"
      subtitle="Hand your approval authority to a colleague while you're away"
      accessView={data.actor.permissions.accessView}
    >
      <div className="space-y-5">
        {banner && <div className="rounded-2xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">{banner}</div>}
        {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}

        {canDelegate ? (
          <section className={`${GLASS} p-5`}>
            <h2 className="text-[15px] font-bold">Delegate my approvals</h2>
            <p className="mt-0.5 text-xs text-slate-500">The delegate is identified by their NESR sign-in email and inherits your approval scope.</p>
            <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LBL}>Find a colleague</label>
                <EmployeeAutocomplete
                  placeholder="Search directory by name or email…"
                  onSelect={emp => { setEmail(emp.email); setName(emp.name); }}
                />
                <p className="mt-1 text-xs text-slate-500/80">Pick from the employee directory to fill the fields below, or type them in manually.</p>
              </div>
              <div>
                <label className={LBL}>Delegate email</label>
                <input type="email" required className={INP} value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@nesr.com" />
              </div>
              <div>
                <label className={LBL}>Delegate name (optional)</label>
                <input className={INP} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className={LBL}>End date (optional)</label>
                <input type="date" className={INP} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500/80">Leave blank to keep active until you revoke it.</p>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={isPending} className={`${CTA} disabled:opacity-60`}>
                  {isPending ? 'Working...' : 'Delegate my approvals'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className={`${GLASS} p-5 text-sm text-slate-500`}>
            You don&apos;t have approval authority of your own to delegate. This page shows any authority delegated to you below.
          </section>
        )}

        <section className={`${GLASS} divide-y divide-slate-100 overflow-hidden`}>
          <div className="p-5">
            <h2 className="text-[15px] font-bold">Delegations you&apos;ve granted</h2>
            <p className="mt-0.5 text-xs text-slate-500">People who can currently act on your behalf.</p>
          </div>
          {data.granted.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">You haven&apos;t delegated to anyone.</div>
          ) : data.granted.map(d => {
            const live = isLive(d);
            return (
              <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                      {live ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegate_email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500/80">
                    Granted {fmtDate(d.created_at)}
                    {d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}
                    {d.revoked_at ? ` · revoked ${fmtDate(d.revoked_at)}` : ''}
                  </p>
                </div>
                {live && (
                  <button
                    onClick={() => revoke(d.id, d.delegate_name || d.delegate_email)}
                    disabled={isPending}
                    className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {data.received.length > 0 && (
          <section className={`${GLASS} divide-y divide-slate-100 overflow-hidden`}>
            <div className="p-5">
              <h2 className="text-[15px] font-bold">Authority delegated to you</h2>
              <p className="mt-0.5 text-xs text-slate-500">Approvers whose requests you can currently act on.</p>
            </div>
            {data.received.map(d => (
              <div key={d.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegator_email}</p>
                <p className="mt-0.5 text-[11px] text-slate-500/80">Since {fmtDate(d.created_at)}{d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </LaptopShell>
  );
}
