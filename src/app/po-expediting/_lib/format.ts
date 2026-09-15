/* The dashboard's own formatters. Pure, no JSX, no React: that is what lets them be unit
   tested, which they could not be while they sat inside a 2,300-line component file.

   Deliberately NOT the shared ones in '@/lib/format': those round currency to whole dollars
   for the analytics surfaces, and this screen has always shown cents on a PO line. formatMatId
   also differs, returning a styled node with an 'N/A' fallback rather than a plain string.
   Unifying them would change what buyers see, so the two stay apart on purpose. */

export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
