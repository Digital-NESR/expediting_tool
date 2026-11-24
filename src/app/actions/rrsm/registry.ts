'use server';

import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { canAccessCountry, currentRrsmActor, rolesIn } from '@/lib/rrsm/access';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy.server';
import { rrsmUom } from '@/lib/service-registry/migrate-plan';
import {
  createRegistryItem,
  listRegistryItems,
  loadRegistryFormRefs,
  updateRegistryItem,
  type RegistryFormRefs,
  type RegistryType,
} from '@/lib/service-registry/registry';
import type { CatalogEntryInput } from '@/lib/service-registry/catalog-core';
import type { CatalogEntry } from '@/types/catalog-manager';

/**
 * RRSM's side of the shared Service Registry (items live in Catalog Manager's database).
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT. Each checks RRSM's own access for the item's country:
 * reading needs any grant there, writing needs a buyer (or admin), as for the rest of the register.
 */

const log = logger('rrsm-registry');

export interface RrsmRegistry {
  ok: boolean;
  items: CatalogEntry[];
}

export async function getRrsmRegistry(
  countryCode: string,
  type: RegistryType = 'rental',
): Promise<RrsmRegistry> {
  try {
    const actor = await currentRrsmActor();
    const code = String(countryCode ?? '').trim();
    if (!actor || !code || !canAccessCountry(actor, code, 'buyer')) return { ok: true, items: [] };
    return { ok: true, items: await listRegistryItems(code, type) };
  } catch (err) {
    log.error('getRrsmRegistry.failed', err, { countryCode });
    return { ok: false, items: [] };
  }
}

/** The item form's lists (taxonomy, units, currencies…). Fetched when the form opens. */
export async function getRrsmRegistryFormRefs(): Promise<RegistryFormRefs | null> {
  try {
    const actor = await currentRrsmActor();
    if (!actor || (!actor.isAdmin && !actor.grants.length)) return null;
    return await loadRegistryFormRefs(SPEND_TAXONOMY);
  } catch (err) {
    log.error('getRrsmRegistryFormRefs.failed', err);
    return null;
  }
}

/**
 * Add or change a registry item from RRSM. The country is the register's, whatever the form
 * says. A changed rate becomes a new rate version on the item, and the item's units follow.
 * The item's supplier is added to RRSM's supplier list if it is not there yet.
 */
export async function saveRrsmRegistryItem(input: {
  countryCode: string;
  code?: string | null;
  type: RegistryType;
  item: CatalogEntryInput;
}): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const actor = await currentRrsmActor();
    const country = String(input?.countryCode ?? '').trim();
    if (!actor || !country || !rolesIn(actor, country).canBuy) {
      return {
        success: false,
        error: 'Only a buyer or an admin for this country changes the registry.',
      };
    }
    const type: RegistryType = input.type === 'recurrent' ? 'recurrent' : 'rental';
    const item: CatalogEntryInput = { ...input.item, country_code: country };
    const who = { name: actor.email, email: actor.email };

    let code = String(input.code ?? '').trim();
    if (code) {
      /* The item must be this country's: a code from the browser proves nothing. */
      const mine = await listRegistryItems(country, type);
      if (!mine.some((e) => e.code === code)) {
        return { success: false, error: 'That item is not in this country’s registry.' };
      }
      await updateRegistryItem(who, code, item, 'Changed in RRSM');
    } else {
      code = (await createRegistryItem(who, item, { type })).code;
    }

    await rrsmPool.query(
      `INSERT INTO rrsm_suppliers (code, name) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [item.supplier_code.replace(/^0+(?=\d)/, ''), item.supplier_name],
    );
    if (type === 'rental') {
      await rrsmPool.query(
        `UPDATE rrsm_service_lines SET rate = $3, uom = $4, updated_at = NOW()
          WHERE country_code = $1 AND registry_code = $2
            AND (rate IS DISTINCT FROM $3::numeric OR uom IS DISTINCT FROM $4)`,
        [country, code, item.unit_price, rrsmUom(item.uom_name)],
      );
    }
    log.info('item.saved', { code, country, by: actor.email });
    return { success: true, code };
  } catch (err) {
    log.error('saveRrsmRegistryItem.failed', err);
    return { success: false, error: (err as Error).message };
  }
}
