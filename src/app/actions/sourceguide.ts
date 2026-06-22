'use server';

import sourceGuidePool from '@/lib/db-sourceguide';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type {
  SgCountry, SgCommodity, SgSupplier, SgMapping, SgCategory, SgStats,
  SgCommodityResult, SgSupplierProfile, SgCommodityDetail, SgGuide,
  SgActivityEntry, SgSearchFilters, SgFacets, Tier,
} from '@/types/sourceguide';

/* ─── helpers ────────────────────────────────────────────────── */

function isoOf(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}

interface SgUser {
  email: string;
  name: string;
  isAdmin: boolean;
  approvedCountries: string[];
  viewOnly: boolean;
}

async function getSgUser(): Promise<SgUser | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());
  const sg = session.user.toolAccess?.sourceguide;
  const approvedCountries = sg?.approvedCountries ?? [];
  const viewOnly = approvedCountries.includes('All Countries - View Only');

  return {
    email,
    name: session.user.name ?? email,
    isAdmin,
    approvedCountries,
    viewOnly,
  };
}

function buildPath(c: { category: string; subCategory: string | null; family: string | null; name: string }): string[] {
  return [c.category, c.subCategory, c.family, c.name].filter(Boolean) as string[];
}

interface CommodityRow {
  id: number; code: string; name: string; category: string; category_id: string;
  sub_category: string | null; family: string | null; spend_type: string; description: string;
}

function rowToCommodity(r: CommodityRow): SgCommodity {
  const c: SgCommodity = {
    id: r.id, code: r.code, name: r.name, category: r.category, categoryId: r.category_id,
    subCategory: r.sub_category, family: r.family, spendType: r.spend_type, description: r.description,
    path: [],
  };
  c.path = buildPath(c);
  return c;
}

/* ─── reference data ─────────────────────────────────────────── */

export async function getCountries(): Promise<SgCountry[]> {
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT code, name, champion, tone FROM sg_countries ORDER BY sort_order, name`,
    );
    return rows.map(r => ({ code: r.code, name: r.name, champion: r.champion, tone: r.tone }));
  } catch (err) {
    console.error('[sg.getCountries]', err);
    return [];
  }
}

export async function getStats(): Promise<SgStats> {
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT
        (SELECT COUNT(*) FROM sg_commodities)                      AS commodities,
        (SELECT COUNT(*) FROM sg_suppliers)                        AS suppliers,
        (SELECT COUNT(*) FROM sg_mappings WHERE status='Active')   AS mappings,
        (SELECT COUNT(*) FROM sg_countries)                        AS countries,
        (SELECT COUNT(DISTINCT category_id) FROM sg_commodities)   AS categories
    `);
    const r = rows[0];
    return {
      commodities: Number(r.commodities), suppliers: Number(r.suppliers),
      mappings: Number(r.mappings), countries: Number(r.countries), categories: Number(r.categories),
    };
  } catch (err) {
    console.error('[sg.getStats]', err);
    return { commodities: 0, suppliers: 0, mappings: 0, countries: 0, categories: 0 };
  }
}

export async function getCategories(): Promise<SgCategory[]> {
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
    return rows.map(r => ({
      id: r.category_id, name: r.category, spendType: r.spend_type,
      count: Number(r.count), subs: (r.subs || []).filter(Boolean),
    }));
  } catch (err) {
    console.error('[sg.getCategories]', err);
    return [];
  }
}

/** counts used by the search filter sidebar */
export async function getSearchFacets(): Promise<SgFacets> {
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
      countries: countryRes.rows.map(r => ({ code: r.country_code, count: Number(r.count) })),
      spendTypes: spendRes.rows.map(r => ({ type: r.spend_type, count: Number(r.count) })),
      tiers: tierRes.rows.map(r => ({ tier: r.tier as Tier, count: Number(r.count) })),
    };
  } catch (err) {
    console.error('[sg.getSearchFacets]', err);
    return { countries: [], spendTypes: [], tiers: [] };
  }
}

export async function getSpendTypes(): Promise<string[]> {
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT DISTINCT spend_type FROM sg_commodities WHERE spend_type IS NOT NULL ORDER BY spend_type`,
    );
    return rows.map(r => r.spend_type);
  } catch (err) {
    console.error('[sg.getSpendTypes]', err);
    return [];
  }
}

/* ─── search ─────────────────────────────────────────────────── */

export async function searchCommodities(
  query: string,
  filters: SgSearchFilters = {},
  limit = 60,
): Promise<SgCommodityResult[]> {
  try {
    const q = (query || '').trim();
    const params: unknown[] = [];
    const where: string[] = [];

    if (q) {
      params.push(`%${q}%`);
      const likeIdx = params.length;
      where.push(`(name ILIKE $${likeIdx} OR category ILIKE $${likeIdx} OR sub_category ILIKE $${likeIdx} OR family ILIKE $${likeIdx} OR code ILIKE $${likeIdx} OR description ILIKE $${likeIdx})`);
    }
    if (filters.categories?.length) {
      params.push(filters.categories);
      where.push(`category_id = ANY($${params.length})`);
    }
    if (filters.spendTypes?.length) {
      params.push(filters.spendTypes);
      where.push(`spend_type = ANY($${params.length})`);
    }

    // score expression for relevance
    let scoreExpr = '1';
    if (q) {
      params.push(`${q}%`);
      const startIdx = params.length;
      params.push(`%${q}%`);
      const incIdx = params.length;
      scoreExpr = `(CASE WHEN name ILIKE $${startIdx} THEN 120 ELSE 0 END
                 + CASE WHEN name ILIKE $${incIdx} THEN 60 ELSE 0 END)`;
    }

    const sql = `
      SELECT id, code, name, category, category_id, sub_category, family, spend_type, description,
             ${scoreExpr} AS score
      FROM sg_commodities
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY score DESC, name ASC
    `;
    const { rows } = await sourceGuidePool.query(sql, params);
    if (!rows.length) return [];

    const ids = rows.map(r => r.id);
    const mapRes = await sourceGuidePool.query(
      `SELECT m.commodity_id, m.country_code, m.tier, m.supplier_id, s.name AS supplier_name
       FROM sg_mappings m JOIN sg_suppliers s ON s.id = m.supplier_id
       WHERE m.status = 'Active' AND m.commodity_id = ANY($1)`,
      [ids],
    );

    interface MiniMap { country: string; tier: Tier; supplierId: number; supplierName: string; }
    const byCom = new Map<number, MiniMap[]>();
    for (const m of mapRes.rows) {
      const arr = byCom.get(m.commodity_id) ?? [];
      arr.push({ country: m.country_code, tier: m.tier, supplierId: m.supplier_id, supplierName: m.supplier_name });
      byCom.set(m.commodity_id, arr);
    }

    const fc = filters.countries ?? [];
    const ft = filters.tiers ?? [];
    const results: SgCommodityResult[] = [];

    for (const r of rows) {
      const maps = byCom.get(r.id) ?? [];
      const countries = [...new Set(maps.map(m => m.country))];

      if (fc.length && !maps.some(m => fc.includes(m.country))) continue;
      if (ft.length) {
        const ok = maps.some(m => ft.includes(m.tier) && (!fc.length || fc.includes(m.country)));
        if (!ok) continue;
      }

      const displayCountry = fc.find(c => countries.includes(c)) || countries[0] || null;
      const pref = displayCountry
        ? maps.find(m => m.country === displayCountry && m.tier === 'Preferred')
        : undefined;
      const backupCount = displayCountry
        ? maps.filter(m => m.country === displayCountry && m.tier === 'Backup').length
        : 0;

      results.push({
        ...rowToCommodity(r),
        countries,
        preferred: pref ? { supplierId: pref.supplierId, supplierName: pref.supplierName, country: displayCountry! } : null,
        backupCount,
      });
      if (results.length >= limit) break;
    }

    return results;
  } catch (err) {
    console.error('[sg.searchCommodities]', err);
    return [];
  }
}

export async function countSearch(query: string, filters: SgSearchFilters = {}): Promise<number> {
  // lightweight: reuse searchCommodities with a high limit then count
  const res = await searchCommodities(query, filters, 100000);
  return res.length;
}

export async function searchSuppliers(query: string, limit = 6): Promise<SgSupplier[]> {
  try {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    const { rows } = await sourceGuidePool.query(
      `SELECT s.id, s.name, s.code,
              COALESCE(ARRAY_AGG(sc.country_code) FILTER (WHERE sc.country_code IS NOT NULL), '{}') AS countries
       FROM sg_suppliers s
       LEFT JOIN sg_supplier_countries sc ON sc.supplier_id = s.id
       WHERE s.name ILIKE $1
       GROUP BY s.id, s.name, s.code
       ORDER BY s.name
       LIMIT $2`,
      [`%${q}%`, limit],
    );
    return rows.map(r => ({ id: r.id, name: r.name, code: r.code, countries: r.countries || [] }));
  } catch (err) {
    console.error('[sg.searchSuppliers]', err);
    return [];
  }
}

/* ─── commodity detail ───────────────────────────────────────── */

export async function getCommodityDetail(commodityId: number): Promise<SgCommodityDetail | null> {
  try {
    const comRes = await sourceGuidePool.query(
      `SELECT id, code, name, category, category_id, sub_category, family, spend_type, description
       FROM sg_commodities WHERE id = $1`,
      [commodityId],
    );
    if (!comRes.rows.length) return null;
    const commodity = rowToCommodity(comRes.rows[0]);

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_id, m.country_code, m.tier, m.status,
              s.name AS supplier_name, s.code AS supplier_code
       FROM sg_mappings m JOIN sg_suppliers s ON s.id = m.supplier_id
       WHERE m.status = 'Active' AND m.commodity_id = $1
       ORDER BY m.country_code, (m.tier = 'Preferred') DESC, s.name`,
      [commodityId],
    );

    const mappingsByCountry: Record<string, SgMapping[]> = {};
    for (const m of mapRes.rows) {
      const mapping: SgMapping = {
        id: m.id, commodityId: m.commodity_id, supplierId: m.supplier_id,
        supplierName: m.supplier_name, supplierCode: m.supplier_code,
        country: m.country_code, tier: m.tier, status: m.status,
      };
      (mappingsByCountry[m.country_code] ??= []).push(mapping);
    }
    const countries = Object.keys(mappingsByCountry);

    return { commodity, countries, mappingsByCountry };
  } catch (err) {
    console.error('[sg.getCommodityDetail]', err);
    return null;
  }
}

/* ─── supplier profile ───────────────────────────────────────── */

export async function getSupplierProfile(supplierId: number): Promise<SgSupplierProfile | null> {
  try {
    const sRes = await sourceGuidePool.query(
      `SELECT s.id, s.name, s.code,
              COALESCE(ARRAY_AGG(DISTINCT sc.country_code) FILTER (WHERE sc.country_code IS NOT NULL), '{}') AS countries
       FROM sg_suppliers s
       LEFT JOIN sg_supplier_countries sc ON sc.supplier_id = s.id
       WHERE s.id = $1
       GROUP BY s.id, s.name, s.code`,
      [supplierId],
    );
    if (!sRes.rows.length) return null;
    const s = sRes.rows[0];

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_id, m.country_code, m.tier, m.status,
              s.name AS supplier_name, s.code AS supplier_code
       FROM sg_mappings m JOIN sg_suppliers s ON s.id = m.supplier_id
       WHERE m.status = 'Active' AND m.supplier_id = $1
       ORDER BY m.country_code`,
      [supplierId],
    );
    const mappings: SgMapping[] = mapRes.rows.map(m => ({
      id: m.id, commodityId: m.commodity_id, supplierId: m.supplier_id,
      supplierName: m.supplier_name, supplierCode: m.supplier_code,
      country: m.country_code, tier: m.tier, status: m.status,
    }));

    const champRes = await sourceGuidePool.query(
      `SELECT DISTINCT champion FROM sg_countries WHERE code = ANY($1) AND champion <> ''`,
      [s.countries || []],
    );

    return {
      id: s.id, name: s.name, code: s.code, countries: s.countries || [],
      totalCommodities: new Set(mappings.map(m => m.commodityId)).size,
      preferredCount: mappings.filter(m => m.tier === 'Preferred').length,
      champions: champRes.rows.map(r => r.champion),
      mappings,
    };
  } catch (err) {
    console.error('[sg.getSupplierProfile]', err);
    return null;
  }
}

/** lookup commodity names for a set of ids (used by supplier profile UI) */
export async function getCommoditiesByIds(ids: number[]): Promise<SgCommodity[]> {
  if (!ids.length) return [];
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT id, code, name, category, category_id, sub_category, family, spend_type, description
       FROM sg_commodities WHERE id = ANY($1)`,
      [ids],
    );
    return rows.map(rowToCommodity);
  } catch (err) {
    console.error('[sg.getCommoditiesByIds]', err);
    return [];
  }
}

/* ─── browse taxonomy ────────────────────────────────────────── */

export interface SgTaxonomyLeaf { id: number; name: string; code: string; countries: number; }
export interface SgTaxonomyFamily { name: string; items: SgTaxonomyLeaf[]; }
export interface SgTaxonomySub { name: string; count: number; families: SgTaxonomyFamily[]; }
export interface SgTaxonomyCategory { id: string; name: string; count: number; subs: SgTaxonomySub[]; }

export async function getTaxonomy(): Promise<SgTaxonomyCategory[]> {
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT c.id, c.code, c.name, c.category, c.category_id,
             COALESCE(c.sub_category, '—') AS sub_category,
             COALESCE(c.family, '—') AS family,
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
      if (!cat) { cat = { id: r.category_id, name: r.category, count: 0, subs: [] }; catMap.set(r.category, cat); }
      let sub = cat.subs.find(s => s.name === r.sub_category);
      if (!sub) { sub = { name: r.sub_category, count: 0, families: [] }; cat.subs.push(sub); }
      let fam = sub.families.find(f => f.name === r.family);
      if (!fam) { fam = { name: r.family, items: [] }; sub.families.push(fam); }
      fam.items.push({ id: r.id, name: r.name, code: r.code, countries: r.countries });
      sub.count++; cat.count++;
    }
    return [...catMap.values()].sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('[sg.getTaxonomy]', err);
    return [];
  }
}

/* ─── mapping workspace (champion / admin) ───────────────────── */

export async function getCountryMappingSummary(country: string): Promise<{ mappings: number; commodities: number }> {
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT COUNT(*)::int AS mappings, COUNT(DISTINCT commodity_id)::int AS commodities
       FROM sg_mappings WHERE country_code = $1 AND status='Active'`,
      [country],
    );
    return { mappings: Number(rows[0].mappings), commodities: Number(rows[0].commodities) };
  } catch (err) {
    console.error('[sg.getCountryMappingSummary]', err);
    return { mappings: 0, commodities: 0 };
  }
}

/** commodities (with their mappings for the given country) to edit in the workspace */
export async function getMappingEditList(
  country: string,
  query: string,
  limit = 30,
): Promise<{ commodity: SgCommodity; mappings: SgMapping[] }[]> {
  try {
    const q = (query || '').trim();
    let comFilter: string;
    let params: unknown[];

    if (q) {
      // full-catalogue search — country is not used in this branch
      params = [`%${q}%`, `${q}%`];
      comFilter = `
        SELECT id, code, name, category, category_id, sub_category, family, spend_type, description
        FROM sg_commodities
        WHERE (name ILIKE $1 OR category ILIKE $1 OR sub_category ILIKE $1 OR family ILIKE $1 OR code ILIKE $1)
        ORDER BY (CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END), name
        LIMIT ${Number(limit)}
      `;
    } else {
      params = [country];
      comFilter = `
        SELECT c.id, c.code, c.name, c.category, c.category_id, c.sub_category, c.family, c.spend_type, c.description
        FROM sg_commodities c
        WHERE EXISTS (SELECT 1 FROM sg_mappings m WHERE m.commodity_id = c.id AND m.country_code = $1 AND m.status='Active')
        ORDER BY c.name
        LIMIT ${Number(limit)}
      `;
    }

    const comRes = await sourceGuidePool.query(comFilter, params);
    if (!comRes.rows.length) return [];
    const ids = comRes.rows.map(r => r.id);

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_id, m.country_code, m.tier, m.status,
              s.name AS supplier_name, s.code AS supplier_code
       FROM sg_mappings m JOIN sg_suppliers s ON s.id = m.supplier_id
       WHERE m.status='Active' AND m.country_code = $1 AND m.commodity_id = ANY($2)`,
      [country, ids],
    );
    const byCom = new Map<number, SgMapping[]>();
    for (const m of mapRes.rows) {
      (byCom.get(m.commodity_id) ?? byCom.set(m.commodity_id, []).get(m.commodity_id)!).push({
        id: m.id, commodityId: m.commodity_id, supplierId: m.supplier_id,
        supplierName: m.supplier_name, supplierCode: m.supplier_code,
        country: m.country_code, tier: m.tier, status: m.status,
      });
    }

    return comRes.rows.map(r => ({ commodity: rowToCommodity(r), mappings: byCom.get(r.id) ?? [] }));
  } catch (err) {
    console.error('[sg.getMappingEditList]', err);
    return [];
  }
}

export async function supplierOptions(country: string, prefix: string, limit = 8): Promise<SgSupplier[]> {
  try {
    const p = (prefix || '').trim();
    const { rows } = await sourceGuidePool.query(
      `SELECT s.id, s.name, s.code,
              COALESCE(ARRAY_AGG(DISTINCT sc.country_code) FILTER (WHERE sc.country_code IS NOT NULL), '{}') AS countries,
              BOOL_OR(sc.country_code = $1) AS in_country
       FROM sg_suppliers s
       LEFT JOIN sg_supplier_countries sc ON sc.supplier_id = s.id
       WHERE ($2 = '' OR s.name ILIKE $3)
       GROUP BY s.id, s.name, s.code
       ORDER BY in_country DESC NULLS LAST, s.name
       LIMIT $4`,
      [country, p, `%${p}%`, limit],
    );
    return rows.map(r => ({ id: r.id, name: r.name, code: r.code, countries: r.countries || [] }));
  } catch (err) {
    console.error('[sg.supplierOptions]', err);
    return [];
  }
}

/* ─── mutations (audit-logged) ───────────────────────────────── */

async function canEdit(user: SgUser, country: string): Promise<boolean> {
  if (user.isAdmin) return true;
  if (user.viewOnly) return false;
  return user.approvedCountries.includes(country);
}

async function logActivity(
  country: string | null, commodityId: number | null,
  action: string, details: string, by: string,
): Promise<void> {
  await sourceGuidePool.query(
    `INSERT INTO sg_activity_log (country_code, commodity_id, action, details, performed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [country, commodityId, action, details, by],
  );
}

export async function addMapping(input: {
  commodityId: number; country: string; tier: Tier; supplierName: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  if (!(await canEdit(user, input.country))) return { success: false, error: 'You cannot edit this country.' };

  const name = input.supplierName.trim();
  if (!name) return { success: false, error: 'Supplier name is required.' };

  const client = await sourceGuidePool.connect();
  try {
    await client.query('BEGIN');

    // ensure supplier (case-insensitive name match) — generate id for new ones
    const found = await client.query(`SELECT id FROM sg_suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
    let supplierId: number;
    if (found.rows.length) {
      supplierId = found.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO sg_suppliers (id, name, code)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM sg_suppliers), $1, '')
         RETURNING id`,
        [name],
      );
      supplierId = ins.rows[0].id;
    }
    await client.query(
      `INSERT INTO sg_supplier_countries (supplier_id, country_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [supplierId, input.country],
    );

    // upsert the mapping
    const existing = await client.query(
      `SELECT id FROM sg_mappings WHERE commodity_id=$1 AND country_code=$2 AND supplier_id=$3 AND status='Active'`,
      [input.commodityId, input.country, supplierId],
    );
    if (existing.rows.length) {
      await client.query(`UPDATE sg_mappings SET tier=$2 WHERE id=$1`, [existing.rows[0].id, input.tier]);
    } else {
      await client.query(
        `INSERT INTO sg_mappings (commodity_id, supplier_id, country_code, tier, status)
         VALUES ($1, $2, $3, $4, 'Active')`,
        [input.commodityId, supplierId, input.country, input.tier],
      );
    }

    const com = await client.query(`SELECT name FROM sg_commodities WHERE id=$1`, [input.commodityId]);
    await client.query('COMMIT');

    await logActivity(input.country, input.commodityId, 'Add',
      `${input.tier} · ${name} → ${com.rows[0]?.name ?? ''}`, user.name);
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[sg.addMapping]', err);
    return { success: false, error: 'Failed to add supplier.' };
  } finally {
    client.release();
  }
}

export async function removeMapping(mapId: number): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  try {
    const m = await sourceGuidePool.query(
      `SELECT m.country_code, m.tier, m.commodity_id, s.name AS supplier_name, c.name AS com_name
       FROM sg_mappings m JOIN sg_suppliers s ON s.id=m.supplier_id
       JOIN sg_commodities c ON c.id=m.commodity_id WHERE m.id=$1`,
      [mapId],
    );
    if (!m.rows.length) return { success: false, error: 'Mapping not found.' };
    const row = m.rows[0];
    if (!(await canEdit(user, row.country_code))) return { success: false, error: 'You cannot edit this country.' };

    await sourceGuidePool.query(`UPDATE sg_mappings SET status='Inactive' WHERE id=$1`, [mapId]);
    await logActivity(row.country_code, row.commodity_id, 'Deactivate',
      `${row.tier} · ${row.supplier_name} ✕ ${row.com_name}`, user.name);
    return { success: true };
  } catch (err) {
    console.error('[sg.removeMapping]', err);
    return { success: false, error: 'Failed to remove supplier.' };
  }
}

export async function changeTier(mapId: number, tier: Tier): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  try {
    const m = await sourceGuidePool.query(
      `SELECT m.country_code, m.tier, m.commodity_id, s.name AS supplier_name, c.name AS com_name
       FROM sg_mappings m JOIN sg_suppliers s ON s.id=m.supplier_id
       JOIN sg_commodities c ON c.id=m.commodity_id WHERE m.id=$1`,
      [mapId],
    );
    if (!m.rows.length) return { success: false, error: 'Mapping not found.' };
    const row = m.rows[0];
    if (!(await canEdit(user, row.country_code))) return { success: false, error: 'You cannot edit this country.' };

    await sourceGuidePool.query(`UPDATE sg_mappings SET tier=$2 WHERE id=$1`, [mapId, tier]);
    await logActivity(row.country_code, row.commodity_id, 'Edit tier',
      `${row.supplier_name}: ${row.tier} → ${tier} (${row.com_name})`, user.name);
    return { success: true };
  } catch (err) {
    console.error('[sg.changeTier]', err);
    return { success: false, error: 'Failed to change tier.' };
  }
}

export async function getActivityLog(country: string | null, limit = 20): Promise<SgActivityEntry[]> {
  try {
    const sql = country
      ? `SELECT * FROM sg_activity_log WHERE country_code=$1 ORDER BY performed_at DESC LIMIT $2`
      : `SELECT * FROM sg_activity_log ORDER BY performed_at DESC LIMIT $1`;
    const params = country ? [country, limit] : [limit];
    const { rows } = await sourceGuidePool.query(sql, params);
    return rows.map(r => ({
      id: r.id, country: r.country_code, commodityId: r.commodity_id,
      action: r.action, details: r.details, performedBy: r.performed_by,
      performedAt: isoOf(r.performed_at),
    }));
  } catch (err) {
    console.error('[sg.getActivityLog]', err);
    return [];
  }
}

/* ─── admin: source guides + analytics ───────────────────────── */

export async function getGuides(): Promise<SgGuide[]> {
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT c.code, c.name, c.champion, c.tone,
             COALESCE(g.version, 'v1.0') AS version,
             COALESCE(g.status, 'Published') AS status,
             COALESCE(g.updated_at, NOW()) AS updated_at,
             g.updated_by,
             COALESCE(mp.mappings, 0)::int AS mappings,
             COALESCE(mp.commodities, 0)::int AS commodities
      FROM sg_countries c
      LEFT JOIN sg_guide_meta g ON g.country_code = c.code
      LEFT JOIN (
        SELECT country_code, COUNT(*) AS mappings, COUNT(DISTINCT commodity_id) AS commodities
        FROM sg_mappings WHERE status='Active' GROUP BY country_code
      ) mp ON mp.country_code = c.code
      ORDER BY c.sort_order, c.name
    `);
    return rows.map(r => ({
      country: r.code, name: r.name, champion: r.champion, tone: r.tone,
      version: r.version, status: r.status, updatedAt: isoOf(r.updated_at), updatedBy: r.updated_by,
      mappings: Number(r.mappings), commodities: Number(r.commodities),
    }));
  } catch (err) {
    console.error('[sg.getGuides]', err);
    return [];
  }
}

export interface SgAnalytics {
  stats: SgStats;
  perCountry: { country: string; name: string; tone: string | null; mappings: number; commodities: number; preferred: number }[];
  topSuppliers: { id: number; name: string; mappings: number; countries: number }[];
  spendTypeBreakdown: { spendType: string; count: number }[];
}

export async function getSourceGuideAnalytics(): Promise<SgAnalytics> {
  try {
    const [stats, perCountryRes, topSuppliersRes, spendRes] = await Promise.all([
      getStats(),
      sourceGuidePool.query(`
        SELECT c.code, c.name, c.tone,
               COALESCE(COUNT(m.id) FILTER (WHERE m.status='Active'), 0)::int AS mappings,
               COALESCE(COUNT(DISTINCT m.commodity_id) FILTER (WHERE m.status='Active'), 0)::int AS commodities,
               COALESCE(COUNT(m.id) FILTER (WHERE m.status='Active' AND m.tier='Preferred'), 0)::int AS preferred
        FROM sg_countries c
        LEFT JOIN sg_mappings m ON m.country_code = c.code
        GROUP BY c.code, c.name, c.tone, c.sort_order
        ORDER BY c.sort_order
      `),
      sourceGuidePool.query(`
        SELECT s.id, s.name,
               COUNT(m.id)::int AS mappings,
               COUNT(DISTINCT m.country_code)::int AS countries
        FROM sg_suppliers s
        JOIN sg_mappings m ON m.supplier_id = s.id AND m.status='Active'
        GROUP BY s.id, s.name
        ORDER BY mappings DESC
        LIMIT 10
      `),
      sourceGuidePool.query(`
        SELECT spend_type, COUNT(*)::int AS count
        FROM sg_commodities WHERE spend_type IS NOT NULL
        GROUP BY spend_type ORDER BY count DESC
      `),
    ]);
    return {
      stats,
      perCountry: perCountryRes.rows.map(r => ({
        country: r.code, name: r.name, tone: r.tone,
        mappings: Number(r.mappings), commodities: Number(r.commodities), preferred: Number(r.preferred),
      })),
      topSuppliers: topSuppliersRes.rows.map(r => ({
        id: r.id, name: r.name, mappings: Number(r.mappings), countries: Number(r.countries),
      })),
      spendTypeBreakdown: spendRes.rows.map(r => ({ spendType: r.spend_type, count: Number(r.count) })),
    };
  } catch (err) {
    console.error('[sg.getSourceGuideAnalytics]', err);
    return { stats: { commodities: 0, suppliers: 0, mappings: 0, countries: 0, categories: 0 }, perCountry: [], topSuppliers: [], spendTypeBreakdown: [] };
  }
}

/* ─── access requests (mirror TI-TE) ─────────────────────────── */

export interface SgAccessRequest {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Denied' | 'Revoked';
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
}

export async function getSourceGuideAccessRequest(userEmail: string): Promise<SgAccessRequest | null> {
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT user_email, display_name, job_title, status, requested_countries, approved_countries, requested_at, reviewed_at
       FROM access_requests WHERE user_email = $1`,
      [userEmail],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      user_email: r.user_email, display_name: r.display_name, job_title: r.job_title,
      status: r.status, requested_countries: r.requested_countries || [],
      approved_countries: r.approved_countries || [], requested_at: isoOf(r.requested_at),
      reviewed_at: r.reviewed_at ? isoOf(r.reviewed_at) : null,
    };
  } catch (err) {
    console.error('[sg.getSourceGuideAccessRequest]', err);
    return null;
  }
}

export async function submitSourceGuideAccessRequest(input: {
  userEmail: string; displayName: string; jobTitle?: string | null;
  department?: string | null; requestedCountries: string[];
}): Promise<{ success: boolean; error?: string }> {
  if (!input.requestedCountries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    await sourceGuidePool.query(
      `INSERT INTO access_requests (user_email, display_name, job_title, department, status, requested_countries, requested_at)
       VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         requested_countries = EXCLUDED.requested_countries,
         display_name = EXCLUDED.display_name,
         status = 'Pending', requested_at = NOW(),
         reviewed_at = NULL, reviewed_by = NULL, notes = NULL, approved_countries = NULL`,
      [input.userEmail, input.displayName, input.jobTitle ?? null, input.department ?? null, input.requestedCountries],
    );
    return { success: true };
  } catch (err) {
    console.error('[sg.submitSourceGuideAccessRequest]', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

export async function getSourceGuideAccessRequests(): Promise<SgAccessRequest[]> {
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT user_email, display_name, job_title, status, requested_countries, approved_countries, requested_at, reviewed_at
      FROM access_requests
      ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC
    `);
    return rows.map(r => ({
      user_email: r.user_email, display_name: r.display_name, job_title: r.job_title,
      status: r.status, requested_countries: r.requested_countries || [],
      approved_countries: r.approved_countries || [], requested_at: isoOf(r.requested_at),
      reviewed_at: r.reviewed_at ? isoOf(r.reviewed_at) : null,
    }));
  } catch (err) {
    console.error('[sg.getSourceGuideAccessRequests]', err);
    return [];
  }
}

export async function getSourceGuidePendingCount(): Promise<number> {
  try {
    const { rows } = await sourceGuidePool.query(`SELECT COUNT(*) AS cnt FROM access_requests WHERE status='Pending'`);
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[sg.getSourceGuidePendingCount]', err);
    return 0;
  }
}

export async function approveSourceGuideAccessRequest(userEmail: string, countries: string[]): Promise<{ success: boolean; error?: string }> {
  if (!countries.length) return { success: false, error: 'Please select at least one country to approve.' };
  try {
    const reviewer = (await getSgUser())?.name ?? null;
    await sourceGuidePool.query(
      `UPDATE access_requests SET status='Approved', approved_countries=$2, reviewed_at=NOW(), reviewed_by=$3 WHERE user_email=$1`,
      [userEmail, countries, reviewer],
    );
    return { success: true };
  } catch (err) {
    console.error('[sg.approveSourceGuideAccessRequest]', err);
    return { success: false, error: 'Failed to approve request.' };
  }
}

export async function rejectSourceGuideAccessRequest(userEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const reviewer = (await getSgUser())?.name ?? null;
    await sourceGuidePool.query(
      `UPDATE access_requests SET status='Denied', approved_countries='{}', reviewed_at=NOW(), reviewed_by=$2 WHERE user_email=$1`,
      [userEmail, reviewer],
    );
    return { success: true };
  } catch (err) {
    console.error('[sg.rejectSourceGuideAccessRequest]', err);
    return { success: false, error: 'Failed to reject request.' };
  }
}

export async function revokeSourceGuideAccess(userEmail: string): Promise<{ success: boolean; error?: string }> {
  return rejectSourceGuideAccessRequest(userEmail);
}

export async function editSourceGuideAccess(userEmail: string, countries: string[]): Promise<{ success: boolean; error?: string }> {
  if (!countries.length) return { success: false, error: 'Please select at least one country.' };
  try {
    await sourceGuidePool.query(
      `UPDATE access_requests SET approved_countries=$2, reviewed_at=NOW() WHERE user_email=$1`,
      [userEmail, countries],
    );
    return { success: true };
  } catch (err) {
    console.error('[sg.editSourceGuideAccess]', err);
    return { success: false, error: 'Failed to update access.' };
  }
}

export async function deleteSourceGuideAccessRequest(userEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    await sourceGuidePool.query(`DELETE FROM access_requests WHERE user_email=$1`, [userEmail]);
    return { success: true };
  } catch (err) {
    console.error('[sg.deleteSourceGuideAccessRequest]', err);
    return { success: false, error: 'Failed to delete request.' };
  }
}
