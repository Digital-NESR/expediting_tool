'use server';

/**
 * Access requests and grants for SOA Consolidation.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint reachable by any signed-in
 * employee, so each one below starts with its own guard. The /admin page's UI gate is not a
 * security control, an admin-only screen that calls an ungated action is an admin-only screen in
 * appearance only.
 */

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { exec, ensureSoaSchema, sql } from '@/lib/soa/db';
import { requireSoaActor } from '@/lib/soa/access';
import { notifyAccessRequest } from '@/lib/access-request-notify';

const log = logger('soa-access');

export interface SoaCountryOption {
  id: string;
  name: string;
}

export interface SoaAccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
  requested_role: string;
  requested_country: string | null;
  approved_role: string | null;
  approved_country: string | null;
  reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface SoaGrantRow {
  email: string;
  name: string;
  role: string;
  country_id: string | null;
}

export type SoaActionResult = { success: boolean; error?: string };

/**
 * Roles a person may ask for.
 *
 * `ap` is here because Accounts Payable staff review a closed cycle for their own country, which
 * is exactly the kind of access it is reasonable to request and have approved.
 */
const REQUESTABLE = new Set(['champion', 'viewer', 'ap']);

/** Roles an administrator appoints directly on the country team screen. */
const APPOINTABLE = new Set(['champion', 'ap']);

export type AppointableRole = 'champion' | 'ap';

function serialiseDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

/** The countries a request or grant may name. Any signed-in user, since the request form needs it. */
export async function getSoaCountries(): Promise<SoaCountryOption[]> {
  const actor = await currentActor();
  if (!actor) return [];
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, name FROM countries WHERE active ORDER BY sort_order, name`,
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
}

/**
 * Ask for access. Requesting again replaces the standing request rather than queuing a second one,
 * which is what lets someone correct a country they picked wrongly without an admin's help.
 *
 * `countryId` null means every country. Champion, Accounts Payable and viewer are offerable: an admin is
 * appointed in the /admin matrix, and admin comes from ADMIN_EMAILS. Neither is self-servable,
 * and this action rejects an attempt to request one rather than silently downgrading it.
 */
/** Stored role codes, as a reviewer would read them. Mirrors the labels in `@/lib/soa/notify`. */
const ROLE_LABEL: Record<string, string> = {
  champion: 'SC SOA Champion',
  ap: 'Accounts Payable',
  viewer: 'Read-only Viewer',
};

export async function submitSoaAccessRequest(input: {
  role: string;
  countryId: string | null;
  reason?: string | null;
}): Promise<SoaActionResult> {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required.', 401);
    await ensureSoaSchema();

    if (!REQUESTABLE.has(input.role)) {
      return { success: false, error: 'Choose Champion, Accounts Payable or Viewer.' };
    }
    if (input.countryId) {
      const known = await sql<QueryResultRow[]>(`SELECT 1 FROM countries WHERE id = ? AND active`, [
        input.countryId,
      ]);
      if (!known.length) return { success: false, error: 'Unknown country.' };
    }

    await exec(
      `INSERT INTO soa_access_requests
         (user_email, display_name, status, requested_role, requested_country, reason, requested_at)
       VALUES (?, ?, 'Pending', ?, ?, ?, NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'Pending',
         requested_role = EXCLUDED.requested_role,
         requested_country = EXCLUDED.requested_country,
         reason = EXCLUDED.reason,
         requested_at = NOW(),
         reviewed_at = NULL,
         reviewed_by = NULL`,
      [
        normalizeEmail(actor.email),
        actor.name,
        input.role,
        input.countryId,
        (input.reason ?? '').trim() || null,
      ],
    );

    /* After the write, and deliberately not awaited into the result: the request is already
       recorded, so a webhook that is down should delay the admin hearing about it, not fail the
       submission and send the person away thinking it did not go through. */
    const country = input.countryId
      ? ((
          await sql<QueryResultRow[]>(`SELECT name FROM countries WHERE id = ?`, [input.countryId])
        )[0]?.name ?? input.countryId)
      : null;
    await notifyAccessRequest({
      tool: 'SOA Consolidation',
      name: actor.name,
      email: normalizeEmail(actor.email),
      // The only tool that captures both; a blank country means every country.
      country: country ? String(country) : 'All countries',
      role: ROLE_LABEL[input.role] ?? input.role,
      reason: (input.reason ?? '').trim() || null,
    });

    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('submitSoaAccessRequest.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not submit the request.',
    };
  }
}

/**
 * The caller's own access request, so the waiting-for-approval screen can say what they asked for.
 *
 * Guarded on being signed in rather than on having access. The whole point is that the person
 * asking has none yet, and it reads only their own row, keyed on their session email. It cannot
 * be pointed at somebody else's.
 */
export async function getMySoaAccessRequest(): Promise<{
  status: string;
  requestedRole: string;
  requestedCountry: string | null;
  requestedCountryName: string | null;
  requestedAt: string;
} | null> {
  try {
    const actor = await currentActor();
    if (!actor) return null;
    await ensureSoaSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT r.status, r.requested_role, r.requested_country, c.name AS country_name,
              r.requested_at
         FROM soa_access_requests r
         LEFT JOIN countries c ON c.id = r.requested_country
        WHERE LOWER(r.user_email) = ?
        LIMIT 1`,
      [normalizeEmail(actor.email)],
    );
    if (!rows.length) return null;
    return {
      status: String(rows[0].status),
      requestedRole: String(rows[0].requested_role),
      requestedCountry: rows[0].requested_country ? String(rows[0].requested_country) : null,
      requestedCountryName: rows[0].country_name ? String(rows[0].country_name) : null,
      requestedAt: serialiseDate(rows[0].requested_at),
    };
  } catch (err) {
    log.error('getMySoaAccessRequest.failed', err);
    return null;
  }
}

/**
 * How many requests are waiting, for the /admin sidebar badge.
 *
 * Every other tool's badge comes from its own action rather than from a query in the admin layout,
 * and this keeps SOA uniform with them. Returns 0 rather than throwing, because a badge is not
 * worth taking the whole admin area down for.
 */
export async function getSoaPendingCount(): Promise<number> {
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS n FROM soa_access_requests WHERE status = 'Pending'`,
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** Every request, newest first. Admin only. */
export async function getSoaAccessRequests(): Promise<SoaAccessRequestRow[]> {
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM soa_access_requests
       ORDER BY CASE status WHEN 'Pending' THEN 0 ELSE 1 END, requested_at DESC`,
    );
    return rows.map((r) => ({
      user_email: String(r.user_email),
      display_name: r.display_name ? String(r.display_name) : null,
      job_title: r.job_title ? String(r.job_title) : null,
      department: r.department ? String(r.department) : null,
      status: String(r.status),
      requested_role: String(r.requested_role),
      requested_country: r.requested_country ? String(r.requested_country) : null,
      approved_role: r.approved_role ? String(r.approved_role) : null,
      approved_country: r.approved_country ? String(r.approved_country) : null,
      reason: r.reason ? String(r.reason) : null,
      requested_at: serialiseDate(r.requested_at),
      reviewed_at: r.reviewed_at ? serialiseDate(r.reviewed_at) : null,
      reviewed_by: r.reviewed_by ? String(r.reviewed_by) : null,
    }));
  } catch (err) {
    log.error('getSoaAccessRequests.failed', err);
    return [];
  }
}

/**
 * Approve a request, granting the role and country the ADMIN chose, not the ones the requester
 * asked for. The request is a proposal; an admin routinely approves a champion request as a viewer,
 * and reading the grant back off `requested_role` would quietly ignore that decision.
 *
 * The grant row and the request's new status are written together: a failure between them either
 * grants access nobody approved, or records an approval that granted nothing.
 */
export async function approveSoaAccessRequest(input: {
  email: string;
  role: string;
  countryId: string | null;
}): Promise<SoaActionResult> {
  try {
    const admin = await requireSoaActor('admin');
    if (!REQUESTABLE.has(input.role)) {
      return {
        success: false,
        error: 'A request can only be approved as Champion, Accounts Payable or Viewer.',
      };
    }
    const email = normalizeEmail(input.email);
    if (!email) return { success: false, error: 'Email is required.' };

    const existing = await sql<QueryResultRow[]>(
      `SELECT display_name FROM soa_access_requests WHERE LOWER(user_email) = ?`,
      [email],
    );
    if (!existing.length) return { success: false, error: 'No such request.' };
    const name = existing[0].display_name ? String(existing[0].display_name) : email;

    await exec(
      `INSERT INTO country_users (email, name, country_id, role)
       VALUES (?, ?, ?, ?::soa_user_role)
       ON CONFLICT (email, role, COALESCE(country_id, '*')) DO UPDATE SET name = EXCLUDED.name`,
      [email, name, input.countryId, input.role],
    );
    await exec(
      `UPDATE soa_access_requests
          SET status = 'Approved', approved_role = ?, approved_country = ?,
              reviewed_at = NOW(), reviewed_by = ?
        WHERE LOWER(user_email) = ?`,
      [input.role, input.countryId, admin.email, email],
    );

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('approveSoaAccessRequest.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not approve the request.',
    };
  }
}

/** Decline a request without granting anything. */
export async function rejectSoaAccessRequest(email: string): Promise<SoaActionResult> {
  try {
    const admin = await requireSoaActor('admin');
    await exec(
      `UPDATE soa_access_requests
          SET status = 'Rejected', approved_role = NULL, approved_country = NULL,
              reviewed_at = NOW(), reviewed_by = ?
        WHERE LOWER(user_email) = ?`,
      [admin.email, normalizeEmail(email)],
    );
    revalidatePath('/admin/soa');
    return { success: true };
  } catch (err) {
    log.error('rejectSoaAccessRequest.failed', err);
    return { success: false, error: 'Could not reject the request.' };
  }
}

/**
 * Take access away. Champion, AP and viewer grants all go, every one of them can arrive through
 * a request, so every one of them can be taken back the same way.
 */
export async function revokeSoaAccess(email: string): Promise<SoaActionResult> {
  try {
    const admin = await requireSoaActor('admin');
    const target = normalizeEmail(email);
    await exec(
      `DELETE FROM country_users WHERE LOWER(email) = ? AND role IN ('champion', 'ap', 'viewer')`,
      [target],
    );
    await exec(
      `UPDATE soa_access_requests
          SET status = 'Revoked', approved_role = NULL, approved_country = NULL,
              reviewed_at = NOW(), reviewed_by = ?
        WHERE LOWER(user_email) = ?`,
      [admin.email, target],
    );
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('revokeSoaAccess.failed', err);
    return { success: false, error: 'Could not revoke access.' };
  }
}

/* ─── Country team: champions and AP contacts ──────────────── */

/**
 * Everyone appointed to a country, champions and AP together.
 *
 * One list rather than two screens because they are read together: a champion chases the vendors
 * and the AP contacts are copied on every letter and pick the cycle up when it closes. Seeing a
 * country with three champions and no AP contact is the point.
 */
export async function getSoaCountryTeam(): Promise<SoaGrantRow[]> {
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT cu.email, cu.name, cu.role::text AS role, cu.country_id
         FROM country_users cu
        WHERE cu.role IN ('champion', 'ap')
        ORDER BY cu.country_id, cu.role, cu.name`,
    );
    return rows.map((r) => ({
      email: String(r.email),
      name: String(r.name),
      role: String(r.role),
      country_id: r.country_id === null ? null : String(r.country_id),
    }));
  } catch (err) {
    log.error('getSoaCountryTeam.failed', err);
    return [];
  }
}

/**
 * Appoint somebody to a country.
 *
 * The address is not required to be in the employee directory. Half the AP contacts are shared
 * mailboxes -- invoices.ksa@nesr.com, financeteam.kuwait@nesr.com -- which no person owns and
 * which nobody could ever request access on behalf of. They still need to be copied on the
 * letters, so an administrator can type one in.
 */
export async function setSoaCountryUser(input: {
  email: string;
  name: string;
  countryId: string;
  role: AppointableRole;
}): Promise<SoaActionResult> {
  try {
    await requireSoaActor('admin');
    if (!APPOINTABLE.has(input.role)) return { success: false, error: 'Unknown role.' };

    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (!email || !email.includes('@'))
      return { success: false, error: 'That is not an email address.' };
    if (!name)
      return {
        success: false,
        error: 'A name is required. It appears in the letter and the audit trail.',
      };

    const known = await sql<QueryResultRow[]>(`SELECT 1 FROM countries WHERE id = ? AND active`, [
      input.countryId,
    ]);
    if (!known.length) return { success: false, error: 'Unknown country.' };

    await exec(
      `INSERT INTO country_users (email, name, country_id, role)
       VALUES (?, ?, ?, ?::soa_user_role)
       ON CONFLICT (email, role, COALESCE(country_id, '*')) DO UPDATE SET name = EXCLUDED.name`,
      [email, name, input.countryId, input.role],
    );
    log.info('countryTeam.appointed', { email, countryId: input.countryId, role: input.role });
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('setSoaCountryUser.failed', err);
    return { success: false, error: 'Could not save that appointment.' };
  }
}

/** Remove one appointment. Leaves any access request they hold alone. */
export async function removeSoaCountryUser(input: {
  email: string;
  countryId: string;
  role: AppointableRole;
}): Promise<SoaActionResult> {
  try {
    await requireSoaActor('admin');
    if (!APPOINTABLE.has(input.role)) return { success: false, error: 'Unknown role.' };
    await exec(
      `DELETE FROM country_users
        WHERE LOWER(email) = ? AND role = ?::soa_user_role AND country_id = ?`,
      [normalizeEmail(input.email), input.role, input.countryId],
    );
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('removeSoaCountryUser.failed', err);
    return { success: false, error: 'Could not remove that appointment.' };
  }
}
