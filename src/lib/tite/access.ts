/* ─── Country scoping: which shipments a person may see, and which they may change.

   These are predicates, not endpoints, and that distinction is the point of moving them. In
   the old module every one of them sat beside the actions as an exported symbol away from
   being POSTable. ─── */

import titePool from '@/lib/db-tite';
import { canEditTiteCountry, canViewTiteCountry, titeReadScope } from '@/lib/tite-auth';
import type { TiteUser } from '@/lib/tite-auth';

/* ─── Special role sentinel ──────────────────────────────────── */

export const VIEW_ALL_COUNTRIES = 'All Countries - View Only';

/* ─── Shipment-level scope guards ─────────────────────────────── */

/**
 * Intersect a caller-supplied country filter with the scope the SESSION allows.
 * The parameter may only narrow the result — never widen it — so a hand-crafted
 * POST cannot read a country the user was not approved for.
 */
export function effectiveCountryScope(user: TiteUser, requested?: string[]): string[] | null {
  const allowed = titeReadScope(user); // null → every country
  const narrow = requested?.includes(VIEW_ALL_COUNTRIES) ? undefined : requested;
  if (allowed === null) return narrow != null && narrow.length > 0 ? narrow : null;
  if (narrow == null || narrow.length === 0) return allowed;
  const lower = new Set(allowed.map((c) => c.trim().toLowerCase()));
  return narrow.filter((c) => lower.has(c.trim().toLowerCase()));
}

/** The country a shipment belongs to, or undefined when the row does not exist. */
export async function shipmentCountry(shipmentId: number): Promise<string | null | undefined> {
  const { rows } = await titePool.query<{ country: string | null }>(
    `SELECT country FROM shipments WHERE id = $1`,
    [shipmentId],
  );
  return rows.length ? rows[0].country : undefined;
}

/** Null when the user may mutate this shipment, otherwise the failure message. */
export async function denyShipmentEdit(user: TiteUser, shipmentId: number): Promise<string | null> {
  const country = await shipmentCountry(shipmentId);
  if (country === undefined) return 'Shipment not found.';
  if (!canEditTiteCountry(user, country)) return 'You cannot edit shipments for this country.';
  return null;
}

/** True when the user may read this shipment and anything hanging off it. */
export async function canReadShipment(user: TiteUser, shipmentId: number): Promise<boolean> {
  const country = await shipmentCountry(shipmentId);
  if (country === undefined) return false;
  return canViewTiteCountry(user, country);
}
