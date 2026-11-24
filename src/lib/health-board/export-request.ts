/*
 * Turning an export request (?view=overview|compare|kpi&year=&country=&kpi=) into a workbook.
 * Shared by the real route (admin-gated) and the dev preview's route. Server-side only.
 */

import { buildComparison, buildDetail, buildOverview } from './calc';
import { COUNTRIES, kpiByCode, type Country } from './definitions';
import { comparisonWorkbook, detailWorkbook, overviewWorkbook } from './export';
import { KPI_PAGES, kpiCodeForSlug } from './pages';
import { loadYearValues, loadYears } from './queries';

export async function exportWorkbook(
  params: URLSearchParams,
): Promise<{ fileName: string; body: Buffer } | null> {
  const years = await loadYears();
  if (!years.length) return null;
  const year = years.includes(Number(params.get('year'))) ? Number(params.get('year')) : years[0];
  const raw = params.get('country') ?? '';
  const country: Country = (COUNTRIES as readonly string[]).includes(raw)
    ? (raw as Country)
    : 'Global';
  const code = kpiCodeForSlug(params.get('kpi') ?? '');
  const kpi = code ? kpiByCode(code) : undefined;
  const values = await loadYearValues(year);
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

  switch (params.get('view')) {
    case 'compare': {
      if (!kpi) return null;
      return {
        fileName: `health-board-${year}-${KPI_PAGES[kpi.code].slug}-all-countries.xlsx`,
        body: await comparisonWorkbook(buildComparison(values, year, kpi)),
      };
    }
    case 'kpi': {
      if (!kpi) return null;
      const prior = years.includes(year - 1) ? await loadYearValues(year - 1) : null;
      return {
        fileName: `health-board-${year}-${KPI_PAGES[kpi.code].slug}-${safe(country)}.xlsx`,
        body: await detailWorkbook(
          buildDetail(values, year, country, kpi),
          prior ? buildDetail(prior, year - 1, country, kpi) : null,
        ),
      };
    }
    default:
      return {
        fileName: `health-board-${year}-${safe(country)}.xlsx`,
        body: await overviewWorkbook(buildOverview(values, year, country)),
      };
  }
}
