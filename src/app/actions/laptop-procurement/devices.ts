'use server';

/* ─── The device catalogue an admin maintains. ─── */

import { asSerialised } from '@/lib/db/sql';
import type {
  ActionResult,
  CreateLaptopDeviceInput,
  LaptopDeviceOption,
  UpdateLaptopDeviceInput,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { requireAdminActor } from '@/lib/laptop-procurement/access';
import { getActor } from '@/lib/laptop-procurement/actor';
import { QueryParams, exec, sql } from '@/lib/laptop-procurement/db';
import { requireText, revalidateLaptopPaths } from '@/lib/laptop-procurement/internals';

export async function getLaptopDeviceOptions(): Promise<LaptopDeviceOption[]> {
  try {
    await getActor();
    const rows = await sql<QueryResultRow[]>(
      `SELECT type_of_device, model FROM laptop_device_catalog WHERE active = TRUE ORDER BY type_of_device, model`,
    );
    return asSerialised<LaptopDeviceOption[]>(rows);
  } catch (err) {
    console.error('[getLaptopDeviceOptions]', err);
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
    console.error('[addLaptopDevice]', err);
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
    console.error('[updateLaptopDevice]', err);
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
    console.error('[deleteLaptopDevice]', err);
    return { success: false, error: 'Failed to delete device.' };
  }
}

/* ── Reads ────────────────────────────────────────────────────── */
