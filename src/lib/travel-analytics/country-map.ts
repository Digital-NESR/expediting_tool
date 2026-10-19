/**
 * Turning a booking's cost centre into a country.
 *
 * `travel_portal.bookings` has no country column, and the mapping that would give it one already
 * exists in the laptop tool's cost-centre tables — which an admin maintains at
 * /admin/laptop?section=cost-centers, so it is kept current by somebody whose job depends on it
 * being right. Copying 2,335 rows into this tool would have created a second thing to maintain
 * and a guaranteed source of drift. See database/migrations/default/004_travel_analytics.sql for
 * why there is no third table.
 *
 * THE RESOLUTION IS PURE, AND LIVES HERE RATHER THAN IN SQL, because the two databases are
 * different databases. Postgres cannot join `travel_portal.bookings` to
 * `laptop_procurement_db.laptop_cost_center_departments` in one query, and the alternative —
 * shipping 2,335 rows into every aggregate as a parameter — would send the whole mapping fifteen
 * times per page load. The query layer loads the mapping once per request, resolves every
 * booking's country here, and then passes only the (code, country) pairs back into SQL. See
 * `@/lib/travel-analytics/queries` for the other half of that.
 *
 * Cost centre first, company code second. Against the October 2026 feed that places 218 of 219
 * real bookings by cost centre and the last by company code, and the two routes never disagree —
 * but the order still matters, because cost centre is the finer key and a company that trades in
 * two countries would be resolved wrongly the other way round. A booking neither route places is
 * UNMAPPED, which is a reported state rather than a silent exclusion: today that is the eleven
 * `Satguru Test` rows on company 1000, which exist in no cost-centre table because they are test
 * data.
 */

/** A row of `laptop_cost_center_departments`. */
export interface CostCentreDepartment {
  costCentre: string;
  companyCode: string;
  /**
   * Carried through so the chargeback table can name a cost centre rather than only number it.
   * `C118800004` tells a finance reader nothing; `C118800004 · SUPPLY CHAIN` tells them who to
   * ask about it.
   */
  department: string;
}

/** A row of `laptop_cost_center_companies`. */
export interface CostCentreCompany {
  code: string;
  name: string;
  country: string;
}

/** Where a booking's country came from, so the data-quality panel can say. */
export type CountrySource = 'cost-centre' | 'company-code' | null;

export interface CountryResolution {
  country: string | null;
  via: CountrySource;
  /** The department the cost centre belongs to, when the cost-centre route found one. */
  department: string | null;
  /** The company name as the cost-centre tables spell it, which is not always what the feed says. */
  companyName: string | null;
}

interface CostCentreEntry {
  companyCode: string;
  department: string;
  country: string | null;
}

export interface CountryIndex {
  byCostCentre: ReadonlyMap<string, CostCentreEntry>;
  byCompanyCode: ReadonlyMap<string, { name: string; country: string }>;
}

/**
 * One spelling of a lookup key.
 *
 * The source data is not clean on either side. The laptop workbook import left non-breaking
 * spaces and casing differences in department text, and the travel feed pads its own columns
 * (`'MANAGEMENT          '`). A cost centre that differs from its mapping row only by a trailing
 * space would resolve to no country at all, and the booking would silently leave a country
 * reader's view — which is the exact failure the unmapped state exists to make visible rather
 * than cause.
 */
const key = (value: string | null | undefined): string =>
  (value ?? '').replace(/ /g, ' ').trim().toUpperCase();

/** Build the two lookup maps once, from the rows the laptop pool handed back. */
export function buildCountryIndex(
  departments: readonly CostCentreDepartment[],
  companies: readonly CostCentreCompany[],
): CountryIndex {
  const byCompanyCode = new Map<string, { name: string; country: string }>();
  for (const c of companies) {
    const code = key(c.code);
    if (!code) continue;
    byCompanyCode.set(code, { name: (c.name ?? '').trim(), country: (c.country ?? '').trim() });
  }

  const byCostCentre = new Map<string, CostCentreEntry>();
  for (const d of departments) {
    const centre = key(d.costCentre);
    if (!centre) continue;
    const companyCode = key(d.companyCode);
    /* First row wins. A cost centre appearing twice under two companies is a mapping error, not
       something to average: taking the first keeps the answer stable across page loads instead
       of flipping with the row order the database happens to return. */
    if (byCostCentre.has(centre)) continue;
    byCostCentre.set(centre, {
      companyCode,
      department: (d.department ?? '').trim(),
      country: byCompanyCode.get(companyCode)?.country || null,
    });
  }

  return { byCostCentre, byCompanyCode };
}

const UNRESOLVED: CountryResolution = {
  country: null,
  via: null,
  department: null,
  companyName: null,
};

/** Cost centre, then company code, then unmapped. Never guesses. */
export function resolveBookingCountry(
  index: CountryIndex,
  costCentre: string | null | undefined,
  companyCode: string | null | undefined,
): CountryResolution {
  const centre = index.byCostCentre.get(key(costCentre));
  if (centre?.country) {
    return {
      country: centre.country,
      via: 'cost-centre',
      department: centre.department || null,
      companyName: index.byCompanyCode.get(centre.companyCode)?.name ?? null,
    };
  }

  const company = index.byCompanyCode.get(key(companyCode));
  if (company?.country) {
    return {
      country: company.country,
      via: 'company-code',
      /* A company-code match knows nothing about which department spent the money — that is what
         the cost centre carries — so the department stays null rather than being invented. */
      department: centre?.department || null,
      companyName: company.name || null,
    };
  }

  /* Unmapped, but the cost centre may still have named a department even though its company had
     no country, and that is worth keeping for the chargeback table. */
  if (centre?.department) {
    return { ...UNRESOLVED, department: centre.department };
  }
  return UNRESOLVED;
}

/**
 * Every country the mapping knows, for the grants editor's picker.
 *
 * Sorted and de-duplicated, and taken from the companies table rather than from the bookings in
 * the feed: a country with no travel yet still needs to be grantable, otherwise the first person
 * in a new country cannot be given access until somebody there has already flown.
 */
export function countryOptions(companies: readonly CostCentreCompany[]): string[] {
  const seen = new Set<string>();
  for (const c of companies) {
    const country = (c.country ?? '').trim();
    if (country) seen.add(country);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
