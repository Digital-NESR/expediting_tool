'use server';

/* ─── The admin console: individual permissions and the approver matrix. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { asSerialised } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import { getPermissionProfile, resolveLaptopMatrixCountry } from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type {
  ActionResult,
  LaptopApproverMatrixRow,
  LaptopPermissionRole,
  UpdateLaptopPermissionInput,
} from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import {
  canBootstrapOwnLaptopPermission,
  requireAdminActor,
} from '@/lib/laptop-procurement/access';
import { existingMatrixCountries, unknownMatrixCountryError } from '@/lib/laptop-procurement/actor';
import { exec, execTx, sql, sqlTx } from '@/lib/laptop-procurement/db';
import { blankToNull, requireText } from '@/lib/laptop-procurement/internals';
import {
  clearApproverMatrixRoleForEmail,
  findUnknownDirectoryEmails,
  getMatrixColumns,
  unknownDirectoryEmailError,
} from '@/lib/laptop-procurement/matrix';
import {
  ensureLaptopApproverMatrixColumns,
  ensureLaptopPermissionsRoleConstraint,
} from '@/lib/laptop-procurement/schema';

const log = logger('laptop-procurement');

export async function updateLaptopPermission(
  input: UpdateLaptopPermissionInput,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const email = requireText(input.email, 'Email').toLowerCase();
    const role = requireText(input.role, 'Role') as LaptopPermissionRole;
    if (!getPermissionProfile(role)) return { success: false, error: 'Unknown role.' };
    if (!actor.permissions.canManagePermissions && !canBootstrapOwnLaptopPermission(actor, email)) {
      return { success: false, error: 'Permission management access is required.' };
    }

    await ensureLaptopPermissionsRoleConstraint();
    await exec(
      `INSERT INTO laptop_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, country = EXCLUDED.country,
         segment = EXCLUDED.segment, updated_at = CURRENT_TIMESTAMP`,
      [
        email,
        blankToNull(input.name),
        role,
        blankToNull(input.country),
        blankToNull(input.segment),
      ],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('updateLaptopPermission.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update permission.',
    };
  }
}

export async function deleteLaptopPermission(email: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await exec(`DELETE FROM laptop_permissions WHERE email = ?`, [email.toLowerCase()]);
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('deleteLaptopPermission.failed', err);
    return { success: false, error: 'Failed to delete permission.' };
  }
}

/* ── Approver matrix admin ─────────────────────────────────────── */

export async function getLaptopApproverMatrix(): Promise<LaptopApproverMatrixRow[] | null> {
  try {
    await requireAdminActor();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_approver_matrix ORDER BY country`,
    );
    return asSerialised<LaptopApproverMatrixRow[]>(rows);
  } catch (err) {
    log.error('getLaptopApproverMatrix.failed', err);
    return null;
  }
}

/**
 * Sets — or clears — exactly one approver cell: one country, one stage+slot.
 *
 * Writes only that column pair, so two admins editing different cells of the same
 * country can't overwrite each other the way resending the whole row does. Pass a blank
 * email to clear the slot. Creates the country's matrix row if it doesn't exist yet, and
 * otherwise leaves is_active alone (that's setLaptopApproverCountryActive's job).
 */
export async function setLaptopApproverCell(input: {
  country: string;
  role: LaptopApprovalStage;
  slot?: number;
  email?: string | null;
  displayName?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    const rawCountry = requireText(input.country, 'Country');
    // Canonicalised before it can reach the table — see resolveLaptopMatrixCountry.
    const country = resolveLaptopMatrixCountry(rawCountry, await existingMatrixCountries());
    if (!country) return { success: false, error: unknownMatrixCountryError([rawCountry]) };
    const cols = getMatrixColumns(input.role, input.slot ?? 1);
    if (!cols) return { success: false, error: 'Unknown approver role.' };

    const email = (input.email ?? '').trim().toLowerCase() || null;
    // A cleared slot drops the cached display name with it, so the two never disagree.
    const name = email ? blankToNull(input.displayName) : null;
    if (email) {
      const unknown = await findUnknownDirectoryEmails([email]);
      if (unknown.length) return { success: false, error: unknownDirectoryEmailError(unknown) };
    }

    await ensureLaptopApproverMatrixColumns();
    // Look-then-insert: without the transaction two admins adding the first approver
    // for the same country can both miss the row and both insert one.
    await withTransaction(laptopProcurementPool, async (client) => {
      const existing = await sqlTx<QueryResultRow[]>(
        client,
        `SELECT id FROM laptop_approver_matrix WHERE country = ? LIMIT 1`,
        [country],
      );
      if (existing[0]) {
        await execTx(
          client,
          `UPDATE laptop_approver_matrix SET ${cols.emailCol} = ?, ${cols.nameCol} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [email, name, existing[0].id],
        );
      } else {
        await execTx(
          client,
          `INSERT INTO laptop_approver_matrix (country, ${cols.emailCol}, ${cols.nameCol}, is_active) VALUES (?, ?, ?, TRUE)`,
          [country, email, name],
        );
      }
    });
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('setLaptopApproverCell.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update approver.',
    };
  }
}

/** Switches one country's approver row on or off, leaving every approver cell on it untouched. */
export async function setLaptopApproverCountryActive(input: {
  country: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    const country = requireText(input.country, 'Country');
    await exec(
      `UPDATE laptop_approver_matrix SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE country = ?`,
      [input.isActive, country],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('setLaptopApproverCountryActive.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update country status.',
    };
  }
}

/**
 * Sets someone as the named approver for a stage+slot across exactly the given
 * countries — the "Add / Update Permission" form's write path for IT Manager (any of
 * its 3 slots) / Country Manager / IT Director / Supply Chain Director, since that
 * authority lives in laptop_approver_matrix, not laptop_permissions (see
 * buildEffectivePermissions). Creates a country's matrix row if it doesn't exist yet;
 * otherwise updates just that one stage+slot's email/name, leaving every other
 * stage/slot on the row untouched.
 *
 * Pass `originalEmail` when editing an existing assignment (including renaming to a
 * different email) — it's cleared from this exact stage+slot everywhere first, so
 * dropping a country from the new list actually removes it rather than leaving it
 * stale. `slot` defaults to 1 (the only slot every non-IT-Manager stage has).
 */
export async function saveApproverMatrixRole(input: {
  originalEmail?: string;
  email: string;
  name?: string;
  role: LaptopApprovalStage;
  slot?: number;
  countries: string[];
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    const email = requireText(input.email, 'Email').toLowerCase();
    const slot = input.slot ?? 1;
    const rawCountries = [...new Set(input.countries.map((c) => c.trim()).filter(Boolean))];
    if (!rawCountries.length) return { success: false, error: 'At least one country is required.' };
    // Canonicalised before they can reach the table — see resolveLaptopMatrixCountry.
    const known = await existingMatrixCountries();
    const resolvedCountries = rawCountries.map((c) => ({
      raw: c,
      canonical: resolveLaptopMatrixCountry(c, known),
    }));
    const unknownCountries = resolvedCountries.filter((c) => !c.canonical).map((c) => c.raw);
    if (unknownCountries.length)
      return { success: false, error: unknownMatrixCountryError(unknownCountries) };
    const countries = [...new Set(resolvedCountries.map((c) => c.canonical as string))];
    const cols = getMatrixColumns(input.role, slot);
    if (!cols) return { success: false, error: 'Unknown approver role.' };

    const unknown = await findUnknownDirectoryEmails([email]);
    if (unknown.length) return { success: false, error: unknownDirectoryEmailError(unknown) };

    // The clear and the per-country writes are one edit: a failure part-way through
    // would otherwise leave the person stripped from their old countries without being
    // installed on the new ones — i.e. a stage with no approver at all.
    await withTransaction(laptopProcurementPool, async (client) => {
      if (input.originalEmail?.trim()) {
        await clearApproverMatrixRoleForEmail(
          input.originalEmail.trim().toLowerCase(),
          input.role,
          slot,
          client,
        );
      }

      for (const country of countries) {
        const rows = await sqlTx<QueryResultRow[]>(
          client,
          `SELECT id FROM laptop_approver_matrix WHERE country = ? LIMIT 1`,
          [country],
        );
        if (rows[0]) {
          await execTx(
            client,
            `UPDATE laptop_approver_matrix SET ${cols.emailCol} = ?, ${cols.nameCol} = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [email, blankToNull(input.name), rows[0].id],
          );
        } else {
          await execTx(
            client,
            `INSERT INTO laptop_approver_matrix (country, ${cols.emailCol}, ${cols.nameCol}, is_active) VALUES (?, ?, ?, TRUE)`,
            [country, email, blankToNull(input.name)],
          );
        }
      }
    });
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('saveApproverMatrixRole.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save approver.',
    };
  }
}

/**
 * Sets one approver stage+slot to the same person for EVERY country at once — the
 * column-header assign in the Approvers by Country & Role matrix, for stages like IT
 * Director / Supply Chain Director that are usually the same person region-wide.
 *
 * Touches only that one column pair, so every other stage on every row is left alone,
 * and unlike saveApproverMatrixRole it never flips is_active — a country deliberately
 * switched off stays off.
 */
export async function setLaptopApproverColumn(input: {
  role: LaptopApprovalStage;
  slot?: number;
  email: string;
  displayName?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    const cols = getMatrixColumns(input.role, input.slot ?? 1);
    if (!cols) return { success: false, error: 'Unknown approver role.' };
    const email = requireText(input.email, 'Email').toLowerCase();

    const unknown = await findUnknownDirectoryEmails([email]);
    if (unknown.length) return { success: false, error: unknownDirectoryEmailError(unknown) };

    await ensureLaptopApproverMatrixColumns();
    await exec(
      `UPDATE laptop_approver_matrix SET ${cols.emailCol} = ?, ${cols.nameCol} = ?, updated_at = CURRENT_TIMESTAMP`,
      [email, blankToNull(input.displayName)],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('setLaptopApproverColumn.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update this role for every country.',
    };
  }
}

/**
 * Clears someone as the named approver for a stage+slot, across every country's
 * matrix row — the "Remove" action for a matrix-sourced row in the merged Permissions
 * list. Per-country adjustments (removing just one of several countries) can be done
 * via Edit instead, or through the Approver Matrix tab directly.
 */
export async function removeApproverMatrixRole(input: {
  email: string;
  role: LaptopApprovalStage;
  slot?: number;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    const email = input.email.trim().toLowerCase();
    if (!email) return { success: false, error: 'Email is required.' };

    await clearApproverMatrixRoleForEmail(email, input.role, input.slot ?? 1);
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('removeApproverMatrixRole.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove approver.',
    };
  }
}

/* ── Access requests (mirrors ProcureGuard's access-request queue) ───────── */
