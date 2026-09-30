'use server';

import { logger } from '@/lib/logger';
import { requireSoaCountry } from '@/lib/soa/access';
import { exec, sql } from '@/lib/soa/db';
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

/**
 * Drop a vendor out of this cycle entirely.
 *
 * Only a vendor nobody has written to. Once a request has gone out, the entry is what the
 * dispatches, the evidence rows and any statement hang off, and deleting it would destroy the
 * record that we wrote to them: an auditor asking "you had 270 suppliers in scope, what happened
 * to this one" would find nothing at all. A contacted vendor is closed through "Close without a
 * statement" instead, which keeps the correspondence and says what the outcome was.
 *
 * This is the same rule, and the same `status = 'scoped'` lock, that `applySoaScopeSelection`
 * applies when a champion unticks a row. Two ways in, one rule.
 */
export async function removeSoaVendorFromCycle(input: {
  countryId: string;
  entryId: number;
}): Promise<SoaResult<CountryRecipients>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');

    /* The entry id comes from the browser and is not a capability, so the country that owns it is
       read back rather than trusted, and the status is read with it. */
    const owner = await sql<
      { country_id: string; status: string; vendor_no: string; name: string; cc_id: number }[]
    >(
      `SELECT cc.country_id, vce.status::text AS status, v.vendor_no, v.name,
              cc.id AS cc_id
         FROM vendor_cycle_entries vce
         JOIN country_cycles cc ON cc.id = vce.country_cycle_id
         JOIN vendors v         ON v.id = vce.vendor_id
        WHERE vce.id = ?`,
      [input.entryId],
    );
    const row = owner[0];
    if (!row) return { success: false, error: 'That vendor is not in this cycle.' };
    if (String(row.country_id) !== input.countryId) {
      return { success: false, error: 'That vendor does not belong to this country.' };
    }
    if (String(row.status) !== 'scoped') {
      return {
        success: false,
        error:
          'This vendor has already been written to, so removing it would delete the record of that. Close it without a statement instead, from Response Tracking.',
      };
    }

    // Guarded again in the statement itself, so a status that changed between the read and the
    // write cannot slip a contacted vendor through.
    // `exec`, not `sql`: `sql` returns the rows, which for a DELETE is an empty array and always
    // truthy, so a refused delete would have reported success.
    const deleted = await exec(
      `DELETE FROM vendor_cycle_entries WHERE id = ? AND status = 'scoped'`,
      [input.entryId],
    );
    if (deleted.rowCount === 0) {
      return { success: false, error: 'That vendor was contacted just now and was not removed.' };
    }

    /* Recorded against the country rather than the entry, which no longer exists. Taking a
       supplier out of a quarter's scope is a decision about what was reconciled, and the pack
       should say who made it. */
    await sql(
      `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
       VALUES (?, NULL, 'scope', 'Vendor removed from scope', ?, ?)`,
      [
        row.cc_id,
        actor.email,
        `${row.name} (${row.vendor_no}) was taken out of scope before any request was sent.`,
      ],
    );

    log.info('recipients.vendorRemoved', {
      countryId: input.countryId,
      vendorNo: row.vendor_no,
      by: actor.email,
    });

    const data = await loadCountryRecipients(input.countryId);
    return data
      ? { success: true, data }
      : { success: false, error: 'Removed, but the list could not be reloaded.' };
  } catch (err) {
    log.error('removeSoaVendorFromCycle.failed', err, { countryId: input.countryId });
    return { success: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}
