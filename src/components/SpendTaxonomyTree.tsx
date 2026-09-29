'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SgTaxonomyCategory } from '@/lib/sourceguide/types';

/**
 * The four-level spend taxonomy, drawn once.
 *
 * Category, sub-category, family, commodity. It was written inside SourceGuide's browse page and
 * is now on the launcher too, so it lives here rather than in either: two copies of a tree this
 * fiddly drift into two trees, and the one people notice is whichever they saw second.
 *
 * `onSelectCommodity` is what differs between the two. SourceGuide sends a click to that
 * commodity's page; the standalone page passes nothing, because a reader who has not been granted
 * SourceGuide cannot open one, and a row that looks clickable and refuses is worse than a row that
 * never offered. Without it the leaf rows lose their pointer, their hover and their chevron.
 */
export default function SpendTaxonomyTree({
  tree,
  onSelectCommodity,
}: {
  tree: SgTaxonomyCategory[];
  onSelectCommodity?: (commodityId: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      {tree.map((cat, i) => (
        <CategoryNode
          key={cat.id}
          cat={cat}
          defaultOpen={i === 0}
          onSelectCommodity={onSelectCommodity}
        />
      ))}
      {!tree.length && (
        /* Said out loud rather than left as an empty card: "no commodities" and "the read failed"
           look identical otherwise, and only one of them is worth telling somebody about. */
        <div className="px-3.5 py-6 text-center text-[13px] text-slate-500">
          The commodity catalogue could not be read just now. Try again shortly.
        </div>
      )}
    </div>
  );
}

function CategoryNode({
  cat,
  defaultOpen,
  onSelectCommodity,
}: {
  cat: SgTaxonomyCategory;
  defaultOpen: boolean;
  onSelectCommodity?: (commodityId: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Row
        depth={0}
        label={cat.name}
        count={cat.count}
        open={open}
        onClick={() => setOpen((o) => !o)}
        bold
      />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {cat.subs.map((sub) => (
            <SubNode key={sub.name} sub={sub} onSelectCommodity={onSelectCommodity} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubNode({
  sub,
  onSelectCommodity,
}: {
  sub: SgTaxonomyCategory['subs'][number];
  onSelectCommodity?: (commodityId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Row
        depth={1}
        label={sub.name}
        count={sub.count}
        open={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {sub.families.map((fam) => (
            <FamilyNode key={fam.name} fam={fam} onSelectCommodity={onSelectCommodity} />
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyNode({
  fam,
  onSelectCommodity,
}: {
  fam: SgTaxonomyCategory['subs'][number]['families'][number];
  onSelectCommodity?: (commodityId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Row
        depth={2}
        label={fam.name}
        count={fam.items.length}
        open={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="ml-[18px] border-l border-slate-100 pl-2">
          {fam.items.map((item) => (
            <div
              key={item.id}
              onClick={onSelectCommodity ? () => onSelectCommodity(item.id) : undefined}
              className={`flex items-center gap-2.5 rounded-md px-3.5 py-2.5 ${
                onSelectCommodity ? 'cursor-pointer hover:bg-[#eaf4ef]' : ''
              }`}
            >
              <span className="w-4" />
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: '#6AAF8E' }}
              />
              <span className="flex-1 text-[13.5px] text-slate-700">{item.name}</span>
              <span className="font-mono text-[11.5px] text-slate-400">{item.countries}</span>
              {onSelectCommodity && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  depth,
  label,
  count,
  open,
  onClick,
  bold,
}: {
  depth: number;
  label: string;
  count: number;
  open: boolean;
  onClick: () => void;
  bold?: boolean;
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
      <span className={`flex-1 text-[14px] ${bold ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
      <span className="font-mono text-[11.5px] text-slate-400">{count}</span>
    </div>
  );
}

export { Row as TaxonomyRow };
