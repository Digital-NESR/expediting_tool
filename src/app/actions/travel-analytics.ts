'use server';

/**
 * The Travel Portal dashboard's endpoints, and the grants editor behind it.
 *
 * EVERY EXPORT OF A `'use server'` MODULE IS A PUBLIC POST ENDPOINT. Any signed-in employee can
 * invoke one of these directly, so the first statement of every function below resolves the
 * actor from the session and applies a guard. Nothing here takes an email, a role, a country or
 * a scope from its caller: a reveal that trusted a scope in its arguments would be a passport
 * number available to anyone who could read the page's own network traffic.
 *
 * Two different gates, deliberately:
 *   - the DASHBOARD reads are gated on a travel grant (`travelScopeFor`), which also decides
 *     which countries and which bands the caller gets;
 *   - the GRANTS EDITOR is gated on ADMIN_EMAILS (`requireAdmin`), because handing out access
 *     to a tool is a platform-admin act and not something a tool's own admin role should be
 *     able to extend to their friends.
 */

import { revalidatePath } from 'next/cache';
import type { TravelFilters } from '@/lib/travel-analytics/filters';
import { logger } from '@/lib/logger';
import { AccessError, forbidden, requireAdmin, requireUser } from '@/lib/require-access';
import {
  addGrant,
  isTravelRole,
  listGrants,
  recordReveal,
  removeGrant,
  travelScopeFor,
  type TravelGrantRow,
} from '@/lib/travel-analytics/grants';
import {
  loadTravelAnalytics,
  readIdentityDocuments,
  REVEALABLE_FIELDS,
  scopedBookingCodes,
  travelCountryOptions,
  type IdentityDocuments,
  type TravelAnalyticsData,
} from '@/lib/travel-analytics/queries';
import { canRevealIdentityDocuments } from '@/lib/travel-analytics/scope';

const log = logger('travel-analytics');

export type TravelActionResult = { success: boolean; error?: string };

/* ═══ The dashboard ══════════════════════════════════════════════════════════ */

/**
 * Everything the signed-in reader may see, or null when they hold no grant.
 *
 * Null rather than a thrown error: this is rendered by a server component on a page whose first
 * tab is a Power BI board that has nothing to do with travel, and a platform admin who has not
 * granted themselves travel access should get a card explaining that — not a digest error
 * across the whole page.
 */
export async function getTravelAnalytics(
  /* Filters arrive from the browser and are checked against this reader's own options inside
     `loadTravelAnalytics`. They narrow what the scope already allows and can never widen it:
     a filter naming a country the reader does not hold simply matches nothing. */
  filters?: TravelFilters | null,
): Promise<TravelAnalyticsData | null> {
  const actor = await requireUser();
  const scope = await travelScopeFor(actor.email);
  if (!scope) return null;

  try {
    return await loadTravelAnalytics(scope, filters ?? null);
  } catch (err) {
    log.error('getTravelAnalytics.failed', err);
    throw err;
  }
}

export type RevealResult =
  { success: true; documents: IdentityDocuments } | { success: false; error: string };

/**
 * Reveal one traveller's passport number, date of birth and mobile.
 *
 * THE ORDER OF THE THREE STEPS IS THE POINT, and it is the order the user asked for:
 *   1. confirm the caller is a travel admin — nobody else may ask at all;
 *   2. write the audit row;
 *   3. only then read the values.
 *
 * The audit row goes in BEFORE the read so it exists even if the reader closes the tab the
 * instant they click, and `recordReveal` is deliberately not wrapped in a try/catch: if the log
 * cannot be written, the reveal does not happen. An unlogged look at a passport number is the
 * one outcome this whole path exists to prevent.
 *
 * The record id alone is not an authorisation. `rowId` is a small integer, so the read is
 * restricted to the booking codes this actor's own scope resolves to, recomputed here rather
 * than taken from the page.
 */
export async function revealTravellerIdentity(recordId: number): Promise<RevealResult> {
  try {
    const actor = await requireUser();
    const scope = await travelScopeFor(actor.email);
    if (!scope || !canRevealIdentityDocuments(scope.role)) {
      throw new AccessError('Travel Portal admins only.');
    }

    if (!Number.isInteger(recordId) || recordId <= 0) {
      return { success: false, error: 'Unknown traveller record.' };
    }

    const codes = await scopedBookingCodes(scope);
    /* Resolve the record first, so the audit row names the booking and the traveller rather
       than only a row id — but read it through the same scoped query the values come from, so
       a record outside the actor's scope is never named in the log either. */
    const documents = await readIdentityDocuments(recordId, codes);
    if (!documents) return { success: false, error: 'Unknown traveller record.' };

    await recordReveal({
      actorEmail: actor.email,
      bookingCode: documents.bookingCode,
      travellerName: documents.travellerName,
      fields: [...REVEALABLE_FIELDS],
    });

    return { success: true, documents };
  } catch (err) {
    if (err instanceof AccessError) return { success: false, error: err.message };
    log.error('revealTravellerIdentity.failed', err);
    return { success: false, error: 'Could not reveal this record.' };
  }
}

/* ═══ The grants editor ══════════════════════════════════════════════════════ */

export interface TravelGrantsAdminData {
  grants: TravelGrantRow[];
  /** Every country the cost-centre mapping knows, whether or not anybody there has flown yet. */
  countries: string[];
}

/** Platform admins only — the whole grants table plus the country picker's options. */
export async function getTravelGrantsAdminData(): Promise<TravelGrantsAdminData> {
  await requireAdmin();
  const [grants, countries] = await Promise.all([listGrants(), travelCountryOptions()]);
  return { grants, countries };
}

export interface AddTravelGrantInput {
  email: string;
  role: string;
  /** Empty or absent means every country. */
  country?: string | null;
}

/**
 * Grant somebody access.
 *
 * The role is validated against the three the model knows rather than passed through to the
 * CHECK constraint: a caller posting `role: 'superadmin'` should be told no by name, not get a
 * constraint violation back as a digest error.
 */
export async function addTravelGrant(input: AddTravelGrantInput): Promise<TravelActionResult> {
  try {
    const actor = await requireAdmin();

    const email = String(input?.email ?? '').trim();
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Enter a valid email address.' };
    }
    if (!isTravelRole(input?.role)) {
      return { success: false, error: 'Choose a role: admin, management or finance.' };
    }

    const country = String(input?.country ?? '').trim() || null;
    if (input.role !== 'admin' && country) {
      /* Checked against the mapping, not accepted as free text. A grant on "Kuwiat" matches no
         booking and looks exactly like a grant that is working but has no travel yet. */
      const countries = await travelCountryOptions();
      if (countries.length && !countries.includes(country)) {
        return { success: false, error: `${country} is not a country in the cost-centre mapping.` };
      }
    }

    await addGrant({ email, role: input.role, country, createdBy: actor.email });
    revalidatePath('/admin/supply-chain-analytics');
    revalidatePath('/supply-chain-analytics');
    return { success: true };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('addTravelGrant.failed', err);
    return { success: false, error: 'Could not add the grant.' };
  }
}

/** Remove one grant. Removing the last admin row is allowed — see the editor's warning. */
export async function removeTravelGrant(id: number): Promise<TravelActionResult> {
  try {
    await requireAdmin();
    const removed = await removeGrant(Number(id));
    if (!removed) return { success: false, error: 'That grant had already been removed.' };
    revalidatePath('/admin/supply-chain-analytics');
    revalidatePath('/supply-chain-analytics');
    return { success: true };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('removeTravelGrant.failed', err);
    return { success: false, error: 'Could not remove the grant.' };
  }
}
