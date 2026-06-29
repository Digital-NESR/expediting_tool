'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getSourceGuideAccessRequests, getSourceGuidePendingCount, getCountries,
  approveSourceGuideAccessRequest, rejectSourceGuideAccessRequest,
  revokeSourceGuideAccess, editSourceGuideAccess, deleteSourceGuideAccessRequest,
  getGuides, getSourceGuideAnalytics,
} from '@/app/actions/sourceguide';
import type { SgAccessRequest, SgAnalytics } from '@/app/actions/sourceguide';
import type { SgCountry, SgGuide } from '@/types/sourceguide';

const BRAND = '#2A7E4F';
const VIEW_ONLY = 'All Countries - View Only';

/* ============================================================
   Access Approvals
   ============================================================ */
export function SourceGuideAccessApprovalsClient({
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (n: number) => void;
}) {
  const [requests, setRequests] = useState<SgAccessRequest[]>([]);
  const [countries, setCountries] = useState<SgCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => [{ code: VIEW_ONLY, name: VIEW_ONLY }, ...countries.map(c => ({ code: c.code, name: c.name }))],
    [countries],
  );
  const nameOf = useMemo(() => {
    const m = new Map(options.map(o => [o.code, o.name]));
    return (code: string) => m.get(code) ?? code;
  }, [options]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [reqs, cs, cnt] = await Promise.all([
      getSourceGuideAccessRequests(), getCountries(), getSourceGuidePendingCount(),
    ]);
    setRequests(reqs); setCountries(cs); setLoading(false);
    onPendingCountChange?.(cnt);
  }, [onPendingCountChange]);

  useEffect(() => { void reload(); }, [reload]);

  function startEdit(r: SgAccessRequest) {
    setEditing(r.user_email);
    setPicked(new Set(r.status === 'Approved' ? r.approved_countries : r.requested_countries));
  }
  function toggle(code: string) {
    setPicked(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { alert(res.error ?? 'Action failed'); return; }
    setEditing(null);
    await reload();
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading access requests…</div>;

  const statusStyle: Record<string, { bg: string; col: string }> = {
    Pending:  { bg: '#fef3c7', col: '#b45309' },
    Approved: { bg: '#dcfce7', col: '#15803d' },
    Denied:   { bg: '#fee2e2', col: '#b91c1c' },
    Rejected: { bg: '#fee2e2', col: '#b91c1c' },
    Revoked:  { bg: '#fee2e2', col: '#b91c1c' },
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">SourceGuide · Access Approvals</h2>
      <p className="mb-6 text-[13px] text-slate-500">Approve country-guide access. Approved countries become editable for that champion; choose “{VIEW_ONLY}” for read-only.</p>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No access requests yet.</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const ss = statusStyle[r.status] ?? statusStyle.Denied;
            const isEditing = editing === r.user_email;
            return (
              <div key={r.user_email} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-slate-900">{r.display_name || r.user_email}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ss.bg, color: ss.col }}>{r.status}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-slate-500">{r.user_email}{r.job_title ? ` · ${r.job_title}` : ''}</div>
                    <div className="mt-2 text-[12.5px] text-slate-600">
                      <span className="text-slate-400">Requested:</span> {r.requested_countries.map(nameOf).join(', ')}
                    </div>
                    {r.status === 'Approved' && (
                      <div className="mt-1 text-[12.5px] text-slate-600">
                        <span className="text-slate-400">Approved:</span> {r.approved_countries.map(nameOf).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isEditing && (r.status === 'Pending' || r.status === 'Approved') && (
                      <button onClick={() => startEdit(r)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: BRAND }}>
                        {r.status === 'Pending' ? 'Review' : 'Edit countries'}
                      </button>
                    )}
                    {!isEditing && r.status === 'Pending' && (
                      <button disabled={busy} onClick={() => run(() => rejectSourceGuideAccessRequest(r.user_email))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">Reject</button>
                    )}
                    {!isEditing && r.status === 'Approved' && (
                      <button disabled={busy} onClick={() => run(() => revokeSourceGuideAccess(r.user_email))} className="rounded-lg border border-red-200 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50">Revoke</button>
                    )}
                    {!isEditing && (
                      <button disabled={busy} onClick={() => { if (confirm('Delete this request?')) run(() => deleteSourceGuideAccessRequest(r.user_email)); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-400 hover:bg-slate-50">Delete</button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {options.map(o => (
                        <label key={o.code} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] hover:bg-white">
                          <input type="checkbox" checked={picked.has(o.code)} onChange={() => toggle(o.code)} style={{ accentColor: BRAND }} />
                          <span className="truncate">{o.name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busy || picked.size === 0}
                        onClick={() => run(() => r.status === 'Approved'
                          ? editSourceGuideAccess(r.user_email, [...picked])
                          : approveSourceGuideAccessRequest(r.user_email, [...picked]))}
                        className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: BRAND }}
                      >
                        {r.status === 'Approved' ? 'Save' : 'Approve'}
                      </button>
                      <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-white">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Source Guides dashboard
   ============================================================ */
export function SourceGuideGuidesClient() {
  const [guides, setGuides] = useState<SgGuide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getGuides().then(g => { setGuides(g); setLoading(false); }); }, []);

  const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const stale = guides.filter(g => daysAgo(g.updatedAt) > 90).length;

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading source guides…</div>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">SourceGuide · Country Guides</h2>
      <p className="mb-6 text-[13px] text-slate-500">Status and coverage of every published country source guide.</p>

      {stale > 0 && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: '#f6c453', background: '#f6efdf', color: '#7a5616' }}>
          <b>{stale} guide{stale === 1 ? '' : 's'} exceed the 90-day staleness threshold.</b> Owners should review and re-publish.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.4fr_0.8fr_1fr_1.1fr_0.8fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div>Country guide</div><div>Status</div><div>Last updated</div><div>Owner</div><div>Coverage</div>
        </div>
        {guides.map(g => {
          const d = daysAgo(g.updatedAt);
          const isStale = d > 90;
          const ss = g.status === 'Published'
            ? { bg: '#dcfce7', col: '#15803d' }
            : g.status === 'Draft' ? { bg: '#f6efdf', col: '#b07d24' } : { bg: '#ececed', col: '#58595b' };
          return (
            <div key={g.country} className="grid grid-cols-[1.4fr_0.8fr_1fr_1.1fr_0.8fr] items-center gap-4 border-b border-slate-50 px-5 py-3.5 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="h-[17px] w-[24px] shrink-0 rounded-sm" style={{ background: g.tone ?? '#999' }} />
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">{g.name}</div>
                  <div className="font-mono text-[11.5px] text-slate-400">{g.version} · {g.mappings.toLocaleString()} mappings</div>
                </div>
              </div>
              <div><span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: ss.bg, color: ss.col }}>{g.status}</span></div>
              <div className="text-[13px]" style={{ color: isStale ? '#b07d24' : '#58595b' }}>{d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}</div>
              <div className="text-[12.5px] text-slate-500">{g.champion || 'Unassigned'}</div>
              <div className="text-[12.5px] text-slate-600">{g.commodities} commodities</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Analytics
   ============================================================ */
export function SourceGuideAnalyticsClient() {
  const [data, setData] = useState<SgAnalytics | null>(null);

  useEffect(() => { getSourceGuideAnalytics().then(setData); }, []);

  if (!data) return <div className="py-16 text-center text-sm text-slate-400">Loading analytics…</div>;

  const maxMappings = Math.max(1, ...data.perCountry.map(c => c.mappings));
  const maxSup = Math.max(1, ...data.topSuppliers.map(s => s.mappings));

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">SourceGuide · Analytics</h2>
      <p className="mb-6 text-[13px] text-slate-500">Coverage across the sourcing catalogue.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ['Commodities', data.stats.commodities], ['Suppliers', data.stats.suppliers],
          ['Mappings', data.stats.mappings], ['Countries', data.stats.countries], ['Categories', data.stats.categories],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[22px] font-bold tracking-tight text-slate-900">{(val as number).toLocaleString()}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-[14px] font-bold text-slate-900">Mappings by country</h3>
          <div className="space-y-2.5">
            {data.perCountry.map(c => (
              <div key={c.country} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-[12.5px] text-slate-600">{c.name}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.mappings / maxMappings) * 100}%`, background: c.tone ?? BRAND }} />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-[11.5px] text-slate-500">{c.mappings.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-[14px] font-bold text-slate-900">Top suppliers by mappings</h3>
          <div className="space-y-2.5">
            {data.topSuppliers.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[12.5px] text-slate-600" title={s.name}>{s.name}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(s.mappings / maxSup) * 100}%`, background: BRAND }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-slate-500">{s.mappings}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h3 className="mb-4 text-[14px] font-bold text-slate-900">Spend type breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {data.spendTypeBreakdown.map(s => (
              <div key={s.spendType} className="rounded-lg border border-slate-200 px-4 py-2.5">
                <div className="text-[18px] font-bold text-slate-900">{s.count.toLocaleString()}</div>
                <div className="text-[12px] text-slate-500">{s.spendType}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
