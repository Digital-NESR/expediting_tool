/* The dashboard's own formatters. Pure, no JSX, no React: that is what lets them be unit
   tested, which they could not be while they sat inside a 2,300-line component file.

   Deliberately NOT the shared ones in '@/lib/format': those round currency to whole dollars
   for the analytics surfaces, and this screen has always shown cents on a PO line. formatMatId
   also differs, returning a styled node with an 'N/A' fallback rather than a plain string.
   Unifying them would change what buyers see, so the two stay apart on purpose. */

import { shortDate, shortDateTime } from '@/lib/format';

export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return shortDate(d);
}

/** A timestamp with the time on it: "05 Oct 2026, 06:04". For when SAP data last landed, where
 *  the date alone would not tell a buyer whether this morning's load has run. */
export function formatDateTime(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return shortDateTime(d);
}

export function formatCurrency(raw: number | string | null | undefined): string {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === '' || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * The same amount, short enough for a phone: "$118.4M".
 *
 * The KPI cards are two to a row under 640px, which leaves about 106px of usable width, and
 * `formatCurrency` shows cents -- so a real total renders as "$118,409,052.18" and needs
 * roughly 240px. It overflowed its card and clipped into the neighbour. No font size that
 * still reads as a KPI closes a gap that wide, so the number itself has to get shorter.
 *
 * One decimal, which keeps the figure meaningful (118.4M, not 118M) while staying under eight
 * characters. Below a thousand there is nothing to abbreviate and Intl leaves it alone, so a
 * small country's total still reads exactly.
 *
 * This is a DISPLAY form for narrow screens only; the card shows the full value from 640px up,
 * the table below it is unrounded, and the Excel export carries the exact figure. Nothing
 * downstream reads this string.
 */
export function formatCurrencyCompact(raw: number | string | null | undefined): string {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === '' || isNaN(n)) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    /* minimum 0 is doing real work: compact notation otherwise pads to the maximum, and a
       country whose total is under a thousand rendered as "$950.0", which reads as a
       truncation rather than as the exact figure it is. */
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

export function daysDiff(raw: string | null | undefined): number {
  if (!raw) return 0;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 0;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isNaN(da) && !isNaN(db)) return da - db;
  return a.localeCompare(b);
}
