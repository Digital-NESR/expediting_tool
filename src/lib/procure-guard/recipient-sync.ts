/**
 * Rebuilds ProcureGuard permission + access rows from the notification-recipient directory.
 *
 * A plain module, deliberately NOT `'use server'`: this sync grants and revokes approval authority,
 * so it must never be reachable as a POST endpoint. Only the recipient mutators and the explicit
 * admin "Re-sync" action may call it, and both guard first.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { normalizeProcureGuardCountry, roleRequiresProcureGuardCountryScope } from '@/lib/procureGuard-utils';
import type {
  ProcureGuardPermissionRole,
  ProcureGuardRequestType,
  ProcureGuardStatus,
} from '@/types/procureGuard';
import { isValidEmail } from './constants';
import { exec, sql } from './internals';
import { ensureProcureGuardAccessRequestTable, ensureProcureGuardPermissionRoleValues } from './schema';
import { blankToNull, normalisePersonName, normaliseProcureGuardRole } from './validation';

const log = logger('procure-guard');

const PROCURE_GUARD_LOCAL_TEST_EMAILS = ['local.procureguard@example.com'];

const PROCURE_GUARD_REVIEW_ROLE_RANK: Record<ProcureGuardPermissionRole, number> = {
  Requester: 0,
  Analyst: 1,
  'Read Only': 1,
  Viewer: 1,
  'SCM Manager': 2,
  'Country Controller': 3,
  'Supply Chain Director': 4,
  'Treasury Director': 5,
  'Corporate Controller': 6,
  CFO: 7,
  Admin: 8,
};

// Roles the recipient sync derives (procureGuardRoleFromRecipient only ever returns one of these).
// A permission row with one of these roles whose email is no longer an active recipient is a stale
// approver grant — pruned on sync so a reassigned/removed approver cleanly loses authority + visibility.
const PROCURE_GUARD_APPROVER_ROLES: ProcureGuardPermissionRole[] = [
  'SCM Manager', 'Country Controller', 'Supply Chain Director', 'Treasury Director', 'Corporate Controller', 'CFO',
];

// Originally from "ProcureGuard - Sub (1).csv": approver name -> the countries their country-scoped
// role covers. This is now only the SEED for `procure_guard_recipient_country_scopes`, which the
// sync actually reads (see loadRecipientCountryScopes). It is kept in source so a fresh database
// still gets the right scopes on first sync — including the live 'EOS, Chad, Congo' Country
// Controller scope, which must never be lost. Edit the TABLE, not this map, for new corrections.
const PROCURE_GUARD_CSV_ROLE_COUNTRIES: Record<string, Partial<Record<ProcureGuardPermissionRole, string[]>>> = {
  [normalisePersonName('Hichem Bezghoud')]: { 'SCM Manager': ['Algeria'] },
  [normalisePersonName('Wael Sharabash')]: { 'SCM Manager': ['Bahrain', 'Saudi Arabia (KSA)'] },
  [normalisePersonName('Belemel Riadinguem')]: { 'SCM Manager': ['Chad'] },
  [normalisePersonName('Mourad Ibrahim')]: { 'SCM Manager': ['Egypt'] },
  [normalisePersonName('Joby Jose')]: { 'SCM Manager': ['EOS'] },
  [normalisePersonName('Swegesh Chinnan Paul')]: { 'SCM Manager': ['India'] },
  [normalisePersonName('Novita Trihandayani')]: { 'SCM Manager': ['Indonesia', 'Malaysia'] },
  [normalisePersonName('Mazen Sarem')]: { 'SCM Manager': ['Iraq'] },
  [normalisePersonName('Talal Aladwani')]: { 'SCM Manager': ['Jordan', 'Kuwait'] },
  [normalisePersonName('Mohamed Hbarat')]: { 'SCM Manager': ['Libya'] },
  [normalisePersonName('Suhail Jafar Al Moosa')]: { 'SCM Manager': ['Oman', 'Yemen'] },
  [normalisePersonName('Abdallah Boulifa')]: { 'SCM Manager': ['Qatar'] },
  [normalisePersonName('Zied Fehri')]: { 'SCM Manager': ['United Arab Emirates (UAE)'] },
  [normalisePersonName('Ahmed Mouhoub')]: { 'Country Controller': ['Algeria'] },
  [normalisePersonName('Mohamed Merghani')]: { 'Country Controller': ['Bahrain', 'Saudi Arabia (KSA)'] },
  [normalisePersonName('Muhammad Khan')]: { 'Country Controller': ['EOS', 'Chad', 'Congo'] },
  [normalisePersonName('Mahmoud El-Nady')]: { 'Country Controller': ['Egypt'] },
  [normalisePersonName('Ahmed Malik')]: { 'Country Controller': ['HQ Dubai'] },
  [normalisePersonName('Ali Bohra')]: { 'Country Controller': ['India'] },
  [normalisePersonName('Ni Kusmiati')]: { 'Country Controller': ['Indonesia', 'Malaysia'] },
  [normalisePersonName('Ramakrishnan Sunderraman')]: { 'Country Controller': ['Iraq'] },
  [normalisePersonName('Shodhan Shetty')]: { 'Country Controller': ['Jordan', 'Kuwait'] },
  [normalisePersonName('Abdurahim Drebi')]: { 'Country Controller': ['Libya'] },
  [normalisePersonName('Adila Harib Al Ismaili')]: { 'Country Controller': ['Oman', 'Yemen'] },
  [normalisePersonName('Mounir Mohamed Al-Sherif')]: { 'Country Controller': ['Qatar'] },
  [normalisePersonName('Rami Dabous')]: { 'Country Controller': ['United Arab Emirates (UAE)'] },
};

/** name -> role -> countries, as loaded from the database for one sync run. */
type RecipientCountryScopes = Map<string, Partial<Record<ProcureGuardPermissionRole, string[]>>>;

/**
 * Loads the approver name -> country-scope overrides from `procure_guard_recipient_country_scopes`,
 * creating and seeding that table from PROCURE_GUARD_CSV_ROLE_COUNTRIES the first time. Admins can
 * then correct a scope with a row update instead of a code deploy.
 *
 * If the table cannot be created or read, we fall back to the in-source seed rather than syncing
 * people to an empty scope — losing a country scope silently is what caused the 404 incident.
 */
async function loadRecipientCountryScopes(): Promise<RecipientCountryScopes> {
  const fromSeed = (): RecipientCountryScopes =>
    new Map(Object.entries(PROCURE_GUARD_CSV_ROLE_COUNTRIES));

  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS procure_guard_recipient_country_scopes (
        person_name TEXT NOT NULL,
        role TEXT NOT NULL,
        countries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (person_name, role)
      )
    `);

    // Insert any seed entry the table does not already have. DO NOTHING, never overwrite: a row an
    // admin has corrected in the database wins over the seed, and a seed entry added after the table
    // was first created (such as the 'EOS, Chad, Congo' Country Controller fix) still lands.
    for (const [personName, byRole] of Object.entries(PROCURE_GUARD_CSV_ROLE_COUNTRIES)) {
      for (const [role, countries] of Object.entries(byRole)) {
        await exec(
          `INSERT INTO procure_guard_recipient_country_scopes (person_name, role, countries)
           VALUES (?, ?, ?)
           ON CONFLICT (person_name, role) DO NOTHING`,
          [personName, role, countries ?? []],
        );
      }
    }

    const existing = await sql<QueryResultRow[]>(`SELECT person_name, role, countries FROM procure_guard_recipient_country_scopes`);
    const scopes: RecipientCountryScopes = new Map();
    for (const row of existing) {
      const personName = normalisePersonName(String(row.person_name ?? ''));
      const role = String(row.role ?? '') as ProcureGuardPermissionRole;
      if (!personName || !role) continue;
      const countries = Array.isArray(row.countries) ? row.countries.map(String) : [];
      const byRole = scopes.get(personName) ?? {};
      byRole[role] = countries;
      scopes.set(personName, byRole);
    }
    return scopes.size > 0 ? scopes : fromSeed();
  } catch (err) {
    log.error('recipientCountryScopes.loadFailed', err, { fallback: 'in-source seed' });
    return fromSeed();
  }
}

function csvRoleCountriesForRecipient(scopes: RecipientCountryScopes, name: string, role: ProcureGuardPermissionRole): string[] {
  const countries = scopes.get(normalisePersonName(name))?.[role] ?? [];
  return countries.map(country => normalizeProcureGuardCountry(country)).filter((country): country is string => Boolean(country));
}

function procureGuardRoleFromRecipient(row: {
  request_type?: ProcureGuardRequestType | 'both' | null;
  notification_role?: string | null;
  approval_status?: ProcureGuardStatus | null;
}): ProcureGuardPermissionRole | null {
  const role = (row.notification_role ?? '').toLowerCase();
  if (role.includes('cfo')) return 'CFO';
  if (role.includes('corporate controller')) return 'Corporate Controller';
  if (role.includes('treasury')) return 'Treasury Director';
  if (role.includes('supply chain director')) return 'Supply Chain Director';
  if (role.includes('country controller') || role.includes('country finance')) return 'Country Controller';
  if (role.includes('scm') || role.includes('supply chain manager')) return 'SCM Manager';

  if (row.approval_status === 'Approved by Corporate Controller') return 'CFO';
  if (row.approval_status === 'Approved by Treasury Director') return 'Corporate Controller';
  if (row.approval_status === 'Approved by Supply Chain Director') return 'Treasury Director';
  if (row.approval_status === 'Approved by Country Controller') return 'Supply Chain Director';
  if (row.approval_status === 'Approved by SCM') return 'Supply Chain Director';
  if (row.approval_status === 'Under Review') {
    return row.request_type === 'advance' ? 'Country Controller' : 'SCM Manager';
  }

  return null;
}

/**
 * NEVER call this from a read path. It used to run on every admin page load, performing two upserts
 * per recipient plus deletes and pruning approver permissions, which silently wiped approver roles
 * granted through the manual permission editor the next time an admin opened the panel. It now runs
 * only from the recipient mutators (which change its inputs) and from the explicit admin "Re-sync"
 * action.
 */
export async function syncProcureGuardRecipientAccessApprovals(): Promise<void> {
  await ensureProcureGuardAccessRequestTable();
  await ensureProcureGuardPermissionRoleValues();
  const countryScopes = await loadRecipientCountryScopes();

  for (const email of PROCURE_GUARD_LOCAL_TEST_EMAILS) {
    await exec(`DELETE FROM procure_guard_access_requests WHERE user_email = ?`, [email]);
    await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
  }

  const rows = await sql<QueryResultRow[]>(`
    SELECT display_name, email, country, request_type, notification_role, approval_status
    FROM procure_guard_notification_recipients
    WHERE is_active = TRUE
      AND email IS NOT NULL
      AND TRIM(email) <> ''
  `);

  const byEmail = new Map<string, {
    email: string;
    name: string;
    role: ProcureGuardPermissionRole;
    countries: Set<string>;
  }>();

  for (const row of rows) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) continue;
    if (PROCURE_GUARD_LOCAL_TEST_EMAILS.includes(email)) continue;

    const role = procureGuardRoleFromRecipient({
      request_type: row.request_type as ProcureGuardRequestType | 'both' | null,
      notification_role: row.notification_role ? String(row.notification_role) : null,
      approval_status: row.approval_status as ProcureGuardStatus | null,
    });
    if (!role) continue;

    const current = byEmail.get(email);
    const currentRank = current ? PROCURE_GUARD_REVIEW_ROLE_RANK[current.role] : -1;
    const nextRole = PROCURE_GUARD_REVIEW_ROLE_RANK[role] > currentRank ? role : current?.role ?? role;
    const countries = current?.countries ?? new Set<string>();
    const displayName = String(row.display_name ?? '').trim();
    const csvCountries = roleRequiresProcureGuardCountryScope(role) ? csvRoleCountriesForRecipient(countryScopes, displayName, role) : [];
    const country = normalizeProcureGuardCountry(row.country ? String(row.country) : null);
    if (csvCountries.length > 0) {
      countries.clear();
      for (const csvCountry of csvCountries) countries.add(csvCountry);
    } else if (country) {
      countries.add(country);
    }

    byEmail.set(email, {
      email,
      name: displayName || current?.name || email,
      role: nextRole,
      countries,
    });
  }

  const existingRows = await sql<QueryResultRow[]>(`SELECT email, role FROM procure_guard_permissions`);
  const existingRoleByEmail = new Map(existingRows.map(row => [String(row.email).toLowerCase(), normaliseProcureGuardRole(row.role)]));

  for (const recipient of byEmail.values()) {
    if (existingRoleByEmail.get(recipient.email) === 'Admin') continue;

    const csvCountries = roleRequiresProcureGuardCountryScope(recipient.role)
      ? csvRoleCountriesForRecipient(countryScopes, recipient.name, recipient.role)
      : [];
    const country = roleRequiresProcureGuardCountryScope(recipient.role)
      ? csvCountries.length > 0
        ? csvCountries.join(', ')
        : recipient.countries.size > 0
          ? [...recipient.countries].join(', ')
          : null
      : null;
    const syncNotes = roleRequiresProcureGuardCountryScope(recipient.role) && !country
      ? 'Synced from notification recipients; country scope needs review'
      : 'Synced from notification recipients';
    await exec(
      `INSERT INTO procure_guard_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, procure_guard_permissions.name),
         role = EXCLUDED.role,
         country = EXCLUDED.country,
         segment = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [recipient.email, recipient.name, recipient.role, blankToNull(country)],
    );

    await exec(
      `INSERT INTO procure_guard_access_requests
       (user_email, display_name, status, requested_role, approved_role, country, segment, requested_at, reviewed_at, reviewed_by, notes)
       VALUES (?, ?, 'Approved', ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ProcureGuard recipient sync', ?)
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'Approved',
         requested_role = EXCLUDED.requested_role,
         approved_role = EXCLUDED.approved_role,
         country = EXCLUDED.country,
         segment = NULL,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = EXCLUDED.reviewed_by,
         notes = EXCLUDED.notes`,
      [recipient.email, recipient.name, recipient.role, recipient.role, blankToNull(country), syncNotes],
    );
  }

  // Clean handoff: prune approver grants no longer backed by an active recipient, so a reassigned or
  // removed approver loses authority AND queue visibility for the scope they were taken off.
  //
  // The prune is limited to rows THIS SYNC created (their access row carries reviewed_by =
  // 'ProcureGuard recipient sync'). It used to delete any approver-role permission with no matching
  // recipient, which meant an approver role granted by hand in the permission editor was wiped the
  // next time the sync ran — the sync and the editor disagreeing about who is an approver. Admins
  // and non-approver roles (Viewer / Analyst / Read Only) were, and stay, untouched.
  const liveApproverEmails = new Set(byEmail.keys());
  const syncOwnedRows = await sql<QueryResultRow[]>(
    `SELECT user_email FROM procure_guard_access_requests WHERE reviewed_by = 'ProcureGuard recipient sync'`,
  );
  const syncOwnedEmails = new Set(syncOwnedRows.map(row => String(row.user_email ?? '').toLowerCase()).filter(Boolean));
  for (const existing of existingRows) {
    const email = String(existing.email ?? '').toLowerCase();
    if (!email) continue;
    const role = normaliseProcureGuardRole(existing.role);
    if (!PROCURE_GUARD_APPROVER_ROLES.includes(role)) continue; // preserve Admin / Viewer / Analyst / Read Only
    if (liveApproverEmails.has(email)) continue; // still an active recipient somewhere
    if (!syncOwnedEmails.has(email)) continue; // granted by hand in the permission editor — not ours to delete
    await exec(`DELETE FROM procure_guard_permissions WHERE LOWER(email) = ?`, [email]);
    await exec(
      `DELETE FROM procure_guard_access_requests WHERE LOWER(user_email) = ? AND reviewed_by = 'ProcureGuard recipient sync'`,
      [email],
    );
  }
}
