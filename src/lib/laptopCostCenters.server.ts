// Cost Center mapping — SERVER-ONLY half (the ~138 KB department / cost-center table).
//
// Auto-generated from the "Cost Center Mapping" Excel export (cost center.xlsx). Regenerate with:
//   node scripts/generate-laptop-cost-centers.mjs --in "<path to cost center.xlsx>"
//
// *** DO NOT IMPORT THIS MODULE FROM A CLIENT COMPONENT. ***
// The request form needs the departments of one company at a time; it gets the first one as a
// prefetched prop from its server page and any later one from
// /api/laptop-procurement/cost-centers/<code>. Client-safe tables and helpers live in
// '@/lib/laptopCostCenters'.

import departmentData from '@/data/laptop-cost-center-departments.json';
import { findCostCenter, type CostCenterDepartment } from '@/lib/laptopCostCenters';

export type { CostCenterCompany, CostCenterDepartment } from '@/lib/laptopCostCenters';
export {
  COST_CENTER_COUNTRIES,
  COST_CENTER_COMPANIES,
  COUNTRY_TO_COST_CENTER_COUNTRIES,
  getCompaniesForRequestorCountry,
  getCompanyByCode,
} from '@/lib/laptopCostCenters';

export const COMPANY_DEPARTMENTS: Record<string, CostCenterDepartment[]> = departmentData as Record<
  string,
  CostCenterDepartment[]
>;

/** Departments available for a company, in the workbook's own order. */
export function getDepartmentsForCompany(code: string | null | undefined): CostCenterDepartment[] {
  if (!code) return [];
  return COMPANY_DEPARTMENTS[code] ?? [];
}

/** Cost center for a given company + department combination, or null if not found. */
export function getCostCenterFor(
  code: string | null | undefined,
  department: string | null | undefined,
): string | null {
  if (!code) return null;
  return findCostCenter(COMPANY_DEPARTMENTS[code], department);
}

/**
 * A one-entry `{ [code]: departments }` map for seeding the request form's client-side cache.
 * The form opens on exactly one company (the one on the request being edited, or the requester's
 * own from the employee directory), and both the department dropdown and the cost-center
 * auto-fill read it synchronously — so that slice is prefetched here rather than fetched from
 * the API, keeping the form's behaviour identical to when the whole 138 KB table was bundled.
 */
export function departmentsSeedFor(
  code: string | null | undefined,
): Record<string, CostCenterDepartment[]> {
  if (!code) return {};
  return { [code]: getDepartmentsForCompany(code) };
}
