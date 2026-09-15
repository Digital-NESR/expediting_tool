'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminEmail } from '@/lib/require-access';
import snsPool from '@/lib/db-sns';
import { logger } from '@/lib/logger';
import type { ActionResult } from './sns';

const log = logger('sns-reference');

/* ═══ Admin gate ═════════════════════════════════════════════════ */

/* The same platform-ADMIN_EMAILS-only gate as sns.ts. It stays a second local copy
   rather than a shared import because sns.ts is a `'use server'` module: exporting the
   gate from there would publish it as a callable server action. Both now parse the env
   list through the one shared helper, which is where the two used to be able to drift. */
async function requireAdmin(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  return isPlatformAdminEmail(email) ? email : null;
}

/* ═══ Shapes ═════════════════════════════════════════════════════ */

export interface RefCommodity {
  id: number;
  name: string;
  active: boolean;
}
export interface RefFamily {
  id: number;
  name: string;
  active: boolean;
  commodities: RefCommodity[];
}
export interface RefSub {
  id: number;
  name: string;
  active: boolean;
  families: RefFamily[];
}
export interface RefCategory {
  id: number;
  name: string;
  spendType: 'Direct' | 'Indirect';
  active: boolean;
  subs: RefSub[];
}
export interface RefCountry {
  code: string;
  name: string;
  active: boolean;
}
export interface RefSegment {
  id: number;
  name: string;
  active: boolean;
}
export interface RefReason {
  id: number;
  classification: 'SGL' | 'SOL';
  name: string;
  active: boolean;
}

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
      snsPool.query(
        `SELECT id, name, spend_type, active FROM sns_category ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, category_id, name, active FROM sns_sub_category ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, sub_category_id, name, active FROM sns_family ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, family_id, name, active FROM sns_commodity ORDER BY sort_order, name`,
      ),
      snsPool.query(`SELECT code, name, active FROM sns_country ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, name, active FROM sns_segment ORDER BY sort_order, name`),
      snsPool.query(
        `SELECT id, classification, name, active FROM sns_reason ORDER BY classification, sort_order, name`,
      ),
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
      list.push({
        id: Number(f.id),
        name: String(f.name),
        active: Boolean(f.active),
        commodities: comsBy.get(f.id) ?? [],
      });
      famsBy.set(f.sub_category_id, list);
    }
    const subsBy = new Map<number, RefSub[]>();
    for (const s of subs.rows) {
      const list = subsBy.get(s.category_id) ?? [];
      list.push({
        id: Number(s.id),
        name: String(s.name),
        active: Boolean(s.active),
        families: famsBy.get(s.id) ?? [],
      });
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
      countries: countries.rows.map((c) => ({
        code: String(c.code),
        name: String(c.name),
        active: Boolean(c.active),
      })),
      segments: segments.rows.map((s) => ({
        id: Number(s.id),
        name: String(s.name),
        active: Boolean(s.active),
      })),
      reasons: reasons.rows.map((r) => ({
        id: Number(r.id),
        classification: r.classification as 'SGL' | 'SOL',
        name: String(r.name),
        active: Boolean(r.active),
      })),
    };
  } catch (err) {
    log.error('referenceAdminData.load.failed', err);
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
async function mutate(
  label: string,
  target: Record<string, unknown>,
  fn: () => Promise<void>,
): Promise<ActionResult> {
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
    /* The caller still sees the generic message; `target` is what makes a reported
       failure findable — which row, edited by whom — instead of a bare tag. */
    log.error(`${label}.failed`, err, { ...target, actor: admin });
    return { success: false, error: 'Could not save the change.' };
  }
}

function clean(s: string): string {
  return s.trim();
}

/* ═══ Taxonomy ═══════════════════════════════════════════════════ */

export async function addSnsCategory(
  name: string,
  spendType: 'Direct' | 'Indirect',
): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsCategory', { name, spendType }, async () => {
    await snsPool.query(
      `INSERT INTO sns_category (name, spend_type, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_category), 0))`,
      [clean(name), spendType],
    );
  });
}

export async function updateSnsCategory(
  id: number,
  name: string,
  spendType: 'Direct' | 'Indirect',
): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsCategory', { id, name, spendType }, async () => {
    await snsPool.query(`UPDATE sns_category SET name = $2, spend_type = $3 WHERE id = $1`, [
      id,
      clean(name),
      spendType,
    ]);
  });
}

export async function addSnsSubCategory(categoryId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsSubCategory', { categoryId, name }, async () => {
    await snsPool.query(
      `INSERT INTO sns_sub_category (category_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_sub_category WHERE category_id = $1), 0))`,
      [categoryId, clean(name)],
    );
  });
}

export async function updateSnsSubCategory(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsSubCategory', { id, name }, async () => {
    await snsPool.query(`UPDATE sns_sub_category SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function addSnsFamily(subCategoryId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsFamily', { subCategoryId, name }, async () => {
    await snsPool.query(
      `INSERT INTO sns_family (sub_category_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_family WHERE sub_category_id = $1), 0))`,
      [subCategoryId, clean(name)],
    );
  });
}

export async function updateSnsFamily(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsFamily', { id, name }, async () => {
    await snsPool.query(`UPDATE sns_family SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function addSnsCommodity(familyId: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsCommodity', { familyId, name }, async () => {
    await snsPool.query(
      `INSERT INTO sns_commodity (family_id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_commodity WHERE family_id = $1), 0))`,
      [familyId, clean(name)],
    );
  });
}

export async function updateSnsCommodity(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsCommodity', { id, name }, async () => {
    await snsPool.query(`UPDATE sns_commodity SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

/* The four taxonomy levels and the table each one names. The level arrives as a
   server-action argument, so its union type is a compile-time promise only — a
   hand-crafted POST can send anything. Everything below looks the table up here
   and bails when the lookup misses, rather than interpolating `undefined` into
   the statement and answering a bad argument with a 500. */
const TAXONOMY_TABLES = {
  category: 'sns_category',
  sub: 'sns_sub_category',
  family: 'sns_family',
  commodity: 'sns_commodity',
} as const;

type TaxonomyLevel = keyof typeof TAXONOMY_TABLES;

/* What the admin sees in the "records exist" refusal, so the message names the
   thing they clicked rather than the wire value. */
const TAXONOMY_LABELS: Record<TaxonomyLevel, string> = {
  category: 'category',
  sub: 'sub-category',
  family: 'family',
  commodity: 'commodity',
};

/* Counts the records whose scope still names a node, per level.
 *
 * `sns_record_node` stores the whole path as denormalised text on one row
 * (category/sub_category/family/commodity), so counting at the level being
 * deleted also covers everything that would cascade away beneath it: a record
 * scoped to a commodity still carries its category's name in the same row.
 *
 * Each query joins back up the taxonomy to match the full path, not just the
 * leaf name — names are unique only within their parent, so `family = 'Valves'`
 * alone would block a delete on some other sub-category's identically named
 * family. Matching on names (as deleteSnsCountry does) is the only link there
 * is: the scope snapshot is deliberately not a foreign key.
 */
const TAXONOMY_USAGE_SQL: Record<TaxonomyLevel, string> = {
  category: `SELECT COUNT(*)::int AS n FROM sns_record_node n
               JOIN sns_category c ON c.name = n.category
              WHERE c.id = $1`,
  sub: `SELECT COUNT(*)::int AS n FROM sns_record_node n
          JOIN sns_sub_category s ON s.name = n.sub_category
          JOIN sns_category c ON c.id = s.category_id AND c.name = n.category
         WHERE s.id = $1`,
  family: `SELECT COUNT(*)::int AS n FROM sns_record_node n
             JOIN sns_family f ON f.name = n.family
             JOIN sns_sub_category s ON s.id = f.sub_category_id AND s.name = n.sub_category
             JOIN sns_category c ON c.id = s.category_id AND c.name = n.category
            WHERE f.id = $1`,
  commodity: `SELECT COUNT(*)::int AS n FROM sns_record_node n
                JOIN sns_commodity m ON m.name = n.commodity
                JOIN sns_family f ON f.id = m.family_id AND f.name = n.family
                JOIN sns_sub_category s ON s.id = f.sub_category_id AND s.name = n.sub_category
                JOIN sns_category c ON c.id = s.category_id AND c.name = n.category
               WHERE m.id = $1`,
};

/** Taxonomy tables all carry an `active` flag — deactivating hides a branch from the wizard without deleting it. */
export async function setSnsTaxonomyActive(
  level: TaxonomyLevel,
  id: number,
  active: boolean,
): Promise<ActionResult> {
  const table = TAXONOMY_TABLES[level];
  if (!table) return { success: false, error: 'Unknown taxonomy level.' };
  return mutate('setSnsTaxonomyActive', { level, id, active }, async () => {
    await snsPool.query(`UPDATE ${table} SET active = $2 WHERE id = $1`, [id, active]);
  });
}

/**
 * Deletes a taxonomy node. Children cascade (see the schema), but existing
 * records keep their scope — nodes are stored on the record as text, so a
 * deleted branch never rewrites history.
 *
 * That snapshot is exactly why the node still has to be in use to block the
 * delete: the records survive, but the branch they name vanishes from the
 * admin tree, and nothing can re-create it at the same ids. So this refuses
 * like deleteSnsCountry does and points the admin at deactivation, which hides
 * the branch from the wizard while leaving the scope it describes intact.
 *
 * Written out rather than run through `mutate` because the pre-check has to
 * return its own refusal, and has to sit behind the admin gate — the same
 * shape deleteSnsCountry uses for the same reason.
 */
export async function deleteSnsTaxonomyNode(
  level: TaxonomyLevel,
  id: number,
): Promise<ActionResult> {
  const table = TAXONOMY_TABLES[level];
  const usageSql = TAXONOMY_USAGE_SQL[level];
  if (!table || !usageSql) return { success: false, error: 'Unknown taxonomy level.' };

  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    const { rows } = await snsPool.query(usageSql, [id]);
    if (Number(rows[0]?.n ?? 0) > 0) {
      return {
        success: false,
        error: `Records exist for this ${TAXONOMY_LABELS[level]} — deactivate it instead of deleting.`,
      };
    }
    await snsPool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('deleteSnsTaxonomyNode.failed', err, { level, id, actor: admin });
    return { success: false, error: 'Could not delete the taxonomy node.' };
  }
}

/* ═══ Countries ══════════════════════════════════════════════════ */

export async function addSnsCountry(code: string, name: string): Promise<ActionResult> {
  const c = clean(code).toUpperCase();
  if (!c || !clean(name)) return { success: false, error: 'Code and name are required.' };
  if (c.length > 4) return { success: false, error: 'Code must be 4 characters or fewer.' };
  return mutate('addSnsCountry', { code: c, name }, async () => {
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
  return mutate('updateSnsCountry', { code, name }, async () => {
    await snsPool.query(`UPDATE sns_country SET name = $2 WHERE code = $1`, [code, clean(name)]);
  });
}

export async function setSnsCountryActive(code: string, active: boolean): Promise<ActionResult> {
  return mutate('setSnsCountryActive', { code, active }, async () => {
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
      return {
        success: false,
        error: 'Records exist for this country — deactivate it instead of deleting.',
      };
    }
    await snsPool.query(`DELETE FROM sns_country WHERE code = $1`, [code]);
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('deleteSnsCountry.failed', err, { code });
    return { success: false, error: 'Could not delete the country.' };
  }
}

/* ═══ Segments ═══════════════════════════════════════════════════ */

export async function addSnsSegment(name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsSegment', { name }, async () => {
    await snsPool.query(
      `INSERT INTO sns_segment (name, sort_order)
       VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_segment), 0))`,
      [clean(name)],
    );
  });
}

export async function updateSnsSegment(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsSegment', { id, name }, async () => {
    await snsPool.query(`UPDATE sns_segment SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function setSnsSegmentActive(id: number, active: boolean): Promise<ActionResult> {
  return mutate('setSnsSegmentActive', { id, active }, async () => {
    await snsPool.query(`UPDATE sns_segment SET active = $2 WHERE id = $1`, [id, active]);
  });
}

export async function deleteSnsSegment(id: number): Promise<ActionResult> {
  return mutate('deleteSnsSegment', { id }, async () => {
    await snsPool.query(`DELETE FROM sns_segment WHERE id = $1`, [id]);
  });
}

/* ═══ Reason codes ═══════════════════════════════════════════════ */

export async function addSnsReason(
  classification: 'SGL' | 'SOL',
  name: string,
): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('addSnsReason', { classification, name }, async () => {
    await snsPool.query(
      `INSERT INTO sns_reason (classification, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM sns_reason WHERE classification = $1), 0))`,
      [classification, clean(name)],
    );
  });
}

export async function updateSnsReason(id: number, name: string): Promise<ActionResult> {
  if (!clean(name)) return { success: false, error: 'Name is required.' };
  return mutate('updateSnsReason', { id, name }, async () => {
    await snsPool.query(`UPDATE sns_reason SET name = $2 WHERE id = $1`, [id, clean(name)]);
  });
}

export async function setSnsReasonActive(id: number, active: boolean): Promise<ActionResult> {
  return mutate('setSnsReasonActive', { id, active }, async () => {
    await snsPool.query(`UPDATE sns_reason SET active = $2 WHERE id = $1`, [id, active]);
  });
}

export async function deleteSnsReason(id: number): Promise<ActionResult> {
  return mutate('deleteSnsReason', { id }, async () => {
    await snsPool.query(`DELETE FROM sns_reason WHERE id = $1`, [id]);
  });
}
