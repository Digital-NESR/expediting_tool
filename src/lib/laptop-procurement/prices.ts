import { fixedUnitPriceUsd } from '@/lib/laptop-procurement/freshservice';
import { sql } from '@/lib/laptop-procurement/db';
import type { QueryResultRow } from 'pg';

/**
 * What a device costs in a country, in USD — the figure the SAP WIP carries.
 *
 * Reads laptop_device_prices, which an admin maintains on the Devices tab. It
 * replaced a constant in the code, so the one thing worth remembering is that
 * "no price" is now an ordinary state rather than a bug: a model nobody has
 * priced yet, or country 'Other', simply has no row, and the WIP refuses with
 * `missing: total value (USD)` rather than inventing a figure.
 */
export async function resolveUnitPriceUsd(
  model: string | null | undefined,
  country: string | null | undefined,
): Promise<number | null> {
  const m = (model ?? '').trim();
  const c = (country ?? '').trim();
  if (!m || !c) return null;

  // Policy first: a rule price is not in the table and must not be overridable
  // by one somebody keys in by hand.
  const fixed = fixedUnitPriceUsd(m);
  if (fixed != null) return fixed;

  const rows = await sql<QueryResultRow[]>(
    `SELECT unit_price_usd FROM laptop_device_prices
      WHERE LOWER(TRIM(model)) = LOWER(TRIM(?))
        AND LOWER(TRIM(country)) = LOWER(TRIM(?))
      LIMIT 1`,
    [m, c],
  );
  return toUnitPrice(rows[0]?.unit_price_usd);
}

/**
 * NUMERIC arrives from the driver as a string, not a number — the same trap as
 * the BIGINT on freshservice_request_id, and no pg type parser is registered
 * here either. Coerced rather than trusted, because the value flows straight
 * into the WIP payload: a string would serialise as `"450.00"` and reach
 * Freshservice quoted.
 *
 * Anything not a usable positive number comes back null, which the caller
 * reports as unpriced. Zero is rejected on the way in by the table's CHECK and
 * again here, since a WIP reading $0 claims the device was free.
 */
export function toUnitPrice(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}
