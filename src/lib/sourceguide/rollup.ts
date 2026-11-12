/**
 * How many suppliers sit under a taxonomy node, and which ones.
 *
 * Nothing in SourceGuide could answer that before this module. Every node figure in the tool --
 * `getTaxonomy`, `getCategories`, `searchTaxonomy().count`, `tallyBy` -- counts commodities, so
 * the only way to reach a supplier was to land on exactly the right leaf out of 1,214. The tree
 * showed the catalogue and never the thing a buyer came for.
 *
 * Pure, and deliberately not a server module: it is the same fold on the server and in the
 * browser, it needs no database, and it can be unit-tested against hand-built rows. The whole
 * relation is 10,976 active mappings, so a fold over the lot costs less than one round trip and
 * every filter tick stays instant -- the lesson the travel board already paid for.
 *
 * THE RULE THIS MODULE EXISTS TO KEEP. A supplier approved on a catch-all node is approved for
 * that sub-category generally; one approved on a specific commodity is not (see
 * `taxonomy-levels.ts` and the note above `getCommodityDetail`). So a rollup may say "these
 * suppliers are approved for SOMETHING inside this node" and may never say "these suppliers are
 * approved for this node". That is why every row returned by `suppliersUnder` carries the
 * commodities that put it there, and why it is a type-level guarantee rather than a convention
 * the UI is trusted to honour: `viaCommodities` is non-optional and is never empty.
 */

import { familyLabel, commodityLabel } from './taxonomy-levels';

/* ─── inputs ─────────────────────────────────────────────────── */

/**
 * A commodity, carrying only what the tree needs. Description and keywords are the bulk of the
 * stored row and nothing here reads them, so callers trim before sending this to a browser.
 */
export interface RollupCommodity {
  id: number;
  name: string;
  code: string | null;
  category: string;
  subCategory: string | null;
  family: string | null;
  spendType: string;
}

/**
 * One active mapping. Mirrors `MappingFact` in `indexes.ts`, restated here so this module
 * imports nothing that opens a database pool.
 */
export interface RollupFact {
  commodityId: number;
  country: string;
  supplier: string;
  preferred: boolean;
}

export interface RollupSupplier {
  code: string;
  name: string;
  blocked: boolean;
}

export type TierFilter = 'all' | 'preferred' | 'backup';

export interface RollupScope {
  /** A country code, or null/undefined for every country. */
  country?: string | null;
  tier?: TierFilter;
}

/* ─── the tree ───────────────────────────────────────────────── */

export type Level = 'spendType' | 'category' | 'subCategory' | 'family' | 'commodity';

export const LEVELS: readonly Level[] = [
  'spendType',
  'category',
  'subCategory',
  'family',
  'commodity',
] as const;

export const LEVEL_LABELS: Record<Level, string> = {
  spendType: 'Spend Type',
  category: 'Category',
  subCategory: 'Sub-Category',
  family: 'Family',
  commodity: 'Commodity',
};

export interface TreeNode {
  /** The full path joined -- the node's identity. Never the label; see `nodeKey`. */
  key: string;
  level: Level;
  label: string;
  path: string[];
  /** Set only on a commodity leaf. */
  commodityId: number | null;
  /** Commodities in this subtree, leaf included. */
  commodityCount: number;
  /** DISTINCT suppliers mapped to anything in this subtree, within the scope. */
  supplierCount: number;
  /** Of those, the ones Preferred on at least one commodity in the subtree. */
  preferredCount: number;
  children: TreeNode[];
}

/**
 * Paths are keyed whole, never by label.
 *
 * Ten commodity names occur in more than one branch, and sub-categories and families repeat
 * across categories -- `General` alone appears under nearly every sub-category. Keying on the
 * label would silently merge two unrelated nodes and report the union of their suppliers.
 * `searchTaxonomy` already keys by whole path for exactly this reason.
 *
 * The separator is a unit separator rather than a visible character, so a label that happens to
 * contain the separator cannot forge a key belonging to a different node.
 */
export const PATH_SEP = '\u001f';

export function nodeKey(path: readonly string[]): string {
  return path.join(PATH_SEP);
}

/**
 * The five labels for a commodity, each level rendered the way the rest of the tool renders it:
 * a blank sub-category and a blank-or-parent-repeating family both read `General`, and a
 * catch-all commodity reads `General` too.
 */
export function commodityPath(c: RollupCommodity): string[] {
  const sub = (c.subCategory ?? '').trim() || 'General';
  const name = (c.name ?? '').trim();
  return [
    (c.spendType ?? '').trim() || 'Unclassified',
    (c.category ?? '').trim() || 'Unclassified',
    sub,
    familyLabel(c.family, c.subCategory) || 'General',
    commodityLabel(name, c.subCategory) || name,
  ];
}

/** Does this mapping count, given the country and tier the reader has chosen? */
export function inScope(f: RollupFact, scope: RollupScope): boolean {
  if (scope.country && f.country !== scope.country) return false;
  const tier = scope.tier ?? 'all';
  if (tier === 'preferred' && !f.preferred) return false;
  if (tier === 'backup' && f.preferred) return false;
  return true;
}

interface Building {
  node: TreeNode;
  suppliers: Set<string>;
  preferred: Set<string>;
  children: Map<string, Building>;
}

function blank(level: Level, label: string, path: string[]): Building {
  return {
    node: {
      key: nodeKey(path),
      level,
      label,
      path,
      commodityId: null,
      commodityCount: 0,
      supplierCount: 0,
      preferredCount: 0,
      children: [],
    },
    suppliers: new Set(),
    preferred: new Set(),
    children: new Map(),
  };
}

function byLabel(a: TreeNode, b: TreeNode): number {
  return a.label.localeCompare(b.label);
}

/**
 * The whole tree, every node carrying its subtree's distinct supplier count.
 *
 * Suppliers are accumulated into a Set at each level rather than summed upward, because a
 * supplier mapped to four commodities in one category is one supplier, not four. Summing is the
 * obvious implementation and it is wrong: across all countries it reports 1,114 suppliers for a
 * category that holds 422.
 */
export function buildTree(
  commodities: readonly RollupCommodity[],
  facts: readonly RollupFact[],
  scope: RollupScope = {},
): TreeNode[] {
  const byCommodity = new Map<number, RollupFact[]>();
  for (const f of facts) {
    if (!inScope(f, scope)) continue;
    const list = byCommodity.get(f.commodityId);
    if (list) list.push(f);
    else byCommodity.set(f.commodityId, [f]);
  }

  const roots = new Map<string, Building>();

  for (const c of commodities) {
    const path = commodityPath(c);
    const mapped = byCommodity.get(c.id) ?? [];

    let level = roots;
    const chain: Building[] = [];
    for (let depth = 0; depth < path.length; depth++) {
      const label = path[depth];
      let b = level.get(label);
      if (!b) {
        b = blank(LEVELS[depth], label, path.slice(0, depth + 1));
        level.set(label, b);
      }
      chain.push(b);
      level = b.children;
    }

    chain[chain.length - 1].node.commodityId = c.id;

    for (const b of chain) {
      b.node.commodityCount += 1;
      for (const f of mapped) {
        b.suppliers.add(f.supplier);
        if (f.preferred) b.preferred.add(f.supplier);
      }
    }
  }

  const finish = (b: Building): TreeNode => {
    b.node.supplierCount = b.suppliers.size;
    b.node.preferredCount = b.preferred.size;
    b.node.children = [...b.children.values()].map(finish).sort(byLabel);
    return b.node;
  };

  return [...roots.values()].map(finish).sort(byLabel);
}

/** Depth-first lookup by key. The tree is about 1,700 nodes, so a walk is cheaper than an index. */
export function findNode(roots: readonly TreeNode[], key: string): TreeNode | null {
  for (const n of roots) {
    if (n.key === key) return n;
    const hit = findNode(n.children, key);
    if (hit) return hit;
  }
  return null;
}

/** Every commodity id in a subtree, leaf included. */
export function commodityIdsUnder(node: TreeNode): number[] {
  const out: number[] = [];
  const walk = (n: TreeNode) => {
    if (n.commodityId !== null) out.push(n.commodityId);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

/* ─── the supplier list ──────────────────────────────────────── */

export interface RolledSupplier {
  code: string;
  name: string;
  blocked: boolean;
  /** Preferred on at least one commodity in this subtree. */
  preferred: boolean;
  /** Why this supplier is in the list. Never empty -- see the note at the top of this file. */
  viaCommodities: { id: number; label: string; preferred: boolean }[];
  countries: string[];
}

/**
 * The suppliers approved for something under this node.
 *
 * Sorted the way a buyer reads it: Preferred first, then whoever covers most of the subtree,
 * then alphabetically so the order is stable between renders. Centrally blocked suppliers sink
 * to the bottom whatever their tier -- ten of them are still mapped and twenty-six of those
 * mappings are Preferred, so without this a blocked vendor leads the list for its node.
 */
export function suppliersUnder(
  node: TreeNode,
  commodities: readonly RollupCommodity[],
  facts: readonly RollupFact[],
  suppliers: readonly RollupSupplier[],
  scope: RollupScope = {},
): RolledSupplier[] {
  const wanted = new Set(commodityIdsUnder(node));
  if (!wanted.size) return [];

  const labels = new Map<number, string>();
  for (const c of commodities) {
    if (!wanted.has(c.id)) continue;
    const name = (c.name ?? '').trim();
    labels.set(c.id, commodityLabel(name, c.subCategory) || name);
  }

  const meta = new Map(suppliers.map((s) => [s.code, s]));
  const acc = new Map<string, RolledSupplier>();

  for (const f of facts) {
    if (!wanted.has(f.commodityId)) continue;
    if (!inScope(f, scope)) continue;

    let row = acc.get(f.supplier);
    if (!row) {
      const m = meta.get(f.supplier);
      row = {
        code: f.supplier,
        name: m?.name ?? f.supplier,
        blocked: m?.blocked ?? false,
        preferred: false,
        viaCommodities: [],
        countries: [],
      };
      acc.set(f.supplier, row);
    }

    if (f.preferred) row.preferred = true;
    if (!row.countries.includes(f.country)) row.countries.push(f.country);

    /* One entry per commodity, not per mapping: the same supplier approved for one commodity in
       four countries is approved for one commodity. Promoted to Preferred if any country in
       scope says so, which is what the tier badge on the row then means. */
    const seen = row.viaCommodities.find((v) => v.id === f.commodityId);
    if (seen) seen.preferred = seen.preferred || f.preferred;
    else
      row.viaCommodities.push({
        id: f.commodityId,
        label: labels.get(f.commodityId) ?? String(f.commodityId),
        preferred: f.preferred,
      });
  }

  const out = [...acc.values()];
  for (const r of out) {
    r.countries.sort();
    r.viaCommodities.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out.sort(
    (a, b) =>
      Number(a.blocked) - Number(b.blocked) ||
      Number(b.preferred) - Number(a.preferred) ||
      b.viaCommodities.length - a.viaCommodities.length ||
      a.name.localeCompare(b.name),
  );
}
