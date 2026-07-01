'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, ChevronRight } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import type { SgDecompRow } from '@/app/actions/sourceguide';

type DimKey = 'spendType' | 'category' | 'subCategory' | 'family' | 'country' | 'tier' | 'supplier';
const DIMS: { key: DimKey; idx: number; label: string }[] = [
  { key: 'spendType', idx: 0, label: 'Spend Type' },
  { key: 'category', idx: 1, label: 'Category' },
  { key: 'subCategory', idx: 2, label: 'Sub-Category' },
  { key: 'family', idx: 3, label: 'Family' },
  { key: 'country', idx: 4, label: 'Country' },
  { key: 'tier', idx: 5, label: 'Tier' },
  { key: 'supplier', idx: 6, label: 'Supplier' },
];
const dimByKey = (k: DimKey) => DIMS.find(d => d.key === k)!;
type Measure = 'mappings' | 'commodities';
const MAX_NODES = 60;

export default function DecompositionClient({ rows }: { rows: SgDecompRow[] }) {
  const router = useRouter();
  const [measure, setMeasure] = useState<Measure>('mappings');
  const [levels, setLevels] = useState<{ key: DimKey; value: string | null }[]>([{ key: 'category', value: null }]);

  const measureOf = useMemo(() => {
    return (rs: SgDecompRow[]) => measure === 'mappings' ? rs.length : new Set(rs.map(r => r[7])).size;
  }, [measure]);

  const { cols, rootTotal } = useMemo(() => {
    const out: { dim: typeof DIMS[number]; value: string | null; entries: { value: string; measure: number }[]; max: number; parentTotal: number }[] = [];
    let subset = rows;
    for (let k = 0; k < levels.length; k++) {
      const dim = dimByKey(levels[k].key);
      const groups = new Map<string, SgDecompRow[]>();
      for (const r of subset) {
        const key = String(r[dim.idx] ?? '');
        const arr = groups.get(key);
        if (arr) arr.push(r); else groups.set(key, [r]);
      }
      const entries = [...groups.entries()]
        .map(([value, rws]) => ({ value, measure: measureOf(rws) }))
        .sort((a, b) => b.measure - a.measure || a.value.localeCompare(b.value));
      const sel = levels[k].value;
      out.push({ dim, value: sel, entries, max: entries[0]?.measure || 1, parentTotal: measureOf(subset) });
      subset = sel != null ? (groups.get(sel) ?? []) : [];
    }
    return { cols: out, rootTotal: measureOf(rows) };
  }, [rows, levels, measureOf]);

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
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>Explore</div>
          <h1 className="text-[30px] font-bold tracking-tight">Spend Taxonomy</h1>
          <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-slate-500">
            Decompose the sourcing data by any dimension. Click a node to drill in, then add another level to break it down further.
          </p>
        </div>
        <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
          {(['mappings', 'commodities'] as Measure[]).map(m => (
            <button key={m} onClick={() => setMeasure(m)}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold capitalize transition-colors"
              style={measure === m ? { background: SG_BRAND, color: '#fff' } : { color: '#58595B' }}>
              {m === 'mappings' ? 'Supplier mappings' : 'Commodities'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {/* Root */}
        <div className="shrink-0 self-start rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">All spend</div>
          <div className="w-[190px] px-4 py-3">
            <div className="text-[13px] font-semibold text-slate-800">Everything</div>
            <div className="mt-1.5 h-2 rounded-full" style={{ background: SG_BRAND }} />
            <div className="mt-1 font-mono text-[12px] text-slate-500">{rootTotal.toLocaleString()}</div>
          </div>
        </div>

        {cols.map((col, k) => (
          <Column key={k} col={col} onPick={(v) => pickNode(k, v)} onRemove={() => removeLevel(k)} />
        ))}

        {canAdd && <AddLevel dims={available} onAdd={addLevel} />}
      </div>

      <p className="mt-2 text-[11.5px] text-slate-400">
        Measure: <b className="text-slate-600">{measure === 'mappings' ? 'supplier mappings (count)' : 'distinct commodities'}</b>. Bars are relative to the largest node in each column. Columns cap at {MAX_NODES} nodes.
        {' '}Looking for the fixed Category → Commodity tree? <button onClick={() => router.push('/sourceguide/browse')} className="font-semibold hover:underline" style={{ color: SG_BRAND }}>Use Browse</button>.
      </p>
    </div>
  );
}

function Column({ col, onPick, onRemove }: {
  col: { dim: { label: string }; value: string | null; entries: { value: string; measure: number }[]; max: number };
  onPick: (v: string) => void;
  onRemove: () => void;
}) {
  const shown = col.entries.slice(0, MAX_NODES);
  return (
    <div className="shrink-0 self-start rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{col.dim.label}</span>
        <button onClick={onRemove} title="Remove level" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="max-h-[62vh] w-[260px] overflow-y-auto p-1.5">
        {shown.map(e => {
          const on = col.value === e.value;
          return (
            <button key={e.value} onClick={() => onPick(e.value)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? '' : 'hover:bg-slate-50'}`}
              style={on ? { background: SG_BRAND_SOFT } : undefined}>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] ${on ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{e.value}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${(e.measure / col.max) * 100}%`, background: on ? SG_BRAND : '#9CC7B0' }} />
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{e.measure.toLocaleString()}</span>
              </span>
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${on ? 'text-[#2A7E4F]' : 'text-slate-300'}`} />
            </button>
          );
        })}
        {col.entries.length > MAX_NODES && (
          <div className="px-2.5 py-2 text-[11px] text-slate-400">+{(col.entries.length - MAX_NODES).toLocaleString()} more — narrow with a level above</div>
        )}
        {col.entries.length === 0 && <div className="px-2.5 py-6 text-center text-[12px] text-slate-400">No data</div>}
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
        className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 transition-colors hover:border-[#6AAF8E] hover:text-[#2A7E4F]"
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
