import type { QueryResultRow } from 'pg';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import type { SgTaxonomyRow } from './types';
import type { TaxonomyExportRow } from './taxonomy-export';

/**
 * The spend taxonomy, without SourceGuide's access gate.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and this is read by a server component on a route the proxy has already put behind
 * sign-in. Adding an endpoint would widen the surface for nothing.
 *
 * SourceGuide's own `getTaxonomyFacts` needs a reader grant, because there it sits beside the
 * country guides and the supplier mappings those grants exist to protect. The same rows go to any
 * signed-in employee here: spend type, category, sub-category, family and commodity name are how
 * NESR describes what it buys, and somebody raising a purchase request has to name their commodity
 * without asking for access to a sourcing tool they will never otherwise open.
 *
 * Flat rows, not a tree. The screen groups and counts them itself as the reader drills in, which
 * is what lets every column show how much sits under each value.
 */

const log = logger('spend-taxonomy');

export async function readSpendTaxonomyFacts(): Promise<SgTaxonomyRow[]> {
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(`
      SELECT spend_type, category,
             COALESCE(NULLIF(TRIM(sub_category), ''), 'General') AS sub,
             COALESCE(NULLIF(TRIM(family), ''), 'General')       AS fam,
             name
        FROM sg_commodities
    `);
    return rows.map((r) => [r.spend_type, r.category, r.sub, r.fam, r.name] as SgTaxonomyRow);
  } catch (err) {
    /* An empty list rather than a thrown page. The taxonomy is reference material: a reader who
       gets nothing tries again, while one who gets an error screen assumes the tool is broken. */
    log.error('readSpendTaxonomyFacts.failed', err);
    return [];
  }
}

/**
 * What the launcher panel says about it, counted from the same rows the page draws.
 *
 * Pure, so the arithmetic can be checked without a database. Categories are counted distinctly
 * because a category appears once per commodity in these rows, and reporting 1,221 categories
 * would be a confident, wrong number on the home page of every employee.
 */
export function summariseTaxonomy(rows: SgTaxonomyRow[]): {
  categories: number;
  commodities: number;
} {
  const categories = new Set<string>();
  for (const r of rows) {
    const category = String(r[1] ?? '').trim();
    if (category) categories.add(category);
  }
  return { categories: categories.size, commodities: rows.length };
}

/**
 * The same taxonomy, with the two fields the drill-down screen has no room for.
 *
 * The export is the only reader. The screen's five-tuple stays as it is: it is loaded on every
 * page view by every employee, and a description column nobody renders would be paid for on all
 * of them. Here the cost is paid once, by somebody who asked for the file.
 */
export async function readSpendTaxonomyForExport(): Promise<TaxonomyExportRow[]> {
  const { rows } = await sourceGuidePool.query<QueryResultRow>(`
    SELECT spend_type, category,
           COALESCE(NULLIF(TRIM(sub_category), ''), 'General') AS sub,
           COALESCE(NULLIF(TRIM(family), ''), 'General')       AS fam,
           name, COALESCE(code, '') AS code, COALESCE(description, '') AS description
      FROM sg_commodities
  `);
  return rows.map((r) => ({
    spendType: String(r.spend_type ?? ''),
    category: String(r.category ?? ''),
    subCategory: String(r.sub ?? ''),
    family: String(r.fam ?? ''),
    commodity: String(r.name ?? ''),
    code: String(r.code ?? ''),
    description: String(r.description ?? ''),
  }));
}
