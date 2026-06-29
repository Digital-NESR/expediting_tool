'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { SG_BRAND } from '../constants';
import type { SgTaxonomyCategory } from '@/app/actions/sourceguide';

export default function BrowseClient({ tree, countryCount }: { tree: SgTaxonomyCategory[]; countryCount: number }) {
  return (
    <div className="mx-auto max-w-[980px] px-6 py-8 lg:px-8">
      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>
          Taxonomy
        </div>
        <h1 className="text-[30px] font-bold tracking-tight">Browse the sourcing catalogue</h1>
        <p className="mt-2 max-w-[580px] text-[15px] leading-relaxed text-slate-500">
          Drill through the four-level hierarchy (Category → Sub-Category → Family → Commodity) to discover
          sourcing options across all {countryCount} country guides.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {tree.map((cat, i) => (
          <CategoryNode key={cat.id} cat={cat} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

function CategoryNode({ cat, defaultOpen }: { cat: SgTaxonomyCategory; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Row depth={0} label={cat.name} count={cat.count} open={open} onClick={() => setOpen(o => !o)} bold />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {cat.subs.map(sub => <SubNode key={sub.name} sub={sub} />)}
        </div>
      )}
    </div>
  );
}

function SubNode({ sub }: { sub: SgTaxonomyCategory['subs'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Row depth={1} label={sub.name} count={sub.count} open={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {sub.families.map(fam => <FamilyNode key={fam.name} fam={fam} />)}
        </div>
      )}
    </div>
  );
}

function FamilyNode({ fam }: { fam: SgTaxonomyCategory['subs'][number]['families'][number] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div>
      <Row depth={2} label={fam.name} count={fam.items.length} open={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {fam.items.map(item => (
            <div
              key={item.id}
              onClick={() => router.push(`/sourceguide/commodity/${item.id}`)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3.5 py-2.5 hover:bg-[#eaf4ef]"
            >
              <span className="w-4" />
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: '#6AAF8E' }} />
              <span className="flex-1 text-[13.5px] text-slate-700">{item.name}</span>
              <span className="font-mono text-[11.5px] text-slate-400">{item.countries}</span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  depth, label, count, open, onClick, bold,
}: {
  depth: number; label: string; count: number; open: boolean; onClick: () => void; bold?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-3.5 py-2.5 hover:bg-[#eaf4ef]"
    >
      <ChevronRight
        className="h-3.5 w-3.5 text-slate-400 transition-transform"
        style={{ transform: open ? 'rotate(90deg)' : 'none' }}
      />
      <span className={`flex-1 text-[14px] ${bold ? 'font-semibold' : depth === 1 ? 'font-medium' : 'font-medium'}`}>{label}</span>
      <span className="font-mono text-[11.5px] text-slate-400">{count}</span>
    </div>
  );
}
