'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, X, Box, Shield, Layers, MapPin } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import type { SgCatalogRow } from '@/app/actions/sourceguide';

const GEN = 'General';
const INDIRECT = '#64748b';

type Spend = 'all' | 'Direct' | 'Indirect';

interface FamNode { name: string; count: number; suppliers: number; items: SgCatalogRow[]; }
interface SubNode { name: string; count: number; suppliers: number; fams: Map<string, FamNode>; }
interface CatNode { name: string; categoryId: string; count: number; suppliers: number; spend: Set<string>; subs: Map<string, SubNode>; }

export default function TaxonomyClient({ catalog }: { catalog: SgCatalogRow[] }) {
  const router = useRouter();
  const [spend, setSpend] = useState<Spend>('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<{ cat: string | null; sub: string | null; fam: string | null }>({ cat: null, sub: null, fam: null });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(r => {
      if (spend !== 'all' && r.spendType !== spend) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) ||
        (r.subCategory ?? '').toLowerCase().includes(q) || (r.family ?? '').toLowerCase().includes(q) ||
        (r.code ?? '').toLowerCase().includes(q)
      );
    });
  }, [catalog, spend, query]);

  const tree = useMemo(() => {
    const cats = new Map<string, CatNode>();
    for (const r of rows) {
      let cat = cats.get(r.category);
      if (!cat) { cat = { name: r.category, categoryId: r.categoryId, count: 0, suppliers: 0, spend: new Set(), subs: new Map() }; cats.set(r.category, cat); }
      cat.count++; cat.suppliers += r.suppliers; cat.spend.add(r.spendType);
      const subL = r.subCategory || GEN;
      let sub = cat.subs.get(subL);
      if (!sub) { sub = { name: subL, count: 0, suppliers: 0, fams: new Map() }; cat.subs.set(subL, sub); }
      sub.count++; sub.suppliers += r.suppliers;
      const famL = r.family || GEN;
      let fam = sub.fams.get(famL);
      if (!fam) { fam = { name: famL, count: 0, suppliers: 0, items: [] }; sub.fams.set(famL, fam); }
      fam.count++; fam.suppliers += r.suppliers; fam.items.push(r);
    }
    return cats;
  }, [rows]);

  const categories = useMemo(() => [...tree.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), [tree]);
  const totals = useMemo(() => ({
    categories: tree.size,
    commodities: rows.length,
    suppliers: rows.reduce((a, r) => a + r.suppliers, 0),
  }), [tree, rows]);

  const catNode = sel.cat ? tree.get(sel.cat) : undefined;
  const subList = useMemo(() => catNode ? [...catNode.subs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) : [], [catNode]);
  const subNode = sel.sub && catNode ? catNode.subs.get(sel.sub) : undefined;
  const famList = useMemo(() => subNode ? [...subNode.fams.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) : [], [subNode]);
  const famNode = sel.fam && subNode ? subNode.fams.get(sel.fam) : undefined;
  const items = useMemo(() => famNode ? [...famNode.items].sort((a, b) => a.name.localeCompare(b.name)) : [], [famNode]);

  function pickCategory(name: string) {
    const c = tree.get(name);
    let sub: string | null = null, fam: string | null = null;
    if (c && c.subs.size === 1) {
      sub = [...c.subs.keys()][0];
      const f = c.subs.get(sub)!;
      if (f.fams.size === 1) fam = [...f.fams.keys()][0];
    }
    setSel({ cat: name, sub, fam });
  }
  function pickSub(name: string) {
    let fam: string | null = null;
    const s = catNode?.subs.get(name);
    if (s && s.fams.size === 1) fam = [...s.fams.keys()][0];
    setSel(prev => ({ ...prev, sub: name, fam }));
  }

  const spendDot = (s: Set<string>) => {
    if (s.size > 1) return 'linear-gradient(90deg,' + SG_BRAND + ' 50%,' + INDIRECT + ' 50%)';
    return s.has('Direct') ? SG_BRAND : INDIRECT;
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
      {/* Header */}
      <div className="mb-5">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>Catalogue</div>
        <h1 className="text-[30px] font-bold tracking-tight">Spend Taxonomy</h1>
        <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-slate-500">
          Drill through the full sourcing catalogue: Category → Sub-Category → Family → Commodity. Counts at every
          level let you gauge coverage at a glance.
        </p>
      </div>

      {/* Controls + at-a-glance */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
          {(['all', 'Indirect', 'Direct'] as Spend[]).map(s => (
            <button
              key={s}
              onClick={() => { setSpend(s); setSel({ cat: null, sub: null, fam: null }); }}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold capitalize transition-colors"
              style={spend === s ? { background: SG_BRAND, color: '#fff' } : { color: '#58595B' }}
            >
              {s === 'all' ? 'All spend' : s}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-slate-400 focus-within:border-[#6AAF8E]">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSel({ cat: null, sub: null, fam: null }); }}
            placeholder="Filter the catalogue…"
            className="w-full bg-transparent text-[13.5px] text-slate-900 outline-none placeholder:text-slate-400"
          />
          {query && <button onClick={() => setQuery('')} className="hover:text-slate-600"><X className="h-4 w-4" /></button>}
        </div>

        <div className="flex items-center gap-4 rounded-full border border-slate-200 bg-white px-4 py-1.5">
          <Glance icon={<Layers className="h-3.5 w-3.5" />} value={totals.categories} label="categories" />
          <span className="h-4 w-px bg-slate-200" />
          <Glance icon={<Box className="h-3.5 w-3.5" />} value={totals.commodities} label="commodities" />
          <span className="h-4 w-px bg-slate-200" />
          <Glance icon={<Shield className="h-3.5 w-3.5" />} value={totals.suppliers} label="mappings" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="mb-3 flex min-h-[20px] flex-wrap items-center gap-1.5 text-[12.5px] text-slate-500">
        {sel.cat ? (
          <>
            <Crumb label={sel.cat} onClick={() => setSel({ cat: sel.cat, sub: null, fam: null })} active={!sel.sub} />
            {sel.sub && sel.sub !== GEN && <><ChevronRight className="h-3 w-3 text-slate-300" /><Crumb label={sel.sub} onClick={() => setSel(p => ({ ...p, fam: null }))} active={!sel.fam} /></>}
            {sel.fam && sel.fam !== GEN && <><ChevronRight className="h-3 w-3 text-slate-300" /><Crumb label={sel.fam} active /></>}
          </>
        ) : <span className="italic text-slate-400">Select a category to begin</span>}
      </div>

      {/* Cascading columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        <Column title="Category" count={categories.length}>
          {categories.map(c => (
            <Item key={c.name} active={sel.cat === c.name} onClick={() => pickCategory(c.name)} count={c.count} chevron
              dot={spendDot(c.spend)} label={c.name} />
          ))}
        </Column>

        {catNode && (
          <Column title="Sub-Category" count={subList.length}>
            {subList.map(s => (
              <Item key={s.name} active={sel.sub === s.name} onClick={() => pickSub(s.name)} count={s.count} chevron
                label={s.name} muted={s.name === GEN} />
            ))}
          </Column>
        )}

        {subNode && (
          <Column title="Family" count={famList.length}>
            {famList.map(f => (
              <Item key={f.name} active={sel.fam === f.name} onClick={() => setSel(p => ({ ...p, fam: f.name }))} count={f.count} chevron
                label={f.name} muted={f.name === GEN} />
            ))}
          </Column>
        )}

        {famNode && (
          <Column title="Commodity" count={items.length} wide>
            {items.map(it => (
              <button
                key={it.id}
                onClick={() => router.push(`/sourceguide/commodity/${it.id}`)}
                className="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#eaf4ef]"
              >
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: it.spendType === 'Direct' ? SG_BRAND : INDIRECT }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-slate-800">{it.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" />{it.suppliers}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{it.countries}</span>
                    {it.code && <span className="font-mono">{it.code}</span>}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[#2A7E4F]" />
              </button>
            ))}
          </Column>
        )}
      </div>
    </div>
  );
}

function Glance({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px]">
      <span style={{ color: SG_BRAND }}>{icon}</span>
      <b className="text-slate-900">{value.toLocaleString()}</b>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}

function Crumb({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded px-1.5 py-0.5 ${active ? 'font-semibold text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}>
      {label}
    </button>
  );
}

function Column({ title, count, children, wide }: { title: string; count: number; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`shrink-0 ${wide ? 'w-[300px]' : 'w-[240px]'} rounded-2xl border border-slate-200 bg-white`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] text-slate-500">{count}</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-1.5">{children}</div>
    </div>
  );
}

function Item({ label, count, active, onClick, chevron, dot, muted }: {
  label: string; count: number; active?: boolean; onClick: () => void; chevron?: boolean; dot?: string; muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
      style={active ? { background: SG_BRAND_SOFT } : undefined}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f6f5'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r" style={{ background: SG_BRAND }} />}
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? 'font-semibold text-slate-900' : muted ? 'text-slate-400' : 'font-medium text-slate-700'}`}>{label}</span>
      <span className="font-mono text-[11px] text-slate-400">{count}</span>
      {chevron && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
    </button>
  );
}
