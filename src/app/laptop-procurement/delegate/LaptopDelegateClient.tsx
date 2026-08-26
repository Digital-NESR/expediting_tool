'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../components/LaptopShell';
import EmployeeAutocomplete from '@/app/procure-guard/components/EmployeeAutocomplete';
import { grantLaptopDelegation, revokeLaptopDelegation } from '@/app/actions/laptopProcurement';
import { fmtDate } from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopDelegationData, LaptopDelegationRow } from '@/types/laptopProcurement';

const LBL = 'mb-1 block text-xs font-semibold text-slate-500';
const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

// Combines a role's stage + country into one string key for checkbox state and back.
const ROLE_KEY_SEP = '||';
function roleKey(stage: string, country: string): string { return `${stage}${ROLE_KEY_SEP}${country}`; }
function parseRoleKey(key: string): { stage: LaptopApprovalStage; country: string } {
  const [stage, country] = key.split(ROLE_KEY_SEP);
  return { stage: stage as LaptopApprovalStage, country };
}

function isLive(d: LaptopDelegationRow): boolean {
  return d.is_active
    && (!d.starts_at || new Date(d.starts_at).getTime() <= Date.now())
    && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

function isScheduled(d: LaptopDelegationRow): boolean {
  return d.is_active && Boolean(d.starts_at) && new Date(d.starts_at!).getTime() > Date.now();
}

export default function LaptopDelegateClient({ data }: { data: LaptopDelegationData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<Set<string>>(new Set());
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');

  const canDelegate = data.actor.permissions.canViewAll;
  // Exactly the roles this actor holds — never anything beyond what's checked below.
  const myRoles = (Object.entries(data.actor.matrixCapabilities) as Array<[LaptopApprovalStage, string[]]>)
    .flatMap(([stage, countries]) => countries.map(country => ({ stage, country })));

  function toggleRole(key: string) {
    setSelectedRoleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner('');
    setError('');
    if (selectedRoleKeys.size === 0) { setError('Select at least one role to delegate.'); return; }
    const roles = [...selectedRoleKeys].map(parseRoleKey);
    startTransition(async () => {
      const result = await grantLaptopDelegation({ delegateEmail: email, delegateName: name, roles, startsAt: startsAt || null, endsAt: endsAt || null });
      if (result.success) {
        setBanner(`Delegated ${roles.length === 1 ? `${roles[0].stage} (${roles[0].country})` : `${roles.length} roles`} to ${email}.`);
        setEmail(''); setName(''); setSelectedRoleKeys(new Set()); setStartsAt(''); setEndsAt('');
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
      accessView={data.actor.effectiveAccessView}
    >
      <div className="space-y-5">
        {banner && <div className="rounded-2xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">{banner}</div>}
        {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}

        {canDelegate ? (
          <section className={`${GLASS} p-5`}>
            <h2 className="text-[15px] font-bold">Delegate my approvals</h2>
            <p className="mt-0.5 text-xs text-slate-500">The delegate is identified by their NESR sign-in email and inherits only the specific role(s) you check below.</p>
            <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LBL}>Delegatee</label>
                <EmployeeAutocomplete
                  value={email}
                  onChange={v => { setEmail(v); setName(''); }}
                  onSelect={emp => { setEmail(emp.email); setName(emp.name); }}
                  inputClassName={INP}
                  placeholder="Search by name or email…"
                />
                {name && <p className="mt-1 text-xs text-slate-500/80">{name}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Which role(s) to delegate</label>
                <div className="flex flex-wrap gap-2">
                  {myRoles.map(r => {
                    const key = roleKey(r.stage, r.country);
                    const checked = selectedRoleKeys.has(key);
                    return (
                      <label key={key} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${checked ? 'border-[#307c4c]/40 bg-[#307c4c]/10 text-[#307c4c]' : 'border-slate-200 bg-white text-slate-600'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRole(key)} className="h-3.5 w-3.5 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]" />
                        {r.stage} — {r.country}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={LBL}>Start date (optional)</label>
                <input type="date" className={INP} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500/80">Leave blank to start immediately.</p>
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
            const scheduled = isScheduled(d);
            return (
              <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                    {d.stage && d.country && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{d.stage} — {d.country}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : scheduled ? 'bg-amber-500/10 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {live ? 'Active' : scheduled ? 'Scheduled' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegate_email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500/80">
                    Granted {fmtDate(d.created_at)}
                    {d.starts_at ? ` · starts ${fmtDate(d.starts_at)}` : ''}
                    {d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}
                    {d.revoked_at ? ` · revoked ${fmtDate(d.revoked_at)}` : ''}
                  </p>
                </div>
                {(live || scheduled) && (
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</p>
                  {d.stage && d.country && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{d.stage} — {d.country}</span>
                  )}
                </div>
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
