'use server';

/* ─── Search and the detail views it leads to. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { MATCH_THRESHOLD, matchScore, norm } from '@/lib/sg-fuzzy';
import type {
  SgCommodity,
  SgCommodityDetail,
  SgCommodityResult,
  SgMapping,
  SgSearchFilters,
  SgSupplier,
  SgSupplierProfile,
  Tier,
} from '@/types/sourceguide';
import { canRead, readUser } from '@/lib/sourceguide/access';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { logUsage } from '@/lib/sourceguide/activity';
import {
  CommodityIndexRow,
  commodityExtra,
  getCommodityIndex,
  getCountriesLite,
  getMappedSupplierIndex,
} from '@/lib/sourceguide/indexes';
import { log, readFailed, rowToCommodity } from '@/lib/sourceguide/internals';
import type {
  SgCatalogRow,
  SgGlobalResults,
  SgTaxonomyCategory,
  SgTaxonomyRow,
} from '@/lib/sourceguide/types';

export async function searchCommodities(
  query: string,
  filters: SgSearchFilters = {},
  limit = 60,
): Promise<SgCommodityResult[]> {
  if (!(await canRead())) return [];
  try {
    const q = (query || '').trim();
    const nq = norm(q);
    const cats = filters.categories?.length ? new Set(filters.categories) : null;
    const spends = filters.spendTypes?.length ? new Set(filters.spendTypes) : null;

    // Fuzzy-rank the (small, cached) commodity catalogue in the app layer.
    const index = await getCommodityIndex();
    const scored: { r: CommodityIndexRow; score: number }[] = [];
    for (const r of index) {
      if (cats && !cats.has(r.category_id)) continue;
      if (spends && !spends.has(r.spend_type)) continue;
      if (q) {
        let s = matchScore(q, r.name, commodityExtra(r));
        if (s < MATCH_THRESHOLD) {
          // last-resort description substring match
          if (nq.length >= 3 && r.description && norm(r.description).includes(nq))
            s = MATCH_THRESHOLD;
          else continue;
        }
        scored.push({ r, score: s });
      } else {
        scored.push({ r, score: 0 });
      }
    }
    scored.sort((a, b) =>
      q ? b.score - a.score || a.r.name.localeCompare(b.r.name) : a.r.name.localeCompare(b.r.name),
    );
    const rows = scored.map((s) => s.r);
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const mapRes = await sourceGuidePool.query(
      `SELECT m.commodity_id, m.country_code, m.tier, m.supplier_code, a.name AS supplier_name,
              a.central_block_status
       FROM sg_mappings m
       JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       WHERE m.status = 'Active' AND m.commodity_id = ANY($1)`,
      [ids],
    );

    interface MiniMap {
      country: string;
      tier: Tier;
      supplierCode: string | null;
      supplierName: string;
      blocked: boolean;
    }
    const byCom = new Map<number, MiniMap[]>();
    for (const m of mapRes.rows) {
      const arr = byCom.get(m.commodity_id) ?? [];
      arr.push({
        country: m.country_code,
        tier: m.tier,
        supplierCode: m.supplier_code,
        supplierName: m.supplier_name,
        blocked: isCentrallyBlocked(m.central_block_status),
      });
      byCom.set(m.commodity_id, arr);
    }

    const fc = filters.countries ?? [];
    const ft = filters.tiers ?? [];
    const results: SgCommodityResult[] = [];

    for (const r of rows) {
      const maps = byCom.get(r.id) ?? [];
      const countries = [...new Set(maps.map((m) => m.country))];

      if (fc.length && !maps.some((m) => fc.includes(m.country))) continue;
      if (ft.length) {
        const ok = maps.some((m) => ft.includes(m.tier) && (!fc.length || fc.includes(m.country)));
        if (!ok) continue;
      }

      const displayCountry = fc.find((c) => countries.includes(c)) || countries[0] || null;
      const pref = displayCountry
        ? maps.find((m) => m.country === displayCountry && m.tier === 'Preferred')
        : undefined;
      const backupCount = displayCountry
        ? maps.filter((m) => m.country === displayCountry && m.tier === 'Backup').length
        : 0;

      results.push({
        ...rowToCommodity(r),
        countries,
        preferred: pref
          ? {
              supplierCode: pref.supplierCode,
              supplierName: pref.supplierName,
              country: displayCountry!,
              blocked: pref.blocked,
            }
          : null,
        backupCount,
      });
      if (results.length >= limit) break;
    }

    return results;
  } catch (err) {
    log.error('searchCommodities.failed', err);
    return [];
  }
}

export async function globalSearch(query: string): Promise<SgGlobalResults> {
  if (!(await canRead())) return { commodities: [], suppliers: [], categories: [], countries: [] };
  const q = (query || '').trim();
  if (!q) return { commodities: [], suppliers: [], categories: [], countries: [] };
  try {
    const [index, suppliers, countries] = await Promise.all([
      getCommodityIndex(),
      getMappedSupplierIndex(),
      getCountriesLite(),
    ]);

    const commodities = index
      .map((r) => ({ r, score: matchScore(q, r.name, commodityExtra(r)) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name))
      .slice(0, 7)
      .map((x) => ({
        id: x.r.id,
        name: x.r.name,
        category: x.r.category,
        subCategory: x.r.sub_category,
      }));

    const sup = suppliers
      .map((s) => ({ s, score: Math.max(matchScore(q, s.name), s.code.includes(q) ? 1.5 : 0) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
      .slice(0, 5)
      .map((x) => ({ code: x.s.code, name: x.s.name }));

    const catMap = new Map<string, string>();
    for (const r of index) if (!catMap.has(r.category_id)) catMap.set(r.category_id, r.category);
    const cats = [...catMap.entries()]
      .map(([id, name]) => ({ id, name, score: matchScore(q, name) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => ({ id: x.id, name: x.name }));

    const ctry = countries
      .map((c) => ({ c, score: matchScore(q, c.name) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => ({ code: x.c.code, name: x.c.name, tone: x.c.tone }));

    return { commodities, suppliers: sup, categories: cats, countries: ctry };
  } catch (err) {
    log.error('globalSearch.failed', err);
    return { commodities: [], suppliers: [], categories: [], countries: [] };
  }
}

export async function countSearch(query: string, filters: SgSearchFilters = {}): Promise<number> {
  if (!(await canRead())) return 0;
  // lightweight: reuse searchCommodities with a high limit then count
  const res = await searchCommodities(query, filters, 100000);
  return res.length;
}

export async function searchSuppliers(query: string, limit = 6): Promise<SgSupplier[]> {
  if (!(await canRead())) return [];
  try {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    // Fuzzy-rank suppliers that are actually mapped somewhere (cached, joined to the AVL by code)
    const suppliers = await getMappedSupplierIndex();
    return suppliers
      .map((s) => ({ s, score: Math.max(matchScore(q, s.name), s.code.includes(q) ? 1.5 : 0) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
      .slice(0, limit)
      .map((x) => ({ code: x.s.code, name: x.s.name, countries: x.s.countries }));
  } catch (err) {
    log.error('searchSuppliers.failed', err);
    return [];
  }
}

/* ─── commodity detail ───────────────────────────────────────── */

export async function getCommodityDetail(commodityId: number): Promise<SgCommodityDetail | null> {
  const viewer = await readUser();
  if (!viewer) return null;
  try {
    const comRes = await sourceGuidePool.query(
      `SELECT id, code, name, category, category_id, sub_category, family, spend_type, description
       FROM sg_commodities WHERE id = $1`,
      [commodityId],
    );
    if (!comRes.rows.length) return null;
    const commodity = rowToCommodity(comRes.rows[0]);

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_code, m.country_code, m.tier, m.status,
              a.name AS supplier_name, a.email AS supplier_email, a.central_block_status
       FROM sg_mappings m
       JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       WHERE m.status = 'Active' AND m.commodity_id = $1
       ORDER BY m.country_code, (m.tier = 'Preferred') DESC, a.name`,
      [commodityId],
    );

    const mappingsByCountry: Record<string, SgMapping[]> = {};
    for (const m of mapRes.rows) {
      const mapping: SgMapping = {
        id: m.id,
        commodityId: m.commodity_id,
        supplierName: m.supplier_name ?? '',
        supplierCode: m.supplier_code,
        supplierEmail: m.supplier_email ?? null,
        supplierBlocked: isCentrallyBlocked(m.central_block_status),
        country: m.country_code,
        tier: m.tier,
        status: m.status,
      };
      (mappingsByCountry[m.country_code] ??= []).push(mapping);
    }
    const countries = Object.keys(mappingsByCountry);

    void logUsage('view', 'commodity', commodity.name, String(commodityId), viewer);
    return { commodity, countries, mappingsByCountry };
  } catch (err) {
    readFailed('getCommodityDetail', err, { commodityId });
  }
}

/* ─── supplier profile ───────────────────────────────────────── */

export async function getSupplierProfile(supplierCode: string): Promise<SgSupplierProfile | null> {
  const viewer = await readUser();
  if (!viewer) return null;
  try {
    const sRes = await sourceGuidePool.query(
      `SELECT supplier_code, name, email, central_block_status
         FROM supplier_avl WHERE supplier_code = $1`,
      [supplierCode],
    );
    if (!sRes.rows.length) return null;
    const s = sRes.rows[0];

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_code, m.country_code, m.tier, m.status
       FROM sg_mappings m
       WHERE m.status = 'Active' AND m.supplier_code = $1
       ORDER BY m.country_code`,
      [supplierCode],
    );
    const mappings: SgMapping[] = mapRes.rows.map((m) => ({
      id: m.id,
      commodityId: m.commodity_id,
      supplierName: s.name,
      supplierCode: m.supplier_code,
      country: m.country_code,
      tier: m.tier,
      status: m.status,
    }));

    const countries = [...new Set(mappings.map((m) => m.country))];
    const champRes = await sourceGuidePool.query(
      `SELECT DISTINCT name FROM sg_champions WHERE country_code = ANY($1) AND COALESCE(TRIM(name),'') <> ''`,
      [countries],
    );

    void logUsage('view', 'supplier', s.name, s.supplier_code, viewer);
    return {
      code: s.supplier_code,
      name: s.name,
      email: s.email ?? null,
      blocked: isCentrallyBlocked(s.central_block_status),
      countries,
      totalCommodities: new Set(mappings.map((m) => m.commodityId)).size,
      preferredCount: mappings.filter((m) => m.tier === 'Preferred').length,
      champions: champRes.rows.map((r) => r.name),
      mappings,
    };
  } catch (err) {
    readFailed('getSupplierProfile', err, { supplierCode });
  }
}

/** lookup commodity names for a set of ids (used by supplier profile UI) */
export async function getCommoditiesByIds(ids: number[]): Promise<SgCommodity[]> {
  if (!(await canRead())) return [];
  if (!ids.length) return [];
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT id, code, name, category, category_id, sub_category, family, spend_type, description
       FROM sg_commodities WHERE id = ANY($1)`,
      [ids],
    );
    return rows.map(rowToCommodity);
  } catch (err) {
    readFailed('getCommoditiesByIds', err, { count: ids.length });
  }
}

export async function getTaxonomyFacts(): Promise<SgTaxonomyRow[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT spend_type, category,
             COALESCE(NULLIF(TRIM(sub_category),''),'General') AS sub,
             COALESCE(NULLIF(TRIM(family),''),'General') AS fam,
             name
      FROM sg_commodities
    `);
    return rows.map((r) => [r.spend_type, r.category, r.sub, r.fam, r.name] as SgTaxonomyRow);
  } catch (err) {
    readFailed('getTaxonomyFacts', err);
  }
}

export async function getCommodityCatalog(): Promise<SgCatalogRow[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT c.id, c.name, c.code, c.spend_type, c.category, c.category_id,
             c.sub_category, c.family,
             COALESCE(mc.suppliers, 0)::int  AS suppliers,
             COALESCE(mc.countries, 0)::int  AS countries
      FROM sg_commodities c
      LEFT JOIN (
        SELECT commodity_id, COUNT(*) AS suppliers, COUNT(DISTINCT country_code) AS countries
        FROM sg_mappings WHERE status='Active' GROUP BY commodity_id
      ) mc ON mc.commodity_id = c.id
      ORDER BY c.category, c.sub_category NULLS FIRST, c.family NULLS FIRST, c.name
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      spendType: r.spend_type,
      category: r.category,
      categoryId: r.category_id,
      subCategory: r.sub_category,
      family: r.family,
      suppliers: Number(r.suppliers),
      countries: Number(r.countries),
    }));
  } catch (err) {
    readFailed('getCommodityCatalog', err);
  }
}

export async function getTaxonomy(): Promise<SgTaxonomyCategory[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT c.id, c.code, c.name, c.category, c.category_id,
             COALESCE(c.sub_category, 'General') AS sub_category,
             COALESCE(c.family, 'General') AS family,
             COALESCE(cc.cnt, 0)::int AS countries
      FROM sg_commodities c
      LEFT JOIN (
        SELECT commodity_id, COUNT(DISTINCT country_code) AS cnt
        FROM sg_mappings WHERE status='Active' GROUP BY commodity_id
      ) cc ON cc.commodity_id = c.id
      ORDER BY c.category, sub_category, family, c.name
    `);

    const catMap = new Map<string, SgTaxonomyCategory>();
    for (const r of rows) {
      let cat = catMap.get(r.category);
      if (!cat) {
        cat = { id: r.category_id, name: r.category, count: 0, subs: [] };
        catMap.set(r.category, cat);
      }
      let sub = cat.subs.find((s) => s.name === r.sub_category);
      if (!sub) {
        sub = { name: r.sub_category, count: 0, families: [] };
        cat.subs.push(sub);
      }
      let fam = sub.families.find((f) => f.name === r.family);
      if (!fam) {
        fam = { name: r.family, items: [] };
        sub.families.push(fam);
      }
      fam.items.push({ id: r.id, name: r.name, code: r.code, countries: r.countries });
      sub.count++;
      cat.count++;
    }
    return [...catMap.values()].sort((a, b) => b.count - a.count);
  } catch (err) {
    readFailed('getTaxonomy', err);
  }
}
