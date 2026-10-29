/**
 * What a purchase requisition number is, and how a field holding several of them is read.
 *
 * One definition, used by the form that refuses to submit and by the server action that refuses
 * to store. The form's copy is the courtesy; the action's is the guard, because every export of a
 * `'use server'` file is a public POST endpoint and a browser is not where a rule is enforced.
 *
 * WHY THIS EXISTS. The field was free text, and 110 adhoc requests have been filed through it. 99
 * carry a clean ten-digit number. The rest carry `NA`, `n/a`, `0`, `07-2026`, `PR 1010010287`,
 * `1005034844/1005035231/1005034844` (the same PR twice) and `WL truck from Algeria to Saudi |
 * NESR-FAT-521`. Each of those reaches an approver's inbox as the reference they are meant to
 * look up in SAP.
 *
 * TEN DIGITS, ANY PREFIX. Every one of the 1,810 PRs in the released-PR feed is exactly ten
 * digits; 1,807 begin `10` and three begin `11`. Adhoc history is 98 beginning `1` and one
 * beginning `5`. Narrowing to a prefix would buy very little and would reject that one real
 * entry, so the rule is the length and the digits.
 *
 * NOT CHECKED AGAINST THE FEED. Only 9 of those 99 adhoc numbers appear in `released_prs`, which
 * holds what RFx Officer has sourced rather than every PR SAP has released. Refusing a number
 * because it is absent would have blocked nine requests in ten. The picker is therefore a
 * convenience and never an authority, and this module deliberately knows nothing about it.
 *
 * HQ DUBAI IS EXEMPT. Its requests do not always carry an SAP requisition, so there the field
 * takes any text and only has to be non-empty. The exemption is by country and by nothing else:
 * it is not a per-user override and not a checkbox a requester can tick, so the only way to reach
 * it is to actually be raising an HQ Dubai request. `usedHqDubaiException` tells a reader after
 * the fact whether a stored value went through the exemption or the ten-digit rule, which is the
 * question an audit asks and which the value alone cannot answer.
 */

/** Ten digits, nothing else. Checked after trimming; see `splitRequisitionInput`. */
export const REQUISITION_PATTERN = /^\d{10}$/;

/**
 * The one country whose requests may carry a free-text requisition.
 *
 * Spelled exactly as `COUNTRY_OPTIONS` spells it, because that is what the form posts and what
 * the column stores. Compared case-insensitively on the trimmed value all the same: a country
 * arriving in a different case would otherwise silently lose the exemption and refuse a
 * perfectly good HQ Dubai request.
 */
export const FREE_TEXT_REQUISITION_COUNTRY = 'HQ Dubai';

export function allowsFreeTextRequisition(country: string | null | undefined): boolean {
  return (country ?? '').trim().toLowerCase() === FREE_TEXT_REQUISITION_COUNTRY.toLowerCase();
}

/**
 * Everything people have used to put two PRs in one box: comma, semicolon, slash, ampersand,
 * the word "and", a dash with space around it, and plain whitespace.
 *
 * A bare hyphen is NOT a separator. `1010010158-1010010157` splits here only because the dash has
 * spaces in the live data, and treating a tight hyphen as a separator would quietly cut a number
 * that genuinely contained one. Anything this fails to split simply fails validation, which is
 * visible, rather than being split wrongly, which is not.
 */
const SEPARATORS = /[,;/&\n\r\t]+|\s+-\s+|\s+and\s+|\s+/gi;

/** The raw field split into the pieces a reader would call separate numbers. */
export function splitRequisitionInput(raw: string): string[] {
  return raw
    .replace(SEPARATORS, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface RequisitionParse {
  /** Valid numbers, in the order given, with repeats removed. */
  numbers: string[];
  /** Pieces that are not ten digits, in the order given. Empty when the input is clean. */
  invalid: string[];
  /** Numbers the reader typed twice. Not an error; reported so the field can say it tidied up. */
  duplicates: string[];
}

export function parseRequisitionNumbers(raw: string | null | undefined): RequisitionParse {
  const numbers: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const part of splitRequisitionInput(String(raw ?? ''))) {
    if (!REQUISITION_PATTERN.test(part)) {
      /* Reported once however many times it was typed: three copies of the same typo is one
         thing to fix, and listing it three times reads as three problems. */
      if (!invalid.includes(part)) invalid.push(part);
      continue;
    }
    if (seen.has(part)) {
      if (!duplicates.includes(part)) duplicates.push(part);
      continue;
    }
    seen.add(part);
    numbers.push(part);
  }
  return { numbers, invalid, duplicates };
}

/** How several numbers are written back to the single column that holds them. */
export function formatRequisitionNumbers(numbers: readonly string[]): string {
  return numbers.join(', ');
}

/**
 * The message a reader gets, or null when the field is good.
 *
 * Written as the same sentence on both sides so somebody who sees it in a toast after a failed
 * submit recognises the one they saw under the field, rather than wondering whether two different
 * checks disagree.
 */
export function requisitionError(
  raw: string | null | undefined,
  country?: string | null,
): string | null {
  if (allowsFreeTextRequisition(country)) {
    /* Still required, just not a PR number. An empty field is the one thing the exemption does
       not cover: a request with no reference at all is not an exception, it is an omission. */
    return String(raw ?? '').trim()
      ? null
      : 'A requisition reference is required. HQ Dubai accepts free text.';
  }
  const { numbers, invalid } = parseRequisitionNumbers(raw);
  if (invalid.length > 0) {
    const shown = invalid
      .slice(0, 3)
      .map((v) => `"${v}"`)
      .join(', ');
    const more = invalid.length > 3 ? ` and ${invalid.length - 3} more` : '';
    return `${shown}${more} is not a requisition number. A PR is exactly 10 digits, for example 1010010287.`;
  }
  if (numbers.length === 0) {
    return 'At least one requisition number is required. A PR is exactly 10 digits, for example 1010010287.';
  }
  return null;
}

/**
 * The stored form of the field, or a thrown error.
 *
 * Returns the tidied string rather than what was typed, so the column ends up holding one spelling
 * of a list: `1010010287, 1010010288`, whatever arrived.
 */
export function requireRequisitionNumbers(
  raw: string | null | undefined,
  country?: string | null,
): string {
  const message = requisitionError(raw, country);
  if (message) throw new Error(message);
  /* Free text is stored as typed, only trimmed. Running it through the number formatter would
     reorder and comma-join whatever the requester wrote, which for prose is mangling. */
  if (allowsFreeTextRequisition(country)) return String(raw ?? '').trim();
  return formatRequisitionNumbers(parseRequisitionNumbers(raw).numbers);
}

/**
 * Whether a stored value got in through the HQ Dubai exemption rather than the ten-digit rule.
 *
 * Derived rather than stored, because it is a fact about the value and the country and would
 * only go stale as a column. A reader needs it to tell a deliberate free-text reference from a
 * malformed PR number, and the detail screen uses it to label the field honestly.
 */
export function usedHqDubaiException(
  raw: string | null | undefined,
  country: string | null | undefined,
): boolean {
  if (!allowsFreeTextRequisition(country)) return false;
  const value = String(raw ?? '').trim();
  if (!value) return false;
  return parseRequisitionNumbers(value).invalid.length > 0;
}
