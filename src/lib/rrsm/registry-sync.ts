import type { PoolClient, QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { getRegistryItems, setRegistryItemRate } from '@/lib/service-registry/registry';

/**
 * Keeping RRSM's rental units in step with their Service Registry item.
 *
 * The item (in Catalog Manager's database) holds the agreed rate; each unit keeps a copy in
 * `rrsm_service_lines.rate`, which is what a month copies onto its cycle lines. So:
 *   - before a month opens, every linked unit takes its item's current rate (a rate changed in
 *     the Catalog reaches the next cycle);
 *   - when RRSM changes a rate (a buyer edits the item, or accepts a supplier's proposal and
 *     updates the register), the item gets a new rate version and all its units follow.
 * The registry being unreachable never stops a month from opening: the stored rates are used.
 */

const log = logger('rrsm-registry-sync');

/** Units take their item's current rate. Returns how many units changed. Inside the caller's transaction. */
export async function syncRatesFromRegistry(
  client: PoolClient,
  countryCode: string,
  actorEmail: string,
): Promise<number> {
  const { rows } = await client.query<QueryResultRow>(
    `SELECT DISTINCT registry_code FROM rrsm_service_lines
      WHERE country_code = $1 AND registry_code IS NOT NULL AND active AND off_hire_date IS NULL`,
    [countryCode],
  );
  if (!rows.length) return 0;
  let items;
  try {
    items = await getRegistryItems(rows.map((r) => String(r.registry_code)));
  } catch (err) {
    log.error('syncRates.registryUnreachable', err, { countryCode });
    return 0;
  }
  let changed = 0;
  for (const [code, item] of items) {
    if (item.rate_to_confirm || !(item.unit_price > 0)) continue; // a placeholder price never overwrites
    const { rows: moved } = await client.query<QueryResultRow>(
      `UPDATE rrsm_service_lines SET rate = $2, updated_at = NOW()
        WHERE country_code = $1 AND registry_code = $3 AND rate IS DISTINCT FROM $2::numeric
        RETURNING id, supplier_code`,
      [countryCode, item.unit_price, code],
    );
    for (const m of moved) {
      await client.query(
        `INSERT INTO rrsm_register_log (country_code, service_line_id, supplier_code, actor, action, changes, note)
         VALUES ($1, $2, $3, $4, 'line_updated', $5::jsonb, $6)`,
        [
          countryCode,
          Number(m.id),
          String(m.supplier_code),
          actorEmail,
          JSON.stringify({ rate: [null, item.unit_price] }),
          `Rate from Service Registry item ${code}`,
        ],
      );
    }
    changed += moved.length;
  }
  return changed;
}

/**
 * RRSM changed a unit's rate for good: the item gets a new rate version and its other units
 * follow. Best effort after the caller's own commit; a failure is logged, not thrown.
 */
export async function pushRateToRegistry(input: {
  actor: { name: string; email: string };
  code: string;
  countryCode: string;
  rate: number;
  reason: string;
}): Promise<boolean> {
  try {
    await setRegistryItemRate(input.actor, input.code, {
      unitPrice: input.rate,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: input.reason,
    });
    await rrsmPool.query(
      `UPDATE rrsm_service_lines SET rate = $3, updated_at = NOW()
        WHERE country_code = $1 AND registry_code = $2 AND rate IS DISTINCT FROM $3::numeric`,
      [input.countryCode, input.code, input.rate],
    );
    return true;
  } catch (err) {
    log.error('pushRate.failed', err, { code: input.code });
    return false;
  }
}
