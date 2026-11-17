'use server';

/* ─── The device catalogue an admin maintains. ─── */

import { asSerialised } from '@/lib/db/sql';
import { logger } from '@/lib/logger';
import type {
  ActionResult,
  CreateLaptopDeviceInput,
  LaptopDeviceOption,
  UpdateLaptopDeviceInput,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import laptopProcurementPool from '@/lib/db-laptop';
import { withTransaction } from '@/lib/db/tx';
import { requireAdminActor } from '@/lib/laptop-procurement/access';
import { getActor } from '@/lib/laptop-procurement/actor';
import { QueryParams, exec, execTx, sql } from '@/lib/laptop-procurement/db';
import { requireText, revalidateLaptopPaths } from '@/lib/laptop-procurement/internals';

const log = logger('laptop-procurement');

export async function getLaptopDeviceOptions(): Promise<LaptopDeviceOption[]> {
  try {
    await getActor();
    const rows = await sql<QueryResultRow[]>(
      `SELECT type_of_device, model FROM laptop_device_catalog WHERE active = TRUE ORDER BY type_of_device, model`,
    );
    return asSerialised<LaptopDeviceOption[]>(rows);
  } catch (err) {
    log.error('getLaptopDeviceOptions.failed', err);
    return [];
  }
}

export async function addLaptopDevice(input: CreateLaptopDeviceInput): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData)
      return { success: false, error: 'Catalog management access is required.' };
    const typeOfDevice = requireText(input.type_of_device, 'Type of device');
    const model = requireText(input.model, 'Model');

    await exec(
      `INSERT INTO laptop_device_catalog (type_of_device, model, active) VALUES (?, ?, TRUE)`,
      [typeOfDevice, model],
    );
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    log.error('addLaptopDevice.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add device.' };
  }
}

export async function updateLaptopDevice(
  id: number,
  input: UpdateLaptopDeviceInput,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData)
      return { success: false, error: 'Catalog management access is required.' };

    const sets: string[] = [];
    const params: QueryParams = [];
    if (input.type_of_device !== undefined) {
      sets.push('type_of_device = ?');
      params.push(requireText(input.type_of_device, 'Type of device'));
    }
    if (input.model !== undefined) {
      sets.push('model = ?');
      params.push(requireText(input.model, 'Model'));
    }
    if (input.active !== undefined) {
      sets.push('active = ?');
      params.push(input.active);
    }
    if (sets.length === 0) return { success: true };

    await exec(`UPDATE laptop_device_catalog SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    log.error('updateLaptopDevice.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update device.',
    };
  }
}

export async function deleteLaptopDevice(id: number): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData)
      return { success: false, error: 'Catalog management access is required.' };
    await exec(`DELETE FROM laptop_device_catalog WHERE id = ?`, [id]);
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    log.error('deleteLaptopDevice.failed', err);
    return { success: false, error: 'Failed to delete device.' };
  }
}

/* ── Device prices (model x country, USD) ─────────────────────── */

/* Reading them is getLaptopAdminData's job — the Devices tab needs the prices
   on first paint, so they arrive with the rest of the admin payload rather
   than through a second round trip once the panel has mounted. */

/**
 * Saves one model's prices across countries in a single transaction.
 *
 * A blank price deletes the cell rather than storing zero — "not priced yet"
 * and "costs nothing" are different answers, and only the first should let the
 * WIP refuse with `missing: total value (USD)`.
 *
 * All-or-nothing on purpose: a half-applied sheet is worse than a rejected one,
 * because the admin has no way to see which half landed.
 */
export async function saveLaptopDevicePrices(
  model: string,
  entries: { country: string; price: number | null }[],
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData)
      return { success: false, error: 'Catalog management access is required.' };
    const cleanModel = requireText(model, 'Model');

    for (const e of entries) {
      if (e.price == null) continue;
      if (!Number.isFinite(e.price) || e.price <= 0) {
        return {
          success: false,
          error: `${e.country}: a price must be greater than zero. Clear the box instead to mark it unpriced.`,
        };
      }
    }

    await withTransaction(laptopProcurementPool, async (client) => {
      for (const entry of entries) {
        const country = entry.country.trim();
        if (!country) continue;

        /* Clear the cell, then write it back if it has a price. Deliberately
           not an upsert: ON CONFLICT would have to name the expression index
           by repeating LOWER(TRIM(...)) exactly, and a mismatch there does not
           fail until a real save runs. Delete-then-insert needs no inference,
           and inside this transaction it is indistinguishable.

           Cleared per country rather than per model, so a price stored against
           a country outside COUNTRY_OPTIONS - the legacy EOS / Jordan /
           Malaysia spellings the matrix still carries - is left alone instead
           of being wiped by a screen that never showed it. */
        await execTx(
          client,
          `DELETE FROM laptop_device_prices
            WHERE LOWER(TRIM(model)) = LOWER(TRIM(?)) AND LOWER(TRIM(country)) = LOWER(TRIM(?))`,
          [cleanModel, country],
        );
        if (entry.price == null) continue;

        await execTx(
          client,
          `INSERT INTO laptop_device_prices (model, country, unit_price_usd, updated_by)
           VALUES (?, ?, ?, ?)`,
          [cleanModel, country, entry.price, actor.email],
        );
      }
    });

    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    log.error('saveLaptopDevicePrices.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save prices.',
    };
  }
}

/* ── Reads ────────────────────────────────────────────────────── */
