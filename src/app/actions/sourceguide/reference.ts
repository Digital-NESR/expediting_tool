'use server';

/* ─── Reference data the filters and pickers are built from. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import type { SgCategory, SgCountry, SgFacets, SgStats, Tier } from '@/types/sourceguide';
import { canRead } from '@/lib/sourceguide/access';
import { readFailed } from '@/lib/sourceguide/internals';

/* ─── reference data ─────────────────────────────────────────── */

export async function getCountries(): Promise<SgCountry[]> {
  if (!(await canRead())) return [];
  try {
    // champion display is driven by the assigned champions (sg_champions)
    const { rows } = await sourceGuidePool.query(
      `SELECT c.code, c.name, c.tone,
              COALESCE(STRING_AGG(ch.name, ', ' ORDER BY ch.name), '') AS champion
       FROM sg_countries c
       LEFT JOIN sg_champions ch ON ch.country_code = c.code
       GROUP BY c.code, c.name, c.tone, c.sort_order
       ORDER BY c.sort_order, c.name`,
    );
    return rows.map((r) => ({ code: r.code, name: r.name, champion: r.champion, tone: r.tone }));
  } catch (err) {
    readFailed('getCountries', err);
  }
}

export async function getStats(): Promise<SgStats> {
  if (!(await canRead()))
    return { commodities: 0, suppliers: 0, mappings: 0, countries: 0, categories: 0 };
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT
        (SELECT COUNT(*) FROM sg_commodities)                                            AS commodities,
        (SELECT COUNT(DISTINCT supplier_code) FROM sg_mappings WHERE status='Active')     AS suppliers,
        (SELECT COUNT(*) FROM sg_mappings WHERE status='Active')                          AS mappings,
        (SELECT COUNT(*) FROM sg_countries)                        AS countries,
        (SELECT COUNT(DISTINCT category_id) FROM sg_commodities)   AS categories
    `);
    const r = rows[0];
    return {
      commodities: Number(r.commodities),
      suppliers: Number(r.suppliers),
      mappings: Number(r.mappings),
      countries: Number(r.countries),
      categories: Number(r.categories),
    };
  } catch (err) {
    readFailed('getStats', err);
  }
}

export async function getCategories(): Promise<SgCategory[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT category_id, category,
             MODE() WITHIN GROUP (ORDER BY spend_type) AS spend_type,
             COUNT(*)::int AS count,
             (ARRAY_AGG(DISTINCT sub_category) FILTER (WHERE sub_category IS NOT NULL))[1:4] AS subs
      FROM sg_commodities
      GROUP BY category_id, category
      ORDER BY count DESC
    `);
    return rows.map((r) => ({
      id: r.category_id,
      name: r.category,
      spendType: r.spend_type,
      count: Number(r.count),
      subs: (r.subs || []).filter(Boolean),
    }));
  } catch (err) {
    readFailed('getCategories', err);
  }
}

/** counts used by the search filter sidebar */
export async function getSearchFacets(): Promise<SgFacets> {
  if (!(await canRead())) return { countries: [], spendTypes: [], tiers: [] };
  try {
    const [countryRes, spendRes, tierRes] = await Promise.all([
      sourceGuidePool.query(`
        SELECT country_code, COUNT(DISTINCT commodity_id)::int AS count
        FROM sg_mappings WHERE status='Active' GROUP BY country_code`),
      sourceGuidePool.query(`
        SELECT spend_type, COUNT(*)::int AS count
        FROM sg_commodities WHERE spend_type IS NOT NULL GROUP BY spend_type ORDER BY spend_type`),
      sourceGuidePool.query(`
        SELECT tier, COUNT(DISTINCT commodity_id)::int AS count
        FROM sg_mappings WHERE status='Active' GROUP BY tier`),
    ]);
    return {
      countries: countryRes.rows.map((r) => ({ code: r.country_code, count: Number(r.count) })),
      spendTypes: spendRes.rows.map((r) => ({ type: r.spend_type, count: Number(r.count) })),
      tiers: tierRes.rows.map((r) => ({ tier: r.tier as Tier, count: Number(r.count) })),
    };
  } catch (err) {
    readFailed('getSearchFacets', err);
  }
}

export async function getSpendTypes(): Promise<string[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT DISTINCT spend_type FROM sg_commodities WHERE spend_type IS NOT NULL ORDER BY spend_type`,
    );
    return rows.map((r) => r.spend_type);
  } catch (err) {
    readFailed('getSpendTypes', err);
  }
}
