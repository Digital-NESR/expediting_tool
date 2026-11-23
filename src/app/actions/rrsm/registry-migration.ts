'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { currentRrsmActor } from '@/lib/rrsm/access';
import {
  createRegistryItem,
  listRegistryForMatching,
  markRegistryType,
  registryApprovalsEnabled,
  setRegistryApprovals,
} from '@/lib/service-registry/registry';
import {
  planMigration,
  type MigrationPlan,
  type PlannedItem,
} from '@/lib/service-registry/migrate-plan';
import type { CatalogEntryInput } from '@/lib/service-registry/catalog-core';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy.server';

/**
 * Admin → RRSM → Service Registry: move RRSM's rental lines and recurrent services into the shared
 * Service Registry (Catalog Manager's database), and switch registry approvals on or off.
 *
 * Runs in the deployed app because only it can reach both databases. EVERY EXPORT IS A PUBLIC
 * POST ENDPOINT: each re-checks that the caller is an RRSM (or platform) admin.
 */

const log = logger('rrsm-registry-migration');

async function requireAdmin() {
  const actor = await currentRrsmActor();
  if (!actor?.isAdmin) throw new Error('Only an RRSM admin can do this.');
  return { name: actor.email, email: actor.email };
}

function day(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

async function buildPlan(): Promise<{ plan: MigrationPlan; currencyOf: Map<string, string> }> {
  const [rental, recurrent, countries] = await Promise.all([
    rrsmPool.query<QueryResultRow>(
      `SELECT s.id, s.country_code, s.supplier_code, sup.name AS supplier_name, s.description,
              s.category, s.uom, s.rate, s.service_number, s.starts_on::text AS starts_on, s.registry_code
         FROM rrsm_service_lines s JOIN rrsm_suppliers sup ON sup.code = s.supplier_code`,
    ),
    rrsmPool.query<QueryResultRow>(
      `SELECT id, country_code, supplier_code, supplier_name, service_name, description, department,
              annual_value, currency, contract_expiry::text AS contract_expiry, registry_code
         FROM rrsm_recurrent_services`,
    ),
    rrsmPool.query<QueryResultRow>(`SELECT code, currency FROM rrsm_countries`),
  ]);
  const used = [...new Set([...rental.rows, ...recurrent.rows].map((r) => String(r.country_code)))];
  const existing = await listRegistryForMatching(used);
  const plan = planMigration({
    rental: rental.rows.map((r) => ({
      id: Number(r.id),
      countryCode: String(r.country_code),
      supplierCode: String(r.supplier_code ?? ''),
      supplierName: String(r.supplier_name ?? ''),
      description: String(r.description ?? ''),
      category: r.category ? String(r.category) : null,
      uom: String(r.uom ?? 'month'),
      rate: r.rate === null ? null : Number(r.rate),
      serviceNumber: r.service_number ? String(r.service_number) : null,
      startsOn: day(r.starts_on),
      registryCode: r.registry_code ? String(r.registry_code) : null,
    })),
    recurrent: recurrent.rows.map((r) => ({
      id: Number(r.id),
      countryCode: String(r.country_code),
      supplierCode: r.supplier_code ? String(r.supplier_code) : null,
      supplierName: r.supplier_name ? String(r.supplier_name) : null,
      serviceName: r.service_name ? String(r.service_name) : null,
      description: String(r.description ?? ''),
      department: r.department ? String(r.department) : null,
      annualValue: r.annual_value === null ? null : Number(r.annual_value),
      currency: r.currency ? String(r.currency) : null,
      contractExpiry: day(r.contract_expiry),
      registryCode: r.registry_code ? String(r.registry_code) : null,
    })),
    existing,
    today: new Date().toISOString().slice(0, 10),
  });
  return {
    plan,
    currencyOf: new Map(countries.rows.map((c) => [String(c.code), String(c.currency)])),
  };
}

export interface MigrationSummary {
  ok: boolean;
  error?: string;
  approvalsEnabled: boolean;
  countries: {
    code: string;
    rentalLines: number;
    rentalItems: number;
    recurrentItems: number;
    merged: number;
    created: number;
    rateToConfirm: number;
  }[];
  items: (Pick<
    PlannedItem,
    | 'type'
    | 'countryCode'
    | 'supplierName'
    | 'itemName'
    | 'uomName'
    | 'unitPrice'
    | 'rateToConfirm'
    | 'existingCode'
    | 'category'
  > & { units: number })[];
  skipped: MigrationPlan['skipped'];
  done?: { linked: number; created: number; failed: string[] };
}

function summarise(plan: MigrationPlan): Omit<MigrationSummary, 'ok' | 'approvalsEnabled'> {
  const by = new Map<string, MigrationSummary['countries'][number]>();
  for (const i of plan.items) {
    const c =
      by.get(i.countryCode) ??
      by
        .set(i.countryCode, {
          code: i.countryCode,
          rentalLines: 0,
          rentalItems: 0,
          recurrentItems: 0,
          merged: 0,
          created: 0,
          rateToConfirm: 0,
        })
        .get(i.countryCode)!;
    if (i.type === 'rental') {
      c.rentalItems++;
      c.rentalLines += i.rentalLineIds.length;
    } else c.recurrentItems++;
    if (i.existingCode) c.merged++;
    else c.created++;
    if (i.rateToConfirm) c.rateToConfirm++;
  }
  return {
    countries: [...by.values()].sort((a, b) => a.code.localeCompare(b.code)),
    items: plan.items.map((i) => ({
      type: i.type,
      countryCode: i.countryCode,
      supplierName: i.supplierName,
      itemName: i.itemName,
      uomName: i.uomName,
      unitPrice: i.unitPrice,
      rateToConfirm: i.rateToConfirm,
      existingCode: i.existingCode,
      category: i.category,
      units: i.rentalLineIds.length,
    })),
    skipped: plan.skipped,
  };
}

/** Dry run: what would move, merge and be created. Writes nothing. */
export async function previewRegistryMigration(): Promise<MigrationSummary> {
  try {
    await requireAdmin();
    const { plan } = await buildPlan();
    return { ok: true, approvalsEnabled: await registryApprovalsEnabled(), ...summarise(plan) };
  } catch (err) {
    log.error('preview.failed', err);
    return {
      ok: false,
      error: (err as Error).message,
      approvalsEnabled: true,
      countries: [],
      items: [],
      skipped: [],
    };
  }
}

/**
 * Do it. Item by item: merge into the matched registry entry or create a new one, then link the
 * RRSM rows to it and log that on RRSM's side. A failure on one item is reported and the rest go
 * on; running again picks up only what is still unlinked.
 */
export async function runRegistryMigration(): Promise<MigrationSummary> {
  let actor: { name: string; email: string };
  try {
    actor = await requireAdmin();
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      approvalsEnabled: true,
      countries: [],
      items: [],
      skipped: [],
    };
  }
  const { plan, currencyOf } = await buildPlan();
  const done = { linked: 0, created: 0, failed: [] as string[] };
  for (const i of plan.items) {
    try {
      let code = i.existingCode;
      if (code) {
        await markRegistryType(code, i.type);
      } else {
        const cat = SPEND_TAXONOMY.find((c) => c.name === i.category.category);
        const input: CatalogEntryInput = {
          supplier_name: i.supplierName,
          supplier_code: i.supplierCode,
          manager: null,
          country_code: i.countryCode,
          category_name: i.category.category,
          subcategory_name: i.category.subcategory,
          spend_type: (cat?.type as CatalogEntryInput['spend_type']) ?? null,
          family: null,
          commodity: null,
          unspsc_code: null,
          item_name: i.itemName,
          description: null,
          uom_name: i.uomName,
          unit_price: i.unitPrice,
          currency_code: i.currency || currencyOf.get(i.countryCode) || 'USD',
          effective_date: i.effectiveDate,
          expiry_date: i.expiryDate,
          notes: i.rateToConfirm
            ? 'Brought over from RRSM without a rate: confirm it.'
            : 'Brought over from RRSM.',
          sirion_contract_id: null,
          sirion_url: null,
          incoterms: null,
          incoterms_location: null,
          lead_time_days: null,
          sap_service_number: i.serviceNumber,
        };
        const made = await createRegistryItem(actor, input, {
          type: i.type,
          rateToConfirm: i.rateToConfirm,
        });
        code = made.code;
        done.created++;
      }
      if (i.rentalLineIds.length) {
        const { rows } = await rrsmPool.query<QueryResultRow>(
          `UPDATE rrsm_service_lines SET registry_code = $2, updated_at = NOW()
            WHERE id = ANY($1) AND registry_code IS NULL RETURNING id, supplier_code`,
          [i.rentalLineIds, code],
        );
        for (const r of rows)
          await rrsmPool.query(
            `INSERT INTO rrsm_register_log (country_code, service_line_id, supplier_code, actor, action, changes, note)
             VALUES ($1, $2, $3, $4, 'line_updated', $5::jsonb, $6)`,
            [
              i.countryCode,
              Number(r.id),
              String(r.supplier_code),
              actor.email,
              JSON.stringify({ registryCode: [null, code] }),
              i.existingCode
                ? `Linked to existing registry item ${code}`
                : `New registry item ${code}`,
            ],
          );
        done.linked += rows.length;
      }
      if (i.recurrentId) {
        const { rowCount } = await rrsmPool.query(
          `UPDATE rrsm_recurrent_services SET registry_code = $2, updated_at = NOW()
            WHERE id = $1 AND registry_code IS NULL`,
          [i.recurrentId, code],
        );
        if (rowCount) {
          await rrsmPool.query(
            `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, changes, note)
             VALUES ($1, $2, $3, 'service_updated', $4::jsonb, $5)`,
            [
              i.recurrentId,
              i.countryCode,
              actor.email,
              JSON.stringify({ registryCode: [null, code] }),
              i.existingCode
                ? `Linked to existing registry item ${code}`
                : `New registry item ${code}`,
            ],
          );
          done.linked++;
        }
      }
    } catch (err) {
      log.error('run.itemFailed', err, { item: i.key });
      done.failed.push(
        `${i.countryCode} · ${i.supplierName} · ${i.itemName}: ${(err as Error).message}`,
      );
    }
  }
  log.info('run.done', { ...done, failed: done.failed.length, by: actor.email });
  return { ok: true, approvalsEnabled: await registryApprovalsEnabled(), ...summarise(plan), done };
}

export async function setServiceRegistryApprovals(
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireAdmin();
    await setRegistryApprovals(actor, enabled === true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
