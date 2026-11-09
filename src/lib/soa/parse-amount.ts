/**
 * Read a money amount out of the text a supplier typed into a statement cell.
 *
 * Pure, and deliberately dependency-free: `scripts/soa-renormalize-amounts.mjs` imports this
 * exact file through Node's type stripping, so the backfill over stored workbooks cannot drift
 * from what the app does to a new upload. Keep it free of imports and of TypeScript features
 * that survive into runtime (enums, namespaces, decorators), or that script stops working.
 *
 * WHY THIS EXISTS. The previous reading was one line -- strip everything that is not a digit,
 * dot or minus, then delete every comma -- on the stated assumption that "a comma is a thousands
 * separator here; a decimal comma would need the locale, which a spreadsheet cell does not
 * carry". Algeria and Kuwait send statements in the French convention, where the comma IS the
 * decimal point, so `6 264 791,08` was being stored as 626,479,108: a hundred times the real
 * balance. SARL SAKER AMN is the vendor that surfaced it.
 *
 * The locale is not needed. The digits themselves say which convention is in use, provided the
 * reader is willing to refuse a cell it cannot resolve.
 *
 * TWO RULES DO THE WORK
 *
 *   SHAPE. The cell must contain exactly one number, optionally beside a short currency marker.
 *   A second number, or more than a few characters of text, means this is not an amount. The old
 *   reader extracted digits from anything, so `Monthly Rental Equipments Month of July 2026`
 *   became 2026 and `4100005767; Dt: 14/01/2026` became 410000576714012000 -- both silently
 *   added to a vendor's balance. Returning null puts an issue on the line instead, which is what
 *   the caller already does for an unreadable date.
 *
 *   GROUPING. A separator only groups thousands if the digits actually group that way: one to
 *   three digits before the first separator, exactly three after each. `4170015974.000` cannot
 *   group, so its dot is a decimal point. `31.07.2026` cannot group either and has no
 *   single-decimal reading, so it is refused rather than guessed at.
 *
 * WHAT STAYS AMBIGUOUS. A lone separator before exactly three digits -- `1,234` -- is genuinely
 * both readings, and no rule settles it. It is read as grouping, which is the commoner intent
 * and matches the old behaviour, and flagged so a caller can surface it. Across the 1,071 stored
 * workbooks this case arises four times and every one of them reads the same either way.
 */

/** Spaces Excel groups digits with, including the narrow no-break space French locales emit. */
const GROUPING_SPACE_CLASS = '\\s\\u00A0\\u202F\\u2007\\u2009';

/** A digit, then a grouping space, then exactly three digits: `6 264`. */
const SPACE_GROUPED = new RegExp(`\\d[${GROUPING_SPACE_CLASS}]\\d{3}(?!\\d)`);
const GROUPING_SPACES = new RegExp(`[${GROUPING_SPACE_CLASS}]`, 'g');

/** The numeric core: digits, with grouping spaces, dots and commas allowed between them. */
const NUMERIC_CORE = new RegExp(`\\d(?:[\\d.,${GROUPING_SPACE_CLASS}]*\\d)?`);

/**
 * What may sit beside an amount: a currency symbol or a short code, and nothing else.
 *
 * Strict about punctuation on purpose. Allowing a stray hyphen read `INV-000787` as -787, and
 * allowing a dot read the purchase-order number `4170015974...` as an amount. Both are in the
 * live data and both are silently wrong today.
 */
const CURRENCY_MARKER = /^[A-Za-z$€£¥₹]{0,4}$/;

export interface AmountReading {
  /** The amount, or null when the cell does not hold one. */
  value: number | null;
  /** True when a decimal reading was equally possible and grouping was assumed. */
  ambiguous: boolean;
  /** Why it was refused, for logging. Null on success. */
  reason: string | null;
}

const refuse = (reason: string): AmountReading => ({ value: null, ambiguous: false, reason });

/** True when these parts group as thousands: 1-3 digits first, exactly 3 after each separator. */
function groupsCleanly(parts: string[]): boolean {
  return (
    parts.length > 1 &&
    parts[0].length >= 1 &&
    parts[0].length <= 3 &&
    parts.slice(1).every((p) => p.length === 3)
  );
}

export function parseAmountText(raw: string): AmountReading {
  const trimmed = String(raw).trim();
  if (!trimmed) return refuse('empty');

  // Accounting parentheses, a trailing minus and a leading minus all mean the same thing.
  const parenthesised = /^\(.*\)$/.test(trimmed);
  let text = parenthesised ? trimmed.slice(1, -1).trim() : trimmed;
  const trailingMinus = /-\s*$/.test(text);
  if (trailingMinus) text = text.replace(/-\s*$/, '').trim();
  const leadingMinus = text.startsWith('-');
  if (leadingMinus) text = text.slice(1).trim();
  const negative = parenthesised || trailingMinus || leadingMinus;

  const match = NUMERIC_CORE.exec(text);
  if (!match) return refuse('no digits');
  const core = match[0];

  const surrounding = (text.slice(0, match.index) + text.slice(match.index + core.length)).replace(
    /\s/g,
    '',
  );
  if (/\d/.test(surrounding)) return refuse('more than one number');
  if (!CURRENCY_MARKER.test(surrounding)) return refuse('text, not an amount');

  const spaceGrouped = SPACE_GROUPED.test(core);
  const digits = core.replace(GROUPING_SPACES, '');
  const parts = digits.split(/[.,]/);
  const separators = digits.match(/[.,]/g) ?? [];

  let normalised: string;
  let ambiguous = false;

  if (separators.length === 0) {
    normalised = digits;
  } else if (new Set(separators).size === 2) {
    // Both a dot and a comma appear: the rightmost is the decimal point, the other groups.
    const decimalAt = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
    const groupChar = digits[decimalAt] === '.' ? ',' : '.';
    const head = digits.slice(0, decimalAt);
    if (!groupsCleanly(head.split(groupChar))) return refuse('separators do not group');
    normalised = head.split(groupChar).join('') + '.' + digits.slice(decimalAt + 1);
  } else if (separators.length > 1) {
    // The same separator repeated can only be grouping -- `1.234.567` has no decimal reading.
    if (!groupsCleanly(parts)) return refuse('separators do not group');
    normalised = parts.join('');
  } else if (parts[1].length === 3 && groupsCleanly(parts)) {
    if (spaceGrouped) {
      // Spaces already did the grouping, so this separator must be the decimal point:
      // `6 264 791,08` is unambiguous once the spaces are read.
      normalised = parts.join('.');
    } else {
      ambiguous = true;
      normalised = parts.join('');
    }
  } else {
    normalised = parts.join('.');
  }

  const n = Number(normalised);
  if (!Number.isFinite(n)) return refuse('not a number');
  return { value: negative && n > 0 ? -n : n, ambiguous, reason: null };
}
