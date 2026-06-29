'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getSourceGuideAccessRequests, getSourceGuidePendingCount,
  approveSourceGuideAccessRequest, rejectSourceGuideAccessRequest,
  revokeSourceGuideAccess, deleteSourceGuideAccessRequest,
  getChampionsByCountry, addChampion, updateChampion, removeChampion,
  getGuides, getSourceGuideAnalytics,
} from '@/app/actions/sourceguide';
import type { SgAccessRequest, SgAnalytics, SgCountryChampions } from '@/app/actions/sourceguide';
import type { SgGuide } from '@/types/sourceguide';

const BRAND = '#2A7E4F';

/* ============================================================
   Access Approvals — grant users all-country (read-only) access
   ============================================================ */
export function SourceGuideAccessApprovalsClient({
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (n: number) => void;
}) {
  const [requests, setRequests] = useState<SgAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [reqs, cnt] = await Promise.all([getSourceGuideAccessRequests(), getSourceGuidePendingCount()]);
    setRequests(reqs); setLoading(false);
    onPendingCountChange?.(cnt);
  }, [onPendingCountChange]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { alert(res.error ?? 'Action failed'); return; }
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
      <p className="mb-6 text-[13px] text-slate-500">Grant general users access to view all country guides (read-only). Champions are managed separately under the Champions tab.</p>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No access requests yet.</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const ss = statusStyle[r.status] ?? statusStyle.Denied;
            return (
              <div key={r.user_email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-slate-900">{r.display_name || r.user_email}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ss.bg, color: ss.col }}>{r.status}</span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-slate-500">{r.user_email}{r.job_title ? ` · ${r.job_title}` : ''}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status !== 'Approved' && (
                    <button disabled={busy} onClick={() => run(() => approveSourceGuideAccessRequest(r.user_email))}
                      className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: BRAND }}>
                      Approve
                    </button>
                  )}
                  {r.status === 'Pending' && (
                    <button disabled={busy} onClick={() => run(() => rejectSourceGuideAccessRequest(r.user_email))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">Reject</button>
                  )}
                  {r.status === 'Approved' && (
                    <button disabled={busy} onClick={() => run(() => revokeSourceGuideAccess(r.user_email))}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50">Revoke</button>
                  )}
                  <button disabled={busy} onClick={() => { if (confirm('Delete this request?')) run(() => deleteSourceGuideAccessRequest(r.user_email)); }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-400 hover:bg-slate-50">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Champions — assign editors per country (name + email)
   ============================================================ */
export function SourceGuideChampionsClient() {
  const [data, setData] = useState<SgCountryChampions[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, { name: string; email: string }>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; email: string }>({ name: '', email: '' });

  const reload = useCallback(async () => {
    setLoading(true);
    setData(await getChampionsByCountry());
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  function setField(code: string, field: 'name' | 'email', value: string) {
    setDraft(d => {
      const cur = d[code] ?? { name: '', email: '' };
      return { ...d, [code]: { ...cur, [field]: value } };
    });
  }
  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true); const res = await fn(); setBusy(false);
    if (!res.success) { alert(res.error ?? 'Action failed'); return; }
    await reload();
  }
  async function add(code: string) {
    const d = draft[code]; if (!d?.name?.trim()) { alert('Enter a name.'); return; }
    await run(() => addChampion(code, d.name, d.email || null));
    setDraft(prev => ({ ...prev, [code]: { name: '', email: '' } }));
  }
  function startEdit(ch: { id: number; name: string; email: string | null }) {
    setEditingId(ch.id);
    setEditDraft({ name: ch.name, email: ch.email ?? '' });
  }
  async function saveEdit(id: number) {
    if (!editDraft.name.trim()) { alert('Enter a name.'); return; }
    await run(() => updateChampion(id, editDraft.name, editDraft.email || null));
    setEditingId(null);
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">Loading champions…</div>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">SourceGuide · Champions</h2>
      <p className="mb-6 text-[13px] text-slate-500">Assign champions per country. A champion gets access automatically on login (matched by email) and can edit mappings only for their country.</p>

      <div className="space-y-3">
        {data.map(c => (
          <div key={c.country} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3">
              <span className="h-[14px] w-[20px] rounded-sm" style={{ background: c.tone ?? '#999' }} />
              <span className="text-[14px] font-bold text-slate-900">{c.name}</span>
              <span className="ml-auto font-mono text-[11.5px] text-slate-400">{c.champions.length} champion{c.champions.length === 1 ? '' : 's'}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {c.champions.map(ch => (
                editingId === ch.id ? (
                  <div key={ch.id} className="flex flex-wrap items-center gap-2 bg-[#eaf4ef]/40 px-5 py-2.5">
                    <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="Name" className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-[#6AAF8E]" />
                    <input value={editDraft.email} onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))}
                      placeholder="email@nesr.com" className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-[#6AAF8E]" />
                    <button disabled={busy} onClick={() => saveEdit(ch.id)}
                      className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: BRAND }}>Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-white">Cancel</button>
                  </div>
                ) : (
                  <div key={ch.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-[13.5px] font-medium text-slate-800">{ch.name}</span>
                      <span className="ml-2 text-[12px] text-slate-500">{ch.email || <span className="italic text-amber-600">no email — add to grant access</span>}</span>
                    </div>
                    <button disabled={busy} onClick={() => startEdit(ch)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                    <button disabled={busy} onClick={() => { if (confirm(`Remove ${ch.name}?`)) run(() => removeChampion(ch.id)); }}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-red-600">Remove</button>
                  </div>
                )
              ))}
              {c.champions.length === 0 && <div className="px-5 py-2.5 text-[12.5px] text-slate-400">No champions yet.</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <input value={draft[c.country]?.name ?? ''} onChange={e => setField(c.country, 'name', e.target.value)}
                placeholder="Name" className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-[#6AAF8E]" />
              <input value={draft[c.country]?.email ?? ''} onChange={e => setField(c.country, 'email', e.target.value)}
                placeholder="email@nesr.com" className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-[#6AAF8E]" />
              <button disabled={busy} onClick={() => add(c.country)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: BRAND }}>Add champion</button>
            </div>
          </div>
        ))}
      </div>
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
              <div key={s.code} className="flex items-center gap-3">
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
