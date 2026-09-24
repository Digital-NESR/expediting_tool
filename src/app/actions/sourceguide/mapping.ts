'use server';

/* ─── The mapping workspace: what a champion sees, and the three mutations that change it. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { MATCH_THRESHOLD, matchScore } from '@/lib/sg-fuzzy';
import type {
  SgActivityEntry,
  SgCommodity,
  SgMapping,
  SgSupplier,
  Tier,
} from '@/types/sourceguide';
import { canEdit, canRead, getSgUser, readUser } from '@/lib/sourceguide/access';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { logActivity, logUsage } from '@/lib/sourceguide/activity';
import { getAvlIndex, invalidateMappingCaches } from '@/lib/sourceguide/indexes';
import { isoOf, log, rowToCommodity } from '@/lib/sourceguide/internals';
import type { GapMode, SgCoverageGap, SgGuideRow } from '@/lib/sourceguide/types';

/* ─── mapping workspace (champion / admin) ───────────────────── */

export async function getCountryMappingSummary(
  country: string,
): Promise<{ mappings: number; commodities: number }> {
  if (!(await canRead())) return { mappings: 0, commodities: 0 };
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT COUNT(*)::int AS mappings, COUNT(DISTINCT commodity_id)::int AS commodities
       FROM sg_mappings WHERE country_code = $1 AND status='Active'`,
      [country],
    );
    return { mappings: Number(rows[0].mappings), commodities: Number(rows[0].commodities) };
  } catch (err) {
    log.error('getCountryMappingSummary.failed', err, { country });
    return { mappings: 0, commodities: 0 };
  }
}

/** commodities (with their mappings for the given country) to edit in the workspace.
 *  mode: 'mapped' = mapped here (default), 'no-preferred' = backup-only here,
 *  'missing' = sourced in another country but not here. */
export async function getMappingEditList(
  country: string,
  query: string,
  limit = 30,
  mode: GapMode = 'mapped',
): Promise<{ commodity: SgCommodity; mappings: SgMapping[] }[]> {
  if (!(await canRead())) return [];
  try {
    const q = (query || '').trim();
    const params: unknown[] = [];
    const P = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const conds: string[] = [];

    if (mode === 'no-preferred') {
      const c1 = P(country);
      conds.push(
        `EXISTS (SELECT 1 FROM sg_mappings m WHERE m.commodity_id=c.id AND m.country_code=${c1} AND m.status='Active')`,
      );
      conds.push(
        `NOT EXISTS (SELECT 1 FROM sg_mappings m WHERE m.commodity_id=c.id AND m.country_code=${c1} AND m.status='Active' AND m.tier='Preferred')`,
      );
    } else if (mode === 'missing') {
      // any catalogue commodity not mapped in this country
      const c1 = P(country);
      conds.push(
        `NOT EXISTS (SELECT 1 FROM sg_mappings m WHERE m.commodity_id=c.id AND m.country_code=${c1} AND m.status='Active')`,
      );
    } else if (!q) {
      const c1 = P(country);
      conds.push(
        `EXISTS (SELECT 1 FROM sg_mappings m WHERE m.commodity_id=c.id AND m.country_code=${c1} AND m.status='Active')`,
      );
    }
    if (q) {
      const lk = P(`%${q}%`);
      conds.push(
        `(c.name ILIKE ${lk} OR c.category ILIKE ${lk} OR c.sub_category ILIKE ${lk} OR c.family ILIKE ${lk} OR c.code ILIKE ${lk} OR c.keywords ILIKE ${lk})`,
      );
    }

    const comFilter = `
      SELECT c.id, c.code, c.name, c.category, c.category_id, c.sub_category, c.family, c.spend_type, c.description
      FROM sg_commodities c
      ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
      ORDER BY c.name
      LIMIT ${Number(limit)}
    `;

    const comRes = await sourceGuidePool.query(comFilter, params);
    if (!comRes.rows.length) return [];
    const ids = comRes.rows.map((r) => r.id);

    const mapRes = await sourceGuidePool.query(
      `SELECT m.id, m.commodity_id, m.supplier_code, m.country_code, m.tier, m.status,
              a.name AS supplier_name, a.central_block_status
       FROM sg_mappings m
       JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       WHERE m.status='Active' AND m.country_code = $1 AND m.commodity_id = ANY($2)`,
      [country, ids],
    );
    const byCom = new Map<number, SgMapping[]>();
    for (const m of mapRes.rows) {
      (byCom.get(m.commodity_id) ?? byCom.set(m.commodity_id, []).get(m.commodity_id)!).push({
        id: m.id,
        commodityId: m.commodity_id,
        supplierName: m.supplier_name ?? '',
        supplierCode: m.supplier_code,
        supplierBlocked: isCentrallyBlocked(m.central_block_status),
        country: m.country_code,
        tier: m.tier,
        status: m.status,
      });
    }

    return comRes.rows.map((r) => ({
      commodity: rowToCommodity(r),
      mappings: byCom.get(r.id) ?? [],
    }));
  } catch (err) {
    log.error('getMappingEditList.failed', err);
    return [];
  }
}

/** Per-country coverage gaps, measured against the full commodity taxonomy. */
export async function getCoverageGapsSummary(): Promise<SgCoverageGap[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      WITH catalogue_total AS (
        SELECT COUNT(*)::int AS n FROM sg_commodities
      )
      SELECT c.code, c.name, c.tone,
             (SELECT n FROM catalogue_total) AS catalogue_total,
             COUNT(DISTINCT m.commodity_id)::int AS covered,
             COUNT(DISTINCT m.commodity_id) FILTER (WHERE m.tier='Preferred')::int AS with_pref,
             COUNT(DISTINCT m.commodity_id) FILTER (WHERE m.tier='Backup')::int AS with_backup
      FROM sg_countries c
      LEFT JOIN sg_mappings m ON m.country_code = c.code AND m.status='Active'
      GROUP BY c.code, c.name, c.tone, c.sort_order
      ORDER BY c.sort_order, c.name
    `);
    return rows.map((r) => {
      const catalogueTotal = Number(r.catalogue_total);
      const covered = Number(r.covered);
      const withPref = Number(r.with_pref);
      const withBackup = Number(r.with_backup);
      return {
        country: r.code,
        name: r.name,
        tone: r.tone,
        catalogueTotal,
        covered,
        missing: Math.max(0, catalogueTotal - covered),
        noPreferred: Math.max(0, covered - withPref),
        noBackup: Math.max(0, covered - withBackup),
        coverage: catalogueTotal ? covered / catalogueTotal : 0,
      };
    });
  } catch (err) {
    log.error('getCoverageGapsSummary.failed', err);
    return [];
  }
}

export async function getCountryGuideRows(code: string): Promise<SgGuideRow[]> {
  if (!(await canRead())) return [];
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT c.spend_type, c.category, COALESCE(c.sub_category,'') AS sub_category,
              COALESCE(c.family,'') AS family, c.name AS commodity, c.code AS unspsc,
              m.tier, m.supplier_code, a.name AS supplier_name, COALESCE(a.email,'') AS supplier_email,
              a.central_block_status
       FROM sg_mappings m
       JOIN sg_commodities c ON c.id = m.commodity_id
       JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       WHERE m.country_code = $1 AND m.status='Active'
       ORDER BY c.category, c.sub_category NULLS FIRST, c.family NULLS FIRST, c.name, (m.tier='Preferred') DESC, a.name`,
      [code],
    );
    return rows.map((r) => ({
      country: code,
      spendType: r.spend_type,
      category: r.category,
      subCategory: r.sub_category,
      family: r.family,
      commodity: r.commodity,
      unspsc: r.unspsc,
      tier: r.tier,
      supplierCode: r.supplier_code,
      supplierName: r.supplier_name,
      supplierEmail: r.supplier_email,
      supplierBlocked: isCentrallyBlocked(r.central_block_status),
    }));
  } catch (err) {
    log.error('getCountryGuideRows.failed', err, { code });
    return [];
  }
}

/** Approved-vendor picker for the mapping workspace — fuzzy over the full AVL. */
export async function supplierOptions(
  country: string,
  prefix: string,
  limit = 8,
): Promise<SgSupplier[]> {
  if (!(await canRead())) return [];
  try {
    const p = (prefix || '').trim();
    if (!p) return [];
    const avl = await getAvlIndex();
    // fuzzy-rank the whole AVL by name (or exact code), keep a few extra to re-rank by in-country
    const top = avl
      .map((a) => ({ a, score: Math.max(matchScore(p, a.name), a.code.includes(p) ? 1.5 : 0) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
      .slice(0, limit * 4);
    if (!top.length) return [];

    // which of these candidates are already mapped in this country
    const codes = top.map((x) => x.a.code);
    const inCountry = new Set<string>();
    const { rows } = await sourceGuidePool.query(
      `SELECT DISTINCT supplier_code FROM sg_mappings WHERE country_code=$1 AND status='Active' AND supplier_code = ANY($2)`,
      [country, codes],
    );
    for (const r of rows) inCountry.add(r.supplier_code);

    return top
      .sort(
        (x, y) =>
          (inCountry.has(y.a.code) ? 1 : 0) - (inCountry.has(x.a.code) ? 1 : 0) ||
          y.score - x.score,
      )
      .slice(0, limit)
      .map((x) => ({
        code: x.a.code,
        name: x.a.name,
        countries: inCountry.has(x.a.code) ? [country] : [],
      }));
  } catch (err) {
    log.error('supplierOptions.failed', err, { country });
    return [];
  }
}

/** Record a committed search from the search UI. Fire-and-forget from the client. */
export async function recordSearch(query: string): Promise<void> {
  const viewer = await readUser();
  if (!viewer) return;
  const q = (query || '').trim();
  if (!q) return;
  await logUsage('search', 'search', q.slice(0, 200), null, viewer);
}

export async function addMapping(input: {
  commodityId: number;
  country: string;
  tier: Tier;
  supplierCode: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  if (!(await canEdit(user, input.country)))
    return { success: false, error: 'You cannot edit this country.' };

  const code = (input.supplierCode || '').trim();
  if (!code)
    return { success: false, error: 'Please pick a supplier from the Approved Vendor List.' };

  try {
    // supplier must exist in the AVL
    const avl = await sourceGuidePool.query(
      `SELECT name FROM supplier_avl WHERE supplier_code = $1`,
      [code],
    );
    if (!avl.rows.length)
      return { success: false, error: 'That supplier code is not in the Approved Vendor List.' };
    const supplierName = avl.rows[0].name;

    // upsert the mapping (keyed by vendor code)
    const existing = await sourceGuidePool.query(
      `SELECT id FROM sg_mappings WHERE commodity_id=$1 AND country_code=$2 AND supplier_code=$3 AND status='Active'`,
      [input.commodityId, input.country, code],
    );
    if (existing.rows.length) {
      await sourceGuidePool.query(`UPDATE sg_mappings SET tier=$2 WHERE id=$1`, [
        existing.rows[0].id,
        input.tier,
      ]);
    } else {
      await sourceGuidePool.query(
        `INSERT INTO sg_mappings (commodity_id, supplier_code, country_code, tier, status)
         VALUES ($1, $2, $3, $4, 'Active')`,
        [input.commodityId, code, input.country, input.tier],
      );
    }

    invalidateMappingCaches();
    const com = await sourceGuidePool.query(`SELECT name FROM sg_commodities WHERE id=$1`, [
      input.commodityId,
    ]);
    await logActivity(
      input.country,
      input.commodityId,
      'Add',
      `${input.tier} · ${supplierName} → ${com.rows[0]?.name ?? ''}`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('addMapping.failed', err);
    return { success: false, error: 'Failed to add supplier.' };
  }
}

export async function removeMapping(mapId: number): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  try {
    const m = await sourceGuidePool.query(
      `SELECT m.country_code, m.tier, m.commodity_id,
              COALESCE(a.name, '') AS supplier_name, c.name AS com_name
       FROM sg_mappings m
       LEFT JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       JOIN sg_commodities c ON c.id=m.commodity_id WHERE m.id=$1`,
      [mapId],
    );
    if (!m.rows.length) return { success: false, error: 'Mapping not found.' };
    const row = m.rows[0];
    if (!(await canEdit(user, row.country_code)))
      return { success: false, error: 'You cannot edit this country.' };

    await sourceGuidePool.query(`UPDATE sg_mappings SET status='Inactive' WHERE id=$1`, [mapId]);
    invalidateMappingCaches();
    await logActivity(
      row.country_code,
      row.commodity_id,
      'Deactivate',
      `${row.tier} · ${row.supplier_name} ✕ ${row.com_name}`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('removeMapping.failed', err, { mapId });
    return { success: false, error: 'Failed to remove supplier.' };
  }
}

export async function changeTier(
  mapId: number,
  tier: Tier,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  try {
    const m = await sourceGuidePool.query(
      `SELECT m.country_code, m.tier, m.commodity_id,
              COALESCE(a.name, '') AS supplier_name, c.name AS com_name
       FROM sg_mappings m
       LEFT JOIN supplier_avl a ON a.supplier_code = m.supplier_code
       JOIN sg_commodities c ON c.id=m.commodity_id WHERE m.id=$1`,
      [mapId],
    );
    if (!m.rows.length) return { success: false, error: 'Mapping not found.' };
    const row = m.rows[0];
    if (!(await canEdit(user, row.country_code)))
      return { success: false, error: 'You cannot edit this country.' };

    await sourceGuidePool.query(`UPDATE sg_mappings SET tier=$2 WHERE id=$1`, [mapId, tier]);
    invalidateMappingCaches();
    await logActivity(
      row.country_code,
      row.commodity_id,
      'Edit tier',
      `${row.supplier_name}: ${row.tier} → ${tier} (${row.com_name})`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('changeTier.failed', err, { mapId, tier });
    return { success: false, error: 'Failed to change tier.' };
  }
}

export async function getActivityLog(
  country: string | null,
  limit = 20,
): Promise<SgActivityEntry[]> {
  if (!(await canRead())) return [];
  try {
    const sql = country
      ? `SELECT * FROM sg_activity_log WHERE country_code=$1 ORDER BY performed_at DESC LIMIT $2`
      : `SELECT * FROM sg_activity_log ORDER BY performed_at DESC LIMIT $1`;
    const params = country ? [country, limit] : [limit];
    const { rows } = await sourceGuidePool.query(sql, params);
    return rows.map((r) => ({
      id: r.id,
      country: r.country_code,
      commodityId: r.commodity_id,
      action: r.action,
      details: r.details,
      performedBy: r.performed_by,
      performedAt: isoOf(r.performed_at),
    }));
  } catch (err) {
    log.error('getActivityLog.failed', err, { country });
    return [];
  }
}
