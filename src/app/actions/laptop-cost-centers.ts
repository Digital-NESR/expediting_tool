'use server';

/**
 * Admin CRUD for the laptop-procurement Cost Center Mapping.
 *
 * Backs /admin/laptop?section=cost-centers. Until this existed the mapping was two generated
 * JSON files built from a spreadsheet nobody had committed, so correcting one wrong cost
 * center meant tracking down the workbook, re-running a script and shipping a deploy.
 *
 * EVERY export in a 'use server' module is a public POST endpoint, so every one of them
 * starts with requireAdmin(). Reads go through the same gate: the mapping is not secret, but
 * there is no reason for a non-admin to pull all 2,300 rows in one response.
 *
 * Writes clear this instance's cached snapshot and revalidate the request form's routes. See
 * the caching note in '@/lib/laptopCostCenters.server' for what that does and does not reach.
 */

import { revalidatePath } from 'next/cache';
import laptopProcurementPool from '@/lib/db-laptop';
import { logger } from '@/lib/logger';
import { AccessError, forbidden, requireAdmin } from '@/lib/require-access';
import { COUNTRY_OPTIONS } from '@/lib/laptopProcurement-utils';
import { normaliseCostCenterText } from '@/lib/laptopCostCenters';
import { ensureLaptopSchema } from '@/lib/laptop-procurement/schema';
import {
  getCostCenterAdminSnapshot,
  invalidateCostCenterCache,
  type CostCenterCompanyRow,
  type CostCenterCountryMap,
  type CostCenterDepartmentRow,
} from '@/lib/laptopCostCenters.server';

const log = logger('laptop-cost-centers-admin');

export type CostCenterActionResult = { success: boolean; error?: string };

export interface LaptopCostCenterAdminData {
  companies: CostCenterCompanyRow[];
  departments: CostCenterDepartmentRow[];
  countryMap: CostCenterCountryMap;
  /** The request form's own country list — the left-hand side of the country map. */
  requestorCountries: string[];
  /** Every workbook country label in use, for the company form's picker. */
  countries: string[];
  /**
   * Country labels no COUNTRY_OPTIONS value reaches. Companies filed under one of these are
   * invisible in the request form, whatever their active flag says — worth showing, because
   * nothing else in the app would ever tell you.
   */
  unreachableCountries: string[];
  /** True when the tables are empty, i.e. the seed script has not been run here yet. */
  empty: boolean;
}

/* ═══ Shared plumbing ════════════════════════════════════════════════════════ */

/**
 * Trim AND fold the spreadsheet's non-breaking spaces to plain ones. Every value written here
 * goes through it, so an admin who types "SUPPLY CHAIN" cannot create a second row alongside
 * the imported "SUPPLY\u00A0CHAIN" — the unique index is on LOWER(department), and those two
 * are different strings to Postgres while being identical on screen.
 */
const clean = (value: string | null | undefined) => normaliseCostCenterText(value);

const COMPANY_CODE_RE = /^\d{4}$/;
const COST_CENTER_RE = /^C\d{9}$/;

/**
 * The same two shape rules the seed script enforces. They are what stops a stray cell of test
 * typing in the source spreadsheet from becoming a company in the request form — which is not
 * hypothetical: the September 2026 export carried two such rows.
 */
function checkCompanyCode(code: string): string | null {
  return COMPANY_CODE_RE.test(code) ? null : 'Company code must be exactly four digits.';
}
function checkCostCenter(costCenter: string): string | null {
  return COST_CENTER_RE.test(costCenter)
    ? null
    : 'Cost center must be the letter C followed by nine digits, e.g. C011100101.';
}

/**
 * Run one admin write: gate, execute, clear the cache, revalidate, and turn the two failures
 * a user can actually cause into a readable message instead of a stack trace.
 */
async function mutate(
  action: string,
  fields: Record<string, unknown>,
  run: (actorEmail: string) => Promise<void>,
): Promise<CostCenterActionResult> {
  let actorEmail: string;
  try {
    actorEmail = (await requireAdmin()).email;
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    throw err;
  }

  try {
    await ensureLaptopSchema();
    await run(actorEmail);
  } catch (err) {
    const code =
      typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    log.error('cost center write failed', { action, ...fields, actor: actorEmail, err });
    if (code === '23505') {
      return { success: false, error: 'That already exists. Edit the existing row instead.' };
    }
    if (code === '23503') {
      return { success: false, error: 'That company no longer exists. Reload the page.' };
    }
    return { success: false, error: 'Could not save the change. Try again.' };
  }

  invalidateCostCenterCache();
  log.info('cost center changed', { action, ...fields, actor: actorEmail });
  // The two routes that render the mapping. The department API route is cached per company
  // with a private max-age, so a requester's browser can be up to an hour behind on a company
  // it already opened; a reload clears it.
  revalidatePath('/laptop-procurement/requests/new');
  revalidatePath('/laptop-procurement/requests/[id]/edit', 'page');
  return { success: true };
}

/* ═══ Read ═══════════════════════════════════════════════════════════════════ */

export async function getLaptopCostCenterAdminData(): Promise<LaptopCostCenterAdminData | null> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AccessError) return null;
    throw err;
  }

  await ensureLaptopSchema();
  const snapshot = await getCostCenterAdminSnapshot();
  const labels = [...new Set(snapshot.companies.map((c) => c.country))].sort();
  const reachable = new Set(Object.values(snapshot.countryMap).flat());

  return {
    companies: snapshot.companies,
    departments: snapshot.departments,
    countryMap: snapshot.countryMap,
    requestorCountries: COUNTRY_OPTIONS.filter((c) => c !== 'Other'),
    countries: labels,
    unreachableCountries: labels.filter((c) => !reachable.has(c)),
    empty: snapshot.companies.length === 0,
  };
}

/* ═══ Companies ══════════════════════════════════════════════════════════════ */

export async function addCostCenterCompany(
  code: string,
  name: string,
  country: string,
): Promise<CostCenterActionResult> {
  const c = clean(code);
  const n = clean(name);
  const ctry = clean(country);
  const bad = checkCompanyCode(c);
  if (bad) return { success: false, error: bad };
  if (!n) return { success: false, error: 'Company name is required.' };
  if (!ctry) return { success: false, error: 'Country is required.' };

  return mutate('addCostCenterCompany', { code: c }, async (actor) => {
    await laptopProcurementPool.query(
      `INSERT INTO laptop_cost_center_companies (code, name, country, sort_order, updated_by)
            VALUES ($1, $2, $3,
                    COALESCE((SELECT MAX(sort_order) + 1 FROM laptop_cost_center_companies), 0),
                    $4)`,
      [c, n, ctry, actor],
    );
  });
}

/**
 * Renames a company or moves it to another country. The CODE is deliberately not editable:
 * it is stored on every laptop request ever raised, so changing it here would leave those
 * requests pointing at a company that no longer exists. Retire the old code and add a new one.
 */
export async function updateCostCenterCompany(
  code: string,
  name: string,
  country: string,
): Promise<CostCenterActionResult> {
  const n = clean(name);
  const ctry = clean(country);
  if (!n) return { success: false, error: 'Company name is required.' };
  if (!ctry) return { success: false, error: 'Country is required.' };

  return mutate('updateCostCenterCompany', { code }, async (actor) => {
    await laptopProcurementPool.query(
      `UPDATE laptop_cost_center_companies
          SET name = $2, country = $3, updated_at = NOW(), updated_by = $4
        WHERE code = $1`,
      [clean(code), n, ctry, actor],
    );
  });
}

/**
 * Retire or restore a company. Deactivating hides it from the request form's company picker
 * while leaving every past request that names it intact — which is why this, not delete, is
 * the normal way to remove one.
 */
export async function setCostCenterCompanyActive(
  code: string,
  active: boolean,
): Promise<CostCenterActionResult> {
  return mutate('setCostCenterCompanyActive', { code, active }, async (actor) => {
    await laptopProcurementPool.query(
      `UPDATE laptop_cost_center_companies
          SET active = $2, updated_at = NOW(), updated_by = $3
        WHERE code = $1`,
      [clean(code), active, actor],
    );
  });
}

/**
 * Permanently removes a company AND every department under it, via the foreign key's cascade.
 * Past laptop requests keep the company code and cost center they were raised with — those are
 * plain columns on the request, not references — so history is not rewritten, but the mapping
 * that produced them is gone. Deactivating is almost always what you want instead.
 */
export async function deleteCostCenterCompany(code: string): Promise<CostCenterActionResult> {
  return mutate('deleteCostCenterCompany', { code }, async () => {
    await laptopProcurementPool.query(`DELETE FROM laptop_cost_center_companies WHERE code = $1`, [
      clean(code),
    ]);
  });
}

/* ═══ Departments ════════════════════════════════════════════════════════════ */

export async function addCostCenterDepartment(
  companyCode: string,
  department: string,
  costCenter: string,
): Promise<CostCenterActionResult> {
  const company = clean(companyCode);
  const dept = clean(department);
  const cc = clean(costCenter).toUpperCase();
  if (!company) return { success: false, error: 'Pick a company first.' };
  if (!dept) return { success: false, error: 'Department is required.' };
  const bad = checkCostCenter(cc);
  if (bad) return { success: false, error: bad };

  return mutate(
    'addCostCenterDepartment',
    { companyCode: company, department: dept },
    async (actor) => {
      await laptopProcurementPool.query(
        `INSERT INTO laptop_cost_center_departments
              (company_code, department, cost_center, sort_order, updated_by)
            VALUES ($1, $2, $3,
                    COALESCE((SELECT MAX(sort_order) + 1
                                FROM laptop_cost_center_departments
                               WHERE company_code = $1), 0),
                    $4)`,
        [company, dept, cc, actor],
      );
    },
  );
}

export async function updateCostCenterDepartment(
  id: number,
  department: string,
  costCenter: string,
): Promise<CostCenterActionResult> {
  const dept = clean(department);
  const cc = clean(costCenter).toUpperCase();
  if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Unknown department row.' };
  if (!dept) return { success: false, error: 'Department is required.' };
  const bad = checkCostCenter(cc);
  if (bad) return { success: false, error: bad };

  return mutate('updateCostCenterDepartment', { id, department: dept }, async (actor) => {
    await laptopProcurementPool.query(
      `UPDATE laptop_cost_center_departments
          SET department = $2, cost_center = $3, updated_at = NOW(), updated_by = $4
        WHERE id = $1`,
      [id, dept, cc, actor],
    );
  });
}

export async function setCostCenterDepartmentActive(
  id: number,
  active: boolean,
): Promise<CostCenterActionResult> {
  if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Unknown department row.' };
  return mutate('setCostCenterDepartmentActive', { id, active }, async (actor) => {
    await laptopProcurementPool.query(
      `UPDATE laptop_cost_center_departments
          SET active = $2, updated_at = NOW(), updated_by = $3
        WHERE id = $1`,
      [id, active, actor],
    );
  });
}

export async function deleteCostCenterDepartment(id: number): Promise<CostCenterActionResult> {
  if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Unknown department row.' };
  return mutate('deleteCostCenterDepartment', { id }, async () => {
    await laptopProcurementPool.query(`DELETE FROM laptop_cost_center_departments WHERE id = $1`, [
      id,
    ]);
  });
}

/* ═══ Country map ════════════════════════════════════════════════════════════ */

/**
 * Replaces the whole set of workbook country labels one request-form country reaches.
 *
 * Whole-set rather than add/remove one at a time, because that is how the decision is actually
 * made: "Abu Dhabi covers UAE and EOS JAFZA" is one statement, not two. Done in a transaction
 * so a half-applied change can never leave a country reaching nothing — which would empty the
 * company dropdown for every requester in it.
 */
export async function setCostCenterCountryMapping(
  requestorCountry: string,
  mappedCountries: string[],
): Promise<CostCenterActionResult> {
  const requestor = clean(requestorCountry);
  if (!requestor) return { success: false, error: 'Pick a requestor country.' };
  if (!COUNTRY_OPTIONS.includes(requestor)) {
    return { success: false, error: 'That is not one of the request form country options.' };
  }
  const labels = [...new Set((mappedCountries ?? []).map(clean).filter(Boolean))];

  return mutate(
    'setCostCenterCountryMapping',
    { requestorCountry: requestor, mappedCountries: labels },
    async () => {
      const client = await laptopProcurementPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM laptop_cost_center_country_map WHERE requestor_country = $1`,
          [requestor],
        );
        for (let i = 0; i < labels.length; i++) {
          await client.query(
            `INSERT INTO laptop_cost_center_country_map
                    (requestor_country, mapped_country, sort_order)
                  VALUES ($1, $2, $3)`,
            [requestor, labels[i], i],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
