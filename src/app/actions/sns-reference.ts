'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import snsPool from '@/lib/db-sns';
import type { ActionResult } from './sns';

/* ═══ Admin gate ═════════════════════════════════════════════════ */

async function requireAdmin(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? email : null;
}

/* ═══ Shapes ═════════════════════════════════════════════════════ */

export interface RefCommodity { id: number; name: string; active: boolean }
export interface RefFamily { id: number; name: string; active: boolean; commodities: RefCommodity[] }
export interface RefSub { id: number; name: string; active: boolean; families: RefFamily[] }
export interface RefCategory { id: number; name: string; spendType: 'Direct' | 'Indirect'; active: boolean; subs: RefSub[] }
export interface RefCountry { code: string; name: string; active: boolean }
export interface RefSegment { id: number; name: string; active: boolean }
export interface RefReason { id: number; classification: 'SGL' | 'SOL'; name: string; active: boolean }

export interface SnsReferenceAdminData {
  categories: RefCategory[];
  countries: RefCountry[];
  segments: RefSegment[];
  reasons: RefReason[];
}

/**
 * The full reference tree for the admin console — unlike getSnsReferenceData,
 * this includes deactivated rows and the primary keys needed to edit them.
 */
export async function getSnsReferenceAdminData(): Promise<SnsReferenceAdminData> {
  const empty: SnsReferenceAdminData = { categories: [], countries: [], segments: [], reasons: [] };
  try {
    const [cats, subs, fams, coms, countries, segments, reasons] = await Promise.all([
      snsPool.query(`SELECT id, name, spend_type, active FROM sns_category ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, category_id, name, active FROM sns_sub_category ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, sub_category_id, name, active FROM sns_family ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, family_id, name, active FROM sns_commodity ORDER BY sort_order, name`),
      snsPool.query(`SELECT code, name, active FROM sns_country ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, name, active FROM sns_segment ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, classification, name, active FROM sns_reason ORDER BY classification, sort_order, name`),
    ]);

    const comsBy = new Map<number, RefCommodity[]>();
    for (const c of coms.rows) {
      const list = comsBy.get(c.family_id) ?? [];
      list.push({ id: Number(c.id), name: String(c.name), active: Boolean(c.active) });
      comsBy.set(c.family_id, list);
    }
    const famsBy = new Map<number, RefFamily[]>();
    for (const f of fams.rows) {
      const list = famsBy.get(f.sub_category_id) ?? [];
      list.push({ id: Number(f.id), name: String(f.name), active: Boolean(f.active), commodities: comsBy.get(f.id) ?? [] });
      famsBy.set(f.sub_category_id, list);
    }
    const subsBy = new Map<number, RefSub[]>();
    for (const s of subs.rows) {
      const list = subsBy.get(s.category_id) ?? [];
      list.push({ id: Number(s.id), name: String(s.name), active: Boolean(s.active), families: famsBy.get(s.id) ?? [] });
      subsBy.set(s.category_id, list);
    }

    return {
      categories: cats.rows.map((c) => ({
        id: Number(c.id),
        name: String(c.name),
        spendType: c.spend_type as 'Direct' | 'Indirect',
        active: Boolean(c.active),
        subs: subsBy.get(c.id) ?? [],
      })),
      countries: countries.rows.map((c) => ({ code: String(c.code), name: String(c.name), active: Boolean(c.active) })),
      segments: segments.rows.map((s) => ({ id: Number(s.id), name: String(s.name), active: Boolean(s.active) })),
      reasons: reasons.rows.map((r) => ({
        id: Number(r.id),
        classification: r.classification as 'SGL' | 'SOL',
        name: String(r.name),
        active: Boolean(r.active),
      })),
    };
  } catch (err) {
    console.error('[getSnsReferenceAdminData]', err);
    return empty;
  }
}

/* ═══ Generic helpers ════════════════════════════════════════════ */

/**
 * Runs one reference-data mutation behind the admin gate.
 *
 * Postgres error 23505 is a unique violation — every reference table has a
 * uniqueness constraint on its name, so that is always "this name is taken"
 * rather than an unexpected failure, and gets a readable message.
 */
async function mutate(label: string, fn: () => Promise<void>): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    await fn();
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return { success: false, error: 'That name already exists here.' };
    console.error(`[${label}]`, err);
    return { success: false, error: 'Could not save the change.' };
  }
}

function clean(s: string): string {
  return s.trim();
}

/* ═══ Taxonomy ═══════════════════════════════════════════════════ */

export async function addSnsCategory(name: string, spendType: 'Direct' | 'Indirect'): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsCategory', async () => {
    await snsPool.query(
      `INSERT INTO sns_category (name, spend_type, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_category), 0))`,
      [clean(name), spendType],
    );
  });
}

export async function updateSnsCategory(id: number, name: string, spendType: 'Direct' | 'Indirect'): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsCategory', async () => {
    await snsPool.query(`UPDATE sns_category SET name = $2, spend_type = $3 WHERE id = $1`, [id, clean(name), spendType]);
  });
}

export async function addSnsSubCategory(categoryId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsSubCategory', async () => {
    await snsPool.query(
      `INSERT INTO sns_sub_category (category_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_sub_category WHERE category_id = $1), 0))`,
      [categoryId, clean(name)],
    );
  });
}

export async function updateSnsSubCategory(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsSubCategory', async () => {
    await snsPool.query(`UPDATE sns_sub_category SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function addSnsFamily(subCategoryId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsFamily', async () => {
    await snsPool.query(
      `INSERT INTO sns_family (sub_category_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_family WHERE sub_category_id = $1), 0))`,
      [subCategoryId, clean(name)],
    );
  });
}

export async function updateSnsFamily(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsFamily', async () => {
    await snsPool.query(`UPDATE sns_family SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function addSnsCommodity(familyId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsCommodity', async () => {
    await snsPool.query(
      `INSERT INTO sns_commodity (family_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_commodity WHERE family_id = $1), 0))`,
      [familyId, clean(name)],
    );
  });
}

export async function updateSnsCommodity(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsCommodity', async () => {
    await snsPool.query(`UPDATE sns_commodity SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

/** Taxonomy tables all carry an `active` flag — deactivating hides a branch from the wizard without deleting it. */
export async function setSnsTaxonomyActive(
  level: 'category' | 'sub' | 'family' | 'commodity',
  id: number,
  active: boolean,
): Promise<ActionResult> {
  const table = {
    category: 'sns_category',
    sub: 'sns_sub_category',
    family: 'sns_family',
    commodity: 'sns_commodity',
  }[level];
  return mutate('setSnsTaxonomyActive', async () => {
    await snsPool.query(`UPDATE ${table} SET active = $2 WHERE id = $1`, [id, active]);
  });
}

/**
 * Deletes a taxonomy node. Children cascade (see the schema), but existing
 * records keep their scope — nodes are stored on the record as text, so a
 * deleted branch never rewrites history.
 */
export async function deleteSnsTaxonomyNode(
  level: 'category' | 'sub' | 'family' | 'commodity',
  id: number,
): Promise<ActionResult> {
  const table = {
    category: 'sns_category',
    sub: 'sns_sub_category',
    family: 'sns_family',
    commodity: 'sns_commodity',
  }[level];
  return mutate('deleteSnsTaxonomyNode', async () => {
    await snsPool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  });
}

/* ═══ Countries ══════════════════════════════════════════════════ */

export async function addSnsCountry(code: string, name: string): Promise<ActionResult> {
  const c = clean(code).toUpperCase();
  if (!c || !clean(name)) return { success: false, error: 'Code and name are required.' };
  if (c.length > 4) return { success: false, error: 'Code must be 4 characters or fewer.' };
  return mutate('addSnsCountry', async () => {
    await snsPool.query(
      `INSERT INTO sns_country (code, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_country), 0))`,
      [c, clean(name)],
    );
  });
}

/**
 * Renames a country. The `code` is deliberately not editable: it is embedded
 * in every Registry ID already issued for that country, so changing it would
 * orphan the numbering sequence.
 */
export async function updateSnsCountry(code: string, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsCountry', async () => {
    await snsPool.query(`UPDATE sns_country SET name = $2 WHERE code = $1`, [code, clean(name)]);
  });
}

export async function setSnsCountryActive(code: string, active: boolean): Promise<ActionResult> {
  return mutate('setSnsCountryActive', async () => {
    await snsPool.query(`UPDATE sns_country SET active = $2 WHERE code = $1`, [code, active]);
  });
}

export async function deleteSnsCountry(code: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    const { rows } = await snsPool.query(
      `SELECT COUNT(*)::int AS n FROM sns_record r
         JOIN sns_country c ON c.name = r.country
        WHERE c.code = $1`,
      [code],
    );
    if (Number(rows[0]?.n ?? 0) > 0) {
      return { success: false, error: 'Records exist for this country — deactivate it instead of deleting.' };
    }
    await snsPool.query(`DELETE FROM sns_country WHERE code = $1`, [code]);
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    console.error('[deleteSnsCountry]', err);
    return { success: false, error: 'Could not delete the country.' };
  }
}

/* ═══ Segments ═══════════════════════════════════════════════════ */

export async function addSnsSegment(name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsSegment', async () => {
    await snsPool.query(
      `INSERT INTO sns_segment (name, sort_order)
       VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_segment), 0))`,
      [clean(name)],
    );
  });
}

export async function updateSnsSegment(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsSegment', async () => {
    await snsPool.query(`UPDATE sns_segment SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function setSnsSegmentActive(id: number, active: boolean): Promise<ActionResult> {
  return mutate('setSnsSegmentActive', async () => {
    await snsPool.query(`UPDATE sns_segment SET active = $2 WHERE id = $1`, [id, active]);
  });
}

export async function deleteSnsSegment(id: number): Promise<ActionResult> {
  return mutate('deleteSnsSegment', async () => {
    await snsPool.query(`DELETE FROM sns_segment WHERE id = $1`, [id]);
  });
}

/* ═══ Reason codes ═══════════════════════════════════════════════ */

export async function addSnsReason(classification: 'SGL' | 'SOL', name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsReason', async () => {
    await snsPool.query(
      `INSERT INTO sns_reason (classification, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_reason WHERE classification = $1), 0))`,
      [classification, clean(name)],
    );
  });
}

export async function updateSnsReason(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsReason', async () => {
    await snsPool.query(`UPDATE sns_reason SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function setSnsReasonActive(id: number, active: boolean): Promise<ActionResult> {
  return mutate('setSnsReasonActive', async () => {
    await snsPool.query(`UPDATE sns_reason SET active = $2 WHERE id = $1`, [id, active]);
  });
}

export async function deleteSnsReason(id: number): Promise<ActionResult> {
  return mutate('deleteSnsReason', async () => {
    await snsPool.query(`DELETE FROM sns_reason WHERE id = $1`, [id]);
  });
}
