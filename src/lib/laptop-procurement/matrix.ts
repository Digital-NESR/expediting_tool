/* ─── Helpers for editing the approver matrix, including the directory check that stops a typo
   becoming an approver nobody can find. ─── */

import empDirectoryPool from '@/lib/db-emp-directory';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type { PoolClient } from 'pg';
import { exec, execTx } from '@/lib/laptop-procurement/db';

const log = logger('laptop-procurement');

/**
 * Returns whichever of `emails` have no matching person in the Azure AD directory.
 *
 * Approver emails are typed as free text, so a single-character typo silently installs
 * an approver who can never sign in and never receives a notification — nothing errors,
 * the stage just goes quiet (this is exactly how Oman's Country Manager sat unreachable:
 * `hbusaid@` instead of `hbusaidi@`). Every matrix write checks the address first.
 *
 * Deliberately fails OPEN: if the directory DB is unreachable this resolves to [] so an
 * outage can't lock admins out of editing the matrix. A directory that answers but has
 * no row for the address is a genuine typo, and that does get rejected.
 */
export async function findUnknownDirectoryEmails(
  emails: (string | null | undefined)[],
): Promise<string[]> {
  const wanted = [...new Set(emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length) return [];
  try {
    const { rows } = await empDirectoryPool.query(
      `SELECT LOWER(mail) AS mail FROM azure_ad_users_staging WHERE LOWER(mail) = ANY($1)`,
      [wanted],
    );
    const known = new Set(rows.map((r) => r.mail as string));
    return wanted.filter((e) => !known.has(e));
  } catch (err) {
    log.error('findUnknownDirectoryEmails.failed', err);
    return [];
  }
}

export function unknownDirectoryEmailError(unknown: string[]): string {
  const subject = unknown.length === 1 ? `${unknown[0]} is` : `${unknown.join(', ')} are`;
  return `${subject} not in the employee directory. Pick the person from the search suggestions — an address that isn't in the directory can never sign in or receive approval emails.`;
}

// IT Manager can have up to 3 named slots (co-managers) for the same country; every
// other stage only ever has slot 1. Returns null for an out-of-range slot (e.g. slot 2
// or 3 requested for a single-slot stage).
export function getMatrixColumns(
  role: LaptopApprovalStage,
  slot: number,
): { emailCol: string; nameCol: string } | null {
  if (role === 'IT Manager') {
    if (slot === 1) return { emailCol: 'it_manager_email', nameCol: 'it_manager_name' };
    if (slot === 2) return { emailCol: 'it_manager_2_email', nameCol: 'it_manager_2_name' };
    if (slot === 3) return { emailCol: 'it_manager_3_email', nameCol: 'it_manager_3_name' };
    return null;
  }
  if (slot !== 1) return null;
  switch (role) {
    case 'Country Manager':
      return { emailCol: 'cm_email', nameCol: 'cm_name' };
    case 'IT Director':
      return { emailCol: 'itd_email', nameCol: 'itd_name' };
    case 'Supply Chain Director':
      return { emailCol: 'scd_email', nameCol: 'scd_name' };
    default:
      return null;
  }
}

// Clears `email` out of exactly the given role+slot's column pair across every matrix
// row — shared by removeApproverMatrixRole and saveApproverMatrixRole's edit path.
export async function clearApproverMatrixRoleForEmail(
  email: string,
  role: LaptopApprovalStage,
  slot: number,
  client?: PoolClient,
): Promise<void> {
  const cols = getMatrixColumns(role, slot);
  if (!cols) return;
  const statement = `UPDATE laptop_approver_matrix SET ${cols.emailCol} = NULL, ${cols.nameCol} = NULL, updated_at = CURRENT_TIMESTAMP WHERE LOWER(${cols.emailCol}) = ?`;
  if (client) await execTx(client, statement, [email]);
  else await exec(statement, [email]);
}
