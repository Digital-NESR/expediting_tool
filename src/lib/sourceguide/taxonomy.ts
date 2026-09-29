import type { QueryResultRow } from 'pg';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import type { SgTaxonomyCategory } from './types';

/**
 * The spend taxonomy, without SourceGuide's access gate.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and this is read by a server component that the proxy has already put behind sign-in.
 * Adding an endpoint would widen the surface for nothing.
 *
 * SourceGuide's own `getTaxonomy` needs a reader grant, because there it sits beside the country
 * guides and the supplier mappings those grants exist to protect. This returns the same tree to
 * any signed-in employee: category, sub-category, family and commodity name are how NESR describes
 * what it buys, and somebody raising a purchase request needs to find their commodity without
 * asking for access to a sourcing tool they will never otherwise open.
 *
 * The per-commodity country count comes with it. It says how many country guides list a commodity,
 * not who supplies it or at what price, and it is the one number that tells a reader whether a
 * line is widely sourced or a local exception.
 */

const log = logger('spend-taxonomy');

export async function readSpendTaxonomy(): Promise<SgTaxonomyCategory[]> {
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(`
      SELECT c.id, c.code, c.name, c.category, c.category_id,
             COALESCE(c.sub_category, 'General') AS sub_category,
             COALESCE(c.family, 'General') AS family,
             COALESCE(cc.cnt, 0)::int AS countries
        FROM sg_commodities c
        LEFT JOIN (
          SELECT commodity_id, COUNT(DISTINCT country_code) AS cnt
            FROM sg_mappings WHERE status = 'Active' GROUP BY commodity_id
        ) cc ON cc.commodity_id = c.id
       ORDER BY c.category, sub_category, family, c.name
    `);
    return buildTaxonomyTree(rows);
  } catch (err) {
    /* An empty tree rather than a thrown page. The taxonomy is reference material: a reader who
       gets nothing tries again, while a reader who gets an error screen assumes the tool is
       broken. The log is where the real answer goes. */
    log.error('readSpendTaxonomy.failed', err);
    return [];
  }
}

/**
 * Flat rows into the four levels the screen draws.
 *
 * Exported and pure so the shaping can be tested without a database, which is the part with the
 * decisions in it: categories come back ordered by how much they hold, because a list led by the
 * largest is a list somebody can scan.
 */
export function buildTaxonomyTree(rows: QueryResultRow[]): SgTaxonomyCategory[] {
  const catMap = new Map<string, SgTaxonomyCategory>();
  for (const r of rows) {
    const categoryName = String(r.category ?? 'Uncategorised');
    let cat = catMap.get(categoryName);
    if (!cat) {
      cat = { id: String(r.category_id ?? categoryName), name: categoryName, count: 0, subs: [] };
      catMap.set(categoryName, cat);
    }
    const subName = String(r.sub_category ?? 'General');
    let sub = cat.subs.find((s) => s.name === subName);
    if (!sub) {
      sub = { name: subName, count: 0, families: [] };
      cat.subs.push(sub);
    }
    const famName = String(r.family ?? 'General');
    let fam = sub.families.find((f) => f.name === famName);
    if (!fam) {
      fam = { name: famName, items: [] };
      sub.families.push(fam);
    }
    fam.items.push({
      id: Number(r.id),
      name: String(r.name),
      code: String(r.code ?? ''),
      countries: Number(r.countries ?? 0),
    });
    sub.count++;
    cat.count++;
  }
  return [...catMap.values()].sort((a, b) => b.count - a.count);
}

/** How many countries have a guide at all, for the line under the heading. */
export async function countGuideCountries(): Promise<number> {
  try {
    const { rows } = await sourceGuidePool.query<{ n: string }>(
      `SELECT COUNT(DISTINCT country_code)::int AS n FROM sg_mappings WHERE status = 'Active'`,
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    log.error('countGuideCountries.failed', err);
    return 0;
  }
}
