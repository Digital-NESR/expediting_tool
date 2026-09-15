/**
 * Shared display formatters.
 *
 * These used to be re-implemented per-file, and had drifted: the `Intl`-based
 * spellings render September as "Sept" (4 letters) while the hand-rolled month
 * array renders "Sep". The hand-rolled array is the canonical rendering here —
 * it was the majority spelling and it keeps every month to three letters, which
 * is what the tabular layouts were sized for.
 *
 * As of 15 Sep 2026 every short-month date in the app comes from this file. Twenty call sites
 * across seventeen files used to spell it themselves through `toLocaleDateString`, so the same
 * date read "15 Sept 2026" on one screen and "15 Sep 2026" on the next.
 *
 * Two further reasons not to go back to `Intl` for this, beyond consistency. The abbreviation
 * is a property of the installed ICU data, not of the code: "Sept" is what CLDR 42 and later
 * give for en-GB, so the app's output changed under users when Node and the browsers updated,
 * and it can differ between the server render and the client one, which is a hydration
 * mismatch waiting to happen. A fixed table has neither problem.
 *
 * The `short*` helpers below take a Date and return a string, with no opinion about empty input.
 * That is deliberate: the callers disagree about what a missing date should look like — an em
 * dash, a hyphen, an empty string, or the raw value echoed back — and each of them keeps its
 * own answer.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const EM_DASH = '—';

/** `05 Sep 2026`. Empty/unparseable input renders an em dash / the raw string. */
export function formatDate(raw: string | null | undefined): string {
  if (!raw) return EM_DASH;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `05 Sep 2026 14:30` — local time, 24h. */
export function formatSessionDate(raw: string | null | undefined): string {
  if (!raw) return EM_DASH;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${time}`;
}

/** `05 Sep` — used for the weekly chart axis, where the year would not fit. */
export function formatWeek(raw: string | null | undefined): string {
  if (!raw) return EM_DASH;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

/**
 * `$1,234` — whole dollars. The analytics surfaces have always rounded; the
 * cent-level spelling lives on the PO line pages and is not this function.
 */
export function formatCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return EM_DASH;
  const n = Number(val);
  if (Number.isNaN(n)) return EM_DASH;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * A blank SAP MAT ID means the line is a service line rather than a material,
 * so it renders the account-classification description instead (falling back to
 * the literal `Service` when no classification is carried on the row).
 */
export function formatMatId(matId: string | null | undefined, accountType?: string | null): string {
  if (matId?.trim()) return matId;
  return accountType?.trim() || 'Service';
}

/* ─── Primitives ─────────────────────────────────────────────────────────────
   Take a valid Date, return the spelling. The caller handles null, unparseable input and its
   own fallback; these never throw and never guess.
   ─────────────────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** `15 Sep 2026` */
export function shortDate(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `15 Sep 2026` from the UTC parts, for exports that deliberately ignore the viewer's zone. */
export function shortDateUTC(d: Date): string {
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `15 Sep 2026, 14:05` — the comma is what `toLocaleString` produced, so it stays. */
export function shortDateTime(d: Date): string {
  return `${shortDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `15 Sep` */
export function shortDayMonth(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
}

/** `Tue, 15 Sep 2026` */
export function shortWeekdayDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${shortDate(d)}`;
}

/** `14:05`, 24-hour. */
export function shortTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `Sep 26` by default, `Sep 2026` with `fullYear`. */
export function shortMonthYear(d: Date, fullYear = false): string {
  const year = fullYear ? d.getFullYear() : pad(d.getFullYear() % 100);
  return `${MONTHS[d.getMonth()]} ${year}`;
}
