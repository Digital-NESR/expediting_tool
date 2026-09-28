/**
 * The currencies the supplier workbook offers.
 *
 * A plain module with no imports, so the list has one definition and the workbook builder and any
 * later reader cannot drift apart on it.
 *
 * Currency used to be free text held to three characters, which accepts `XYZ` as readily as `SAR`
 * and does nothing about a supplier who writes `Riyal` or `Dhs`. A list stops the typo at the cell
 * rather than leaving it to be guessed at months later, when the only person who knows what was
 * meant has moved on.
 *
 * Ordered by how often NESR is actually invoiced in them rather than alphabetically: a dropdown is
 * scrolled, and the codes a supplier in this region needs should be at the top of it. USD first,
 * then the GCC, then the wider region, then the currencies NESR's overseas suppliers bill in.
 *
 * Deliberately not exhaustive. The rule is a warning and blanks are allowed, so a supplier billing
 * in something not listed can still type it: a hard stop on a statement someone is trying to
 * return is worse than a code we have to look at afterwards.
 */

export interface CurrencyOption {
  code: string;
  name: string;
}

export const WORKBOOK_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Pound Sterling' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'ZAR', name: 'South African Rand' },
] as const;

export const CURRENCY_CODES: readonly string[] = WORKBOOK_CURRENCIES.map((c) => c.code);

/**
 * Excel's inline list, which is a quoted comma-separated string and not a range.
 *
 * Excel refuses an inline list longer than 255 characters, and refuses it by dropping the
 * validation rather than by complaining, so the workbook would look correct and simply have no
 * dropdown. Checked here instead of discovered by a supplier.
 */
export const CURRENCY_LIST_FORMULA = `"${CURRENCY_CODES.join(',')}"`;

export const CURRENCY_LIST_FITS_EXCEL = CURRENCY_LIST_FORMULA.length <= 255;
