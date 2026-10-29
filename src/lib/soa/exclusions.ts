/**
 * The intercompany exclusion list, in the one form every query has to agree on.
 *
 * `excluded_vendors` holds NESR's own entities. There is no third party to ask for a statement
 * and no balance anyone outside the group could confirm, so their spend is not reconcilable and
 * does not belong in a coverage figure — on either side of the division.
 *
 * It is a module of SQL fragments rather than a filter each query writes for itself because the
 * drift is what went wrong. `scopeCandidates` took them out and the Scoping screen read "target
 * met"; the dashboard, the handoff gate, the evidence pack and the Corporate Rollup all divided
 * by a denominator that still contained them. Egypt is 57.8% intercompany, so its champion was
 * told they had covered the quarter on one screen and 23.70% on another, for the same work on
 * the same day.
 *
 * Both sides matter. Six countries had an excluded entity LOCKED into their chase list — scoped
 * before the exclusion existed, written to, and therefore not removable — and $5.4M of that was
 * being counted as covered. Taking them out of the denominator alone would have let coverage
 * climb past 100%.
 *
 * The arguments are column expressions written by the caller, never anything from a request.
 * Nothing here interpolates a value.
 */

/** True for a supplier whose vendor number is NOT on the exclusion list. */
export const notExcludedVendorNo = (vendorNoExpr: string): string =>
  `NOT EXISTS (SELECT 1 FROM excluded_vendors x WHERE x.vendor_no = ${vendorNoExpr})`;

/**
 * The same test for a `vendor_cycle_entries` row, which reaches its vendor number through
 * `vendors`. Written as its own subquery rather than relying on a join the caller remembered to
 * add, so a query cannot silently stop excluding by dropping a join.
 */
export const entryNotExcluded = (entryAlias = 'vce'): string =>
  `NOT EXISTS (
     SELECT 1 FROM vendors ev
       JOIN excluded_vendors x ON x.vendor_no = ev.vendor_no
      WHERE ev.id = ${entryAlias}.vendor_id
   )`;
