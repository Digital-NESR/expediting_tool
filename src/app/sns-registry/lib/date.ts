const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Local midnight for "now". Deliberately not a module-level constant: the tool
 * runs long enough that a cached anchor would drift, and expiry countdowns are
 * the whole point of the Expiry & Review screen.
 */
export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
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
