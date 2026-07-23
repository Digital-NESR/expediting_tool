'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  approveCatalogAccessRequest,
  deleteCatalogAccessRequest,
  getCatalogAccessRequests,
  getCatalogAdminSummary,
  getPirSyncHealth,
  rejectCatalogAccessRequest,
  revokeCatalogAccessRequest,
} from '@/app/actions/catalog-manager';
import type { CatalogAccessRequestRow, CatalogAdminSummary, CatalogRole, PirSyncHealth } from '@/types/catalog-manager';
import { ALL_ROLES, SEED_COUNTRIES } from '@/lib/catalog-manager-utils';

const BRAND = '#307c4c';

function formatDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ============================================================================
   1) ACCESS APPROVALS — self-service role-upgrade requests
============================================================================ */

function StatusBadge({ status }: { status: CatalogAccessRequestRow['status'] }) {
  const cls = status === 'Approved'
    ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
    : status === 'Pending'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${cls}`}>{status}</span>;
}

function RoleSelector({
  row, loading, onCancel, onConfirm,
}: {
  row: CatalogAccessRequestRow;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (role: CatalogRole, countryCode: string) => void;
}) {
  const [role, setRole] = useState<CatalogRole>(row.approved_role ?? row.requested_role);
  const [country, setCountry] = useState(row.country_code ?? '');

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold text-slate-600">Approve role and home country</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as CatalogRole)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#307c4c]">
            {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Home country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]">
            <option value="">Not set</option>
            {SEED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
      </div>
      {role === 'Approver' && (
        <p className="mt-2 text-[11px] text-amber-700">Approver alone doesn&apos;t scope them to a country — also assign them in Catalog Repo → Admin → Country approvers.</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={loading} onClick={() => onConfirm(role, country)} className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60" style={{ background: BRAND }}>
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        <button type="button" disabled={loading} onClick={onCancel} className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}

export function CatalogAccessApprovalsClient({
  userEmail,
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const [requests, setRequests] = useState<CatalogAccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getCatalogAccessRequests();
      setRequests(data);
      setLastRefreshed(new Date());
      onPendingCountChange?.(data.filter((row) => row.status === 'Pending').length);
    } finally {
      setIsRefreshing(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    getCatalogAccessRequests()
      .then((data) => {
        setRequests(data);
        setLastRefreshed(new Date());
        onPendingCountChange?.(data.filter((row) => row.status === 'Pending').length);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = useMemo(() => requests.filter((row) => row.status === 'Pending'), [requests]);

  function handleApprove(row: CatalogAccessRequestRow, role: CatalogRole, countryCode: string) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await approveCatalogAccessRequest({ userEmail: row.user_email, approvedRole: role, reviewedBy: userEmail, countryCode: countryCode || null });
      if (!result.success) { setActionError(result.error ?? 'Failed to approve access.'); setProcessingEmail(null); return; }
      await refreshData();
      setExpandedEmail(null);
      setProcessingEmail(null);
    });
  }
  function handleReject(email: string) {
    setProcessingEmail(email);
    startTransition(async () => { await rejectCatalogAccessRequest(email, userEmail); await refreshData(); setProcessingEmail(null); });
  }
  function handleRevoke(email: string) {
    setProcessingEmail(email);
    startTransition(async () => { await revokeCatalogAccessRequest(email, userEmail); await refreshData(); setProcessingEmail(null); });
  }
  function handleDelete(email: string) {
    setProcessingEmail(email);
    startTransition(async () => { await deleteCatalogAccessRequest(email); await refreshData(); setProcessingEmail(null); });
  }

  function renderRows(rows: CatalogAccessRequestRow[], empty: string) {
    if (rows.length === 0) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{empty}</div>;
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Country</th>
                <th className="px-4 py-3 text-left font-semibold">Requested</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const busy = isPending && processingEmail === row.user_email;
                const expanded = expandedEmail === row.user_email;
                return (
                  <tr key={row.user_email} className="align-top hover:bg-[#307c4c]/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.display_name || row.user_email}</p>
                      <p className="text-xs text-slate-500">{row.user_email}</p>
                      {row.job_title && <p className="mt-1 text-xs text-slate-400">{row.job_title}</p>}
                      {row.reason && <p className="mt-1 max-w-xs truncate text-xs italic text-slate-400" title={row.reason}>&ldquo;{row.reason}&rdquo;</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{row.approved_role ?? row.requested_role}</p>
                      {row.status === 'Pending' && <p className="text-xs text-slate-500">requested</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.country_code || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <p>{formatDate(row.requested_at)}</p>
                      {row.reviewed_at && <p className="mt-1 text-xs">Reviewed {formatDate(row.reviewed_at)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.status === 'Pending' && (
                          <>
                            <button type="button" disabled={busy} onClick={() => setExpandedEmail(expanded ? null : row.user_email)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" style={{ background: BRAND }}>Approve</button>
                            <button type="button" disabled={busy} onClick={() => handleReject(row.user_email)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">Reject</button>
                          </>
                        )}
                        {row.status === 'Approved' && (
                          <button type="button" disabled={busy} onClick={() => handleRevoke(row.user_email)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">Revoke</button>
                        )}
                        {row.status !== 'Approved' && (
                          <button type="button" disabled={busy} onClick={() => handleDelete(row.user_email)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 disabled:opacity-60">Delete</button>
                        )}
                      </div>
                      {expanded && (
                        <RoleSelector row={row} loading={busy} onCancel={() => setExpandedEmail(null)} onConfirm={(role, countryCode) => handleApprove(row, role, countryCode)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
        <span className="text-sm font-medium">Loading Catalog Repo access…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Catalog Repo Access Approvals</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            New users default to read-only Viewer automatically — this queue is only for requested upgrades.
            {lastRefreshed && ` Last updated: ${lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <button type="button" disabled={isRefreshing} onClick={refreshData} className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {actionError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{actionError}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Pending Requests</h3>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">{pending.length}</span>
        </div>
        {renderRows(pending, 'No pending Catalog Repo access requests.')}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">All Requests</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{requests.length}</span>
        </div>
        {renderRows(requests, 'No Catalog Repo access requests yet.')}
      </section>
    </div>
  );
}

/* ============================================================================
   Shared read-only summary UI (KPI tiles + panels)
============================================================================ */

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const col = tone === 'warn' ? '#b45309' : tone === 'bad' ? '#b91c1c' : tone === 'good' ? BRAND : '#0f172a';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[22px] font-bold tracking-tight" style={{ color: col }}>{value}</div>
      <div className="mt-0.5 text-[12px] text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mb-4 mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

/* ============================================================================
   2) ADMIN PANEL — read-only master-data snapshot
============================================================================ */

export function CatalogAdminPanelClient() {
  const [data, setData] = useState<CatalogAdminSummary | null>(null);

  useEffect(() => { getCatalogAdminSummary().then(setData); }, []);

  if (!data) return <div className="py-16 text-center text-sm text-slate-400">Loading Catalog Repo master data…</div>;

  const roleRows: { role: CatalogRole; label: string }[] = [
    { role: 'Admin', label: 'Admin' },
    { role: 'Approver', label: 'Approver' },
    { role: 'Contributor', label: 'Contributor' },
    { role: 'Viewer', label: 'Viewer' },
  ];
  const maxRole = Math.max(1, ...roleRows.map((r) => data.usersByRole[r.role]));

  return (
    <div>
      <div className="mb-5">
        <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">Catalog Repo · Admin Panel</h2>
        <p className="text-[13px] text-slate-500">Read-only master-data snapshot. Edit values inside Catalog Repo → Administration.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active countries" value={`${data.countriesActive} / ${data.countriesTotal}`} />
        <Kpi label="Currencies" value={String(data.currencies)} />
        <Kpi label="Suppliers" value={data.suppliers.toLocaleString()} />
        <Kpi label="Active categories" value={String(data.categoriesActive)} />
        <Kpi label="Units of measure" value={String(data.uoms)} />
        <Kpi label="Threshold rules" value={String(data.thresholdRules)} />
        <Kpi label="Country approvers" value={String(data.countryApprovers)} />
        <Kpi label="Catalog users" value={String(data.usersTotal)} />
      </div>

      <Panel title="Users by role" subtitle="Who currently has what level of access.">
        <div className="space-y-2.5">
          {roleRows.map(({ role, label }) => {
            const n = data.usersByRole[role];
            return (
              <div key={role} className="grid grid-cols-[100px_1fr_30px] items-center gap-3">
                <span className="truncate text-[12.5px] font-medium text-slate-600">{label}</span>
                <span className="block h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${(n / maxRole) * 100}%`, background: `linear-gradient(90deg, ${BRAND}88, ${BRAND})` }} />
                </span>
                <span className="text-right text-[12.5px] font-semibold tabular-nums text-slate-900">{n}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================================
   3) PIR SYNC HEALTH — nightly n8n pipeline observability
============================================================================ */

export function CatalogSyncHealthClient() {
  const [data, setData] = useState<PirSyncHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getPirSyncHealth().then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  if (loading || !data) return <div className="py-16 text-center text-sm text-slate-400">Checking PIR sync health…</div>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">PIR / Inventory · Sync Health</h2>
          <p className="text-[13px] text-slate-500">Status of the nightly n8n load from Power BI into pir_catalog.</p>
        </div>
        <button type="button" onClick={refresh} className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Refresh</button>
      </div>

      {data.isStale && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          <div>
            <p className="text-[13px] font-bold text-amber-800">
              {data.lastSyncedAt ? `No sync in ${data.hoursSinceSync?.toFixed(1)} hours` : 'No successful sync recorded yet'}
            </p>
            <p className="mt-0.5 text-[12px] text-amber-700">The nightly n8n workflow may have failed its validation guard (e.g. Power BI mid-refresh) or isn&apos;t running. Check the n8n execution log.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="PIR records" value={data.total.toLocaleString()} />
        <Kpi label="Last synced" value={data.hoursSinceSync != null ? `${data.hoursSinceSync.toFixed(1)}h ago` : 'Never'} tone={data.isStale ? 'warn' : 'good'} sub={data.lastSyncedAt ? formatDate(data.lastSyncedAt) : undefined} />
        <Kpi label="Description coverage" value={`${data.descriptionCoveragePct}%`} sub={`${data.withDescription.toLocaleString()} of ${data.total.toLocaleString()}`} tone={data.descriptionCoveragePct < 20 ? 'bad' : data.descriptionCoveragePct < 50 ? 'warn' : 'good'} />
        <Kpi label="Status" value={data.isStale ? 'Stale' : 'Healthy'} tone={data.isStale ? 'warn' : 'good'} />
      </div>
      <p className="mt-4 text-[11.5px] text-slate-400">
        Some PIR materials genuinely have no description (never referenced on a purchase order in SUPPLYCHAIN, the only description source) — coverage below 100% is expected.
        A sudden drop, or &quot;stale&quot; above, usually means the SUPPLYCHAIN dataset was mid-refresh when the sync ran.
      </p>
    </div>
  );
}
