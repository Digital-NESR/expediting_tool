/*
 * The TI-TE brand green — the header badge, the selected tab and the primary
 * buttons.
 *
 * SourceGuide keeps its equivalent as `SG_BRAND` in
 * `src/app/sourceguide/constants.ts`; TI-TE never had one, so the hex is spelled
 * out at every use site across the tool and a rebrand would mean a
 * find-and-replace. This constant only reaches as far as the help pages that
 * import it — `src/lib/tite-constants.ts` would be the natural home, but that
 * file is outside these pages' remit, so the rest of the TI-TE files still carry
 * the literal.
 */
export const TITE_BRAND = '#006B0C';
