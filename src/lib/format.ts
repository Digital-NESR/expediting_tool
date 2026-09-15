/**
 * Shared display formatters.
 *
 * These used to be re-implemented per-file, and had drifted: the `Intl`-based
 * spellings render September as "Sept" (4 letters) while the hand-rolled month
 * array renders "Sep". The hand-rolled array is the canonical rendering here —
 * it was the majority spelling and it keeps every month to three letters, which
 * is what the tabular layouts were sized for.
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
