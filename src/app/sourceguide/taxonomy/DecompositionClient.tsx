'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, ChevronRight } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import type { SgTaxonomyRow } from '@/app/actions/sourceguide';

type DimKey = 'spendType' | 'category' | 'subCategory' | 'family' | 'commodity';
const DIMS: { key: DimKey; idx: number; label: string }[] = [
  { key: 'spendType', idx: 0, label: 'Spend Type' },
  { key: 'category', idx: 1, label: 'Category' },
  { key: 'subCategory', idx: 2, label: 'Sub-Category' },
  { key: 'family', idx: 3, label: 'Family' },
  { key: 'commodity', idx: 4, label: 'Commodity' },
];
const dimByKey = (k: DimKey) => DIMS.find(d => d.key === k)!;
const MAX_NODES = 200;

export default function DecompositionClient({ rows }: { rows: SgTaxonomyRow[] }) {
  const router = useRouter();
  const [levels, setLevels] = useState<{ key: DimKey; value: string | null }[]>([{ key: 'category', value: null }]);

  const { cols, rootTotal } = useMemo(() => {
    const out: { dim: typeof DIMS[number]; value: string | null; entries: { value: string; count: number }[]; max: number }[] = [];
    let subset = rows;
    for (let k = 0; k < levels.length; k++) {
      const dim = dimByKey(levels[k].key);
      const groups = new Map<string, number>();
      for (const r of subset) {
        const key = String(r[dim.idx] ?? '');
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const entries = [...groups.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      out.push({ dim, value: levels[k].value, entries, max: entries[0]?.count || 1 });
      const sel = levels[k].value;
      subset = sel != null ? subset.filter(r => String(r[dim.idx] ?? '') === sel) : [];
    }
    return { cols: out, rootTotal: rows.length };
  }, [rows, levels]);

  const usedKeys = levels.map(l => l.key);
  const available = DIMS.filter(d => !usedKeys.includes(d.key));
  const canAdd = available.length > 0 && (levels.length === 0 || levels[levels.length - 1].value != null);

  function pickNode(k: number, value: string) {
    setLevels(prev => {
      const next = prev.slice(0, k + 1);
      next[k] = { ...next[k], value: next[k].value === value ? null : value };
      return next;
    });
  }
  const removeLevel = (k: number) => setLevels(prev => prev.slice(0, k));
  const addLevel = (key: DimKey) => setLevels(prev => [...prev, { key, value: null }]);

  return (
    <div className="mx-auto w-full max-w-[1760px] px-6 py-8 lg:px-10">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>Explore</div>
        <h1 className="text-[30px] font-bold tracking-tight">Spend Taxonomy</h1>
        <p className="mt-2 max-w-[720px] text-[15px] leading-relaxed text-slate-500">
          The organisation&apos;s full sourcing taxonomy. Break down by any level — Spend Type, Category, Sub-Category, Family, Commodity —
          click a node to drill in, then add another level. Numbers are commodity counts.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {/* Root */}
        <div className="shrink-0 self-start rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">All</div>
          <div className="w-[150px] px-3 py-2.5">
            <div className="text-[12.5px] font-semibold text-slate-800">Everything</div>
            <div className="mt-1.5 h-1.5 rounded-full" style={{ background: SG_BRAND }} />
            <div className="mt-1 font-mono text-[11px] text-slate-500">{rootTotal.toLocaleString()} commodities</div>
          </div>
        </div>

        {cols.map((col, k) => (
          <Column key={k} col={col} onPick={(v) => pickNode(k, v)} onRemove={() => removeLevel(k)} />
        ))}

        {canAdd && <AddLevel dims={available} onAdd={addLevel} />}
      </div>

      <p className="mt-2 text-[11.5px] text-slate-400">
        Base taxonomy only — no supplier, country or mapping data here. Bars are relative to the largest node in each column.
        {' '}Looking for suppliers for a commodity? <button onClick={() => router.push('/sourceguide/search')} className="font-semibold hover:underline" style={{ color: SG_BRAND }}>Search</button>.
      </p>
    </div>
  );
}

function Column({ col, onPick, onRemove }: {
  col: { dim: { label: string }; value: string | null; entries: { value: string; count: number }[]; max: number };
  onPick: (v: string) => void;
  onRemove: () => void;
}) {
  const shown = col.entries.slice(0, MAX_NODES);
  return (
    <div className="flex max-h-[74vh] shrink-0 flex-col self-start rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{col.dim.label}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate-300">{col.entries.length}</span>
          <button onClick={onRemove} title="Remove level" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      <div className="w-[248px] overflow-y-auto py-1">
        {shown.map(e => {
          const on = col.value === e.value;
          return (
            <button key={e.value} onClick={() => onPick(e.value)}
              className={`flex w-full items-center gap-2 px-3 py-1 text-left transition-colors ${on ? '' : 'hover:bg-slate-50'}`}
              style={on ? { background: SG_BRAND_SOFT } : undefined}>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[12.5px] leading-tight ${on ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{e.value}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{e.count.toLocaleString()}</span>
                </span>
                <span className="mt-0.5 block h-[3px] overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${(e.count / col.max) * 100}%`, background: on ? SG_BRAND : '#9CC7B0' }} />
                </span>
              </span>
              <ChevronRight className={`h-3 w-3 shrink-0 ${on ? 'text-[#2A7E4F]' : 'text-slate-200'}`} />
            </button>
          );
        })}
        {col.entries.length > MAX_NODES && (
          <div className="px-3 py-1.5 text-[11px] text-slate-400">+{(col.entries.length - MAX_NODES).toLocaleString()} more</div>
        )}
        {col.entries.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-slate-400">No data</div>}
      </div>
    </div>
  );
}

function AddLevel({ dims, onAdd }: { dims: { key: DimKey; label: string }[]; onAdd: (k: DimKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div ref={ref} className="relative shrink-0 self-start">
      <button onClick={() => setOpen(o => !o)}
        className="flex h-[44px] w-[44px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400 transition-colors hover:border-[#6AAF8E] hover:text-[#2A7E4F]"
        title="Break down by…">
        <Plus className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          <div className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Break down by</div>
          {dims.map(d => (
            <button key={d.key} onClick={() => { onAdd(d.key); setOpen(false); }}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-[#eaf4ef]">{d.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
