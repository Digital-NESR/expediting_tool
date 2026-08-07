'use client';

import Link from 'next/link';
import { useState } from 'react';
import LaptopShell, { CTA, GLASS } from '../components/LaptopShell';
import EmployeeAutocomplete from '@/app/procure-guard/components/EmployeeAutocomplete';
import {
  addLaptopDevice,
  adminGrantLaptopDelegation,
  deleteLaptopDevice,
  deleteLaptopPermission,
  deleteLaptopRecord,
  getLaptopAdminData,
  revokeLaptopDelegation,
  updateLaptopDevice,
  updateLaptopPermission,
} from '@/app/actions/laptopProcurement';
import {
  COUNTRY_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  PERMISSION_PROFILES,
  PERMISSION_ROLE_OPTIONS,
  SEGMENT_OPTIONS,
  fmtDate,
  getPermissionProfile,
  getStatusBadge,
} from '@/lib/laptopProcurement-utils';
import type { LaptopAdminData, LaptopDelegationRow, LaptopDeviceCatalogRow, LaptopPermissionRole } from '@/types/laptopProcurement';

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

// Deliberately not React's useTransition: transition updates are scheduled at low
// priority, and if the tab is backgrounded even briefly (a very normal thing for an
// admin to do while waiting — switching windows, checking another tab), Chrome's
// timer throttling for hidden pages can delay that scheduled update by many seconds,
// even though the underlying fetch already finished. A plain boolean applied via a
// normal-priority setState isn't subject to that starvation.
function usePendingAction(): [boolean, (fn: () => Promise<void>) => void] {
  const [isPending, setIsPending] = useState(false);
  function run(fn: () => Promise<void>) {
    setIsPending(true);
    fn().finally(() => setIsPending(false));
  }
  return [isPending, run];
}

function delegationIsLive(d: LaptopDelegationRow): boolean {
  return d.is_active
    && (!d.starts_at || new Date(d.starts_at).getTime() <= Date.now())
    && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

function delegationIsScheduled(d: LaptopDelegationRow): boolean {
  return d.is_active && Boolean(d.starts_at) && new Date(d.starts_at!).getTime() > Date.now();
}

function DelegationsPanel({
  delegations,
  approvers,
  onDone,
  onMutated,
}: {
  delegations: LaptopDelegationRow[];
  approvers: Array<{ email: string; name: string | null; role: LaptopPermissionRole }>;
  onDone: (message: string) => void;
  onMutated: () => Promise<unknown>;
}) {
  const [isPending, startTransition] = usePendingAction();
  const [delegatorEmail, setDelegatorEmail] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState('');
  const [delegationsPage, setDelegationsPage] = useState(0);

  const delegationsPageCount = Math.max(1, Math.ceil(delegations.length / REQUESTS_PAGE_SIZE));
  const currentDelegationsPage = Math.min(delegationsPage, delegationsPageCount - 1);
  const pagedDelegations = delegations.slice(currentDelegationsPage * REQUESTS_PAGE_SIZE, (currentDelegationsPage + 1) * REQUESTS_PAGE_SIZE);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await adminGrantLaptopDelegation({ delegatorEmail, delegateEmail, delegateName, startsAt: startsAt || null, endsAt: endsAt || null });
      if (result.success) {
        onDone(`Delegated ${delegatorEmail}'s approvals to ${delegateEmail}.`);
        setDelegatorEmail(''); setDelegateEmail(''); setDelegateName(''); setStartsAt(''); setEndsAt('');
        await onMutated();
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
        await onMutated();
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
            <label className="mb-1 block text-xs font-semibold text-slate-500">Start date (optional)</label>
            <input type="date" className={INP} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500/80">Leave blank to start immediately.</p>
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
        ) : pagedDelegations.map(d => {
          const live = delegationIsLive(d);
          const scheduled = delegationIsScheduled(d);
          return (
            <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : scheduled ? 'bg-amber-500/10 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {live ? 'Active' : scheduled ? 'Scheduled' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegator_email} → {d.delegate_email}</p>
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
        {delegations.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-xs text-slate-500/80">
              Showing {currentDelegationsPage * REQUESTS_PAGE_SIZE + 1}
              –{Math.min((currentDelegationsPage + 1) * REQUESTS_PAGE_SIZE, delegations.length)} of {delegations.length} delegations
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDelegationsPage(p => Math.max(0, p - 1))}
                disabled={currentDelegationsPage === 0}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              <span className="text-xs font-semibold text-slate-600">Page {currentDelegationsPage + 1} of {delegationsPageCount}</span>
              <button
                onClick={() => setDelegationsPage(p => Math.min(delegationsPageCount - 1, p + 1))}
                disabled={currentDelegationsPage >= delegationsPageCount - 1}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DevicesPanel({
  devices,
  onDone,
  onMutated,
}: {
  devices: LaptopDeviceCatalogRow[];
  onDone: (message: string) => void;
  onMutated: () => Promise<unknown>;
}) {
  const [isPending, startTransition] = usePendingAction();
  const [typeOfDevice, setTypeOfDevice] = useState(DEVICE_TYPE_OPTIONS[0]);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [devicesPage, setDevicesPage] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState('');
  const [editModel, setEditModel] = useState('');

  const devicesPageCount = Math.max(1, Math.ceil(devices.length / REQUESTS_PAGE_SIZE));
  const currentDevicesPage = Math.min(devicesPage, devicesPageCount - 1);
  const pagedDevices = devices.slice(currentDevicesPage * REQUESTS_PAGE_SIZE, (currentDevicesPage + 1) * REQUESTS_PAGE_SIZE);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!model.trim()) { setError('Model is required.'); return; }
    startTransition(async () => {
      const result = await addLaptopDevice({ type_of_device: typeOfDevice, model: model.trim() });
      if (result.success) {
        onDone(`Added ${typeOfDevice} model "${model.trim()}" to the catalog.`);
        setModel('');
        await onMutated();
      } else {
        setError(result.error ?? 'Failed to add device.');
      }
    });
  }

  function startEdit(d: LaptopDeviceCatalogRow) {
    setError('');
    setEditingId(d.id);
    setEditType(d.type_of_device);
    setEditModel(d.model);
  }

  function saveEdit(id: number) {
    setError('');
    if (!editModel.trim()) { setError('Model is required.'); return; }
    startTransition(async () => {
      const result = await updateLaptopDevice(id, { type_of_device: editType, model: editModel.trim() });
      if (result.success) {
        setEditingId(null);
        onDone('Device updated.');
        await onMutated();
      } else {
        setError(result.error ?? 'Failed to update device.');
      }
    });
  }

  function toggleActive(d: LaptopDeviceCatalogRow) {
    setError('');
    startTransition(async () => {
      const result = await updateLaptopDevice(d.id, { active: !d.active });
      if (result.success) {
        onDone(`${d.model} ${d.active ? 'deactivated' : 'reactivated'}.`);
        await onMutated();
      } else {
        setError(result.error ?? 'Failed to update device.');
      }
    });
  }

  function remove(d: LaptopDeviceCatalogRow) {
    setError('');
    startTransition(async () => {
      const result = await deleteLaptopDevice(d.id);
      if (result.success) {
        onDone(`Removed ${d.model} from the catalog.`);
        await onMutated();
      } else {
        setError(result.error ?? 'Failed to delete device.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className={`${GLASS} p-5`}>
        <h3 className="text-[15px] font-bold">Add a device</h3>
        <p className="mt-0.5 text-xs text-slate-500">Approved laptop / desktop models shown on the &quot;Requested Device&quot; step of the request form.</p>
        {error && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Type of Device</label>
            <select className={INP} value={typeOfDevice} onChange={e => setTypeOfDevice(e.target.value)}>
              {DEVICE_TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Model</label>
            <input className={INP} value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Dell Latitude 5000 series - Core i5" />
          </div>
          <div className="flex items-end md:col-span-3">
            <button type="submit" disabled={isPending} className={`${CTA} disabled:opacity-60`}>
              {isPending ? 'Adding…' : 'Add device'}
            </button>
          </div>
        </form>
      </section>

      <section className={`${GLASS} divide-y divide-slate-100 overflow-hidden`}>
        <div className="p-5">
          <h3 className="text-[15px] font-bold">Approved devices</h3>
          <p className="mt-0.5 text-xs text-slate-500">Deactivate or delete a model to remove it from the request form immediately.</p>
        </div>
        {devices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No devices in the catalog yet.</div>
        ) : pagedDevices.map(d => (
          <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
            {editingId === d.id ? (
              <div className="flex flex-1 flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type of Device</label>
                  <select className={INP} value={editType} onChange={e => setEditType(e.target.value)}>
                    {DEVICE_TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="min-w-[14rem] flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model</label>
                  <input className={INP} value={editModel} onChange={e => setEditModel(e.target.value)} />
                </div>
                <button type="button" disabled={isPending} onClick={() => saveEdit(d.id)} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
                  {isPending ? 'Saving...' : 'Save'}
                </button>
                <button type="button" disabled={isPending} onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{d.model}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${d.active ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                      {d.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{d.type_of_device}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => toggleActive(d)} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">
                    {d.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button type="button" onClick={() => startEdit(d)} disabled={isPending} className="rounded-lg border border-[#307c4c]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#307c4c] transition hover:bg-white disabled:opacity-60">Edit</button>
                  <button type="button" onClick={() => remove(d)} disabled={isPending} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60">Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
        {devices.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-xs text-slate-500/80">
              Showing {currentDevicesPage * REQUESTS_PAGE_SIZE + 1}
              –{Math.min((currentDevicesPage + 1) * REQUESTS_PAGE_SIZE, devices.length)} of {devices.length} devices
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDevicesPage(p => Math.max(0, p - 1))}
                disabled={currentDevicesPage === 0}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              <span className="text-xs font-semibold text-slate-600">Page {currentDevicesPage + 1} of {devicesPageCount}</span>
              <button
                onClick={() => setDevicesPage(p => Math.min(devicesPageCount - 1, p + 1))}
                disabled={currentDevicesPage >= devicesPageCount - 1}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function LaptopAdminClient({ data: initialData, embedded = false }: { data: LaptopAdminData | null; embedded?: boolean }) {
  const [tab, setTab] = useState<'permissions' | 'requests' | 'activity' | 'delegations' | 'devices'>('permissions');
  const [isPending, startTransition] = usePendingAction();
  const [banner, setBanner] = useState('');
  // Owned entirely by this component after mount — every mutation below refetches
  // explicitly and calls setData itself, rather than relying on router.refresh().
  // deleteLaptopRecord (and friends) call revalidatePath server-side, which makes
  // Next.js silently re-render this route's Server Component in the background
  // (with requestsPage reset to 0); syncing local state to that incoming prop would
  // race with — and clobber — the page we just explicitly fetched.
  const [data, setData] = useState(initialData);
  const [requestsPage, setRequestsPage] = useState(0);
  const [permissionsPage, setPermissionsPage] = useState(0);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<LaptopPermissionRole>('Requester');
  const [country, setCountry] = useState('');
  const [segment, setSegment] = useState('');

  if (!data) return <DbError />;
  const { actor, requests, activity, permissions, delegations, deviceCatalog, stats } = data;
  const approvers = permissions.filter(p => getPermissionProfile(p.role).canViewAll);

  // Requests are paginated server-side (see getLaptopAdminData) — `requests` here is
  // already just the current page, so no client-side slicing is needed.
  const requestsPageCount = Math.max(1, Math.ceil(data.requestsTotal / REQUESTS_PAGE_SIZE));
  const currentRequestsPage = Math.min(requestsPage, requestsPageCount - 1);

  const permissionsPageCount = Math.max(1, Math.ceil(permissions.length / REQUESTS_PAGE_SIZE));
  const currentPermissionsPage = Math.min(permissionsPage, permissionsPageCount - 1);
  const pagedPermissions = permissions.slice(currentPermissionsPage * REQUESTS_PAGE_SIZE, (currentPermissionsPage + 1) * REQUESTS_PAGE_SIZE);

  async function refreshAdminData(page: number = currentRequestsPage) {
    const fresh = await getLaptopAdminData(page);
    if (fresh) setData(fresh);
    else setBanner('Failed to refresh data.');
    return fresh;
  }

  function goToRequestsPage(page: number) {
    const clamped = Math.max(0, page);
    startTransition(async () => {
      const fresh = await refreshAdminData(clamped);
      if (fresh) setRequestsPage(clamped);
    });
  }

  function savePermission() {
    setBanner('');
    if (!email.trim()) { setBanner('Email is required.'); return; }
    startTransition(async () => {
      const result = await updateLaptopPermission({ email, name, role, country, segment });
      if (result.success) {
        setBanner(`Saved permission for ${email}.`);
        setEmail(''); setName(''); setRole('Requester'); setCountry(''); setSegment('');
        await refreshAdminData();
      } else {
        setBanner(result.error ?? 'Failed to save permission.');
      }
    });
  }

  function removePermission(targetEmail: string) {
    startTransition(async () => {
      const result = await deleteLaptopPermission(targetEmail);
      if (result.success) await refreshAdminData();
      else setBanner(result.error ?? 'Failed to delete permission.');
    });
  }

  function removeRequest(id: number) {
    startTransition(async () => {
      const result = await deleteLaptopRecord('request', id);
      if (!result.success) { setBanner(result.error ?? 'Failed to delete request.'); return; }
      let page = currentRequestsPage;
      let fresh = await refreshAdminData(page);
      // Deleted the last item on the last page — step back one so the view isn't blank.
      if (fresh && page > 0 && page * REQUESTS_PAGE_SIZE >= fresh.requestsTotal) {
        page -= 1;
        fresh = await refreshAdminData(page);
      }
      if (fresh) setRequestsPage(page);
      else setBanner('Request deleted, but the list failed to refresh.');
    });
  }

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'permissions', label: `Permissions (${permissions.length})` },
    { id: 'requests', label: `Requests (${data.requestsTotal})` },
    { id: 'activity', label: `Activity (${activity.length})` },
    { id: 'delegations', label: `Delegations (${delegations.length})` },
    { id: 'devices', label: `Devices (${deviceCatalog.length})` },
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
                    {pagedPermissions.map(p => (
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
              {permissions.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <p className="text-xs text-slate-500/80">
                    Showing {currentPermissionsPage * REQUESTS_PAGE_SIZE + 1}
                    –{Math.min((currentPermissionsPage + 1) * REQUESTS_PAGE_SIZE, permissions.length)} of {permissions.length} permissions
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPermissionsPage(p => Math.max(0, p - 1))}
                      disabled={currentPermissionsPage === 0}
                      aria-label="Previous page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ‹
                    </button>
                    <span className="text-xs font-semibold text-slate-600">Page {currentPermissionsPage + 1} of {permissionsPageCount}</span>
                    <button
                      onClick={() => setPermissionsPage(p => Math.min(permissionsPageCount - 1, p + 1))}
                      disabled={currentPermissionsPage >= permissionsPageCount - 1}
                      aria-label="Next page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
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
                  {requests.map(r => {
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
                Showing {data.requestsTotal === 0 ? 0 : currentRequestsPage * REQUESTS_PAGE_SIZE + 1}
                –{Math.min((currentRequestsPage + 1) * REQUESTS_PAGE_SIZE, data.requestsTotal)} of {data.requestsTotal} requests
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToRequestsPage(currentRequestsPage - 1)}
                  disabled={currentRequestsPage === 0 || isPending}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-slate-600">Page {currentRequestsPage + 1} of {requestsPageCount}</span>
                <button
                  onClick={() => goToRequestsPage(currentRequestsPage + 1)}
                  disabled={currentRequestsPage >= requestsPageCount - 1 || isPending}
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
          <DelegationsPanel delegations={delegations} approvers={approvers} onDone={setBanner} onMutated={refreshAdminData} />
        )}

        {tab === 'devices' && (
          <DevicesPanel devices={deviceCatalog} onDone={setBanner} onMutated={refreshAdminData} />
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <LaptopShell
      title="Admin Panel"
      subtitle="Permissions, records, and workflow activity"
      pendingCount={stats.pending_review}
      accessView={actor.effectiveAccessView}
    >
      {content}
    </LaptopShell>
  );
}
