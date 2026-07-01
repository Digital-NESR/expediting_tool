'use client';

import { useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import type { SgTaxonomyRow } from '@/app/actions/sourceguide';

// Fixed hierarchy — the taxonomy always drills in this order.
const HIER = [
  { idx: 0, label: 'Spend Type' },
  { idx: 1, label: 'Category' },
  { idx: 2, label: 'Sub-Category' },
  { idx: 3, label: 'Family' },
  { idx: 4, label: 'Commodity' },
];
const MAX_NODES = 200;

export default function DecompositionClient({ rows }: { rows: SgTaxonomyRow[] }) {
  const router = useRouter();
  // path[k] = the chosen value at hierarchy level k
  const [path, setPath] = useState<string[]>([]);

  const cols = useMemo(() => {
    const out: { level: number; selected: string | null; entries: { value: string; count: number }[]; max: number }[] = [];
    let subset = rows;
    const nCols = Math.min(path.length + 1, HIER.length);
    for (let k = 0; k < nCols; k++) {
      const dim = HIER[k];
      const groups = new Map<string, number>();
      for (const r of subset) {
        const key = String(r[dim.idx] ?? '');
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const entries = [...groups.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      out.push({ level: k, selected: path[k] ?? null, entries, max: entries[0]?.count || 1 });
      if (path[k] != null) subset = subset.filter(r => String(r[dim.idx] ?? '') === path[k]);
    }
    return out;
  }, [rows, path]);

  // click a node: select it at its level and drop anything deeper (toggle to collapse)
  function pickNode(level: number, value: string) {
    setPath(prev => {
      const base = prev.slice(0, level);
      return prev[level] === value ? base : [...base, value];
    });
  }
  const jumpTo = (level: number) => setPath(prev => prev.slice(0, level));

  return (
    <div className="mx-auto w-full max-w-[1760px] px-6 py-8 lg:px-10">
      <div className="mb-4">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>Explore</div>
        <h1 className="text-[30px] font-bold tracking-tight">Spend Taxonomy</h1>
      </div>

      {/* Fixed hierarchy stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        {HIER.map((h, i) => {
          const reached = i <= path.length;
          const isFrontier = i === path.length;
          const val = path[i] ?? null;
          return (
            <Fragment key={h.label}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              <button
                onClick={() => reached && jumpTo(i)}
                disabled={!reached}
                className={`flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-left transition-colors ${reached ? 'hover:bg-slate-50' : 'opacity-40'}`}
                style={isFrontier ? { background: SG_BRAND_SOFT } : undefined}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={val || isFrontier ? { background: SG_BRAND, color: '#fff' } : { background: '#eef0ef', color: '#94a3b8' }}
                >{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight text-slate-700">{h.label}</span>
                  {val && <span className="block max-w-[180px] truncate text-[11.5px] leading-tight" style={{ color: SG_BRAND }}>{val}</span>}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map(col => (
          <Column key={col.level} col={col} onPick={(v) => pickNode(col.level, v)} />
        ))}
      </div>

      <p className="mt-2 text-[11.5px] text-slate-400">
        Base taxonomy only: no supplier, country or mapping data here. Click a node to drill to the next level; use the numbered path above to jump back.
        {' '}Looking for suppliers for a commodity? <button onClick={() => router.push('/sourceguide/search')} className="font-semibold hover:underline" style={{ color: SG_BRAND }}>Search</button>.
      </p>
    </div>
  );
}

function Column({ col, onPick }: {
  col: { level: number; selected: string | null; entries: { value: string; count: number }[]; max: number };
  onPick: (v: string) => void;
}) {
  const shown = col.entries.slice(0, MAX_NODES);
  const isLeaf = col.level === HIER.length - 1;
  return (
    <div className="flex max-h-[72vh] shrink-0 flex-col self-start rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span className="mr-1 text-slate-300">{col.level + 1}</span>{HIER[col.level].label}
        </span>
        <span className="font-mono text-[10px] text-slate-300">{col.entries.length}</span>
      </div>
      <div className="w-[248px] overflow-y-auto py-1">
        {shown.map(e => {
          const on = col.selected === e.value;
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
              {!isLeaf && <ChevronRight className={`h-3 w-3 shrink-0 ${on ? 'text-[#2A7E4F]' : 'text-slate-200'}`} />}
            </button>
          );
        })}
        {col.entries.length > MAX_NODES && (
          <div className="px-3 py-1.5 text-[11px] text-slate-400">+{(col.entries.length - MAX_NODES).toLocaleString()} more</div>
        )}
      </div>
    </div>
  );
}
