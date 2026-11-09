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
 * WHAT STAYS AMBIGUOUS. A lone separator before exactly three digits -- `1,234` or `332.235` --
 * is genuinely both readings, and no rule in the cell settles it. Each character then falls back
 * to the convention that uses IT as the decimal point: a lone comma groups, a lone dot is a
 * decimal. That is also what the old reader did with both, so this rule cannot make a cell that
 * was right before wrong now. Reading a lone dot as grouping instead -- which an earlier version
 * of this file did -- inflates 116 cells across the stored statements by a thousand, every one
 * of them a three-decimal currency (OMR, KWD and BHD all carry three).
 */

/** Spaces Excel groups digits with, including the narrow no-break space French locales emit. */
const GROUPING_SPACE_CLASS = '\\s\\u00A0\\u202F\\u2007\\u2009';

/** A digit, then a grouping space, then exactly three digits: `6 264`. */
const SPACE_GROUPED = new RegExp(`\\d[${GROUPING_SPACE_CLASS}]\\d{3}(?!\\d)`);
const GROUPING_SPACES = new RegExp(`[${GROUPING_SPACE_CLASS}]`, 'g');

/** The numeric core: digits, with grouping spaces, dots and commas allowed between them. */
const NUMERIC_CORE = new RegExp(`\\d(?:[\\d.,${GROUPING_SPACE_CLASS}]*\\d)?`);

/**
 * What may sit beside an amount: a currency marker, optionally bracketed, optionally after a
 * one-word label. Nothing else.
 *
 * Strict about punctuation on purpose. Allowing a stray hyphen read `INV-000787` as -787, and
 * allowing a dot read the purchase-order number `4170015974...` as an amount. Both are in the
 * live data and both were silently wrong before.
 *
 * The length is what separates a label from a sentence, and it is drawn from the live data
 * rather than guessed: `Total    AED 3,022.11` and `1104(USD)` are real statement rows carrying
 * real amounts, leaving `TotalAED` and `(USD)`, while the prose this must still refuse leaves
 * `MonthlyRentalEquipmentsMonthofJuly` (34) and `TotalInvoicesCompleteddays` (26). Ten admits
 * the first pair and nothing near the second.
 */
const CURRENCY_MARKER = /^[()A-Za-z$€£¥₹]{0,10}$/;

/**
 * Read the "invoice outstanding days" column, which is a count and not an amount.
 *
 * It needs its own reader because the two columns fail in opposite directions. Suppliers write
 * the unit out -- `74 DAYS OUTSTANDING`, `14 DAYS REMAINING` -- and 74 is the real answer, so
 * the amount reader's short-label rule throws away a good value. Others put a due date in the
 * column, and `20/09/2026` must not become 20,092,026 days, which is what deleting the slashes
 * used to produce.
 *
 * A count, optionally followed by its unit, and nothing else.
 */
export function parseDayCount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  /* One number, with words allowed on either side of it and nothing else. All of these are real
     cells: `74 DAYS OUTSTANDING`, `40 overdue`, `More than 365`, `10-`, and the output of a
     supplier's own formula, `83 days have passed since the due date`.

     The labels are any run of letters rather than a list of expected words, and generously
     sized, because the column heading already supplies the unit and suppliers phrase it however
     they like -- a sentence around the number is still a count.

     Two things carry the weight of refusing what is not a count. Letters only keeps dates out:
     `20/09/2026` has separators no part of the pattern admits, so it reads as null rather than
     20,092,026 days. And five digits keeps amounts out: a formula pointing at the wrong column
     yields 11,377,500, which is not a number of days under any reading.

     The fractional part is not decoration either -- this column is often a formula subtracting
     two dates, so its result arrives as 40.000000000349 or 462.75. */
  const text = raw.trim();
  const trailingMinus = /-\s*$/.test(text);
  const body = trailingMinus ? text.replace(/-\s*$/, '').trim() : text;
  const m = /^([A-Za-z\s]{0,48}?)(-?\d{1,5}(?:\.\d+)?)([A-Za-z\s]{0,48})$/.exec(body);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return Math.round(trailingMinus && n > 0 ? -n : n);
}

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
      /* Genuinely both readings, and nothing in the cell settles it -- so fall back to what the
         separator means in the convention that uses it as a decimal point. A lone dot reads as
         a decimal (`332.235` is an Omani tax amount, not 332 thousand) and a lone comma reads as
         grouping (`1,234`). This is also exactly what the old reader did for both characters,
         so no cell that was right before becomes wrong now.

         Measured on the stored statements: reading a lone dot as grouping instead would inflate
         116 cells by a thousand, all of them three-decimal currencies -- OMR, KWD and BHD all
         carry three. */
      ambiguous = true;
      normalised = digits.includes(',') ? parts.join('') : parts.join('.');
    }
  } else {
    normalised = parts.join('.');
  }

  const n = Number(normalised);
  if (!Number.isFinite(n)) return refuse('not a number');
  return { value: negative && n > 0 ? -n : n, ambiguous, reason: null };
}
