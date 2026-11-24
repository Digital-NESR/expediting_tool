'use server';

import { revalidatePath } from 'next/cache';
import { withTransaction } from '@/lib/db/tx';
import { AccessError, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { requireSafeSignAdmin, requireSafeSignManager } from '@/lib/safesign/access';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';

/**
 * The vendor library, topics and the user list. Every export is a POST endpoint any signed-in
 * employee can call, so each starts with a role guard.
 */

const log = logger('safesign-library');

export type Result = { success: boolean; error?: string; id?: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(err: unknown, event: string): Result {
  if (err instanceof AccessError) return { success: false, error: err.message };
  const code = (err as { code?: string })?.code;
  if (code === '23505') return { success: false, error: 'That name is already in use.' };
  log.error(event, err);
  return { success: false, error: 'Something went wrong. Try again.' };
}

export interface VendorInput {
  id?: number;
  name: string;
  category: string;
  vendorCode?: string;
  active?: boolean;
  contacts: { name?: string; email: string; kind: 'to' | 'cc' }[];
}

function cleanContacts(contacts: VendorInput['contacts']): VendorInput['contacts'] | string {
  const out: VendorInput['contacts'] = [];
  const seen = new Set<string>();
  for (const c of contacts ?? []) {
    const email = normalizeEmail(c?.email);
    if (!email) continue;
    if (!EMAIL.test(email)) return `"${c.email}" is not a valid email address.`;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: String(c?.name ?? '').trim(), email, kind: c?.kind === 'cc' ? 'cc' : 'to' });
  }
  if (!out.some((c) => c.kind === 'to')) return 'Add at least one TO address.';
  return out;
}

export async function saveVendor(input: VendorInput): Promise<Result> {
  try {
    const actor = await requireSafeSignManager();
    await ensureSafeSignSchema();
    const name = String(input?.name ?? '').trim();
    const category = String(input?.category ?? '').trim() || 'General';
    if (!name) return { success: false, error: 'Enter the supplier name.' };
    const contacts = cleanContacts(input.contacts);
    if (typeof contacts === 'string') return { success: false, error: contacts };

    const id = await withTransaction(safesignPool, async (client) => {
      let vendorId = Number(input.id) || 0;
      if (vendorId) {
        const { rowCount } = await client.query(
          `UPDATE ss_vendors SET name = $2, category = $3, vendor_code = NULLIF($4, ''),
                  active = $5, updated_at = NOW() WHERE id = $1`,
          [vendorId, name, category, String(input.vendorCode ?? '').trim(), input.active !== false],
        );
        if (!rowCount) throw new AccessError('That supplier no longer exists.', 404);
        await client.query(`DELETE FROM ss_vendor_contacts WHERE vendor_id = $1`, [vendorId]);
      } else {
        const { rows } = await client.query(
          `INSERT INTO ss_vendors (name, category, vendor_code, created_by)
           VALUES ($1, $2, NULLIF($3, ''), $4) RETURNING id`,
          [name, category, String(input.vendorCode ?? '').trim(), actor.email],
        );
        vendorId = Number(rows[0].id);
      }
      for (const c of contacts) {
        await client.query(
          `INSERT INTO ss_vendor_contacts (vendor_id, name, email, kind) VALUES ($1, NULLIF($2, ''), $3, $4)`,
          [vendorId, c.name, c.email, c.kind],
        );
      }
      return vendorId;
    });
    revalidatePath('/safesign/vendors');
    return { success: true, id };
  } catch (err) {
    return fail(err, 'saveVendor.failed');
  }
}

/**
 * Bulk import from a pasted sheet or an uploaded Excel file, already parsed by the page into
 * rows. Matches on supplier name: an existing supplier keeps its row and gets its category and
 * contacts replaced; a new name is added.
 */
export async function importVendors(
  rows: VendorInput[],
): Promise<Result & { added?: number; updated?: number; errors?: string[] }> {
  try {
    await requireSafeSignManager();
    await ensureSafeSignSchema();
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    const { rows: existing } = await safesignPool.query(`SELECT id, LOWER(name) AS key FROM ss_vendors`);
    const byName = new Map(existing.map((r) => [String(r.key), Number(r.id)]));

    for (const [i, row] of (rows ?? []).entries()) {
      const name = String(row?.name ?? '').trim();
      if (!name) continue;
      const id = byName.get(name.toLowerCase());
      const r = await saveVendor({ ...row, id });
      if (!r.success) errors.push(`Row ${i + 1} (${name}): ${r.error}`);
      else if (id) updated += 1;
      else {
        added += 1;
        if (r.id) byName.set(name.toLowerCase(), r.id);
      }
    }
    revalidatePath('/safesign/vendors');
    return { success: errors.length === 0, added, updated, errors };
  } catch (err) {
    return fail(err, 'importVendors.failed');
  }
}

/** Deactivate rather than delete once a supplier has requests, so history stays intact. */
export async function removeVendor(id: number): Promise<Result> {
  try {
    await requireSafeSignManager();
    await ensureSafeSignSchema();
    const { rows } = await safesignPool.query(`SELECT 1 FROM ss_requests WHERE vendor_id = $1 LIMIT 1`, [id]);
    if (rows.length) {
      await safesignPool.query(`UPDATE ss_vendors SET active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
    } else {
      await safesignPool.query(`DELETE FROM ss_vendors WHERE id = $1`, [id]);
    }
    revalidatePath('/safesign/vendors');
    return { success: true };
  } catch (err) {
    return fail(err, 'removeVendor.failed');
  }
}

export async function saveTopic(input: { id?: number; name: string; description?: string }): Promise<Result> {
  try {
    const actor = await requireSafeSignManager();
    await ensureSafeSignSchema();
    const name = String(input?.name ?? '').trim();
    if (!name) return { success: false, error: 'Enter a topic name.' };
    const description = String(input?.description ?? '').trim();
    if (input.id) {
      await safesignPool.query(`UPDATE ss_topics SET name = $2, description = NULLIF($3, '') WHERE id = $1`, [
        input.id,
        name,
        description,
      ]);
    } else {
      await safesignPool.query(
        `INSERT INTO ss_topics (name, description, created_by) VALUES ($1, NULLIF($2, ''), $3)`,
        [name, description, actor.email],
      );
    }
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'saveTopic.failed');
  }
}

export async function setTopicArchived(id: number, archived: boolean): Promise<Result> {
  try {
    await requireSafeSignManager();
    await ensureSafeSignSchema();
    await safesignPool.query(`UPDATE ss_topics SET archived = $2 WHERE id = $1`, [id, Boolean(archived)]);
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'setTopicArchived.failed');
  }
}

export async function saveUser(input: { email: string; name?: string; role: 'manager' | 'viewer' }): Promise<Result> {
  try {
    const actor = await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    const email = normalizeEmail(input?.email);
    if (!EMAIL.test(email)) return { success: false, error: 'Enter a valid email address.' };
    const role = input?.role === 'viewer' ? 'viewer' : 'manager';
    await safesignPool.query(
      `INSERT INTO ss_users (email, name, role, created_by) VALUES ($1, NULLIF($2, ''), $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, name = COALESCE(EXCLUDED.name, ss_users.name)`,
      [email, String(input?.name ?? '').trim(), role, actor.email],
    );
    revalidatePath('/safesign/settings');
    return { success: true };
  } catch (err) {
    return fail(err, 'saveUser.failed');
  }
}

export async function removeUser(email: string): Promise<Result> {
  try {
    await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    await safesignPool.query(`DELETE FROM ss_users WHERE email = $1`, [normalizeEmail(email)]);
    revalidatePath('/safesign/settings');
    return { success: true };
  } catch (err) {
    return fail(err, 'removeUser.failed');
  }
}
