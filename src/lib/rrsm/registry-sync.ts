import type { PoolClient, QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import {
  createRegistryItem,
  entryToInput,
  getRegistryItems,
  setRegistryItemRate,
  updateRegistryItem,
} from '@/lib/service-registry/registry';
import { recurrentCategory } from '@/lib/service-registry/migrate-plan';

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

/**
 * A recurrent service and its registry item, kept together: the item is created the first time
 * the service has a vendor code, and afterwards follows the service's name, supplier, annual value
 * and expiry. Only a real difference writes a new item version. Best effort after the caller's
 * commit; returns the item code, or null when there is none (no vendor code, or an error, logged).
 */
export async function syncRecurrentToRegistry(
  serviceId: number,
  actor: { name: string; email: string },
): Promise<string | null> {
  try {
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT s.id, s.country_code, s.service_name, s.description, s.department, s.supplier_code,
              s.supplier_name, s.annual_value, s.currency, s.contract_expiry::text AS expiry,
              s.registry_code, c.currency AS country_currency
         FROM rrsm_recurrent_services s JOIN rrsm_countries c ON c.code = s.country_code
        WHERE s.id = $1`,
      [serviceId],
    );
    const s = rows[0];
    if (!s) return null;
    const vendor = String(s.supplier_code ?? '').replace(/^0+(?=\d)/, '');
    if (!vendor) return s.registry_code ? String(s.registry_code) : null;

    const name = String(s.service_name || s.description).trim();
    const value = s.annual_value === null ? 0 : Number(s.annual_value);
    const currency = String(s.currency || s.country_currency || 'USD');
    const expiry = s.expiry ? String(s.expiry) : null;
    const effective = expiry
      ? (() => {
          const d = new Date(expiry + 'T00:00:00Z');
          d.setUTCFullYear(d.getUTCFullYear() - 1);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })()
      : new Date().toISOString().slice(0, 10);

    if (s.registry_code) {
      const code = String(s.registry_code);
      const item = (await getRegistryItems([code])).get(code);
      if (!item) return code;
      const same =
        item.item_name === name &&
        item.supplier_code.replace(/^0+(?=\d)/, '') === vendor &&
        Number(item.unit_price) === value &&
        item.currency_code === currency &&
        (item.expiry_date ?? null) === expiry;
      if (same) return code;
      await updateRegistryItem(
        actor,
        code,
        {
          ...entryToInput(item),
          item_name: name,
          supplier_code: vendor,
          supplier_name: String(s.supplier_name || item.supplier_name),
          unit_price: value,
          currency_code: currency,
          effective_date: Number(item.unit_price) === value ? item.effective_date : effective,
          expiry_date: expiry,
        },
        'Recurrent service changed in RRSM',
      );
      return code;
    }

    const cat = recurrentCategory({
      serviceName: s.service_name ? String(s.service_name) : null,
      description: String(s.description ?? ''),
      department: s.department ? String(s.department) : null,
    });
    const made = await createRegistryItem(
      actor,
      {
        supplier_name: String(s.supplier_name || vendor),
        supplier_code: vendor,
        manager: null,
        country_code: String(s.country_code),
        category_name: cat.category,
        subcategory_name: cat.subcategory,
        spend_type: null,
        family: null,
        commodity: null,
        unspsc_code: null,
        item_name: name,
        description: s.description && s.description !== name ? String(s.description) : null,
        uom_name: 'Year',
        unit_price: value,
        currency_code: currency,
        effective_date: effective,
        expiry_date: expiry,
        notes: value > 0 ? null : 'No annual value yet: confirm the rate.',
        sirion_contract_id: null,
        sirion_url: null,
        incoterms: null,
        incoterms_location: null,
        lead_time_days: null,
        sap_service_number: null,
      },
      { type: 'recurrent', rateToConfirm: !(value > 0) },
    );
    await rrsmPool.query(
      `UPDATE rrsm_recurrent_services SET registry_code = $2 WHERE id = $1 AND registry_code IS NULL`,
      [serviceId, made.code],
    );
    return made.code;
  } catch (err) {
    log.error('syncRecurrent.failed', err, { serviceId });
    return null;
  }
}
