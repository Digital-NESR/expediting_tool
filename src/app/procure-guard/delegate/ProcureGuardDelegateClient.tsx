'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import ProcureGuardHero from '../components/ProcureGuardHero';
import { grantProcureGuardDelegation, revokeProcureGuardDelegation } from '@/app/actions/procureGuard';
import { fmtDate } from '@/lib/procureGuard-utils';
import type { ProcureGuardDelegationData, ProcureGuardDelegation } from '@/types/procureGuard';

const LBL = 'block text-sm font-semibold text-slate-800 mb-2';
const INP = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400';

function isLive(d: ProcureGuardDelegation): boolean {
  return d.is_active && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

export default function ProcureGuardDelegateClient({ data }: { data: ProcureGuardDelegationData }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');

  const canDelegate = (data.actor.reviewGrants ?? []).some(g => g.source === 'self');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner('');
    setError('');
    startTransition(async () => {
      const result = await grantProcureGuardDelegation({ delegateEmail: email, delegateName: name, expiresAt: expiresAt || null });
      if (result.success) {
        setBanner(`Delegated your approvals to ${email}. They've been emailed.`);
        setEmail('');
        setName('');
        setExpiresAt('');
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
      const result = await revokeProcureGuardDelegation(id);
      if (result.success) {
        setBanner(`Revoked delegation for ${who}. They've been emailed.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to revoke delegation.');
      }
    });
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} accessView={data.actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">Delegation</span>
      </header>

      <main className="mx-auto max-w-[900px] space-y-5 px-4 py-6 sm:px-6">
        <ProcureGuardHero title="Delegation" subtitle="Hand your approval authority to a colleague while you're away. You both keep the ability to act, and you can revoke any time." />

        {banner && <div className="rounded-lg border border-[#307c4c]/20 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">{banner}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        {canDelegate ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Delegate my approvals</h2>
            <p className="mt-0.5 text-xs text-slate-500">The delegate is identified by their NESR sign-in email and inherits your approval scope.</p>
            <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LBL}><span className="mr-1 text-red-500">*</span>Delegate email</label>
                <input type="email" required className={INP} value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@nesr.com" />
              </div>
              <div>
                <label className={LBL}>Delegate name <span className="font-normal text-slate-400">(optional)</span></label>
                <input className={INP} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className={LBL}>End date <span className="font-normal text-slate-400">(optional)</span></label>
                <input type="date" className={INP} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                <p className="mt-1 text-xs text-slate-400">Leave blank to keep active until you revoke it.</p>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#307c4c]/85 disabled:opacity-60">
                  {isPending ? 'Working…' : 'Delegate my approvals'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            You don&apos;t have approval authority of your own to delegate. This page shows any authority delegated to you below.
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Delegations you&apos;ve granted</h2>
            <p className="mt-0.5 text-xs text-slate-500">People who can currently act on your behalf.</p>
          </div>
          {data.granted.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">You haven&apos;t delegated to anyone.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.granted.map(d => {
                const live = isLive(d);
                return (
                  <div key={d.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                          {live ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegate_email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Granted {fmtDate(d.created_at)}
                        {d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}
                        {d.revoked_at ? ` · revoked ${fmtDate(d.revoked_at)}` : ''}
                      </p>
                    </div>
                    {live && (
                      <button
                        onClick={() => revoke(d.id, d.delegate_name || d.delegate_email)}
                        disabled={isPending}
                        className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {data.received.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Authority delegated to you</h2>
              <p className="mt-0.5 text-xs text-slate-500">Approvers whose requests you can currently act on.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.received.map(d => (
                <div key={d.id} className="p-4">
                  <p className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegator_email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Since {fmtDate(d.created_at)}{d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
