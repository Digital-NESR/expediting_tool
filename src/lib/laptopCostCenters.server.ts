// Cost Center mapping — SERVER-ONLY half. Reads the three tables in laptop_procurement_db.
//
// *** DO NOT IMPORT THIS MODULE FROM A CLIENT COMPONENT. ***
// Client-safe types and pure helpers live in '@/lib/laptopCostCenters'.
//
// WHERE THE DATA LIVES
//   laptop_cost_center_companies      one row per company: code, name, workbook country
//   laptop_cost_center_departments    one row per department: company, name, cost center
//   laptop_cost_center_country_map    COUNTRY_OPTIONS value to workbook country label
//
// It used to be two generated JSON files, built from a spreadsheet that was never committed —
// so a wrong cost center could only be corrected by whoever still had the workbook, and only
// by shipping a deploy. Admins now edit it at /admin/laptop?section=cost-centers.
//
// CACHING
//   This is reference data: ~2,300 rows, read on every request-form load and every department
//   fetch, written a few times a year. Two layers:
//     - `cache()` dedupes within a single request;
//     - a process-level snapshot with a 60s TTL spares the database the repeat reads.
//   An admin edit calls `invalidateCostCenterCache()`, which clears the snapshot in the
//   instance that served the write. Other instances keep their snapshot until it expires, so
//   an edit can take up to a minute to be visible everywhere. That is the deliberate trade:
//   this data changes far too rarely to justify a round trip per read.

import { cache } from 'react';
import laptopProcurementPool from '@/lib/db-laptop';
import { logger } from '@/lib/logger';
import type {
  CostCenterCountryMap,
  CostCenterDepartment,
  CostCenterFormData,
} from '@/lib/laptopCostCenters';

export type {
  CostCenterCompany,
  CostCenterCountryMap,
  CostCenterDepartment,
  CostCenterFormData,
} from '@/lib/laptopCostCenters';
export {
  findCostCenter,
  getCompaniesForRequestorCountry,
  getCompanyByCode,
} from '@/lib/laptopCostCenters';

const log = logger('laptop-cost-centers');

/** Rows exactly as the tables hold them — what the admin page edits. */
export interface CostCenterCompanyRow {
  code: string;
  name: string;
  country: string;
  active: boolean;
  sortOrder: number;
  departmentCount: number;
}

export interface CostCenterDepartmentRow {
  id: number;
  companyCode: string;
  department: string;
  costCenter: string;
  active: boolean;
  sortOrder: number;
}

export interface CostCenterSnapshot {
  companies: CostCenterCompanyRow[];
  departments: CostCenterDepartmentRow[];
  countryMap: CostCenterCountryMap;
}

/* ═══ Schema ═════════════════════════════════════════════════════════════════
   Created on first use, like every other table in this tool. The departments table is keyed
   on (company_code, LOWER(department)) because the form's lookup is case-insensitive: two
   departments differing only in case would make the cost-center auto-fill ambiguous.
   ═══════════════════════════════════════════════════════════════════════════ */

let schemaEnsured: Promise<void> | null = null;

export function ensureCostCenterSchema(): Promise<void> {
  if (schemaEnsured) return schemaEnsured;
  schemaEnsured = (async () => {
    const exec = async (statement: string) => {
      try {
        await laptopProcurementPool.query(statement);
      } catch (err) {
        // Two instances racing to create the same object: whoever loses sees one of these.
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
      }
    };
    await exec(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_companies (
        code        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        country     TEXT NOT NULL,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by  TEXT
      )
    `);
    await exec(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_departments (
        id           SERIAL PRIMARY KEY,
        company_code TEXT NOT NULL
                     REFERENCES laptop_cost_center_companies (code)
                     ON UPDATE CASCADE ON DELETE CASCADE,
        department   TEXT NOT NULL,
        cost_center  TEXT NOT NULL,
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by   TEXT
      )
    `);
    await exec(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_country_map (
        requestor_country TEXT NOT NULL,
        mapped_country    TEXT NOT NULL,
        sort_order        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (requestor_country, mapped_country)
      )
    `);
    await exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_lcc_departments_company_dept
         ON laptop_cost_center_departments (company_code, LOWER(department))`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS idx_lcc_departments_company
         ON laptop_cost_center_departments (company_code)`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS idx_lcc_companies_country
         ON laptop_cost_center_companies (country)`,
    );
  })().catch((err) => {
    schemaEnsured = null;
    throw err;
  });
  return schemaEnsured;
}

/* ═══ Snapshot ═══════════════════════════════════════════════════════════════ */

const SNAPSHOT_TTL_MS = 60_000;

let snapshot: { at: number; data: CostCenterSnapshot } | null = null;
let inFlight: Promise<CostCenterSnapshot> | null = null;

/** Drop this instance's cached snapshot. Called by every admin write. */
export function invalidateCostCenterCache(): void {
  snapshot = null;
  inFlight = null;
}

async function loadSnapshot(): Promise<CostCenterSnapshot> {
  await ensureCostCenterSchema();
  const [companies, departments, countryMap] = await Promise.all([
    laptopProcurementPool.query(
      `SELECT c.code, c.name, c.country, c.active, c.sort_order,
              COUNT(d.id) FILTER (WHERE d.active) AS department_count
         FROM laptop_cost_center_companies c
         LEFT JOIN laptop_cost_center_departments d ON d.company_code = c.code
        GROUP BY c.code
        ORDER BY c.sort_order, c.name`,
    ),
    laptopProcurementPool.query(
      `SELECT id, company_code, department, cost_center, active, sort_order
         FROM laptop_cost_center_departments
        ORDER BY company_code, sort_order, department`,
    ),
    laptopProcurementPool.query(
      `SELECT requestor_country, mapped_country
         FROM laptop_cost_center_country_map
        ORDER BY requestor_country, sort_order, mapped_country`,
    ),
  ]);

  const map: CostCenterCountryMap = {};
  for (const row of countryMap.rows) {
    (map[String(row.requestor_country)] ??= []).push(String(row.mapped_country));
  }

  return {
    companies: companies.rows.map((r) => ({
      code: String(r.code),
      name: String(r.name),
      country: String(r.country),
      active: Boolean(r.active),
      sortOrder: Number(r.sort_order),
      departmentCount: Number(r.department_count),
    })),
    departments: departments.rows.map((r) => ({
      id: Number(r.id),
      companyCode: String(r.company_code),
      department: String(r.department),
      costCenter: String(r.cost_center),
      active: Boolean(r.active),
      sortOrder: Number(r.sort_order),
    })),
    countryMap: map,
  };
}

/**
 * The whole mapping, cached. `cache()` collapses repeat calls within one request; the
 * module-level snapshot spares the database across requests on the same instance.
 *
 * `inFlight` matters under load: without it, a cold instance serving twenty concurrent form
 * loads would run twenty copies of the same three queries against a pool that allows three
 * connections.
 */
export const getCostCenterSnapshot = cache(async (): Promise<CostCenterSnapshot> => {
  const now = Date.now();
  if (snapshot && now - snapshot.at < SNAPSHOT_TTL_MS) return snapshot.data;
  if (inFlight) return inFlight;
  inFlight = loadSnapshot()
    .then((data) => {
      snapshot = { at: Date.now(), data };
      inFlight = null;
      return data;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
});

/**
 * Same as `getCostCenterSnapshot`, but a database failure yields an empty mapping instead of
 * throwing. The request form degrades to empty company and department dropdowns — which is
 * what an unmapped country already did — rather than failing the whole page.
 */
async function safeSnapshot(context: string): Promise<CostCenterSnapshot> {
  try {
    return await getCostCenterSnapshot();
  } catch (err) {
    log.error('cost center mapping unavailable', { context, err });
    return { companies: [], departments: [], countryMap: {} };
  }
}

/* ═══ Reads used by the request form ═════════════════════════════════════════ */

/** Only ACTIVE rows — the admin page deactivates a company or department to retire it. */
export async function getCostCenterFormData(): Promise<CostCenterFormData> {
  const data = await safeSnapshot('getCostCenterFormData');
  return {
    companies: data.companies
      .filter((c) => c.active)
      .map((c) => ({ code: c.code, name: c.name, countries: [c.country] })),
    countryMap: data.countryMap,
  };
}

/** Every workbook country label in use, for the admin page's pickers. */
export async function getCostCenterCountries(): Promise<string[]> {
  const data = await safeSnapshot('getCostCenterCountries');
  return [...new Set(data.companies.map((c) => c.country))].sort();
}

/** Active departments for one company, in the order the admin page shows them. */
export async function getDepartmentsForCompany(
  code: string | null | undefined,
): Promise<CostCenterDepartment[]> {
  if (!code) return [];
  const data = await safeSnapshot('getDepartmentsForCompany');
  return data.departments
    .filter((d) => d.companyCode === code && d.active)
    .map((d) => ({ department: d.department, costCenter: d.costCenter }));
}

/** Cost center for a company and department pair, or null. Case-insensitive on department. */
export async function getCostCenterFor(
  code: string | null | undefined,
  department: string | null | undefined,
): Promise<string | null> {
  if (!code || !department) return null;
  const wanted = department.trim().toLowerCase();
  const rows = await getDepartmentsForCompany(code);
  return rows.find((d) => d.department.toLowerCase() === wanted)?.costCenter ?? null;
}

/**
 * A one-entry `{ [code]: departments }` map seeding the request form's client-side cache.
 * The form opens on exactly one company — the one being edited, or the requester's own from
 * the employee directory — and both the department dropdown and the cost-center auto-fill read
 * it synchronously. Prefetching that slice here keeps those paths synchronous; any other
 * company the user picks is fetched from /api/laptop-procurement/cost-centers/<code>.
 */
export async function departmentsSeedFor(
  code: string | null | undefined,
): Promise<Record<string, CostCenterDepartment[]>> {
  if (!code) return {};
  return { [code]: await getDepartmentsForCompany(code) };
}

/* ═══ Read used by the admin page ════════════════════════════════════════════ */

/** Everything, including deactivated rows and primary keys. Bypasses the TTL cache. */
export async function getCostCenterAdminSnapshot(): Promise<CostCenterSnapshot> {
  invalidateCostCenterCache();
  return getCostCenterSnapshot();
}
