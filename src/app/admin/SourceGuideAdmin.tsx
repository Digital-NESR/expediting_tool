'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getSourceGuideAccessRequests, getSourceGuidePendingCount,
  approveSourceGuideAccessRequest, rejectSourceGuideAccessRequest,
  revokeSourceGuideAccess, deleteSourceGuideAccessRequest,
  getChampionsByCountry, addChampion, updateChampion, removeChampion,
  getGuides, getSourceGuideAnalytics, getCoverageGapsSummary,
  getSourceGuideInsights, getSourceGuideAuditLog, getUserActivity,
} from '@/app/actions/sourceguide';
import type {
  SgAccessRequest, SgAnalytics, SgCountryChampions, SgCoverageGap,
  SgInsights, SgAuditEntry, SgUserActivity,
} from '@/app/actions/sourceguide';
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
                      <span className="ml-2 text-[12px] text-slate-500">{ch.email || <span className="italic text-amber-600">no email, add one to grant access</span>}</span>
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
   Analytics: tabbed Overview / Coverage / Suppliers / Audit
   ============================================================ */
type SgAnalyticsTab = 'overview' | 'coverage' | 'suppliers' | 'people' | 'audit';

export function SourceGuideAnalyticsClient() {
  const [data, setData] = useState<SgAnalytics | null>(null);
  const [gaps, setGaps] = useState<SgCoverageGap[]>([]);
  const [insights, setInsights] = useState<SgInsights | null>(null);
  const [audit, setAudit] = useState<SgAuditEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [people, setPeople] = useState<SgUserActivity[] | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [tab, setTab] = useState<SgAnalyticsTab>('overview');

  useEffect(() => {
    getSourceGuideAnalytics().then(setData);
    getCoverageGapsSummary().then(setGaps);
    getSourceGuideInsights().then(setInsights);
  }, []);

  useEffect(() => {
    if (tab === 'audit' && audit === null && !auditLoading) {
      setAuditLoading(true);
      getSourceGuideAuditLog().then(a => { setAudit(a); setAuditLoading(false); });
    }
    if (tab === 'people' && people === null && !peopleLoading) {
      setPeopleLoading(true);
      getUserActivity().then(p => { setPeople(p); setPeopleLoading(false); });
    }
  }, [tab, audit, auditLoading, people, peopleLoading]);

  if (!data || !insights) return <div className="py-16 text-center text-sm text-slate-400">Loading analytics…</div>;

  const TABS: { key: SgAnalyticsTab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'coverage',  label: 'Coverage' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'people',    label: 'People' },
    { key: 'audit',     label: 'Audit log' },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">SourceGuide · Analytics</h2>
          <p className="text-[13px] text-slate-500">Coverage, supplier reach and a full record of every change.</p>
        </div>
        <span className="rounded-full bg-[#eaf4ef] px-3 py-1.5 text-[12px] font-semibold" style={{ color: BRAND }}>
          {insights.activity30d.toLocaleString()} change{insights.activity30d === 1 ? '' : 's'} in the last 30 days
        </span>
      </div>

      {/* Top tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative -mb-px whitespace-nowrap px-4 py-2.5 text-[13.5px] font-semibold transition-colors"
              style={{ color: on ? BRAND : '#64748b', borderBottom: on ? `2px solid ${BRAND}` : '2px solid transparent' }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview'  && <OverviewTab data={data} insights={insights} />}
      {tab === 'coverage'  && <CoverageTab gaps={gaps} insights={insights} />}
      {tab === 'suppliers' && <SuppliersTab data={data} insights={insights} />}
      {tab === 'people'    && <PeopleTab rows={people} loading={peopleLoading} />}
      {tab === 'audit'     && <AuditTab entries={audit} loading={auditLoading} />}
    </div>
  );
}

/* ─── shared analytics UI ─────────────────────────────────────── */

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

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mb-4 mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function BarRow({ label, value, max, color = BRAND, labelWidth = 'w-24', suffix }: {
  label: string; value: number; max: number; color?: string; labelWidth?: string; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${labelWidth} shrink-0 truncate text-[12.5px] text-slate-600`} title={label}>{label}</span>
      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[11.5px] text-slate-500">{value.toLocaleString()}{suffix ?? ''}</span>
    </div>
  );
}

function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }

/* ─── Overview tab ────────────────────────────────────────────── */

function OverviewTab({ data, insights }: { data: SgAnalytics; insights: SgInsights }) {
  const maxMappings = Math.max(1, ...data.perCountry.map(c => c.mappings));
  const maxSpend = Math.max(1, ...data.spendTypeBreakdown.map(s => s.count));
  const totalTier = insights.tier.preferred + insights.tier.backup;
  const coverage = pct(insights.coverageOverall.coveredAnywhere, insights.coverageOverall.catalogue);
  const prefShare = pct(insights.tier.preferred, totalTier);
  const noChampion = Math.max(0, insights.champions.countriesTotal - insights.champions.withChampion);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Commodities" value={data.stats.commodities.toLocaleString()} />
        <Kpi label="Suppliers mapped" value={data.stats.suppliers.toLocaleString()} sub={`${insights.avl.total.toLocaleString()} in AVL`} />
        <Kpi label="Mappings" value={data.stats.mappings.toLocaleString()} />
        <Kpi label="Countries" value={data.stats.countries.toLocaleString()} />
        <Kpi label="Categories" value={data.stats.categories.toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Catalogue coverage" value={`${coverage}%`} sub={`${insights.coverageOverall.coveredAnywhere.toLocaleString()} of ${insights.coverageOverall.catalogue.toLocaleString()} mapped`} tone={coverage >= 60 ? 'good' : coverage >= 30 ? 'warn' : 'bad'} />
        <Kpi label="Preferred share" value={`${prefShare}%`} sub={`${insights.tier.preferred.toLocaleString()} preferred · ${insights.tier.backup.toLocaleString()} backup`} tone="good" />
        <Kpi label="Single-source pairs" value={insights.singleSourcePairs.toLocaleString()} sub="country + commodity with 1 supplier" tone={insights.singleSourcePairs > 0 ? 'warn' : 'good'} />
        <Kpi label="Countries missing champion" value={noChampion.toLocaleString()} sub={`${insights.champions.withEmail} have an active editor`} tone={noChampion > 0 ? 'warn' : 'good'} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Mappings by country">
          <div className="space-y-2.5">
            {data.perCountry.map(c => (
              <BarRow key={c.country} label={c.name} value={c.mappings} max={maxMappings} color={c.tone ?? BRAND} />
            ))}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Spend type">
            <div className="space-y-2.5">
              {data.spendTypeBreakdown.map(s => (
                <BarRow key={s.spendType} label={s.spendType} value={s.count} max={maxSpend} labelWidth="w-20" />
              ))}
            </div>
          </Panel>
          <Panel title="Tier mix">
            <div className="flex overflow-hidden rounded-full">
              <div className="h-4" style={{ width: `${prefShare}%`, background: BRAND }} title={`Preferred ${insights.tier.preferred}`} />
              <div className="h-4 flex-1" style={{ background: '#9CC7B0' }} title={`Backup ${insights.tier.backup}`} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BRAND }} /> Preferred {insights.tier.preferred.toLocaleString()}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#9CC7B0' }} /> Backup {insights.tier.backup.toLocaleString()}</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ─── Coverage tab ────────────────────────────────────────────── */

function CoverageTab({ gaps, insights }: { gaps: SgCoverageGap[]; insights: SgInsights }) {
  const coverage = pct(insights.coverageOverall.coveredAnywhere, insights.coverageOverall.catalogue);
  const cats = insights.categoryCoverage;
  const noBackupTotal = gaps.reduce((s, g) => s + g.noBackup, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Catalogue commodities" value={insights.coverageOverall.catalogue.toLocaleString()} />
        <Kpi label="Covered somewhere" value={insights.coverageOverall.coveredAnywhere.toLocaleString()} sub={`${coverage}% of catalogue`} tone={coverage >= 60 ? 'good' : coverage >= 30 ? 'warn' : 'bad'} />
        <Kpi label="No-preferred pairs" value={insights.noPreferredPairs.toLocaleString()} sub="covered but only backups" tone={insights.noPreferredPairs > 0 ? 'warn' : 'good'} />
        <Kpi label="No-backup pairs" value={noBackupTotal.toLocaleString()} sub="a preferred, but no fallback" tone={noBackupTotal > 0 ? 'warn' : 'good'} />
      </div>

      {/* Coverage gaps by country */}
      <Panel title="Coverage gaps by country" subtitle={`Of the ${(gaps[0]?.catalogueTotal ?? insights.coverageOverall.catalogue).toLocaleString()} commodities in the full taxonomy, how many each country covers. Click a number to jump into the mappings workspace.`}>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-[1.4fr_1.4fr_0.7fr_0.9fr_0.85fr_0.85fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <span>Country</span><span>Coverage</span><span className="text-right">Covered</span><span className="text-right">No preferred</span><span className="text-right">No backup</span><span className="text-right">Missing</span>
          </div>
          {gaps.map(g => (
            <div key={g.country} className="grid grid-cols-[1.4fr_1.4fr_0.7fr_0.9fr_0.85fr_0.85fr] items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-b-0">
              <span className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                <span className="h-3 w-4 shrink-0 rounded-sm" style={{ background: g.tone ?? '#999' }} />
                <span className="truncate">{g.name}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${Math.round(g.coverage * 100)}%`, background: BRAND }} />
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-slate-500">{Math.round(g.coverage * 100)}%</span>
              </span>
              <span className="text-right font-mono text-[12px] text-slate-600">{g.covered}</span>
              <a href={`/sourceguide/mappings?country=${g.country}&gap=no-preferred`}
                className={`text-right font-mono text-[12px] font-semibold ${g.noPreferred ? 'text-amber-600 hover:underline' : 'text-slate-300'}`}>{g.noPreferred}</a>
              <span className={`text-right font-mono text-[12px] font-semibold ${g.noBackup ? 'text-slate-600' : 'text-slate-300'}`}>{g.noBackup}</span>
              <a href={`/sourceguide/mappings?country=${g.country}&gap=missing`}
                className="text-right font-mono text-[12px] font-semibold hover:underline" style={{ color: g.missing ? '#64748b' : '#cbd5e1' }}>{g.missing}</a>
            </div>
          ))}
        </div>
      </Panel>

      {/* Category coverage */}
      <Panel title="Coverage by category" subtitle="Share of each category's commodities that are mapped in at least one country.">
        <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
          {cats.map(c => {
            const p = pct(c.covered, c.catalogue);
            return (
              <div key={c.category} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[12.5px] text-slate-600" title={c.category}>{c.category}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 60 ? BRAND : p >= 30 ? '#d99a2b' : '#c15b5b' }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-slate-500">{c.covered}/{c.catalogue} ({p}%)</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ─── Suppliers tab ───────────────────────────────────────────── */

function SuppliersTab({ data, insights }: { data: SgAnalytics; insights: SgInsights }) {
  const maxSup = Math.max(1, ...data.topSuppliers.map(s => s.mappings));
  const maxMulti = Math.max(1, ...insights.topMultiCountry.map(s => s.mappings));
  const utilisation = pct(insights.avl.mapped, insights.avl.total);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Suppliers in AVL" value={insights.avl.total.toLocaleString()} />
        <Kpi label="Suppliers mapped" value={insights.avl.mapped.toLocaleString()} sub={`${utilisation}% of the AVL is in use`} tone="good" />
        <Kpi label="Multi-country suppliers" value={insights.multiCountrySuppliers.toLocaleString()} sub="active in more than one country" />
        <Kpi label="Single-source pairs" value={insights.singleSourcePairs.toLocaleString()} tone={insights.singleSourcePairs > 0 ? 'warn' : 'good'} />
      </div>

      <Panel title="AVL utilisation" subtitle="How much of the Approved Vendor List is actually mapped to a commodity somewhere.">
        <div className="flex overflow-hidden rounded-full">
          <div className="h-4" style={{ width: `${utilisation}%`, background: BRAND }} />
          <div className="h-4 flex-1" style={{ background: '#eef0ef' }} />
        </div>
        <div className="mt-2 text-[12.5px] text-slate-500">{insights.avl.mapped.toLocaleString()} of {insights.avl.total.toLocaleString()} approved vendors mapped ({utilisation}%)</div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Top suppliers by mappings">
          <div className="space-y-2.5">
            {data.topSuppliers.map(s => (
              <BarRow key={s.code} label={s.name} value={s.mappings} max={maxSup} labelWidth="w-40" />
            ))}
            {data.topSuppliers.length === 0 && <div className="text-[12.5px] text-slate-400">No supplier mappings yet.</div>}
          </div>
        </Panel>

        <Panel title="Widest reach" subtitle="Suppliers active across the most countries.">
          <div className="space-y-2.5">
            {insights.topMultiCountry.map(s => (
              <div key={s.code} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[12.5px] text-slate-600" title={s.name}>{s.name}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(s.mappings / maxMulti) * 100}%`, background: BRAND }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-slate-500">{s.countries} ctry · {s.mappings}</span>
              </div>
            ))}
            {insights.topMultiCountry.length === 0 && <div className="text-[12.5px] text-slate-400">No suppliers span multiple countries yet.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ─── Audit tab ───────────────────────────────────────────────── */

type AuditKind = 'mapping' | 'champion' | 'access';
function auditKind(action: string): AuditKind {
  if (action.startsWith('Champion')) return 'champion';
  if (action.startsWith('Access')) return 'access';
  return 'mapping';
}
const KIND_STYLE: Record<AuditKind, { bg: string; col: string; label: string }> = {
  mapping:  { bg: '#eaf4ef', col: '#1f5d3a', label: 'Mapping' },
  champion: { bg: '#e0e7ff', col: '#4338ca', label: 'Champion' },
  access:   { bg: '#fef3c7', col: '#b45309', label: 'Access' },
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
function fullTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function ChangeRow({ e }: { e: SgAuditEntry }) {
  const st = KIND_STYLE[auditKind(e.action)];
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-[1px] shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: st.bg, color: st.col }}>{e.action}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600" title={e.details ?? ''}>{e.details || 'No detail'}</span>
      <span className="shrink-0 text-[11.5px] font-medium text-slate-600">{e.performedBy || 'System'}</span>
      <span className="w-16 shrink-0 text-right text-[11px] text-slate-400" title={fullTime(e.performedAt)}>{timeAgo(e.performedAt)}</span>
    </div>
  );
}

function AuditTab({ entries, loading }: { entries: SgAuditEntry[] | null; loading: boolean }) {
  const [view, setView] = useState<'country' | 'timeline'>('country');
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('all');
  const [kind, setKind] = useState<'all' | AuditKind>('all');

  const list = entries ?? [];
  const actors = useMemo(
    () => Array.from(new Set(list.map(e => e.performedBy).filter((v): v is string => !!v))).sort(),
    [list],
  );

  // Timeline: all activity, filterable
  const filtered = useMemo(() => list.filter(e => {
    if (kind !== 'all' && auditKind(e.action) !== kind) return false;
    if (actor !== 'all' && e.performedBy !== actor) return false;
    if (q.trim()) {
      const hay = `${e.action} ${e.details ?? ''} ${e.countryName ?? ''} ${e.commodityName ?? ''} ${e.performedBy ?? ''}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [list, kind, actor, q]);

  // Mapping changes grouped by country, then by commodity
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; tone: string | null; coms: Map<string, SgAuditEntry[]>; countryLevel: SgAuditEntry[]; total: number }>();
    for (const e of list) {
      if (auditKind(e.action) !== 'mapping') continue;
      const key = e.country ?? '__none__';
      let g = m.get(key);
      if (!g) { g = { name: e.countryName ?? 'No country', tone: e.tone, coms: new Map(), countryLevel: [], total: 0 }; m.set(key, g); }
      g.total++;
      if (e.commodityId != null) {
        const ck = e.commodityName ?? `Commodity #${e.commodityId}`;
        const arr = g.coms.get(ck); if (arr) arr.push(e); else g.coms.set(ck, [e]);
      } else {
        g.countryLevel.push(e);
      }
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);

  if (loading && entries === null) return <div className="py-16 text-center text-sm text-slate-400">Loading audit log…</div>;

  const KIND_TABS: { key: 'all' | AuditKind; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mapping', label: 'Mappings' },
    { key: 'champion', label: 'Champions' },
    { key: 'access', label: 'Access' },
  ];

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {([['country', 'Mapping changes by country'], ['timeline', 'All activity']] as const).map(([k, label]) => {
            const on = view === k;
            return (
              <button key={k} onClick={() => setView(k)}
                className="px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={on ? { background: BRAND, color: '#fff' } : { background: '#fff', color: '#64748b' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          No changes recorded yet. Mapping edits, champion changes and access decisions will appear here.
        </div>
      ) : view === 'country' ? (
        grouped.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No mapping changes recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {grouped.map(g => (
              <div key={g.name} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <span className="h-3.5 w-5 shrink-0 rounded-sm" style={{ background: g.tone ?? '#999' }} />
                  <span className="text-[14px] font-bold text-slate-900">{g.name}</span>
                  <span className="ml-auto font-mono text-[11.5px] text-slate-400">{g.total} change{g.total === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-slate-100 px-4">
                  {[...g.coms.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([com, es]) => (
                    <div key={com} className="py-2.5">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-800">{com}</span>
                        <span className="font-mono text-[10.5px] text-slate-400">{es.length}</span>
                      </div>
                      <div className="pl-0.5">{es.map(e => <ChangeRow key={e.id} e={e} />)}</div>
                    </div>
                  ))}
                  {g.countryLevel.length > 0 && (
                    <div className="py-2.5">
                      <div className="mb-0.5 text-[13px] font-semibold text-slate-800">Country-level actions</div>
                      <div className="pl-0.5">{g.countryLevel.map(e => <ChangeRow key={e.id} e={e} />)}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* Timeline filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-200">
              {KIND_TABS.map(k => {
                const on = kind === k.key;
                return (
                  <button key={k.key} onClick={() => setKind(k.key)}
                    className="px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                    style={on ? { background: BRAND, color: '#fff' } : { background: '#fff', color: '#64748b' }}>
                    {k.label}
                  </button>
                );
              })}
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search action, supplier, commodity, country…"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-[#6AAF8E]" />
            <select value={actor} onChange={e => setActor(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-600 outline-none focus:border-[#6AAF8E]">
              <option value="all">All people</option>
              {actors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="ml-auto text-[12px] text-slate-400">{filtered.length.toLocaleString()} of {list.length.toLocaleString()}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">No entries match these filters.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {filtered.map((e, i) => {
                const st = KIND_STYLE[auditKind(e.action)];
                return (
                  <div key={e.id} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                    <span className="mt-0.5 w-[68px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide" style={{ background: st.bg, color: st.col }}>{st.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13.5px] font-semibold text-slate-900">{e.action}</span>
                        {e.countryName && (
                          <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                            <span className="h-2.5 w-3.5 rounded-sm" style={{ background: e.tone ?? '#999' }} />{e.countryName}
                          </span>
                        )}
                      </div>
                      {e.details && <div className="mt-0.5 truncate text-[12.5px] text-slate-500" title={e.details}>{e.details}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12.5px] font-medium text-slate-700">{e.performedBy || 'System'}</div>
                      <div className="text-[11px] text-slate-400" title={fullTime(e.performedAt)}>{timeAgo(e.performedAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── People tab: per-user usage ──────────────────────────────── */

function PeopleTab({ rows, loading }: { rows: SgUserActivity[] | null; loading: boolean }) {
  if (loading && rows === null) return <div className="py-16 text-center text-sm text-slate-400">Loading user activity…</div>;
  const list = rows ?? [];
  const maxTotal = Math.max(1, ...list.map(r => r.total));
  const totalChanges = list.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Kpi label="Active contributors" value={list.length.toLocaleString()} />
        <Kpi label="Total recorded changes" value={totalChanges.toLocaleString()} />
        <Kpi label="Mapping edits" value={list.reduce((s, r) => s + r.mappings, 0).toLocaleString()} tone="good" />
      </div>

      <Panel title="Activity by person" subtitle="Every recorded change per user (mapping edits, champion changes and access decisions). View-only users who never edit will not appear here.">
        {list.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-slate-400">No user activity recorded yet.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1.7fr_1.4fr_0.8fr_0.9fr_0.7fr_0.8fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              <span>Person</span><span>Changes</span><span className="text-right">Mappings</span><span className="text-right">Champions</span><span className="text-right">Access</span><span className="text-right">Countries</span><span className="text-right">Last active</span>
            </div>
            {list.map(r => (
              <div key={r.user} className="grid grid-cols-[1.7fr_1.4fr_0.8fr_0.9fr_0.7fr_0.8fr_1fr] items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-b-0">
                <span className="truncate text-[13px] font-semibold text-slate-800" title={r.user}>{r.user}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full" style={{ width: `${(r.total / maxTotal) * 100}%`, background: BRAND }} />
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-500">{r.total}</span>
                </span>
                <span className={`text-right font-mono text-[12px] ${r.mappings ? 'text-slate-600' : 'text-slate-300'}`}>{r.mappings}</span>
                <span className={`text-right font-mono text-[12px] ${r.champions ? 'text-slate-600' : 'text-slate-300'}`}>{r.champions}</span>
                <span className={`text-right font-mono text-[12px] ${r.access ? 'text-slate-600' : 'text-slate-300'}`}>{r.access}</span>
                <span className={`text-right font-mono text-[12px] ${r.countries ? 'text-slate-600' : 'text-slate-300'}`}>{r.countries}</span>
                <span className="text-right text-[11.5px] text-slate-500" title={fullTime(r.lastActive)}>{timeAgo(r.lastActive)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
