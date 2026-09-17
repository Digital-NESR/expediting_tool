import sourceGuidePool from '@/lib/db-sourceguide';
import type { TaxCategory } from '@/app/sns-registry/lib/types';

/**
 * The Category › Sub-Category › Family › Commodity tree, read live from
 * `sg_commodities` in SourceGuide's database.
 *
 * The registry used to keep its own copy in sns_category/sub_category/family/
 * commodity. Those tables are no longer read: the platform has one canonical
 * spend taxonomy, maintained in /admin → SourceGuide → Spend Taxonomy, and a
 * second copy only ever drifts from it. The two databases are separate, so this
 * is a second pool rather than a join.
 *
 * Rows missing a sub-category or family are skipped. A registry record can only
 * be raised at Family or Commodity level, so a commodity with no family above it
 * has nothing the wizard could select.
 *
 * Lives here rather than beside either caller because both the New Record
 * wizard and the admin console need the same tree, and two copies of this query
 * would be two chances for them to disagree about what the taxonomy is.
 */
export async function fetchSnsTaxonomyTree(): Promise<TaxCategory[]> {
  const [spendRes, rowsRes] = await Promise.all([
    sourceGuidePool.query(
      `SELECT category, MODE() WITHIN GROUP (ORDER BY spend_type) AS spend_type
         FROM sg_commodities
        WHERE COALESCE(category, '') <> '' AND spend_type IS NOT NULL
        GROUP BY category`,
    ),
    sourceGuidePool.query(
      `SELECT category, sub_category, family, name
         FROM sg_commodities
        WHERE COALESCE(category, '')     <> ''
          AND COALESCE(sub_category, '') <> ''
          AND COALESCE(family, '')       <> ''
        ORDER BY category, sub_category, family, name`,
    ),
  ]);

  const spendByCategory = new Map<string, 'Direct' | 'Indirect'>();
  for (const r of spendRes.rows) {
    spendByCategory.set(String(r.category), r.spend_type === 'Direct' ? 'Direct' : 'Indirect');
  }

  // One ordered pass: the query already sorts by every level, so each new value
  // opens a branch and repeats append to the branch that is already open.
  const tax: TaxCategory[] = [];
  let cat: TaxCategory | undefined;
  let sub: TaxCategory['subs'][number] | undefined;
  let fam: { name: string; commodities: string[] } | undefined;

  for (const r of rowsRes.rows) {
    const catName = String(r.category);
    const subName = String(r.sub_category);
    const famName = String(r.family);

    if (!cat || cat.name !== catName) {
      cat = { name: catName, spendType: spendByCategory.get(catName) ?? 'Indirect', subs: [] };
      tax.push(cat);
      sub = undefined;
      fam = undefined;
    }
    if (!sub || sub.name !== subName) {
      sub = { name: subName, families: [] };
      cat.subs.push(sub);
      fam = undefined;
    }
    if (!fam || fam.name !== famName) {
      fam = { name: famName, commodities: [] };
      sub.families.push(fam);
    }
    fam.commodities.push(String(r.name));
  }

  return tax;
}
