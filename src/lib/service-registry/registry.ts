import catalogManagerPool from '@/lib/db-catalog-manager';
import { withTransaction } from '@/lib/db/tx';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';
import type { ApprovalThresholdRule, CatalogEntry, SpendType } from '@/types/catalog-manager';
import {
  ENTRY_SELECT,
  approvalsEnabled,
  dbOn,
  insertCatalogEntry,
  loadCurrencyRates,
  mapEntry,
  poolDb,
  updateCatalogEntryCore,
  type CatalogEntryInput,
  type RegistryActor,
} from './catalog-core';

/**
 * The Service Registry as RRSM uses it: one item per country + supplier + service + rate, living
 * in Catalog Manager's database. RRSM's rental units and recurrent services hang off an item by
 * its CAT-nnnn code.
 *
 * NO ACCESS CHECKS HERE. Every caller is an RRSM server action that has already checked the RRSM
 * grant for the item's country (each tool edits with its own access, decision 23 Nov 2026).
 */

export type RegistryType = 'rental' | 'recurrent';

/** The items RRSM can put units under, or link a recurrent service to, in one country. */
export async function listRegistryItems(
  countryCode: string,
  type: RegistryType,
): Promise<CatalogEntry[]> {
  const rates = await loadCurrencyRates();
  /* Rentals also see Catalog-only items (registry_type NULL), so a unit can go under an item
     somebody created in the Catalog. Recurrent services are their own items. */
  const rows = await poolDb.sql<Record<string, unknown>[]>(
    `${ENTRY_SELECT}
      WHERE e.country_code = ? AND e.status <> 'Inactive'
        AND (e.registry_type = ? OR (? = 'rental' AND e.registry_type IS NULL))
      ORDER BY s.name, e.item_name`,
    [countryCode, type, type],
  );
  return rows.map((r) => mapEntry(r, rates));
}

export async function getRegistryItems(codes: string[]): Promise<Map<string, CatalogEntry>> {
  const list = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  const out = new Map<string, CatalogEntry>();
  if (!list.length) return out;
  const rates = await loadCurrencyRates();
  const rows = await poolDb.sql<Record<string, unknown>[]>(
    `${ENTRY_SELECT} WHERE e.code = ANY(?)`,
    [list],
  );
  for (const r of rows) {
    const e = mapEntry(r, rates);
    out.set(e.code, e);
  }
  return out;
}

/** An existing item as the input an edit starts from. */
export function entryToInput(e: CatalogEntry): CatalogEntryInput {
  return {
    id: e.id,
    supplier_name: e.supplier_name,
    supplier_code: e.supplier_code,
    manager: e.manager,
    country_code: e.country_code,
    category_name: e.category_name ?? '',
    subcategory_name: e.subcategory_name,
    spend_type: (e.spend_type as SpendType | null) ?? null,
    family: e.family,
    commodity: e.commodity,
    unspsc_code: e.unspsc_code,
    item_name: e.item_name,
    description: e.description,
    uom_name: e.uom_name ?? '',
    unit_price: e.unit_price,
    currency_code: e.currency_code,
    effective_date: e.effective_date,
    expiry_date: e.expiry_date,
    notes: e.notes,
    sirion_contract_id: e.sirion_contract_id,
    sirion_url: e.sirion_url,
    incoterms: e.incoterms,
    incoterms_location: e.incoterms_location,
    lead_time_days: e.lead_time_days,
    sap_service_number: e.sap_service_number ?? null,
  };
}

/** A new item created from RRSM. Active at once while approvals are paused. */
export async function createRegistryItem(
  actor: RegistryActor,
  input: CatalogEntryInput,
  opts: { type: RegistryType; rateToConfirm?: boolean },
): Promise<{ id: number; code: string; status: string }> {
  return withTransaction(catalogManagerPool, async (client) => {
    const db = dbOn(client);
    const made = await insertCatalogEntry(db, actor, input, 'submit');
    await db.exec(
      `UPDATE catalog_entry SET registry_type = ?, source = 'rrsm', rate_to_confirm = ? WHERE id = ?`,
      [opts.type, opts.rateToConfirm === true, made.id],
    );
    return made;
  });
}

/**
 * A change to an item from RRSM: a new version with the new rate (the history is kept), exactly
 * as an edit in the Catalog. A real price clears "rate to confirm".
 */
export async function updateRegistryItem(
  actor: RegistryActor,
  code: string,
  input: CatalogEntryInput,
  reason: string,
): Promise<{ id: number; status: string }> {
  return withTransaction(catalogManagerPool, async (client) => {
    const db = dbOn(client);
    const found = await db.sql<{ id: number }[]>(`SELECT id FROM catalog_entry WHERE code = ?`, [
      code,
    ]);
    if (!found[0]) throw new Error(`Registry item ${code} not found.`);
    const id = Number(found[0].id);
    const res = await updateCatalogEntryCore(db, actor, id, { ...input, id }, 'submit', reason);
    if (input.unit_price > 0)
      await db.exec(`UPDATE catalog_entry SET rate_to_confirm = FALSE WHERE id = ?`, [id]);
    return res;
  });
}

/** Just the rate, from a given date: an accepted supplier proposal, or a renewal's new value. */
export async function setRegistryItemRate(
  actor: RegistryActor,
  code: string,
  change: { unitPrice: number; currency?: string; effectiveDate: string; reason: string },
): Promise<{ id: number; status: string }> {
  const items = await getRegistryItems([code]);
  const e = items.get(code);
  if (!e) throw new Error(`Registry item ${code} not found.`);
  return updateRegistryItem(
    actor,
    code,
    {
      ...entryToInput(e),
      unit_price: change.unitPrice,
      currency_code: change.currency || e.currency_code,
      effective_date: change.effectiveDate,
    },
    change.reason,
  );
}

/** What the shared item form needs, read straight from the registry's own tables. */
export interface RegistryFormRefs {
  taxonomy: TaxCategory[];
  countries: { code: string; name: string; flag: string | null }[];
  currencies: { code: string; usd_rate: number }[];
  uoms: { name: string }[];
  managers: string[];
  thresholds: ApprovalThresholdRule[];
  approvalsEnabled: boolean;
}

export async function loadRegistryFormRefs(taxonomy: TaxCategory[]): Promise<RegistryFormRefs> {
  const [countries, currencies, uoms, managers, thresholds, approvals] = await Promise.all([
    poolDb.sql<{ code: string; name: string; flag: string | null }[]>(
      `SELECT code, name, flag FROM country WHERE status = 'Active' ORDER BY name`,
    ),
    poolDb.sql<{ code: string; usd_rate: string | number }[]>(
      `SELECT code, usd_rate FROM currency ORDER BY code`,
    ),
    poolDb.sql<{ name: string }[]>(
      `SELECT name FROM unit_of_measure WHERE status = 'Active' ORDER BY name`,
    ),
    poolDb.sql<{ m: string }[]>(
      `SELECT DISTINCT accountable_manager AS m FROM supplier
        WHERE accountable_manager IS NOT NULL ORDER BY 1`,
    ),
    poolDb.sql<Record<string, unknown>[]>(
      `SELECT t.id, t.country_code, c.name AS country_name, t.spend_category_id,
              sc.name AS spend_category_name, t.threshold_usd
         FROM approval_threshold t
         LEFT JOIN country c ON c.code = t.country_code
         LEFT JOIN spend_category sc ON sc.id = t.spend_category_id`,
    ),
    approvalsEnabled(),
  ]);
  return {
    taxonomy,
    countries: countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag ?? null })),
    currencies: currencies.map((c) => ({ code: c.code, usd_rate: Number(c.usd_rate) })),
    uoms: uoms.map((u) => ({ name: u.name })),
    managers: managers.map((m) => m.m),
    thresholds: thresholds.map((t) => ({
      id: Number(t.id),
      country_code: (t.country_code as string) ?? null,
      country_name: (t.country_name as string) ?? null,
      spend_category_id: t.spend_category_id != null ? Number(t.spend_category_id) : null,
      spend_category_name: (t.spend_category_name as string) ?? null,
      threshold_usd: Number(t.threshold_usd),
    })),
    approvalsEnabled: approvals,
  };
}

/** Approvals on or off, written straight to the registry (the caller checks it is an admin). */
export async function setRegistryApprovals(actor: RegistryActor, enabled: boolean): Promise<void> {
  await poolDb.exec(
    `INSERT INTO catalog_setting (key, value, updated_by, updated_at)
     VALUES ('approvals_enabled', ?::jsonb, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                                     updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(enabled === true), actor.email],
  );
  await poolDb.exec(
    `INSERT INTO audit_log (action, target, user_name, user_email, detail) VALUES (?, ?, ?, ?, ?)`,
    [
      'Master data',
      'Approvals',
      actor.name,
      actor.email,
      enabled
        ? 'Switched approvals on'
        : 'Paused approvals: new entries activate without an approver',
    ],
  );
}

export { approvalsEnabled as registryApprovalsEnabled };

/** Registry entries in the given countries, for matching RRSM rows against (migration). */
export async function listRegistryForMatching(
  countries: string[],
): Promise<
  {
    code: string;
    countryCode: string;
    supplierCode: string;
    itemName: string;
    registryType: string | null;
  }[]
> {
  if (!countries.length) return [];
  const rows = await poolDb.sql<Record<string, unknown>[]>(
    `SELECT e.code, e.country_code, s.vendor_code, e.item_name, e.registry_type
       FROM catalog_entry e JOIN supplier s ON s.id = e.supplier_id
      WHERE e.country_code = ANY(?) AND e.status <> 'Inactive'`,
    [countries],
  );
  return rows.map((r) => ({
    code: String(r.code),
    countryCode: String(r.country_code),
    supplierCode: String(r.vendor_code),
    itemName: String(r.item_name),
    registryType: (r.registry_type as string) ?? null,
  }));
}

/** A merged Catalog entry starts showing in RRSM: give it its registry type if it had none. */
export async function markRegistryType(code: string, type: RegistryType): Promise<void> {
  await poolDb.exec(
    `UPDATE catalog_entry SET registry_type = ? WHERE code = ? AND registry_type IS NULL`,
    [type, code],
  );
}
