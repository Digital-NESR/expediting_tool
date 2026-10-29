/**
 * Which country a booking belongs to, and which bookings a reader may see.
 *
 * `travel_portal.bookings` has no country column. What it has is `costCenter` and `companyCode`,
 * and the mapping from those to a country already exists in the laptop tool's cost-centre tables,
 * which an admin maintains. Against today's feed that resolves 218 of 219 real bookings by cost
 * centre and the remaining one by company code, with the two routes never disagreeing.
 *
 * Cost centre first, because it is the finer key and carries the department as well. Company code
 * second, because a cost centre that has not reached the mapping yet should not take a whole
 * booking out of a country reader's view. A booking that neither route resolves is UNMAPPED, and
 * unmapped is a visible state rather than a silent exclusion: it is reported on the data quality
 * panel and it is shown to admins, who see everything, while a country reader does not see it
 * because there is no country to match it against.
 */

export type TravelRole = 'admin' | 'finance' | 'management';

export interface TravelGrant {
  role: TravelRole;
  /** Null means every country. */
  country: string | null;
}

export interface TravelScope {
  /** The strongest role the reader holds. */
  role: TravelRole;
  /**
   * The countries the reader may see, or null for every country.
   *
   * Null and an empty array are different answers and must not be conflated: null is "all", an
   * empty array is "none", and a query that treats them the same shows a reader with no grant
   * the entire company's travel.
   */
  countries: string[] | null;
  /** Only an admin may see an unmapped booking, because only an admin is not country-scoped. */
  includeUnmapped: boolean;
}

/** An admin outranks management, which outranks finance. */
const RANK: Record<TravelRole, number> = { finance: 0, management: 1, admin: 2 };

/**
 * Collapse a person's grants into one scope.
 *
 * Somebody may hold several rows: finance on two countries, or management on one and finance
 * everywhere. The role is the strongest they hold, and the countries are the union of the rows
 * at that role. Rows at a weaker role do not widen a stronger one's reach, because the question
 * the dashboard asks is "what may this person see", and a finance grant on Kuwait is not a
 * licence to see Kuwait's compliance detail.
 */
export function resolveScope(grants: readonly TravelGrant[]): TravelScope | null {
  if (!grants.length) return null;

  let role: TravelRole = 'finance';
  for (const g of grants) if (RANK[g.role] > RANK[role]) role = g.role;

  if (role === 'admin') return { role, countries: null, includeUnmapped: true };

  const atRole = grants.filter((g) => g.role === role);
  /* One NULL row wins: that is the central reader, and intersecting it with their other rows
     would quietly narrow somebody who was deliberately given everything. */
  if (atRole.some((g) => g.country === null)) {
    return { role, countries: null, includeUnmapped: false };
  }
  const countries = [...new Set(atRole.map((g) => g.country).filter((c): c is string => !!c))];
  return { role, countries, includeUnmapped: false };
}

/** True when this reader may see the compliance and optimisation detail. */
export const canSeeOptimisation = (role: TravelRole): boolean =>
  role === 'management' || role === 'admin';

/** True when this reader may ask to reveal a traveller's identity documents. */
export const canRevealIdentityDocuments = (role: TravelRole): boolean => role === 'admin';

/**
 * The SQL that limits a bookings query to a reader's countries, and the parameters it needs.
 *
 * Returned as a fragment rather than applied here because every figure on the dashboard needs
 * the same restriction, and the way these go wrong is one query out of fifteen forgetting it.
 * `alias` is the bookings table's alias; `country` is the resolved-country expression the caller
 * has already joined in.
 *
 * The parameter index is passed in and returned so a caller can place this inside a larger
 * query without renumbering by hand.
 */
export function countryFilterSql(
  scope: TravelScope,
  countryExpr: string,
  nextParamIndex: number,
): { sql: string; params: string[][]; nextIndex: number } {
  if (scope.countries === null) {
    /* Everything, except that only an admin sees a booking we could not place in a country. */
    return scope.includeUnmapped
      ? { sql: 'TRUE', params: [], nextIndex: nextParamIndex }
      : { sql: `${countryExpr} IS NOT NULL`, params: [], nextIndex: nextParamIndex };
  }
  if (!scope.countries.length) {
    /* No grant at this role covers any country. Not the same as "all", and the difference is
       the whole company's travel. */
    return { sql: 'FALSE', params: [], nextIndex: nextParamIndex };
  }
  return {
    sql: `${countryExpr} = ANY($${nextParamIndex})`,
    params: [scope.countries],
    nextIndex: nextParamIndex + 1,
  };
}
