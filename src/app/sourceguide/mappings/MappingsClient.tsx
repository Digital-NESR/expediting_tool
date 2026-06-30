'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, Zap, Clock, Lock, ChevronDown, Check } from 'lucide-react';
import { SG_BRAND } from '../constants';
import { PathTrail } from '../ui';
import {
  getMappingEditList, getCountryMappingSummary, getActivityLog,
  supplierOptions, addMapping, removeMapping, changeTier, getCoverageGapsSummary,
} from '@/app/actions/sourceguide';
import type { GapMode } from '@/app/actions/sourceguide';
import type { SgCountry, SgCommodity, SgMapping, SgActivityEntry, Tier, SgSupplier } from '@/types/sourceguide';

type EditItem = { commodity: SgCommodity; mappings: SgMapping[] };

export default function MappingsClient({
  countries, isAdmin, userName, initialCountry = null, initialMode = 'mapped',
}: {
  countries: SgCountry[];
  isAdmin: boolean;
  userName: string;
  initialCountry?: string | null;
  initialMode?: GapMode;
}) {
  const [country, setCountry] = useState(
    (initialCountry && countries.some(c => c.code === initialCountry)) ? initialCountry : (countries[0]?.code ?? ''));
  const [mode, setMode] = useState<GapMode>(initialMode);
  const [q, setQ] = useState('');
  const [list, setList] = useState<EditItem[]>([]);
  const [summary, setSummary] = useState({ mappings: 0, commodities: 0 });
  const [gaps, setGaps] = useState<{ missing: number; noPreferred: number }>({ missing: 0, noPreferred: 0 });
  const [audit, setAudit] = useState<SgActivityEntry[]>([]);
  const [limit, setLimit] = useState(15);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const c = useMemo(() => countries.find(x => x.code === country), [countries, country]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [items, sum, log, gapSummary] = await Promise.all([
      getMappingEditList(country, q, 200, mode),
      getCountryMappingSummary(country),
      getActivityLog(isAdmin ? null : country, 12),
      getCoverageGapsSummary(),
    ]);
    setList(items); setSummary(sum); setAudit(log); setLoading(false);
    const g = gapSummary.find(x => x.country === country);
    setGaps({ missing: g?.missing ?? 0, noPreferred: g?.noPreferred ?? 0 });
  }, [country, q, isAdmin, mode]);

  useEffect(() => { setLimit(15); }, [country, q, mode]);
  useEffect(() => { void reload(); }, [reload, refreshKey]);

  const bump = (msg?: string) => { if (msg) setToast(msg); setRefreshKey(k => k + 1); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  if (!country) {
    return <div className="mx-auto max-w-[980px] px-6 py-16 text-center text-slate-500">No countries available to manage.</div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-7 lg:px-8">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>
          {isAdmin ? 'Administration' : 'SourceGuide Champion'}
        </div>
        <h1 className="text-[30px] font-bold tracking-tight">Manage mappings</h1>
        <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-slate-500">
          Amend the preferred and backup supplier mappings for your country. Promote, demote, add or deactivate
          suppliers. Every change is audit-logged.
        </p>
      </div>

      {/* Scope bar */}
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-[18px] w-[26px] rounded-sm" style={{ background: c?.tone ?? '#999' }} />
          <div>
            <div className="text-[15px] font-bold">{c?.name}</div>
            <div className="text-[12px] text-slate-500">Champion: {c?.champion || 'Unassigned'}</div>
          </div>
        </div>
        <div className="h-7 w-px bg-slate-200" />
        <div className="text-[13px] text-slate-500">
          <b className="text-slate-900">{summary.mappings.toLocaleString()}</b> active mappings ·{' '}
          <b className="text-slate-900">{summary.commodities}</b> commodities covered
        </div>
        <div className="flex-1" />
        {isAdmin && countries.length > 1 ? (
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] font-semibold outline-none"
          >
            {countries.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C5E0D2] px-2.5 py-1 text-[11px] font-semibold text-[#1f5d3a]">
            <Lock className="h-3 w-3" /> Scoped to {c?.code}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {/* Gap-mode segmented control */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([
              { m: 'mapped' as GapMode, label: 'Mapped here', n: summary.commodities },
              { m: 'no-preferred' as GapMode, label: 'No preferred', n: gaps.noPreferred },
              { m: 'missing' as GapMode, label: 'Missing (sourced elsewhere)', n: gaps.missing },
            ]).map(t => {
              const on = mode === t.m;
              return (
                <button
                  key={t.m}
                  onClick={() => { setMode(t.m); setQ(''); }}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                  style={on ? { background: SG_BRAND, borderColor: SG_BRAND, color: '#fff' } : { borderColor: '#D1D3D4', background: '#fff', color: '#58595B' }}
                >
                  {t.label}
                  <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold" style={on ? { background: 'rgba(255,255,255,.25)' } : { background: '#eef0ef', color: '#58595B' }}>{t.n}</span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-[#6AAF8E]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder={mode === 'mapped' ? 'Find a commodity to amend (search the full catalogue)…' : 'Filter within these results…'}
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
            />
            {q && <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
          </div>
          <div className="mb-3.5 text-[12.5px] text-slate-500">
            {q.trim()
              ? <>Showing matches across the full taxonomy. Add suppliers to any commodity.</>
              : mode === 'missing'
                ? <>Commodities sourced in other countries but <b className="text-slate-900">not yet mapped</b> in {c?.name}. Add a supplier to fill the gap.</>
                : mode === 'no-preferred'
                  ? <>Commodities in {c?.name} that have a <b className="text-slate-900">backup but no preferred</b> supplier.</>
                  : <>Showing the <b className="text-slate-900">{list.length}</b> commodities currently mapped in {c?.name}.</>}
          </div>

          {loading && list.length === 0 && <div className="py-10 text-center text-[13.5px] text-slate-400">Loading…</div>}
          {list.slice(0, limit).map(item => (
            <MappingEditor key={item.commodity.id} item={item} country={country} onChange={bump} />
          ))}
          {!loading && list.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-[13.5px] text-slate-500">
              No commodities to show. Use search to find one and add a supplier.
            </div>
          )}
          {list.length > limit && (
            <div className="mt-4 text-center">
              <button onClick={() => setLimit(l => l + 15)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#6AAF8E]">
                Show more · {(list.length - limit).toLocaleString()} remaining
              </button>
            </div>
          )}
        </div>

        <AuditPanel items={audit} />
      </div>

      {toast && (
        <div className="fixed bottom-7 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-[#1F1F1D] px-5 py-3 text-[13.5px] font-medium text-white shadow-2xl">
          <Check className="h-4 w-4" style={{ color: '#6AAF8E' }} /> {toast}
        </div>
      )}
    </div>
  );
}

/* ─── per-commodity editor ───────────────────────────────────── */
function MappingEditor({ item, country, onChange }: { item: EditItem; country: string; onChange: (msg?: string) => void }) {
  const { commodity: com, mappings } = item;
  const pref = mappings.filter(m => m.tier === 'Preferred');
  const backups = mappings.filter(m => m.tier === 'Backup');

  return (
    <div className="mb-2.5 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="min-w-0">
          <PathTrail path={com.path.slice(0, 3)} />
          <div className="text-[15px] font-semibold">
            {com.name}
            {com.code && <span className="ml-1.5 font-mono text-[11px]" style={{ color: SG_BRAND }}>{com.code}</span>}
          </div>
        </div>
        <span className="rounded-full bg-[#ececed] px-2.5 py-1 text-[11px] font-semibold text-slate-500">{mappings.length} mapped</span>
      </div>
      <hr className="my-3.5 border-slate-100" />
      <div className="flex flex-col gap-2.5">
        <ChipRow label="Preferred" chips={pref} country={country} onChange={onChange} />
        <ChipRow label="Backup" chips={backups} country={country} onChange={onChange} />
      </div>
      <div className="mt-3.5">
        <AddSupplier country={country} commodityId={com.id} onChange={onChange} />
      </div>
    </div>
  );
}

function ChipRow({ label, chips, onChange }: { label: string; chips: SgMapping[]; country: string; onChange: (m?: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="w-[70px] font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      {chips.map(m => <Chip key={m.id} m={m} onChange={onChange} />)}
    </div>
  );
}

function Chip({ m, onChange }: { m: SgMapping; onChange: (msg?: string) => void }) {
  const isPref = m.tier === 'Preferred';
  const [busy, setBusy] = useState(false);

  async function flip() {
    setBusy(true);
    const res = await changeTier(m.id, isPref ? 'Backup' : 'Preferred');
    setBusy(false);
    if (res.success) onChange(`${isPref ? 'Demoted' : 'Promoted'} ${m.supplierName}`);
    else onChange(res.error);
  }
  async function remove() {
    setBusy(true);
    const res = await removeMapping(m.id);
    setBusy(false);
    if (res.success) onChange(`Removed ${m.supplierName}`);
    else onChange(res.error);
  }

  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5"
      style={isPref ? { borderColor: '#6AAF8E', background: '#eaf4ef' } : { borderColor: '#D1D3D4', background: '#fff' }}
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: isPref ? SG_BRAND : '#7c7d80' }} />
      <span className="max-w-[220px] truncate text-[12.5px] font-medium">{m.supplierName}</span>
      <button disabled={busy} onClick={flip} title={isPref ? 'Make backup' : 'Make preferred'} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
        {isPref ? <ChevronDown className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
      </button>
      <button disabled={busy} onClick={remove} title="Remove" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddSupplier({ country, commodityId, onChange }: { country: string; commodityId: number; onChange: (m?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier>('Preferred');
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const [opts, setOpts] = useState<SgSupplier[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(async () => {
      const res = await supplierOptions(country, text, 7);
      if (active) setOpts(res);
    }, 150);
    return () => { active = false; clearTimeout(t); };
  }, [open, text, country]);

  async function submit(sup?: SgSupplier) {
    const pick = sup ?? opts[0];
    if (!pick) return;
    setBusy(true);
    const res = await addMapping({ commodityId, country, tier, supplierCode: pick.code });
    setBusy(false);
    if (res.success) { setText(''); setOpen(false); setFocus(false); onChange(`Added ${pick.name}`); }
    else onChange(res.error);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ef] px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-200">
        <Zap className="h-3.5 w-3.5" /> Add supplier
      </button>
    );
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full bg-[#eef0ef] p-0.5">
        {(['Preferred', 'Backup'] as Tier[]).map(t => (
          <button
            key={t} onClick={() => setTier(t)}
            className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
            style={tier === t ? { background: '#fff', color: '#1f5d3a', fontWeight: 600 } : { color: '#58595B' }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="relative min-w-[200px] flex-1">
        <input
          autoFocus value={text} placeholder="Search the Approved Vendor List…"
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 160)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#6AAF8E]"
        />
        {focus && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
            {opts.map(s => (
              <div key={s.code} onMouseDown={() => submit(s)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#eaf4ef]">
                <span className="grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: SG_BRAND }}>
                  {s.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{s.name}</span>
                  <span className="block font-mono text-[10.5px] text-slate-400">{s.code}</span>
                </span>
                {s.countries.includes(country) && <span className="rounded-full bg-[#C5E0D2] px-2 py-0.5 text-[10px] font-semibold text-[#1f5d3a]">in country</span>}
              </div>
            ))}
            {text.trim().length > 0 && opts.length === 0 && (
              <div className="px-2.5 py-3 text-center text-[12px] text-slate-400">No matching vendor in the AVL.</div>
            )}
          </div>
        )}
      </div>
      <button disabled={busy} onMouseDown={() => submit()} className="rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: SG_BRAND }}>
        Add
      </button>
      <button onClick={() => setOpen(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

/* ─── audit panel ────────────────────────────────────────────── */
function AuditPanel({ items }: { items: SgActivityEntry[] }) {
  const ago = (iso: string) => {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  };
  const colors: Record<string, string> = { Add: SG_BRAND, Deactivate: '#a23b3b', 'Edit tier': '#b07d24' };
  return (
    <div className="sticky top-[88px] rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        <span className="text-[14px] font-bold">Audit log</span>
      </div>
      <p className="mb-3.5 text-[12px] text-slate-500">Every amendment is recorded with user, time and delta.</p>
      {items.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-slate-400">No changes yet.<br />Edits you make will appear here.</div>
      ) : (
        <div className="flex flex-col">
          {items.map((a, i) => (
            <div key={a.id} className={`flex gap-2.5 py-2.5 ${i < items.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: colors[a.action] ?? '#58595B' }} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium">{a.action} <span className="font-normal text-slate-500">· {a.details}</span></div>
                <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">{a.performedBy} · {ago(a.performedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
