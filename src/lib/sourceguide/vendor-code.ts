/**
 * Matching a pasted vendor code.
 *
 * Buyers search by code as often as by name. In the usage log, three of the most-repeated search
 * terms are bare vendor codes — `0001100174`, `1103318`, `0001105784` — pasted straight out of
 * SAP. Three call sites each wrote `s.code.includes(q)` against the raw query, which gets two
 * things wrong:
 *
 *   - SAP pads codes to ten digits in some screens and not in others, so the `1103318` somebody
 *     copies does not literally appear inside the stored `0001103318`... and when it does, it is
 *     by luck of the padding rather than by rule.
 *   - An untrimmed or lower-cased query silently matches nothing, with no indication why.
 *
 * Comparing on the significant digits fixes both. Kept separate from `matchScore` because a code
 * is an identifier, not a name: typo tolerance is wrong here — a one-digit slip is a different
 * vendor, not a near miss — and an exact hit must outrank every fuzzy name match, which is what
 * the score below is scaled to do.
 */

/** Trimmed, upper-cased, leading zeros dropped. Null when nothing significant is left. */
export function normaliseVendorCode(value: unknown): string | null {
  const s = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^0+/, '');
  return s.length ? s : null;
}

/**
 * How well a query identifies this vendor code. 0 is no match.
 *
 * An exact match scores above anything `matchScore` can return for a name, so pasting a code
 * puts that vendor first rather than behind a supplier whose name happens to score well. A
 * partial match needs at least four significant characters: fewer would make `1` match most of
 * the register, which is noise rather than a result.
 */
export function vendorCodeScore(query: string, code: string): number {
  const q = normaliseVendorCode(query);
  const c = normaliseVendorCode(code);
  if (!q || !c) return 0;
  if (q === c) return 10;
  if (q.length >= 4 && c.includes(q)) return 1.5;
  return 0;
}
