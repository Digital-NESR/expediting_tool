'use server';

import { revalidatePath } from 'next/cache';
import { AccessError, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { requireSafeSignCountry } from '@/lib/safesign/access';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';
import {
  getSupplierCard,
  masterSuppliers,
  searchSuppliers,
  supplierCategoriesFor,
  type SupplierCard,
  type SupplierRow,
  type SupplierSearch,
} from '@/lib/safesign/suppliers';

/**
 * The supplier library of the country being worked on. Suppliers come from the SAP vendor master
 * (SourceGuide's supplier_avl); what is stored here is which of them are in this country's
 * library and the recipients the team added or removed on top of the master's emails.
 *
 * Every export is a POST endpoint any signed-in employee can call, so each starts with
 * requireSafeSignCountry, and the country always comes from the server, never the browser.
 */

const log = logger('safesign-library');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CardResult = { success: boolean; error?: string; card?: SupplierCard | null };

function fail(err: unknown, event: string): CardResult {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: 'Something went wrong. Try again.' };
}

export async function searchLibrary(
  input: Omit<SupplierSearch, 'countryId'>,
): Promise<{ rows: SupplierRow[]; total: number }> {
  const { country } = await requireSafeSignCountry();
  return searchSuppliers({
    countryId: country.id,
    q: String(input?.q ?? '').slice(0, 100),
    scope: input?.scope === 'library' || input?.scope === 'bought' ? input.scope : 'all',
    category: String(input?.category ?? '').slice(0, 100),
    status: input?.status === 'active' || input?.status === 'blocked' ? input.status : '',
    email: input?.email === 'with' || input?.email === 'without' ? input.email : '',
    offset: Number(input?.offset) || 0,
  });
}

export async function loadSupplier(code: string): Promise<CardResult> {
  try {
    const { country } = await requireSafeSignCountry();
    return { success: true, card: await getSupplierCard(country.id, String(code ?? '').trim()) };
  } catch (err) {
    return fail(err, 'loadSupplier.failed');
  }
}

/** The library row for this supplier in this country, created (or re-activated) if needed. */
async function ensureVendor(countryId: string, code: string, actorEmail: string): Promise<number> {
  const master = (await masterSuppliers([code])).get(code);
  if (!master) throw new AccessError('That supplier is not in the SAP vendor master.', 404);
  const categories = await supplierCategoriesFor(countryId, code);
  const { rows } = await safesignPool.query(
    `INSERT INTO ss_vendors (name, category, vendor_code, country_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (country_id, vendor_code) WHERE vendor_code IS NOT NULL
     DO UPDATE SET active = TRUE, name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [master.name, categories[0] ?? 'Other', code, countryId, actorEmail],
  );
  return Number(rows[0].id);
}

async function vendorIdFor(countryId: string, code: string): Promise<number | null> {
  const { rows } = await safesignPool.query(
    `SELECT id FROM ss_vendors WHERE country_id = $1 AND vendor_code = $2`,
    [countryId, code],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

function done(countryId: string, code: string): Promise<CardResult> {
  revalidatePath('/safesign/suppliers');
  return getSupplierCard(countryId, code).then((card) => ({ success: true, card }));
}

export async function addToLibrary(code: string): Promise<CardResult> {
  try {
    const { actor, country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    await ensureVendor(country.id, code, actor.email);
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'addToLibrary.failed');
  }
}

/** Out of the library. Kept (inactive) once it has communications, so history stays intact. */
export async function removeFromLibrary(code: string): Promise<CardResult> {
  try {
    const { country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    const id = await vendorIdFor(country.id, code);
    if (id) {
      const { rows } = await safesignPool.query(`SELECT 1 FROM ss_requests WHERE vendor_id = $1 LIMIT 1`, [id]);
      await safesignPool.query(
        rows.length
          ? `UPDATE ss_vendors SET active = FALSE, updated_at = NOW() WHERE id = $1`
          : `DELETE FROM ss_vendors WHERE id = $1`,
        [id],
      );
    }
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'removeFromLibrary.failed');
  }
}

/**
 * Add a recipient. Remembered for this supplier in this country, so the next communication to
 * them includes it. Adding a master email that was removed brings it back instead.
 */
export async function addRecipient(input: { code: string; email: string; name?: string; kind: 'to' | 'cc' }): Promise<CardResult> {
  try {
    const { actor, country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    const code = String(input?.code ?? '').trim();
    const email = normalizeEmail(input?.email);
    const kind = input?.kind === 'cc' ? 'cc' : 'to';
    if (!EMAIL.test(email)) return { success: false, error: 'Enter a valid email address.' };
    if (kind === 'cc' && email === normalizeEmail(actor.email)) {
      return { success: false, error: 'You are always copied already.' };
    }

    const vendorId = await ensureVendor(country.id, code, actor.email);
    const restored = await safesignPool.query(
      `DELETE FROM ss_vendor_contacts WHERE vendor_id = $1 AND kind = 'hidden' AND LOWER(email) = $2`,
      [vendorId, email],
    );
    const card = await getSupplierCard(country.id, code);
    const already =
      card?.masterTo.includes(email) || card?.added.some((c) => c.email.toLowerCase() === email);
    if (already && !restored.rowCount) return { success: false, error: 'That address is already on the list.' };
    if (!already) {
      await safesignPool.query(
        `INSERT INTO ss_vendor_contacts (vendor_id, name, email, kind, added_by)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5)`,
        [vendorId, String(input?.name ?? '').trim(), email, kind, actor.email],
      );
    }
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'addRecipient.failed');
  }
}

/** Remove an added recipient. */
export async function removeRecipient(code: string, contactId: number): Promise<CardResult> {
  try {
    const { country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    await safesignPool.query(
      `DELETE FROM ss_vendor_contacts c USING ss_vendors v
        WHERE c.id = $1 AND c.vendor_id = v.id AND v.country_id = $2 AND v.vendor_code = $3
          AND c.kind IN ('to', 'cc')`,
      [contactId, country.id, code],
    );
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'removeRecipient.failed');
  }
}

/** Stop sending to one of the master's emails, for this country only. SAP is not changed. */
export async function hideMasterEmail(code: string, email: string): Promise<CardResult> {
  try {
    const { actor, country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    const e = normalizeEmail(email);
    const vendorId = await ensureVendor(country.id, code, actor.email);
    await safesignPool.query(
      `INSERT INTO ss_vendor_contacts (vendor_id, email, kind, added_by)
       VALUES ($1, $2, 'hidden', $3) ON CONFLICT DO NOTHING`,
      [vendorId, e, actor.email],
    );
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'hideMasterEmail.failed');
  }
}

export async function restoreMasterEmail(code: string, hiddenId: number): Promise<CardResult> {
  try {
    const { country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();
    await safesignPool.query(
      `DELETE FROM ss_vendor_contacts c USING ss_vendors v
        WHERE c.id = $1 AND c.vendor_id = v.id AND v.country_id = $2 AND v.vendor_code = $3
          AND c.kind = 'hidden'`,
      [hiddenId, country.id, code],
    );
    return done(country.id, code);
  } catch (err) {
    return fail(err, 'restoreMasterEmail.failed');
  }
}
