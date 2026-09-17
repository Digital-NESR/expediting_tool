'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/require-access';
import snsPool from '@/lib/db-sns';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import type { ActionResult } from './sns';

/**
 * The named approvers behind the two validation levels.
 *
 * Roles in sns_access_requests say what a person is *allowed* to do. The tables
 * here say who the approver actually *is* for a given country or category —
 * which is what routing needs, because an email has to go to a person, not to
 * everyone holding a role.
 *
 * Level 1 is keyed on sns_country.code rather than the display name, for the
 * same reason sns_record.country_code exists: names are editable reference
 * data, and renaming a country must not silently orphan its approver.
 */

const log = logger('sns-registry');

/* ═══ Admin gate ═════════════════════════════════════════════════ */

async function mutate(event: string, fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Admins only.' };
  }
  try {
    await fn();
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505')
      return { success: false, error: 'That country or category already has a manager.' };
    log.error(event, err);
    return { success: false, error: 'Could not save the change.' };
  }
}

/* ═══ Shapes ═════════════════════════════════════════════════════ */

export interface CountryManager {
  id: number;
  /** sns_country.code — the identity. */
  countryCode: string;
  /** Display name resolved from sns_country; empty if the code no longer resolves. */
  countryName: string;
  name: string;
  email: string;
  title: string;
  active: boolean;
}

export interface CategoryManager {
  id: number;
  /** null means Supply Chain Director — able to sign off any category. */
  category: string | null;
  name: string;
  email: string;
  title: string;
  active: boolean;
}

export interface SnsApproverAdminData {
  countryManagers: CountryManager[];
  categoryManagers: CategoryManager[];
  /** Active countries with nobody assigned — the gap list for the admin. */
  countriesWithoutManager: { code: string; name: string }[];
  /** Categories from sg_commodities with nobody assigned. */
  categoriesWithoutManager: string[];
}

function mapCountryManager(r: Record<string, unknown>): CountryManager {
  return {
    id: Number(r.id),
    countryCode: String(r.country_code),
    countryName: r.country_name ? String(r.country_name) : String(r.country_code),
    name: String(r.manager_name ?? ''),
    email: String(r.manager_email),
    title: String(r.manager_title ?? 'Country Supply Chain Manager'),
    active: Boolean(r.active),
  };
}

function mapCategoryManager(r: Record<string, unknown>): CategoryManager {
  return {
    id: Number(r.id),
    category: r.category === null || r.category === undefined ? null : String(r.category),
    name: String(r.manager_name ?? ''),
    email: String(r.manager_email),
    title: String(r.manager_title ?? 'Category Manager'),
    active: Boolean(r.active),
  };
}

/* ═══ Categories (from sg_commodities) ═══════════════════════════ */

/**
 * The distinct spend categories, read from SourceGuide's catalogue — the same
 * list the wizard's Category column shows. Assigning a manager needs the exact
 * strings sg_commodities uses, since that is what lands on sns_record_node.
 */
export async function getSnsSpendCategories(): Promise<string[]> {
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT DISTINCT category FROM sg_commodities
        WHERE category IS NOT NULL AND category <> ''
        ORDER BY category`,
    );
    return rows.map((r) => String(r.category));
  } catch (err) {
    log.error('spendCategories.failed', err);
    return [];
  }
}

/* ═══ Reads ══════════════════════════════════════════════════════ */

export async function getSnsApproverAdminData(): Promise<SnsApproverAdminData> {
  const empty: SnsApproverAdminData = {
    countryManagers: [],
    categoryManagers: [],
    countriesWithoutManager: [],
    categoriesWithoutManager: [],
  };

  try {
    const [countryRes, categoryRes, countriesRes, categories] = await Promise.all([
      snsPool.query(
        `SELECT m.*, c.name AS country_name
           FROM sns_country_manager m
           LEFT JOIN sns_country c ON c.code = m.country_code
          ORDER BY COALESCE(c.sort_order, 9999), c.name, m.country_code`,
      ),
      snsPool.query(
        `SELECT * FROM sns_category_manager
          ORDER BY category IS NOT NULL, category, manager_name`,
      ),
      snsPool.query(`SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`),
      getSnsSpendCategories(),
    ]);

    const countryManagers = countryRes.rows.map(mapCountryManager);
    const categoryManagers = categoryRes.rows.map(mapCategoryManager);

    const assignedCodes = new Set(
      countryManagers.filter((m) => m.active).map((m) => m.countryCode),
    );
    const assignedCategories = new Set(
      categoryManagers.filter((m) => m.active && m.category).map((m) => m.category as string),
    );

    return {
      countryManagers,
      categoryManagers,
      countriesWithoutManager: countriesRes.rows
        .map((r) => ({ code: String(r.code), name: String(r.name) }))
        .filter((c) => !assignedCodes.has(c.code)),
      categoriesWithoutManager: categories.filter((c) => !assignedCategories.has(c)),
    };
  } catch (err) {
    log.error('approverAdminData.failed', err);
    return empty;
  }
}

/* ═══ Resolution — used by routing and by the permission checks ══ */

export interface ResolvedApprover {
  name: string;
  email: string;
  title: string;
  /** Which rule put this person on the list. */
  basis: string;
}

/** The Level 1 approver for a country code, or null if nobody is assigned yet. */
export async function resolveSnsLevel1Approver(
  countryCode: string,
): Promise<ResolvedApprover | null> {
  if (!countryCode) return null;
  try {
    const { rows } = await snsPool.query(
      `SELECT m.*, c.name AS country_name
         FROM sns_country_manager m
         LEFT JOIN sns_country c ON c.code = m.country_code
        WHERE m.country_code = $1 AND m.active
        LIMIT 1`,
      [countryCode],
    );
    if (!rows.length) return null;
    const m = mapCountryManager(rows[0]);
    return {
      name: m.name || m.email,
      email: m.email,
      title: m.title,
      basis: `Country Supply Chain Manager — ${m.countryName}`,
    };
  } catch (err) {
    log.error('resolveLevel1.failed', err, { countryCode });
    return null;
  }
}

/**
 * Everyone entitled to sign a record off at Level 2: the manager of each
 * category the record touches, plus every Supply Chain Director.
 *
 * A record may span categories, and the agreed rule is that any one of these
 * people may sign — so this is the notify list and the permission list at once.
 */
export async function resolveSnsLevel2Approvers(categories: string[]): Promise<ResolvedApprover[]> {
  try {
    const { rows } = await snsPool.query(
      `SELECT * FROM sns_category_manager
        WHERE active AND (category IS NULL OR category = ANY($1))`,
      [categories],
    );

    const seen = new Set<string>();
    const out: ResolvedApprover[] = [];
    for (const raw of rows) {
      const m = mapCategoryManager(raw);
      const key = m.email.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: m.name || m.email,
        email: m.email,
        title: m.title,
        basis: m.category ? `Category Manager — ${m.category}` : 'Supply Chain Director',
      });
    }
    return out;
  } catch (err) {
    log.error('resolveLevel2.failed', err);
    return [];
  }
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether `email` is the named Level 1 approver for `countryCode`.
 *
 * Returns `unassigned` when the country has no manager configured. The caller
 * decides what to do with that: the registry falls back to the role grant, so a
 * country whose manager has not been loaded yet is not deadlocked.
 */
export async function isSnsLevel1Approver(
  email: string,
  countryCode: string,
): Promise<{ allowed: boolean; unassigned: boolean }> {
  const approver = await resolveSnsLevel1Approver(countryCode);
  if (!approver) return { allowed: false, unassigned: true };
  return { allowed: sameEmail(approver.email, email), unassigned: false };
}

/** As above, for Level 2, against every category the record touches. */
export async function isSnsLevel2Approver(
  email: string,
  categories: string[],
): Promise<{ allowed: boolean; unassigned: boolean }> {
  const approvers = await resolveSnsLevel2Approvers(categories);
  if (!approvers.length) return { allowed: false, unassigned: true };
  return { allowed: approvers.some((a) => sameEmail(a.email, email)), unassigned: false };
}

/* ═══ Country manager mutations ══════════════════════════════════ */

export async function upsertSnsCountryManager(
  countryCode: string,
  name: string,
  email: string,
  title: string,
): Promise<ActionResult> {
  const code = countryCode.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();
  if (!code) return { success: false, error: 'Select a country.' };
  if (!cleanEmail.includes('@')) return { success: false, error: 'Enter a valid email address.' };

  return mutate('upsertCountryManager.failed', async () => {
    await snsPool.query(
      `INSERT INTO sns_country_manager (country_code, manager_name, manager_email, manager_title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (country_code) DO UPDATE
         SET manager_name  = EXCLUDED.manager_name,
             manager_email = EXCLUDED.manager_email,
             manager_title = EXCLUDED.manager_title,
             active        = TRUE,
             updated_at    = CURRENT_TIMESTAMP`,
      [code, name.trim(), cleanEmail, title.trim() || 'Country Supply Chain Manager'],
    );
  });
}

export async function setSnsCountryManagerActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return mutate('setCountryManagerActive.failed', async () => {
    await snsPool.query(
      `UPDATE sns_country_manager SET active = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, active],
    );
  });
}

export async function deleteSnsCountryManager(id: number): Promise<ActionResult> {
  return mutate('deleteCountryManager.failed', async () => {
    await snsPool.query(`DELETE FROM sns_country_manager WHERE id = $1`, [id]);
  });
}

/**
 * Loads the whole Level 1 list in one go.
 *
 * The country managers arrive as a list from the S&S team rather than one at a
 * time, and retyping a dozen rows through a form invites typos in exactly the
 * field — the email — that decides who can approve.
 *
 * Entries may name a country either way round: the code, or the display name.
 * Anything that resolves to neither is skipped and reported rather than
 * guessed at, since a misfiled approver routes records to the wrong person.
 */
export async function bulkUpsertSnsCountryManagers(
  entries: { country: string; name: string; email: string; title?: string }[],
): Promise<ActionResult & { saved?: number; skipped?: string[] }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, error: 'Admins only.' };
  }

  const client = await snsPool.connect();
  try {
    const { rows: countryRows } = await client.query(`SELECT code, name FROM sns_country`);
    const byCode = new Map<string, string>();
    for (const r of countryRows) {
      byCode.set(String(r.code).toUpperCase(), String(r.code));
      byCode.set(String(r.name).trim().toLowerCase(), String(r.code));
    }

    const resolved: { code: string; name: string; email: string; title: string }[] = [];
    const skipped: string[] = [];

    for (const e of entries) {
      const raw = e.country.trim();
      const email = e.email.trim().toLowerCase();
      const code = byCode.get(raw.toUpperCase()) ?? byCode.get(raw.toLowerCase());
      if (!code || !email.includes('@')) {
        if (raw) skipped.push(raw);
        continue;
      }
      resolved.push({
        code,
        name: e.name.trim(),
        email,
        title: (e.title ?? '').trim() || 'Country Supply Chain Manager',
      });
    }

    if (!resolved.length) {
      return {
        success: false,
        error: 'Nothing to import — no row named a known country with a valid email.',
        skipped,
      };
    }

    await client.query('BEGIN');
    for (const r of resolved) {
      await client.query(
        `INSERT INTO sns_country_manager (country_code, manager_name, manager_email, manager_title)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (country_code) DO UPDATE
           SET manager_name  = EXCLUDED.manager_name,
               manager_email = EXCLUDED.manager_email,
               manager_title = EXCLUDED.manager_title,
               active        = TRUE,
               updated_at    = CURRENT_TIMESTAMP`,
        [r.code, r.name, r.email, r.title],
      );
    }
    await client.query('COMMIT');

    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true, saved: resolved.length, skipped };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('bulkUpsertCountryManagers.failed', err);
    return { success: false, error: 'Could not import the list.' };
  } finally {
    client.release();
  }
}

/* ═══ Category manager mutations ═════════════════════════════════ */

/** `category` null creates a Supply Chain Director, who can sign off anything. */
export async function upsertSnsCategoryManager(
  category: string | null,
  name: string,
  email: string,
  title: string,
): Promise<ActionResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) return { success: false, error: 'Enter a valid email address.' };

  const cleanCategory = category === null ? null : category.trim() || null;
  const cleanTitle = title.trim() || (cleanCategory ? 'Category Manager' : 'Supply Chain Director');

  return mutate('upsertCategoryManager.failed', async () => {
    if (cleanCategory === null) {
      // Directors are not unique on anything, so an upsert has nothing to
      // conflict on — match on the email instead, which is the identity.
      const existing = await snsPool.query(
        `SELECT id FROM sns_category_manager WHERE category IS NULL AND LOWER(manager_email) = $1`,
        [cleanEmail],
      );
      if (existing.rows.length) {
        await snsPool.query(
          `UPDATE sns_category_manager
              SET manager_name = $2, manager_title = $3, active = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [existing.rows[0].id, name.trim(), cleanTitle],
        );
        return;
      }
      await snsPool.query(
        `INSERT INTO sns_category_manager (category, manager_name, manager_email, manager_title)
         VALUES (NULL, $1, $2, $3)`,
        [name.trim(), cleanEmail, cleanTitle],
      );
      return;
    }

    await snsPool.query(
      `INSERT INTO sns_category_manager (category, manager_name, manager_email, manager_title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category) WHERE category IS NOT NULL DO UPDATE
         SET manager_name  = EXCLUDED.manager_name,
             manager_email = EXCLUDED.manager_email,
             manager_title = EXCLUDED.manager_title,
             active        = TRUE,
             updated_at    = CURRENT_TIMESTAMP`,
      [cleanCategory, name.trim(), cleanEmail, cleanTitle],
    );
  });
}

export async function setSnsCategoryManagerActive(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return mutate('setCategoryManagerActive.failed', async () => {
    await snsPool.query(
      `UPDATE sns_category_manager SET active = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, active],
    );
  });
}

export async function deleteSnsCategoryManager(id: number): Promise<ActionResult> {
  return mutate('deleteCategoryManager.failed', async () => {
    await snsPool.query(`DELETE FROM sns_category_manager WHERE id = $1`, [id]);
  });
}
