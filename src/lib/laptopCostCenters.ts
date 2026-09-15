// Cost Center mapping for the laptop procurement request form — CLIENT-SAFE half.
//
// The mapping now lives in Postgres (laptop_procurement_db), in three tables that the
// /admin → Laptop Procurement → Cost Centers page edits directly. It used to be a pair of
// JSON files generated from a spreadsheet that was never committed, so every correction
// meant finding the workbook, re-running a script and shipping a deploy.
//
// This module holds only what a CLIENT component may have: the types, and pure functions
// that take the data as arguments. Nothing here reads the database or imports data, so the
// request form's chunk carries logic and no rows. See '@/lib/laptopCostCenters.server' for
// the reads, and 'scripts/seed-laptop-cost-centers.mjs' for the one-time load.

export interface CostCenterCompany {
  code: string;
  name: string;
  /**
   * The workbook's country label(s) this company files under — 'KSA', 'EOS JAFZA', 'HQ Dubai'.
   * These are NOT the form's own country values; `countryMap` bridges the two. An array
   * because the mapping has always allowed it, though every company currently has exactly one.
   */
  countries: string[];
}

export interface CostCenterDepartment {
  department: string;
  costCenter: string;
}

/**
 * Fold the source spreadsheet's whitespace into something matchable.
 *
 * The export is written by Excel, and 1,554 of its 2,335 department names separate words with a
 * NON-BREAKING space (U+00A0) rather than a plain one: "SUPPLY\u00A0CHAIN", not "SUPPLY CHAIN".
 * On screen the two are indistinguishable, which is exactly why nobody noticed. The damage is
 * that "SUPPLY CHAIN" typed by a person never equals "SUPPLY\u00A0CHAIN" read from the sheet,
 * so the cost-center auto-fill silently gave up whenever the department name came from anywhere
 * other than the dropdown built from this same data — the employee directory, most of all.
 *
 * Every write normalises, and every comparison normalises again, so a row that predates this
 * still matches. Also folds the other Unicode spaces and the zero-width characters that survive
 * a copy-paste out of a browser, then collapses runs of spaces and trims.
 */
export function normaliseCostCenterText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * COUNTRY_OPTIONS value → the workbook country label(s) it covers. Hand-maintained, because
 * it is a judgement call rather than anything the source data states: 'Abu Dhabi' reaches both
 * 'UAE' and 'EOS JAFZA', and 'Other' reaches nothing. Editable on the admin page.
 */
export type CostCenterCountryMap = Record<string, string[]>;

/** Everything the request form needs up front — small enough to pass as a prop. */
export interface CostCenterFormData {
  companies: CostCenterCompany[];
  countryMap: CostCenterCountryMap;
}

/** Companies available to a given requestor country (a COUNTRY_OPTIONS value). */
export function getCompaniesForRequestorCountry(
  data: CostCenterFormData | null | undefined,
  requestorCountry: string | null | undefined,
): CostCenterCompany[] {
  if (!data) return [];
  const labels = (requestorCountry && data.countryMap[requestorCountry]) || [];
  if (!labels.length) return [];
  return data.companies.filter((c) => c.countries.some((ctry) => labels.includes(ctry)));
}

export function getCompanyByCode(
  data: CostCenterFormData | null | undefined,
  code: string | null | undefined,
): CostCenterCompany | null {
  if (!data || !code) return null;
  return data.companies.find((c) => c.code === code) ?? null;
}

/**
 * Cost center for a department within an ALREADY-LOADED department list.
 *
 * Both sides go through {@link normaliseCostCenterText} and then case folding, which is why the
 * table's uniqueness constraint is on LOWER(department): two departments differing only in case
 * would make this ambiguous. Normalising the stored side too, rather than trusting the write
 * path, is what lets a row seeded before the whitespace fix still match.
 */
export function findCostCenter(
  departments: CostCenterDepartment[] | undefined,
  department: string | null | undefined,
): string | null {
  if (!departments || !department) return null;
  const wanted = normaliseCostCenterText(department).toLowerCase();
  if (!wanted) return null;
  const dept = departments.find(
    (d) => normaliseCostCenterText(d.department).toLowerCase() === wanted,
  );
  return dept?.costCenter ?? null;
}
