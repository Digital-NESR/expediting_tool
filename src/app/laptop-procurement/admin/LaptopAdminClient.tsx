'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../components/LaptopShell';
import EmployeeAutocomplete from '@/app/procure-guard/components/EmployeeAutocomplete';
import {
  adminGrantLaptopDelegation,
  deleteLaptopPermission,
  deleteLaptopRecord,
  revokeLaptopDelegation,
  updateLaptopPermission,
} from '@/app/actions/laptopProcurement';
import {
  COUNTRY_OPTIONS,
  PERMISSION_PROFILES,
  PERMISSION_ROLE_OPTIONS,
  SEGMENT_OPTIONS,
  fmtDate,
  getPermissionProfile,
  getStatusBadge,
} from '@/lib/laptopProcurement-utils';
import type { LaptopAdminData, LaptopDelegationRow, LaptopPermissionRole } from '@/types/laptopProcurement';

const INP = 'w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2 text-sm text-[#182a1f] shadow-sm outline-none backdrop-blur-xl transition placeholder:text-[#8a978d] focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#edf4ee] p-6">
      <div className="max-w-sm rounded-3xl border border-white/70 bg-white/70 p-10 text-center shadow-[0_14px_44px_rgba(24,58,38,0.14)] backdrop-blur-2xl">
        <p className="mb-1 font-semibold text-[#182a1f]">Admin data unavailable</p>
        <p className="text-sm text-[#5f7266]">Admin access is required, or the database is unreachable.</p>
      </div>
    </div>
  );
}

const REQUESTS_PAGE_SIZE = 10;

function delegationIsLive(d: LaptopDelegationRow): boolean {
  return d.is_active && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

function DelegationsPanel({
  delegations,
  approvers,
  onDone,
}: {
  delegations: LaptopDelegationRow[];
  approvers: Array<{ email: string; name: string | null; role: LaptopPermissionRole }>;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [delegatorEmail, setDelegatorEmail] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await adminGrantLaptopDelegation({ delegatorEmail, delegateEmail, delegateName, endsAt: endsAt || null });
      if (result.success) {
        onDone(`Delegated ${delegatorEmail}'s approvals to ${delegateEmail}.`);
        setDelegatorEmail(''); setDelegateEmail(''); setDelegateName(''); setEndsAt('');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to create delegation.');
      }
    });
  }

  function revoke(id: number, who: string) {
    setError('');
    startTransition(async () => {
      const result = await revokeLaptopDelegation(id);
      if (result.success) {
        onDone(`Revoked delegation for ${who}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to revoke delegation.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className={`${GLASS} p-5`}>
        <h3 className="text-[15px] font-bold">Set up a delegation</h3>
        <p className="mt-0.5 text-xs text-[#5f7266]">Hand an approver&apos;s authority to a delegate on their behalf. The delegate inherits the approver&apos;s scope until the end date or until you revoke it.</p>
        {error && <div className="mt-3 rounded-xl border border-red-400/40 bg-red-100/40 px-4 py-3 text-sm font-semibold text-red-800 backdrop-blur">{error}</div>}
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Find the delegate in the directory</label>
            <EmployeeAutocomplete
              placeholder="Search directory by name or email…"
              onSelect={emp => { setDelegateEmail(emp.email); setDelegateName(emp.name); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Approver (delegator)</label>
            <select className={INP} value={delegatorEmail} onChange={e => setDelegatorEmail(e.target.value)} required>
              <option value="">Select an approver…</option>
              {approvers.map(a => (
                <option key={a.email} value={a.email}>{a.name ? `${a.name} (${a.email})` : a.email} — {a.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Delegate email</label>
            <input type="email" required className={INP} value={delegateEmail} onChange={e => setDelegateEmail(e.target.value)} placeholder="colleague@nesr.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Delegate name (optional)</label>
            <input className={INP} value={delegateName} onChange={e => setDelegateName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5f7266]">End date (optional)</label>
            <input type="date" className={INP} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
          </div>
          <div className="flex items-end md:col-span-2">
            <button type="submit" disabled={isPending} className={`${CTA} disabled:opacity-60`}>
              {isPending ? 'Working…' : 'Create delegation'}
            </button>
          </div>
        </form>
        {approvers.length === 0 && (
          <p className="mt-3 text-xs text-[#5f7266]/80">No approvers found. Assign approval access from the Permissions tab first.</p>
        )}
      </section>

      <section className={`${GLASS} divide-y divide-[#182a1f]/[0.06] overflow-hidden`}>
        <div className="p-5">
          <h3 className="text-[15px] font-bold">All delegations</h3>
          <p className="mt-0.5 text-xs text-[#5f7266]">Every delegation across approvers. Revoke any active one to remove the delegate&apos;s access immediately.</p>
        </div>
        {delegations.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#5f7266]">No delegations have been set up.</div>
        ) : delegations.map(d => {
          const live = delegationIsLive(d);
          return (
            <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#182a1f]">{d.delegator_name || d.delegator_email}</span>
                  <span className="text-[#8a978d]">→</span>
                  <span className="text-sm font-semibold text-[#182a1f]">{d.delegate_name || d.delegate_email}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                    {live ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#5f7266]">{d.delegator_email} → {d.delegate_email}</p>
                <p className="mt-0.5 text-[11px] text-[#5f7266]/80">
                  Granted {fmtDate(d.created_at)}
                  {d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}
                  {d.revoked_at ? ` · revoked ${fmtDate(d.revoked_at)}` : ''}
                </p>
              </div>
              {live && (
                <button
                  onClick={() => revoke(d.id, d.delegate_name || d.delegate_email)}
                  disabled={isPending}
                  className="shrink-0 rounded-full border border-red-400/40 bg-red-100/40 px-3 py-1.5 text-xs font-bold text-red-800 backdrop-blur transition hover:bg-red-100/80 disabled:opacity-60"
                >
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default function LaptopAdminClient({ data, embedded = false }: { data: LaptopAdminData | null; embedded?: boolean }) {
  const [tab, setTab] = useState<'permissions' | 'requests' | 'activity' | 'delegations'>('permissions');
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState('');
  const [requestsPage, setRequestsPage] = useState(0);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<LaptopPermissionRole>('Requester');
  const [country, setCountry] = useState('');
  const [segment, setSegment] = useState('');

  if (!data) return <DbError />;
  const { actor, requests, activity, permissions, delegations, stats } = data;
  const approvers = permissions.filter(p => getPermissionProfile(p.role).canViewAll);

  const requestsPageCount = Math.max(1, Math.ceil(requests.length / REQUESTS_PAGE_SIZE));
  const currentRequestsPage = Math.min(requestsPage, requestsPageCount - 1);
  const pagedRequests = requests.slice(currentRequestsPage * REQUESTS_PAGE_SIZE, (currentRequestsPage + 1) * REQUESTS_PAGE_SIZE);

  function savePermission() {
    setBanner('');
    if (!email.trim()) { setBanner('Email is required.'); return; }
    startTransition(async () => {
      const result = await updateLaptopPermission({ email, name, role, country, segment });
      if (result.success) {
        setBanner(`Saved permission for ${email}.`);
        setEmail(''); setName(''); setRole('Requester'); setCountry(''); setSegment('');
        router.refresh();
      } else {
        setBanner(result.error ?? 'Failed to save permission.');
      }
    });
  }

  function removePermission(targetEmail: string) {
    startTransition(async () => {
      const result = await deleteLaptopPermission(targetEmail);
      if (result.success) router.refresh();
      else setBanner(result.error ?? 'Failed to delete permission.');
    });
  }

  function removeRequest(id: number) {
    startTransition(async () => {
      const result = await deleteLaptopRecord('request', id);
      if (result.success) router.refresh();
      else setBanner(result.error ?? 'Failed to delete request.');
    });
  }

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'permissions', label: `Permissions (${permissions.length})` },
    { id: 'requests', label: `Requests (${requests.length})` },
    { id: 'activity', label: `Activity (${activity.length})` },
    { id: 'delegations', label: `Delegations (${delegations.length})` },
  ];

  const content = (
      <div className="space-y-5">
        {banner && <div className="rounded-2xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#1f5c3a] backdrop-blur">{banner}</div>}

        <div className="inline-flex flex-wrap gap-1 rounded-full border border-white/80 bg-white/55 p-1 backdrop-blur-xl">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                tab === t.id
                  ? 'bg-gradient-to-br from-[#3a9a5f] to-[#28714a] text-white shadow-[0_6px_16px_rgba(40,113,74,0.35)]'
                  : 'text-[#4c5f53] hover:bg-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'permissions' && (
          <>
            <section className={`${GLASS} p-5`}>
              <h2 className="mb-4 text-[15px] font-bold">Add / Update Permission</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div><label className="mb-1 block text-xs font-semibold text-[#5f7266]">Email</label><input className={INP} value={email} onChange={e => setEmail(e.target.value)} placeholder="user@nesr.com" /></div>
                <div><label className="mb-1 block text-xs font-semibold text-[#5f7266]">Name</label><input className={INP} value={name} onChange={e => setName(e.target.value)} /></div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Role</label>
                  <select className={INP} value={role} onChange={e => setRole(e.target.value as LaptopPermissionRole)}>
                    {PERMISSION_ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Country (scope)</label>
                  <select className={INP} value={country} onChange={e => setCountry(e.target.value)}>
                    <option value="">All countries</option>
                    {COUNTRY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#5f7266]">Segment (scope)</label>
                  <select className={INP} value={segment} onChange={e => setSegment(e.target.value)}>
                    <option value="">All segments</option>
                    {SEGMENT_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#5f7266]">{PERMISSION_PROFILES[role].description}</p>
              <button onClick={savePermission} disabled={isPending} className={`mt-4 ${CTA} disabled:opacity-60`}>
                {isPending ? 'Saving...' : 'Save Permission'}
              </button>
            </section>

            <section className={`${GLASS} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-[#5f7266]">
                    <tr className="border-b border-[#182a1f]/[0.08]">
                      <th className="px-5 py-3 text-left font-semibold">Email</th>
                      <th className="px-5 py-3 text-left font-semibold">Name</th>
                      <th className="px-5 py-3 text-left font-semibold">Role</th>
                      <th className="px-5 py-3 text-left font-semibold">Scope</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#182a1f]/[0.06]">
                    {permissions.map(p => (
                      <tr key={p.id} className="transition-colors hover:bg-white/45">
                        <td className="px-5 py-3 font-semibold text-[#182a1f]">{p.email}</td>
                        <td className="px-5 py-3 text-[#4c5f53]">{p.name || '—'}</td>
                        <td className="px-5 py-3"><span className="inline-flex rounded-full border border-[#307c4c]/30 bg-[#307c4c]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#1f5c3a] backdrop-blur">{p.role}</span></td>
                        <td className="px-5 py-3 text-xs text-[#4c5f53]">{[p.country, p.segment].filter(Boolean).join(' · ') || 'All'}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => removePermission(p.email)} disabled={isPending} className="rounded-full border border-red-400/40 bg-red-100/40 px-3 py-1 text-xs font-bold text-red-800 backdrop-blur transition hover:bg-red-100/80 disabled:opacity-60">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === 'requests' && (
          <section className={`${GLASS} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-[#5f7266]">
                  <tr className="border-b border-[#182a1f]/[0.08]">
                    <th className="px-5 py-3 text-left font-semibold">Reference</th>
                    <th className="px-5 py-3 text-left font-semibold">Requester</th>
                    <th className="px-5 py-3 text-left font-semibold">Status</th>
                    <th className="px-5 py-3 text-left font-semibold">Created</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182a1f]/[0.06]">
                  {pagedRequests.map(r => {
                    const badge = getStatusBadge(r.status);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-white/45">
                        <td className="px-5 py-3"><Link href={`/laptop-procurement/requests/${r.id}`} className="font-bold text-[#28714a] hover:underline">{r.reference_number}</Link></td>
                        <td className="px-5 py-3 text-[#4c5f53]">{r.requested_by_name || r.requested_by_email}</td>
                        <td className="px-5 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${badge.className}`}>{badge.label}</span></td>
                        <td className="px-5 py-3 text-xs text-[#5f7266]">{fmtDate(r.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => removeRequest(r.id)} disabled={isPending} className="rounded-full border border-red-400/40 bg-red-100/40 px-3 py-1 text-xs font-bold text-red-800 backdrop-blur transition hover:bg-red-100/80 disabled:opacity-60">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#182a1f]/[0.06] px-5 py-3">
              <p className="text-xs text-[#5f7266]/80">
                Showing {requests.length === 0 ? 0 : currentRequestsPage * REQUESTS_PAGE_SIZE + 1}
                –{Math.min((currentRequestsPage + 1) * REQUESTS_PAGE_SIZE, requests.length)} of {requests.length} requests
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRequestsPage(p => Math.max(0, p - 1))}
                  disabled={currentRequestsPage === 0}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[#4c5f53] backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-[#4c5f53]">Page {currentRequestsPage + 1} of {requestsPageCount}</span>
                <button
                  onClick={() => setRequestsPage(p => Math.min(requestsPageCount - 1, p + 1))}
                  disabled={currentRequestsPage >= requestsPageCount - 1}
                  aria-label="Next page"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[#4c5f53] backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === 'activity' && (
          <section className={`${GLASS} divide-y divide-[#182a1f]/[0.06] overflow-hidden`}>
            {activity.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5f7266]">No activity recorded.</div>
            ) : activity.map(item => (
              <div key={item.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-[#182a1f]">{item.action}</p>
                <p className="mt-1 text-xs text-[#5f7266]">{item.reference_number} · {item.actor_name || item.actor_email || 'System'} · {fmtDate(item.created_at)}</p>
                {item.notes && <p className="mt-1 rounded-xl bg-white/50 p-2 text-xs text-[#4c5f53] backdrop-blur">{item.notes}</p>}
              </div>
            ))}
          </section>
        )}

        {tab === 'delegations' && (
          <DelegationsPanel delegations={delegations} approvers={approvers} onDone={setBanner} />
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <LaptopShell
      title="Admin Panel"
      subtitle="Permissions, records, and workflow activity"
      pendingCount={stats.pending_review}
      accessView={actor.permissions.accessView}
    >
      {content}
    </LaptopShell>
  );
}
