import type { SgTaxonomyRow } from './types';

/**
 * Finding a node anywhere in the spend taxonomy.
 *
 * Pure and free of React, so the matching and the ranking can be checked without a browser. They
 * are the part with judgement in them; drawing a dropdown is not.
 *
 * The taxonomy is 1,221 rows of five levels, and a reader usually knows one word of what they are
 * buying and nothing about where it sits. Drilling Spend Type to Category to Sub-Category to
 * Family to find "Shaped Charges" means guessing four times before the guess that counts.
 */

/** The five levels, in the order the screen drills them. */
export const LEVEL_LABELS = [
  'Spend Type',
  'Category',
  'Sub-Category',
  'Family',
  'Commodity',
] as const;

export interface TaxonomyHit {
  /** 0 = Spend Type … 4 = Commodity. */
  level: number;
  /** The value that matched, as it appears at that level. */
  value: string;
  /**
   * Every level from the top down to and including this one.
   *
   * This IS the answer: handing it to the drill-down opens each column to the right value. A value
   * alone would not be enough, because the same name recurs under different parents.
   */
  path: string[];
  /** Commodities sitting under this node. What the reader is choosing between. */
  count: number;
}

const norm = (value: unknown) => String(value ?? '').trim();

/**
 * Rank a hit against the typed text.
 *
 * Lower is better. An exact name beats a prefix, a prefix beats a word start, and a word start
 * beats a match buried mid-word: somebody typing "cement" wants Cement before Reinforced Cementing
 * Accessories. Depth breaks ties towards the commodity, because that is what people search for; a
 * bigger node wins only between nodes at the same depth with the same quality of match.
 */
function score(value: string, query: string, level: number): number {
  const v = value.toLowerCase();
  if (v === query) return 0;
  if (v.startsWith(query)) return 1;
  // A new word beginning with the query: "sand" finding "Natural Sand". Split rather than
  // matched with a built regular expression, so a query carrying regex punctuation cannot throw.
  if (v.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2;
  return 3;
}

/**
 * Every node whose name contains the query, deepest and closest match first.
 *
 * A node is a distinct PATH, not a distinct name. "General" is a family under a dozen
 * sub-categories and each is a different place to land, so each is its own hit, told apart on
 * screen by the trail above it.
 */
export function searchTaxonomy(
  rows: SgTaxonomyRow[],
  query: string,
  limit = 40,
): TaxonomyHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  // Keyed by the whole path, so two nodes sharing a name stay two nodes.
  const found = new Map<string, TaxonomyHit>();
  for (const row of rows) {
    for (let level = 0; level < LEVEL_LABELS.length; level++) {
      const value = norm(row[level]);
      if (!value || !value.toLowerCase().includes(q)) continue;
      const path = [];
      for (let k = 0; k <= level; k++) path.push(norm(row[k]));
      const key = path.join('\u0000');
      const hit = found.get(key);
      if (hit) hit.count += 1;
      else found.set(key, { level, value, path, count: 1 });
    }
  }

  return [...found.values()]
    .sort(
      (a, b) =>
        score(a.value, q, a.level) - score(b.value, q, b.level) ||
        b.level - a.level ||
        b.count - a.count ||
        a.value.localeCompare(b.value),
    )
    .slice(0, limit);
}
