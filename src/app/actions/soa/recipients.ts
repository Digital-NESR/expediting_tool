'use server';

import { logger } from '@/lib/logger';
import { requireSoaCountry } from '@/lib/soa/access';
import { sql } from '@/lib/soa/db';
import {
  loadCountryRecipients,
  looksLikeEmail,
  setVendorContact,
  type CountryRecipients,
} from '@/lib/soa/recipients';

/**
 * Endpoints for the recipient review screen.
 *
 * Every export is a public POST endpoint and carries its own guard. A vendor id is not a
 * capability: `vendorOwnedBy` checks the vendor actually belongs to the country the caller was
 * authorised for, otherwise a champion for one country could edit another country's contacts by
 * passing a different id.
 */

const log = logger('soa-recipients');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

async function vendorOwnedBy(vendorId: number, countryId: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM vendors WHERE id = ? AND country_id = ?`,
    [vendorId, countryId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Every in-scope vendor with its resolved recipients, largest amount first. */
export async function getSoaRecipients(countryId: string): Promise<SoaResult<CountryRecipients>> {
  try {
    await requireSoaCountry(countryId, 'champion');
    const data = await loadCountryRecipients(countryId);
    if (!data) return { success: false, error: 'That country is not set up for this cycle.' };
    return { success: true, data };
  } catch (err) {
    log.error('getSoaRecipients.failed', err, { countryId });
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}

/**
 * Add, remove or restore one address on one vendor.
 *
 * Both adding and removing persist, so a champion who tracked down the right contact keeps it next
 * quarter and one who removed a dead mailbox does not have it pulled back in. A removal is stored
 * rather than applied destructively, which is what makes it undoable.
 */
export async function updateSoaVendorContact(input: {
  countryId: string;
  vendorId: number;
  email: string;
  action: 'add' | 'remove' | 'restore';
}): Promise<SoaResult<CountryRecipients>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');

    const email = input.email.trim().toLowerCase();
    if (!looksLikeEmail(email)) return { success: false, error: `"${input.email}" is not an email address.` };
    if (!(await vendorOwnedBy(input.vendorId, input.countryId)))
      return { success: false, error: 'That vendor does not belong to this country.' };

    await setVendorContact({ vendorId: input.vendorId, email, action: input.action, actor: actor.email });
    log.info('recipients.changed', {
      countryId: input.countryId,
      vendorId: input.vendorId,
      action: input.action,
      by: actor.email,
    });

    // Return the whole country so the screen re-renders from the same resolution the send will
    // use, rather than patching its own copy and drifting from it.
    const data = await loadCountryRecipients(input.countryId);
    return data
      ? { success: true, data }
      : { success: false, error: 'Saved, but the list could not be reloaded.' };
  } catch (err) {
    log.error('updateSoaVendorContact.failed', err, { countryId: input.countryId });
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}
