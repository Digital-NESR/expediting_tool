/**
 * How many decimals a statement currency actually has.
 *
 * Six of the currencies suppliers invoice NESR in divide into thousandths, not hundredths: a
 * Kuwaiti dinar is 1000 fils. Rounding those to the cent -- which this tool did until migration
 * 023, and which the line table still displayed at two places -- misstates better than one line
 * in six, concentrated in Oman, Kuwait and Libya.
 *
 * Kept here rather than imported from `catalog-manager-utils`, which has its own currency table:
 * that is a different tool's master data, loaded from its own database, and SOA should not start
 * depending on it to render a number. Kept out of `parse-amount.ts` too -- reading a number and
 * presenting it are different jobs, and the parser is deliberately dependency-free.
 *
 * Pure and dependency-free for the same reason as the parser:
 * `scripts/soa-renormalize-amounts.mjs` imports it through Node's type stripping.
 */

/** ISO codes whose minor unit is a thousandth. */
const THREE_DECIMAL = new Set(['KWD', 'OMR', 'BHD', 'IQD', 'JOD', 'LYD', 'TND']);

/**
 * What suppliers write instead of the ISO code.
 *
 * The `currency` column is whatever was typed into the spreadsheet, so it holds `SAUDI RIYAL`,
 * `SR` and `LE` alongside real codes. Only the spellings that resolve to a three-decimal currency
 * matter here -- everything unrecognised falls through to two, which is the safe default and what
 * the column did before.
 */
const ALIASES: Record<string, string> = {
  'KUWAITI DINAR': 'KWD',
  'KUWAIT DINAR': 'KWD',
  KD: 'KWD',
  'OMANI RIAL': 'OMR',
  'OMANI RIYAL': 'OMR',
  RO: 'OMR',
  'BAHRAINI DINAR': 'BHD',
  BD: 'BHD',
  'IRAQI DINAR': 'IQD',
  'JORDANIAN DINAR': 'JOD',
  JD: 'JOD',
  'LIBYAN DINAR': 'LYD',
  LD: 'LYD',
  'TUNISIAN DINAR': 'TND',
};

/** The decimal places `code` is quoted in. Two unless the currency is one of the thousandths. */
export function statementCurrencyDecimals(code: string | null | undefined): number {
  const key = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!key) return 2;
  return THREE_DECIMAL.has(ALIASES[key] ?? key) ? 3 : 2;
}
