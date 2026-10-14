/**
 * When a taxonomy level says nothing, and how each surface says so.
 *
 * The spend taxonomy is five levels deep (spend type, category, sub-category, family, commodity)
 * and not every branch is genuinely that deep. 43 commodities carry no family at all, and a
 * further 15 carry one that merely repeats their own sub-category: `Lubricants > Lubricants >
 * Engine Oil`, `Radiators > Radiators > Radiator Spare Parts`. On the drill-down the repeat is a
 * column offering one choice whose label the reader has just clicked; in the breadcrumb it is the
 * same word twice; in the export it is a duplicated cell.
 *
 * A repeat and a blank are the same fact - this branch has no family - so they are treated as one
 * thing here, and each surface then says it the way that surface already says it:
 *
 *   drill-down and export   a column per level, so the level needs a value: `General`, which is
 *                           what the 43 blanks have always shown.
 *   breadcrumb              a list, so the level is simply left out, which is what `buildPath`
 *                           already did with a null family.
 *
 * Deliberately a read rule and not an UPDATE. `sg_commodities` is what the taxonomy owner
 * maintains and `Lubricants` is what they typed; flattening it in the table would overwrite their
 * data to fix a rendering, lose the difference between "no family" and "a family that happens to
 * match", and leave the next imported row broken again. As a rule it holds for rows not yet
 * loaded.
 *
 * Only the immediate parent counts. Three commodities carry a family matching their *category*
 * two levels up (`Cement > Commodities Chemicals > Cement`), which is a different shape: the
 * level between them is doing real work, so that repeat is not redundant in the same way and is
 * left alone.
 */

/**
 * This family tells the reader nothing: either it is empty, or it is its own sub-category again.
 *
 * Compared case-insensitively on the trimmed values. No row differs from its sub-category by case
 * alone today, so that changes nothing now; it is written this way because the comparison that
 * only catches an exact match is the one that silently stops working the day somebody retypes a
 * level in different case.
 */
export function isRedundantFamily(
  family: string | null | undefined,
  subCategory: string | null | undefined,
): boolean {
  const fam = (family ?? '').trim();
  if (!fam) return true;
  return fam.toLowerCase() === (subCategory ?? '').trim().toLowerCase();
}

/** The drill-down and export form: a value for the column, never an empty cell. */
export function familyLabel(
  family: string | null | undefined,
  subCategory: string | null | undefined,
): string {
  return isRedundantFamily(family, subCategory) ? 'General' : (family ?? '').trim();
}

/*
 * The same rule as SQL.
 *
 * Four queries read these two columns and had drifted into three spellings of one intent, one of
 * which (`getTaxonomy`) compared against NULL only and so let a family stored as an empty string
 * reach the screen empty. One fragment is the only way they stay agreed.
 */

/** `c.` for a query that aliases the table, '' for one that does not. */
type Alias = '' | `${string}.`;

/** Sub-category, blank reported as `General`. Its parent is a category, which is never empty. */
export function subCategorySql(a: Alias = '', as = 'sub'): string {
  return `COALESCE(NULLIF(TRIM(${a}sub_category), ''), 'General') AS ${as}`;
}

/** Family, with blank and parent-repeating both reported as `General`. */
export function familySql(a: Alias = '', as = 'fam'): string {
  return `CASE
            WHEN NULLIF(TRIM(${a}family), '') IS NULL
              OR lower(TRIM(${a}family)) = lower(TRIM(COALESCE(${a}sub_category, '')))
            THEN 'General'
            ELSE TRIM(${a}family)
          END AS ${as}`;
}
