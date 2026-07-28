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

const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="mb-1 font-semibold text-slate-900">Admin data unavailable</p>
        <p className="text-sm text-slate-500">Admin access is required, or the database is unreachable.</p>
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
        <p className="mt-0.5 text-xs text-slate-500">Hand an approver&apos;s authority to a delegate on their behalf. The delegate inherits the approver&apos;s scope until the end date or until you revoke it.</p>
        {error && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Find the delegate in the directory</label>
            <EmployeeAutocomplete
              placeholder="Search directory by name or email…"
              onSelect={emp => { setDelegateEmail(emp.email); setDelegateName(emp.name); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Approver (delegator)</label>
            <select className={INP} value={delegatorEmail} onChange={e => setDelegatorEmail(e.target.value)} required>
              <option value="">Select an approver…</option>
              {approvers.map(a => (
                <option key={a.email} value={a.email}>{a.name ? `${a.name} (${a.email})` : a.email} — {a.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Delegate email</label>
            <input type="email" required className={INP} value={delegateEmail} onChange={e => setDelegateEmail(e.target.value)} placeholder="colleague@nesr.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Delegate name (optional)</label>
            <input className={INP} value={delegateName} onChange={e => setDelegateName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">End date (optional)</label>
            <input type="date" className={INP} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
          </div>
          <div className="flex items-end md:col-span-2">
            <button type="submit" disabled={isPending} className={`${CTA} disabled:opacity-60`}>
              {isPending ? 'Working…' : 'Create delegation'}
            </button>
          </div>
        </form>
        {approvers.length === 0 && (
          <p className="mt-3 text-xs text-slate-500/80">No approvers found. Assign approval access from the Permissions tab first.</p>
        )}
      </section>

      <section className={`${GLASS} divide-y divide-slate-100 overflow-hidden`}>
        <div className="p-5">
          <h3 className="text-[15px] font-bold">All delegations</h3>
          <p className="mt-0.5 text-xs text-slate-500">Every delegation across approvers. Revoke any active one to remove the delegate&apos;s access immediately.</p>
        </div>
        {delegations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No delegations have been set up.</div>
        ) : delegations.map(d => {
          const live = delegationIsLive(d);
          return (
            <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                    {live ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegator_email} → {d.delegate_email}</p>
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
        {banner && <div className="rounded-2xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">{banner}</div>}

        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                tab === t.id
                  ? 'bg-[#307c4c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'permissions' && (
          <>
            <section className={`${GLASS} relative z-20 p-5`}>
              <h2 className="mb-4 text-[15px] font-bold">Add / Update Permission</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
                  <EmployeeAutocomplete
                    value={email}
                    onChange={setEmail}
                    onSelect={emp => { setEmail(emp.email); setName(emp.name); }}
                    placeholder="user@nesr.com"
                    inputClassName={INP}
                  />
                </div>
                <div><label className="mb-1 block text-xs font-semibold text-slate-500">Name</label><input className={INP} value={name} onChange={e => setName(e.target.value)} /></div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
                  <select className={INP} value={role} onChange={e => setRole(e.target.value as LaptopPermissionRole)}>
                    {PERMISSION_ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Country (scope)</label>
                  <select className={INP} value={country} onChange={e => setCountry(e.target.value)}>
                    <option value="">All countries</option>
                    {COUNTRY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Segment (scope)</label>
                  <select className={INP} value={segment} onChange={e => setSegment(e.target.value)}>
                    <option value="">All segments</option>
                    {SEGMENT_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">{PERMISSION_PROFILES[role].description}</p>
              <button onClick={savePermission} disabled={isPending} className={`mt-4 ${CTA} disabled:opacity-60`}>
                {isPending ? 'Saving...' : 'Save Permission'}
              </button>
            </section>

            <section className={`${GLASS} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3 text-left font-semibold">Email</th>
                      <th className="px-5 py-3 text-left font-semibold">Name</th>
                      <th className="px-5 py-3 text-left font-semibold">Role</th>
                      <th className="px-5 py-3 text-left font-semibold">Scope</th>
                      <th className="px-5 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissions.map(p => (
                      <tr key={p.id} className="transition-colors hover:bg-white">
                        <td className="px-5 py-3 font-semibold text-slate-900">{p.email}</td>
                        <td className="px-5 py-3 text-slate-600">{p.name || '—'}</td>
                        <td className="px-5 py-3"><span className="inline-flex rounded-full border border-[#307c4c]/30 bg-[#307c4c]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#307c4c]">{p.role}</span></td>
                        <td className="px-5 py-3 text-xs text-slate-600">{[p.country, p.segment].filter(Boolean).join(' · ') || 'All'}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => removePermission(p.email)} disabled={isPending} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60">Remove</button>
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
                <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left font-semibold">Reference</th>
                    <th className="px-5 py-3 text-left font-semibold">Requester</th>
                    <th className="px-5 py-3 text-left font-semibold">Status</th>
                    <th className="px-5 py-3 text-left font-semibold">Created</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRequests.map(r => {
                    const badge = getStatusBadge(r.status);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-white">
                        <td className="px-5 py-3"><Link href={`/laptop-procurement/requests/${r.id}`} className="font-bold text-[#307c4c] hover:underline">{r.reference_number}</Link></td>
                        <td className="px-5 py-3 text-slate-600">{r.requested_by_name || r.requested_by_email}</td>
                        <td className="px-5 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span></td>
                        <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(r.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => removeRequest(r.id)} disabled={isPending} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500/80">
                Showing {requests.length === 0 ? 0 : currentRequestsPage * REQUESTS_PAGE_SIZE + 1}
                –{Math.min((currentRequestsPage + 1) * REQUESTS_PAGE_SIZE, requests.length)} of {requests.length} requests
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRequestsPage(p => Math.max(0, p - 1))}
                  disabled={currentRequestsPage === 0}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-slate-600">Page {currentRequestsPage + 1} of {requestsPageCount}</span>
                <button
                  onClick={() => setRequestsPage(p => Math.min(requestsPageCount - 1, p + 1))}
                  disabled={currentRequestsPage >= requestsPageCount - 1}
                  aria-label="Next page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === 'activity' && (
          <section className={`${GLASS} divide-y divide-slate-100 overflow-hidden`}>
            {activity.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No activity recorded.</div>
            ) : activity.map(item => (
              <div key={item.id} className="px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                <p className="mt-1 text-xs text-slate-500">{item.reference_number} · {item.actor_name || item.actor_email || 'System'} · {fmtDate(item.created_at)}</p>
                {item.notes && <p className="mt-1 rounded-xl bg-white p-2 text-xs text-slate-600">{item.notes}</p>}
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
