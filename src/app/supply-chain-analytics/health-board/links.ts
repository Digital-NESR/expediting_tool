import type { Country } from '@/lib/health-board/definitions';
import { KPI_PAGES } from '@/lib/health-board/pages';

/* Where the Health Board's links go. `base` lets the dev preview link to its own copies. */

export const HEALTH_BOARD = '/supply-chain-analytics/health-board';

const query = (year: number, country: Country) =>
  new URLSearchParams({ year: String(year), country }).toString();

export function overviewHref(year: number, country: Country, base = HEALTH_BOARD): string {
  return `${base}?${query(year, country)}`;
}

/** A KPI's detail page, or null for a KPI without one (Supplier QBR). */
export function detailHref(
  kpiCode: string,
  year: number,
  country: Country,
  base = HEALTH_BOARD,
): string | null {
  const page = KPI_PAGES[kpiCode];
  return page ? `${base}/${page.slug}?${query(year, country)}` : null;
}

/** The country comparison for one KPI and year. */
export function compareHref(
  kpiCode: string,
  year: number,
  base = HEALTH_BOARD,
  sort: string = 'country',
): string {
  const slug = KPI_PAGES[kpiCode]?.slug ?? 'pl-pc-pr';
  const q = new URLSearchParams({ kpi: slug, year: String(year) });
  if (sort !== 'country') q.set('sort', sort);
  return `${base}/compare?${q.toString()}`;
}

/** The Read Me (and KPI index). */
export function readMeHref(base = HEALTH_BOARD): string {
  return `${base}/read-me`;
}
