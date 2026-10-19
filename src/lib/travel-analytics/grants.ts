/**
 * Reading and writing `travel_analytics_grants`, and writing the reveal log.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and the dashboard page is a server component that resolves a reader's scope before
 * it renders anything. Only the admin editor needs to be callable from a browser, and that goes
 * through `@/app/actions/travel-analytics`, which gates every call.
 *
 * Nothing here takes an email from a caller and trusts it. Every function is handed one the
 * action already resolved from the session, because a grants list keyed on a parameter is a
 * grants list anybody can read — and `grantsFor` is the function the whole access model stands
 * on.
 */

import pool from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireSchema } from '@/lib/db/schema-version';
import { normalizeEmail } from '@/lib/require-access';
import { resolveScope, type TravelGrant, type TravelRole, type TravelScope } from './scope';

const log = logger('travel-analytics-grants');

const MIGRATION = '004_travel_analytics';

const TRAVEL_ROLES: readonly TravelRole[] = ['admin', 'finance', 'management'];

export function isTravelRole(value: unknown): value is TravelRole {
  return typeof value === 'string' && (TRAVEL_ROLES as readonly string[]).includes(value);
}

/** One row as the admin editor lists it. */
export interface TravelGrantRow {
  id: number;
  email: string;
  role: TravelRole;
  /** Null means every country. */
  country: string | null;
  createdAt: string;
  createdBy: string;
}

/**
 * One person's grants, for `resolveScope`.
 *
 * Returns an empty array when the schema is missing or the query fails, and an empty array
 * resolves to no scope at all — which shows the reader the "no access" card. That is the right
 * way round: a database blip must not hand somebody the whole company's travel, and the
 * alternative of throwing would take down a page whose first tab has nothing to do with travel.
 */
export async function grantsFor(email: string): Promise<TravelGrant[]> {
  const actor = normalizeEmail(email);
  if (!actor) return [];
  try {
    await requireSchema(pool, 'default', MIGRATION);
    const { rows } = await pool.query<{ role: string; country: string | null }>(
      `SELECT role, country FROM travel_analytics_grants WHERE lower(email) = $1`,
      [actor],
    );
    return rows
      .filter((r) => isTravelRole(r.role))
      .map((r) => ({
        role: r.role as TravelRole,
        country: r.country,
      }));
  } catch (err) {
    log.error('grantsFor.failed', err);
    return [];
  }
}

/**
 * What one person may see, or null when they hold no grant at all.
 *
 * The single place the two halves of the access model meet: the rows in the table, and the
 * rules in `./scope` for collapsing them. Both the dashboard page's gate and every action that
 * reads travel data call this, so there is no second reading of "has this person got access".
 *
 * A platform admin is NOT given a scope here. Being in ADMIN_EMAILS opens the Supply Chain
 * Analytics page, and the Power BI board on its first tab; it does not by itself hand over
 * other people's passport expiry dates. Someone who wants the travel tab grants it to
 * themselves in the editor, and that act leaves a row with their name on it.
 */
export async function travelScopeFor(email: string): Promise<TravelScope | null> {
  return resolveScope(await grantsFor(email));
}

/** Every grant, newest first, for the admin editor. */
export async function listGrants(): Promise<TravelGrantRow[]> {
  await requireSchema(pool, 'default', MIGRATION);
  const { rows } = await pool.query(
    `SELECT id, email, role, country, created_at, created_by
       FROM travel_analytics_grants
      ORDER BY lower(email), role, country NULLS FIRST`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    role: r.role as TravelRole,
    country: r.country === null ? null : String(r.country),
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: String(r.created_by),
  }));
}

export interface AddGrantInput {
  email: string;
  role: TravelRole;
  /** Null for every country. */
  country: string | null;
  createdBy: string;
}

/**
 * Add one grant, or do nothing if the same one already exists.
 *
 * An admin row is forced to all-countries. The migration's comment says admin rows are always
 * NULL and the dashboard honours that anyway — `resolveScope` gives an admin every country
 * regardless — so storing "admin, Kuwait" would create a row that reads like a restriction and
 * is not one. Refusing it here means the editor cannot display a lie.
 */
export async function addGrant(input: AddGrantInput): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('An email address is required.');
  const country = input.role === 'admin' ? null : input.country?.trim() || null;

  await requireSchema(pool, 'default', MIGRATION);
  await pool.query(
    `INSERT INTO travel_analytics_grants (email, role, country, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email, role, country) DO NOTHING`,
    [email, input.role, country, normalizeEmail(input.createdBy) || input.createdBy],
  );
}

/** Remove one grant by its primary key. Returns false when the row had already gone. */
export async function removeGrant(id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  await requireSchema(pool, 'default', MIGRATION);
  const { rowCount } = await pool.query(`DELETE FROM travel_analytics_grants WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/* ═══ The reveal log ═════════════════════════════════════════════════════════ */

export interface RevealAudit {
  actorEmail: string;
  bookingCode: string;
  travellerName: string | null;
  fields: string[];
}

/**
 * Record that somebody looked at a traveller's identity documents.
 *
 * Called BEFORE the values are read, and deliberately not wrapped in a try/catch: if this write
 * fails the reveal fails with it. An unlogged look at a passport number is the thing this table
 * exists to prevent, so "the audit is down, show it anyway" is not an option the caller is
 * given.
 */
export async function recordReveal(entry: RevealAudit): Promise<void> {
  await requireSchema(pool, 'default', MIGRATION);
  await pool.query(
    `INSERT INTO travel_pii_reveals (actor_email, booking_code, traveller_name, fields)
     VALUES ($1, $2, $3, $4)`,
    [normalizeEmail(entry.actorEmail), entry.bookingCode, entry.travellerName, entry.fields],
  );
}
