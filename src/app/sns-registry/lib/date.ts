const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The one business timezone the registry keeps its calendar in.
 *
 * Dates on a record are compliance facts: the issue date, the expiry date, the
 * audit-trail entry dates, and the year embedded in the immutable Registry ID.
 * They must not depend on where the code happens to run — the server is UTC on
 * Vercel, the browser is whatever the user's laptop says. Both sides call the
 * helpers below, so a sign-off at 01:00 Gulf time stamps the same calendar day
 * on the server, in the browser, and in the Registry ID.
 */
export const BUSINESS_TZ = 'Asia/Riyadh';

/* Fixed zone, so the formatter can be built once and reused. */
const BUSINESS_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in the business timezone, as `YYYY-MM-DD`. */
export function todayISO(): string {
  const parts = BUSINESS_DATE_FMT.formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Business-timezone "today", as a date with no time component.
 *
 * Deliberately not a module-level constant: the tool runs long enough that a
 * cached anchor would drift, and expiry countdowns are the whole point of the
 * Expiry & Review screen.
 */
export function today(): Date {
  return parseISODate(todayISO());
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

export function toISODate(d: Date): string {
  // Format using local date parts, not toISOString() (which converts to UTC
  // and rolls the date back by one for any positive-UTC-offset timezone —
  // including NESR's Gulf-region offices — since parseISODate below
  // reconstructs the date as local-time midnight).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

export function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = parseISODate(s);
  return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

export function daysFromToday(s: string): number {
  return Math.round((parseISODate(s).getTime() - today().getTime()) / 86400000);
}
