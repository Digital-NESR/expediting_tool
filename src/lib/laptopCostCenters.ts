// Cost Center mapping for the laptop procurement request form — CLIENT-SAFE half.
//
// Auto-generated from the "Cost Center Mapping" Excel export (cost center.xlsx) shared for the
// laptop procurement Cost Allocation section. Regenerate with:
//   node scripts/generate-laptop-cost-centers.mjs --in "<path to cost center.xlsx>"
//
// This module deliberately carries only the small tables the request form needs synchronously:
// the company list (56 rows, ~4.8 KB) and the requestor-country → Excel-country map. The
// department / cost-center table is ~138 KB and is NOT here — the form only ever needs the
// departments of the ONE company currently selected, so those are fetched per company from
// /api/laptop-procurement/cost-centers/<code>. See '@/lib/laptopCostCenters.server' for the
// full dataset (server-side only).

import companyData from '@/data/laptop-cost-center-companies.json';

export interface CostCenterCompany {
  code: string;
  name: string;
  countries: string[];
}

export interface CostCenterDepartment {
  department: string;
  costCenter: string;
}

export const COST_CENTER_COUNTRIES: string[] = companyData.countries;

export const COST_CENTER_COMPANIES: CostCenterCompany[] = companyData.companies;

// COUNTRY_OPTIONS value -> matching Excel country label(s). Entries with no mapping here
// (e.g. 'Other') simply yield an empty company list.
export const COUNTRY_TO_COST_CENTER_COUNTRIES: Record<string, string[]> = companyData.countryMap;

/** Companies available to a given requestor country (COUNTRY_OPTIONS value). */
export function getCompaniesForRequestorCountry(requestorCountry: string | null | undefined): CostCenterCompany[] {
  const excelCountries = (requestorCountry && COUNTRY_TO_COST_CENTER_COUNTRIES[requestorCountry]) || [];
  if (!excelCountries.length) return [];
  return COST_CENTER_COMPANIES.filter(c => c.countries.some(ctry => excelCountries.includes(ctry)));
}

export function getCompanyByCode(code: string | null | undefined): CostCenterCompany | null {
  if (!code) return null;
  return COST_CENTER_COMPANIES.find(c => c.code === code) ?? null;
}

/**
 * Cost center for a department within an ALREADY-LOADED department list. Same matching rule
 * (case-insensitive, trimmed) the old synchronous `getCostCenterFor` used — the only difference
 * is that the caller supplies the one company's departments instead of the module holding all 56.
 */
export function findCostCenter(
  departments: CostCenterDepartment[] | undefined,
  department: string | null | undefined,
): string | null {
  if (!departments || !department) return null;
  const dept = departments.find(d => d.department.toLowerCase() === department.trim().toLowerCase());
  return dept?.costCenter ?? null;
}
