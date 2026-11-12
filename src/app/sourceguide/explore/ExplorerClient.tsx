'use client';

/**
 * Drill the catalogue and see the suppliers underneath wherever you stop.
 *
 * The screen SourceGuide did not have. `/browse` and `/taxonomy` both show the tree and neither
 * names or counts a single supplier, so the only way to reach one was to land on exactly the
 * right leaf out of 1,214. Here every node carries its subtree's distinct supplier count, and
 * selecting any node — a spend type, a category, a family, a leaf — lists them.
 *
 * Everything after the initial load is a fold in this component: `buildTree` over 1,214
 * commodities and 10,976 mappings costs a few milliseconds, so changing country or tier is
 * instant rather than a round trip.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Compass,
  CornerDownRight,
  Package,
  Search,
  X,
} from 'lucide-react';
import {
  buildTree,
  findNode,
  suppliersUnder,
  type RolledSupplier,
  type TierFilter,
  type TreeNode,
} from '@/lib/sourceguide/rollup';
import type { SgExplorerDataset } from '@/app/actions/sourceguide/explore';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import { useCountryScope } from '../CountryScope';
import { BlockedBadge, PathTrail, SupAvatar, TierBadge } from '../ui';

const TIERS: { id: TierFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'preferred', label: 'Preferred' },
  { id: 'backup', label: 'Backup' },
];

export default function ExplorerClient({ data }: { data: SgExplorerDataset }) {
  const { country, current, withCountry } = useCountryScope();
  const [tier, setTier] = useState<TierFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [treeQuery, setTreeQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');

  const scope = useMemo(() => ({ country, tier }), [country, tier]);

  /* The country's name when it is known, otherwise its code. Falling back to "all countries"
     when only the name is missing would caption a scoped list as an unscoped one — the counts
     would be Oman's and the sentence would say they were everyone's. */
  const scopeLabel = current?.name ?? country;

  /* Unpacked once, then folded by everything below. See `PackedFact` for why they arrive as
     tuples rather than objects. */
  const facts = useMemo(
    () =>
      data.facts.map((f) => ({
        commodityId: f[0],
        country: f[1],
        supplier: f[2],
        preferred: f[3] === 1,
      })),
    [data.facts],
  );

  const tree = useMemo(
    () => buildTree(data.commodities, facts, scope),
    [data.commodities, facts, scope],
  );

  const selected = useMemo(
    () => (selectedKey ? findNode(tree, selectedKey) : null),
    [tree, selectedKey],
  );

  const suppliers = useMemo(
    () =>
      selected ? suppliersUnder(selected, data.commodities, facts, data.suppliers, scope) : [],
    [selected, data, facts, scope],
  );

  const shownSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [suppliers, supplierQuery]);

  /* Tree search is matched against this tree rather than through `searchTaxonomy`: that helper
     builds its own paths from the raw rows, and a hit it returned for a path this tree does not
     render would be a jump to nowhere. Fifteen lines here keep the two in step by construction. */
  const hits = useMemo(() => {
    const q = treeQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: TreeNode[] = [];
    const walk = (n: TreeNode) => {
      if (n.label.toLowerCase().includes(q)) out.push(n);
      for (const c of n.children) walk(c);
    };
    for (const r of tree) walk(r);
    return out
      .sort(
        (a, b) =>
          Number(a.label.toLowerCase().startsWith(q)) * -1 -
            Number(b.label.toLowerCase().startsWith(q)) * -1 ||
          b.supplierCount - a.supplierCount ||
          a.label.localeCompare(b.label),
      )
      .slice(0, 12);
  }, [tree, treeQuery]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Select a node and open every ancestor, so a search hit lands somewhere visible. */
  function reveal(node: TreeNode) {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let i = 1; i <= node.path.length; i++) next.add(node.path.slice(0, i).join('\u001f'));
      return next;
    });
    setSelectedKey(node.key);
    setSupplierQuery('');
  }

  const totalSuppliers = useMemo(
    () =>
      new Set(facts.filter((f) => !country || f.country === country).map((f) => f.supplier)).size,
    [facts, country],
  );

  if (!data.commodities.length) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Explore</h1>
        <p className="mt-2 text-[14px] text-slate-500">
          The sourcing catalogue could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
      {/* ── heading ─────────────────────────────────────────── */}
      <div className="mb-5">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: SG_BRAND }}
        >
          <Compass className="h-3.5 w-3.5" />
          Explore
        </div>
        <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-slate-900">
          Drill down to what you are buying, and see who is approved for it.
        </h1>
        <p className="mt-1 text-[13.5px] text-slate-500">
          Stop at any level — a whole category or one commodity — and the suppliers underneath it
          are listed. {totalSuppliers.toLocaleString()} suppliers are mapped
          {scopeLabel ? ` in ${scopeLabel}` : ' across all countries'}.
        </p>
      </div>

      {/* ── controls ────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={treeQuery}
            onChange={(e) => setTreeQuery(e.target.value)}
            placeholder="Jump to a category, family or commodity…"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-9 text-[13.5px] outline-none transition-colors focus:border-[#6AAF8E]"
          />
          {treeQuery && (
            <button
              onClick={() => setTreeQuery('')}
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              style={tier === t.id ? { background: SG_BRAND, color: '#fff' } : { color: '#64748b' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── search hits ─────────────────────────────────────── */}
      {hits.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {hits.map((h) => (
            <button
              key={h.key}
              onClick={() => {
                reveal(h);
                setTreeQuery('');
              }}
              className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50"
            >
              <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-slate-800">
                  {h.label}
                </span>
                <span className="block truncate text-[11.5px] text-slate-400">
                  {h.path.slice(0, -1).join(' › ')}
                </span>
              </span>
              <Count node={h} />
            </button>
          ))}
        </div>
      )}

      {/* ── tree + panel ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
          {tree.map((n) => (
            <Branch
              key={n.key}
              node={n}
              depth={0}
              expanded={expanded}
              selectedKey={selectedKey}
              onToggle={toggle}
              onSelect={(node) => {
                setSelectedKey(node.key);
                setSupplierQuery('');
              }}
            />
          ))}
        </div>

        <Panel
          node={selected}
          tree={tree}
          suppliers={shownSuppliers}
          totalSuppliers={suppliers.length}
          query={supplierQuery}
          onQuery={setSupplierQuery}
          onSelect={reveal}
          withCountry={withCountry}
          canManage={data.canManage}
          countryName={scopeLabel}
        />
      </div>
    </div>
  );
}

/* ─── the tree ───────────────────────────────────────────────── */

function Count({ node }: { node: TreeNode }) {
  const none = node.supplierCount === 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold"
        style={
          none
            ? { background: '#f1f5f9', color: '#94a3b8' }
            : { background: SG_BRAND_SOFT, color: SG_BRAND }
        }
        title={
          none
            ? 'No supplier is mapped here in this scope'
            : `${node.supplierCount} suppliers approved for something in here`
        }
      >
        {node.supplierCount}
      </span>
      <span
        className="hidden font-mono text-[11px] text-slate-400 sm:inline"
        title={`${node.commodityCount} commodities`}
      >
        {node.commodityCount}
      </span>
    </span>
  );
}

function Branch({
  node,
  depth,
  expanded,
  selectedKey,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selectedKey: string | null;
  onToggle: (key: string) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const open = expanded.has(node.key);
  const isSelected = selectedKey === node.key;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-lg transition-colors hover:bg-slate-50"
        style={{
          paddingLeft: depth * 14,
          ...(isSelected ? { background: SG_BRAND_SOFT } : {}),
        }}
      >
        <button
          onClick={() => hasChildren && onToggle(node.key)}
          aria-label={hasChildren ? (open ? 'Collapse' : 'Expand') : undefined}
          className="grid h-6 w-6 shrink-0 place-items-center text-slate-400"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <Package className="h-3 w-3 text-slate-300" />
          )}
        </button>

        <button
          onClick={() => onSelect(node)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
        >
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'
            } ${node.supplierCount === 0 ? 'opacity-55' : ''}`}
          >
            {node.label}
          </span>
          <Count node={node} />
        </button>
      </div>

      {open &&
        node.children.map((c) => (
          <Branch
            key={c.key}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            selectedKey={selectedKey}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

/* ─── the panel ──────────────────────────────────────────────── */

function Panel({
  node,
  tree,
  suppliers,
  totalSuppliers,
  query,
  onQuery,
  onSelect,
  withCountry,
  canManage,
  countryName,
}: {
  node: TreeNode | null;
  tree: TreeNode[];
  suppliers: RolledSupplier[];
  totalSuppliers: number;
  query: string;
  onQuery: (v: string) => void;
  onSelect: (node: TreeNode) => void;
  withCountry: (href: string) => string;
  canManage: boolean;
  countryName: string | null;
}) {
  if (!node) {
    /* Nothing selected yet, so the panel is the starting point rather than a blank slab: the
       categories with the supplier counts that are the reason to open this screen at all. */
    const categories = tree.flatMap((t) => t.children);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Start anywhere
        </div>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          Pick a category below, or open any level on the left. The number beside a node is how many
          suppliers are approved for something inside it.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {categories
            .slice()
            .sort((a, b) => b.supplierCount - a.supplierCount)
            .map((c) => (
              <button
                key={c.key}
                onClick={() => onSelect(c)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-[#6AAF8E]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-slate-800">
                    {c.label}
                  </span>
                  <span className="block text-[11.5px] text-slate-400">{c.path[0]}</span>
                </span>
                <Count node={c} />
              </button>
            ))}
        </div>
      </div>
    );
  }

  const leafId = node.commodityId;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <PathTrail
        path={node.path}
        onCrumb={(i) => {
          const ancestor = findNode(tree, node.path.slice(0, i + 1).join('\u001f'));
          if (ancestor) onSelect(ancestor);
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-bold tracking-tight text-slate-900">{node.label}</h2>
        {leafId !== null && (
          <Link
            href={withCountry(`/sourceguide/commodity/${leafId}`)}
            className="text-[12.5px] font-semibold hover:underline"
            style={{ color: SG_BRAND }}
          >
            Open commodity detail →
          </Link>
        )}
      </div>

      {/*
        "approved for something in" rather than "approved for". A supplier approved on a
        catch-all node is approved for that sub-category generally; one approved on a specific
        commodity is not. The list below says which commodity put each supplier here, and this
        heading has to make the same claim the list can support — no more.
      */}
      <p className="mt-1 text-[13.5px] text-slate-500">
        <strong className="font-semibold text-slate-800">{node.supplierCount}</strong>{' '}
        {node.supplierCount === 1 ? 'supplier is' : 'suppliers are'} approved for something in here,
        across {node.commodityCount} {node.commodityCount === 1 ? 'commodity' : 'commodities'}
        {countryName ? ` in ${countryName}` : ''}.
        {node.preferredCount > 0 && (
          <span className="text-slate-400"> {node.preferredCount} of them Preferred.</span>
        )}
      </p>

      {totalSuppliers > 8 && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={`Filter these ${totalSuppliers} suppliers by name or vendor code…`}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-[#6AAF8E]"
          />
        </div>
      )}

      {suppliers.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <Building2 className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-[13.5px] text-slate-500">
            {totalSuppliers === 0
              ? `No supplier is mapped here${countryName ? ` in ${countryName}` : ''} yet.`
              : 'No supplier here matches that filter.'}
          </p>
          {totalSuppliers === 0 && canManage && (
            <Link
              href={withCountry('/sourceguide/mappings')}
              className="mt-2 inline-block text-[12.5px] font-semibold hover:underline"
              style={{ color: SG_BRAND }}
            >
              Map a supplier here →
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {suppliers.map((s) => (
            <SupplierRow key={s.code} supplier={s} withCountry={withCountry} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierRow({
  supplier,
  withCountry,
}: {
  supplier: RolledSupplier;
  withCountry: (href: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? supplier.viaCommodities : supplier.viaCommodities.slice(0, 3);
  const hidden = supplier.viaCommodities.length - shown.length;

  return (
    <div className="rounded-xl border border-slate-200 p-3 transition-colors hover:border-[#6AAF8E]">
      <div className="flex items-start gap-3">
        <SupAvatar name={supplier.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={withCountry(`/sourceguide/suppliers/${encodeURIComponent(supplier.code)}`)}
              className="truncate text-[14px] font-semibold text-slate-900 hover:underline"
            >
              {supplier.name}
            </Link>
            <TierBadge tier={supplier.preferred ? 'Preferred' : 'Backup'} />
            {supplier.blocked && <BlockedBadge compact />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-400">
            <span className="font-mono">{supplier.code}</span>
            <span>{supplier.countries.join(' · ')}</span>
          </div>

          {/* Why this supplier is in the list. Never omitted — see the note in `rollup.ts`. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {shown.map((v) => (
              <Link
                key={v.id}
                href={withCountry(`/sourceguide/commodity/${v.id}`)}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-[#6AAF8E]"
                style={
                  v.preferred ? { background: SG_BRAND_SOFT, borderColor: '#cfe6d9' } : undefined
                }
              >
                {v.label}
              </Link>
            ))}
            {hidden > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
              >
                +{hidden} more
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
