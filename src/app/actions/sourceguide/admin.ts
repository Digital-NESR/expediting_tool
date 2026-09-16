'use server';

/* ─── The admin console: guides, dashboards, analytics, insights and the audit feed. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import type { SgGuide } from '@/types/sourceguide';
import { getStats } from '@/app/actions/sourceguide/reference';
import { canReadAdmin, readUser } from '@/lib/sourceguide/access';
import { logUsage } from '@/lib/sourceguide/activity';
import { isoOf, log, readFailed } from '@/lib/sourceguide/internals';
import {
  EMPTY_ANALYTICS,
  EMPTY_INSIGHTS,
  SgAnalytics,
  SgAuditEntry,
  SgCountryDashboard,
  SgInsights,
  SgUserActivity,
} from '@/lib/sourceguide/types';

/* ─── admin: source guides + analytics ───────────────────────── */

export async function getGuides(): Promise<SgGuide[]> {
  if (!(await canReadAdmin())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT c.code, c.name, c.tone,
             COALESCE(ch.champions, '') AS champion,
             COALESCE(g.version, 'v1.0') AS version,
             COALESCE(g.status, 'Published') AS status,
             COALESCE(g.updated_at, NOW()) AS updated_at,
             g.updated_by,
             COALESCE(mp.mappings, 0)::int AS mappings,
             COALESCE(mp.commodities, 0)::int AS commodities
      FROM sg_countries c
      LEFT JOIN sg_guide_meta g ON g.country_code = c.code
      LEFT JOIN (
        SELECT country_code, STRING_AGG(name, ', ' ORDER BY name) AS champions
        FROM sg_champions GROUP BY country_code
      ) ch ON ch.country_code = c.code
      LEFT JOIN (
        SELECT country_code, COUNT(*) AS mappings, COUNT(DISTINCT commodity_id) AS commodities
        FROM sg_mappings WHERE status='Active' GROUP BY country_code
      ) mp ON mp.country_code = c.code
      ORDER BY c.sort_order, c.name
    `);
    return rows.map((r) => ({
      country: r.code,
      name: r.name,
      champion: r.champion,
      tone: r.tone,
      version: r.version,
      status: r.status,
      updatedAt: isoOf(r.updated_at),
      updatedBy: r.updated_by,
      mappings: Number(r.mappings),
      commodities: Number(r.commodities),
    }));
  } catch (err) {
    log.error('getGuides.failed', err);
    return [];
  }
}

export async function getCountryDashboard(code: string): Promise<SgCountryDashboard | null> {
  const viewer = await readUser();
  if (!viewer) return null;
  try {
    const cRes = await sourceGuidePool.query(
      `SELECT c.code, c.name, c.tone,
              COALESCE(g.version, 'v1.0') AS version,
              COALESCE(g.status, 'Published') AS status,
              COALESCE(g.updated_at, NOW()) AS updated_at,
              COALESCE((SELECT ARRAY_AGG(name ORDER BY name) FROM sg_champions WHERE country_code = c.code), '{}') AS champions
       FROM sg_countries c
       LEFT JOIN sg_guide_meta g ON g.country_code = c.code
       WHERE c.code = $1`,
      [code],
    );
    if (!cRes.rows.length) return null;
    const c = cRes.rows[0];

    const [statsRes, catRes, supRes] = await Promise.all([
      sourceGuidePool.query(
        `SELECT COUNT(*)::int AS mappings,
                COUNT(DISTINCT commodity_id)::int AS commodities,
                COUNT(*) FILTER (WHERE tier='Preferred')::int AS preferred,
                COUNT(DISTINCT supplier_code)::int AS suppliers
         FROM sg_mappings WHERE country_code = $1 AND status='Active'`,
        [code],
      ),
      sourceGuidePool.query(
        `SELECT c.category_id, c.category, COUNT(DISTINCT m.commodity_id)::int AS commodities
         FROM sg_mappings m JOIN sg_commodities c ON c.id = m.commodity_id
         WHERE m.country_code = $1 AND m.status='Active'
         GROUP BY c.category_id, c.category ORDER BY commodities DESC`,
        [code],
      ),
      sourceGuidePool.query(
        `SELECT a.supplier_code, a.name, COUNT(m.id)::int AS mappings
         FROM sg_mappings m JOIN supplier_avl a ON a.supplier_code = m.supplier_code
         WHERE m.country_code = $1 AND m.status='Active'
         GROUP BY a.supplier_code, a.name ORDER BY mappings DESC LIMIT 8`,
        [code],
      ),
    ]);
    const s = statsRes.rows[0];
    void logUsage('view', 'country', c.name, c.code, viewer);
    return {
      code: c.code,
      name: c.name,
      tone: c.tone,
      champions: c.champions || [],
      version: c.version,
      status: c.status,
      updatedAt: isoOf(c.updated_at),
      stats: {
        mappings: Number(s.mappings),
        commodities: Number(s.commodities),
        preferred: Number(s.preferred),
        suppliers: Number(s.suppliers),
      },
      categories: catRes.rows.map((r) => ({
        id: r.category_id,
        name: r.category,
        commodities: Number(r.commodities),
      })),
      topSuppliers: supRes.rows.map((r) => ({
        code: r.supplier_code,
        name: r.name,
        mappings: Number(r.mappings),
      })),
    };
  } catch (err) {
    readFailed('getCountryDashboard', err, { code });
  }
}

export async function getSourceGuideAnalytics(): Promise<SgAnalytics> {
  if (!(await canReadAdmin())) return EMPTY_ANALYTICS;
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
        SELECT a.supplier_code, a.name,
               COUNT(m.id)::int AS mappings,
               COUNT(DISTINCT m.country_code)::int AS countries
        FROM supplier_avl a
        JOIN sg_mappings m ON m.supplier_code = a.supplier_code AND m.status='Active'
        GROUP BY a.supplier_code, a.name
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
      perCountry: perCountryRes.rows.map((r) => ({
        country: r.code,
        name: r.name,
        tone: r.tone,
        mappings: Number(r.mappings),
        commodities: Number(r.commodities),
        preferred: Number(r.preferred),
      })),
      topSuppliers: topSuppliersRes.rows.map((r) => ({
        code: r.supplier_code,
        name: r.name,
        mappings: Number(r.mappings),
        countries: Number(r.countries),
      })),
      spendTypeBreakdown: spendRes.rows.map((r) => ({
        spendType: r.spend_type,
        count: Number(r.count),
      })),
    };
  } catch (err) {
    log.error('getSourceGuideAnalytics.failed', err);
    return EMPTY_ANALYTICS;
  }
}

export async function getSourceGuideInsights(): Promise<SgInsights> {
  if (!(await canReadAdmin())) return EMPTY_INSIGHTS;
  try {
    const [tierRes, avlRes, covRes, pairRes, champRes, catRes, multiRes, actRes, multiCountRes] =
      await Promise.all([
        sourceGuidePool.query(
          `SELECT tier, COUNT(*)::int AS n FROM sg_mappings WHERE status='Active' GROUP BY tier`,
        ),
        sourceGuidePool.query(`SELECT (SELECT COUNT(*)::int FROM supplier_avl) AS total,
        (SELECT COUNT(DISTINCT m.supplier_code)::int FROM sg_mappings m JOIN supplier_avl a ON a.supplier_code = m.supplier_code WHERE m.status='Active') AS mapped`),
        sourceGuidePool.query(`SELECT (SELECT COUNT(*)::int FROM sg_commodities) AS catalogue,
        (SELECT COUNT(DISTINCT commodity_id)::int FROM sg_mappings WHERE status='Active') AS covered`),
        sourceGuidePool.query(`
        SELECT
          COUNT(*) FILTER (WHERE n = 1)::int AS single_source,
          COUNT(*) FILTER (WHERE prefs = 0)::int AS no_preferred
        FROM (
          SELECT country_code, commodity_id, COUNT(*) AS n,
                 COUNT(*) FILTER (WHERE tier='Preferred') AS prefs
          FROM sg_mappings WHERE status='Active'
          GROUP BY country_code, commodity_id
        ) t`),
        sourceGuidePool.query(`SELECT
        (SELECT COUNT(*)::int FROM sg_countries) AS countries_total,
        (SELECT COUNT(DISTINCT country_code)::int FROM sg_champions) AS with_champion,
        (SELECT COUNT(DISTINCT country_code)::int FROM sg_champions WHERE email IS NOT NULL AND email <> '') AS with_email`),
        sourceGuidePool.query(`
        SELECT c.category, COUNT(*)::int AS catalogue,
               COUNT(*) FILTER (WHERE mp.commodity_id IS NOT NULL)::int AS covered
        FROM sg_commodities c
        LEFT JOIN (SELECT DISTINCT commodity_id FROM sg_mappings WHERE status='Active') mp ON mp.commodity_id = c.id
        GROUP BY c.category ORDER BY catalogue DESC`),
        sourceGuidePool.query(`
        SELECT a.supplier_code, a.name,
               COUNT(DISTINCT m.country_code)::int AS countries, COUNT(m.id)::int AS mappings
        FROM supplier_avl a
        JOIN sg_mappings m ON m.supplier_code = a.supplier_code AND m.status='Active'
        GROUP BY a.supplier_code, a.name
        HAVING COUNT(DISTINCT m.country_code) > 1
        ORDER BY countries DESC, mappings DESC LIMIT 10`),
        sourceGuidePool.query(
          `SELECT COUNT(*)::int AS n FROM sg_activity_log WHERE performed_at > NOW() - INTERVAL '30 days'`,
        ),
        sourceGuidePool.query(`
        SELECT COUNT(*)::int AS n FROM (
          SELECT supplier_code FROM sg_mappings WHERE status='Active'
          GROUP BY supplier_code HAVING COUNT(DISTINCT country_code) > 1
        ) t`),
      ]);

    const tierMap = new Map(tierRes.rows.map((r) => [r.tier, Number(r.n)]));

    return {
      tier: { preferred: tierMap.get('Preferred') ?? 0, backup: tierMap.get('Backup') ?? 0 },
      avl: { total: Number(avlRes.rows[0].total), mapped: Number(avlRes.rows[0].mapped) },
      coverageOverall: {
        catalogue: Number(covRes.rows[0].catalogue),
        coveredAnywhere: Number(covRes.rows[0].covered),
      },
      multiCountrySuppliers: Number(multiCountRes.rows[0]?.n ?? 0),
      singleSourcePairs: Number(pairRes.rows[0]?.single_source ?? 0),
      noPreferredPairs: Number(pairRes.rows[0]?.no_preferred ?? 0),
      champions: {
        countriesTotal: Number(champRes.rows[0].countries_total),
        withChampion: Number(champRes.rows[0].with_champion),
        withEmail: Number(champRes.rows[0].with_email),
      },
      categoryCoverage: catRes.rows.map((r) => ({
        category: r.category,
        catalogue: Number(r.catalogue),
        covered: Number(r.covered),
      })),
      topMultiCountry: multiRes.rows.map((r) => ({
        code: r.supplier_code,
        name: r.name,
        countries: Number(r.countries),
        mappings: Number(r.mappings),
      })),
      activity30d: Number(actRes.rows[0].n),
    };
  } catch (err) {
    log.error('getSourceGuideInsights.failed', err);
    return EMPTY_INSIGHTS;
  }
}

export async function getSourceGuideAuditLog(limit = 500): Promise<SgAuditEntry[]> {
  if (!(await canReadAdmin())) return [];
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT l.id, l.action, l.details, l.country_code, l.commodity_id, l.performed_by, l.performed_at,
              c.name AS country_name, c.tone, cm.name AS commodity_name
       FROM sg_activity_log l
       LEFT JOIN sg_countries c ON c.code = l.country_code
       LEFT JOIN sg_commodities cm ON cm.id = l.commodity_id
       ORDER BY l.performed_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      country: r.country_code,
      countryName: r.country_name,
      tone: r.tone,
      commodityId: r.commodity_id,
      commodityName: r.commodity_name,
      performedBy: r.performed_by,
      performedAt: isoOf(r.performed_at),
    }));
  } catch (err) {
    log.error('getSourceGuideAuditLog.failed', err);
    return [];
  }
}

export async function getUserActivity(): Promise<SgUserActivity[]> {
  if (!(await canReadAdmin())) return [];
  try {
    // Key both sides by a stable identity: the actor email where known, else the display name (lowercased).
    // This keeps one human as one row across a display-name change or case/whitespace drift.
    const [actRes, useRes] = await Promise.all([
      sourceGuidePool.query(`
        SELECT LOWER(COALESCE(NULLIF(performed_by_email, ''), performed_by)) AS key,
               MAX(performed_by) AS name,
               COUNT(*)::int AS edits,
               COUNT(*) FILTER (WHERE action NOT LIKE 'Champion%' AND action NOT LIKE 'Access%')::int AS mappings,
               COUNT(*) FILTER (WHERE action LIKE 'Champion%')::int AS champions,
               COUNT(*) FILTER (WHERE action LIKE 'Access%')::int AS access,
               COUNT(DISTINCT country_code)::int AS countries,
               MAX(performed_at) AS last_active
        FROM sg_activity_log
        WHERE COALESCE(NULLIF(performed_by_email, ''), performed_by) IS NOT NULL
          AND COALESCE(NULLIF(performed_by_email, ''), performed_by) <> ''
        GROUP BY LOWER(COALESCE(NULLIF(performed_by_email, ''), performed_by))`),
      sourceGuidePool.query(`
        SELECT LOWER(COALESCE(NULLIF(user_email, ''), user_name)) AS key,
               MAX(COALESCE(user_name, user_email)) AS name,
               COUNT(*) FILTER (WHERE event_type='view')::int AS views,
               COUNT(*) FILTER (WHERE event_type='search')::int AS searches,
               MAX(created_at) AS last_active
        FROM sg_usage_log
        WHERE COALESCE(NULLIF(user_email, ''), user_name) IS NOT NULL
        GROUP BY LOWER(COALESCE(NULLIF(user_email, ''), user_name))`),
    ]);

    const map = new Map<string, SgUserActivity>();
    const ensure = (key: string, name: string): SgUserActivity => {
      let r = map.get(key);
      if (!r) {
        r = {
          user: name || key,
          views: 0,
          searches: 0,
          edits: 0,
          mappings: 0,
          champions: 0,
          access: 0,
          countries: 0,
          lastActive: '',
        };
        map.set(key, r);
      }
      // prefer a human name over an email/key for display
      else if (name && (!r.user || r.user.includes('@')) && !name.includes('@')) r.user = name;
      return r;
    };
    for (const a of actRes.rows) {
      const r = ensure(a.key, a.name);
      r.edits = Number(a.edits);
      r.mappings = Number(a.mappings);
      r.champions = Number(a.champions);
      r.access = Number(a.access);
      r.countries = Number(a.countries);
      const la = isoOf(a.last_active);
      if (la > r.lastActive) r.lastActive = la;
    }
    for (const u of useRes.rows) {
      const r = ensure(u.key, u.name);
      r.views = Number(u.views);
      r.searches = Number(u.searches);
      const la = isoOf(u.last_active);
      if (la > r.lastActive) r.lastActive = la;
    }
    return [...map.values()].sort(
      (a, b) =>
        b.views + b.searches + b.edits - (a.views + a.searches + a.edits) ||
        b.lastActive.localeCompare(a.lastActive),
    );
  } catch (err) {
    log.error('getUserActivity.failed', err);
    return [];
  }
}
