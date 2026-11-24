/*
 * Reading KPI rows from a grid of cells (a CSV or a sheet), for the initial load and for every
 * /admin upload. Nothing is guessed: a row whose KPI, country, period, year or number cannot be
 * read exactly is rejected with the reason, and the admin fixes the file.
 */

import {
  QUARTER_MONTHS,
  isMonth,
  kpiByCode,
  normaliseCategory,
  normaliseCountry,
  normalisePeriod,
  type Country,
  type Period,
} from './definitions';

/** The columns of the SharePoint "All KPIs" export, which is also the upload format. */
export const UPLOAD_COLUMNS = [
  'Country',
  'Value',
  'Month',
  'Year',
  'KPI',
  'Category',
  'Unit',
  'Target words',
] as const;

export interface ParsedRow {
  /** 1-based line in the file, for messages. */
  line: number;
  kpi: string;
  year: number;
  period: Period;
  country: Country;
  countryRaw: string;
  value: number | null;
  /** The value as written, without thousands separators: stored as-is so no digit is lost. */
  valueText: string | null;
  targetWords: string | null;
  category: string;
  unit: string;
  /** The source list's ID column, when the file has one. */
  sourceRef: string | null;
}

export interface Problem {
  line: number;
  severity: 'reject' | 'warn';
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  problems: Problem[];
}

export function rowKey(r: { kpi: string; year: number; period: string; country: string }): string {
  return `${r.kpi}|${r.year}|${r.period}|${r.country}`;
}

/**
 * A number as the source list writes it: optional minus, optional thousands separators, optional
 * decimals. "1,239" is 1239. Anything else (text, "12%", "1.2.3") is not a number.
 */
export function parseNumber(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(s)) return 'invalid';
  return Number(s.replace(/,/g, ''));
}

function headerIndex(grid: string[][]): number {
  return grid.findIndex((row) => {
    const cells = row.map((c) => c.trim().toLowerCase());
    return cells.includes('country') && cells.includes('value') && cells.includes('kpi');
  });
}

/**
 * @param duplicates 'reject' for an upload (the same cell twice in one file is a mistake);
 *   'keep-all' for the initial load, which resolves duplicates itself by modified date.
 */
export function parseKpiGrid(
  grid: string[][],
  options: { duplicates: 'reject' | 'keep-all' } = { duplicates: 'reject' },
): ParseResult {
  const problems: Problem[] = [];
  const rows: ParsedRow[] = [];

  const h = headerIndex(grid);
  if (h < 0) {
    return {
      rows,
      problems: [
        {
          line: 0,
          severity: 'reject',
          message: `No header row found. The file needs the columns ${UPLOAD_COLUMNS.join(', ')}.`,
        },
      ],
    };
  }
  const header = grid[h].map((c) => c.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const missing = UPLOAD_COLUMNS.filter((c) => col(c) < 0);
  if (missing.length) {
    return {
      rows,
      problems: [
        { line: h + 1, severity: 'reject', message: `Missing column(s): ${missing.join(', ')}.` },
      ],
    };
  }
  const idCol = col('ID');

  for (let i = h + 1; i < grid.length; i++) {
    const line = i + 1;
    const cells = grid[i];
    const get = (name: string) => (cells[col(name)] ?? '').trim();
    if (cells.every((c) => c.trim() === '')) continue;
    const reject = (message: string) => problems.push({ line, severity: 'reject', message });

    const kpiRaw = get('KPI');
    const kpi = kpiByCode(kpiRaw);
    if (!kpi) {
      reject(`Unknown KPI "${kpiRaw}".`);
      continue;
    }
    const countryRaw = cells[col('Country')] ?? '';
    const country = normaliseCountry(countryRaw);
    if (!country) {
      reject(`Unknown country "${countryRaw.trim()}".`);
      continue;
    }
    const period = normalisePeriod(get('Month'));
    if (!period) {
      reject(`Unknown month "${get('Month')}". Use Baseline, Target, YTD or a month name.`);
      continue;
    }
    const yearText = get('Year');
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
    if (!(year >= 2000 && year <= 2100)) {
      reject(`Year "${yearText}" is not a year.`);
      continue;
    }
    if (kpi.discontinuedFrom !== undefined && year >= kpi.discontinuedFrom) {
      reject(`${kpi.name} was discontinued from ${kpi.discontinuedFrom}.`);
      continue;
    }
    const value = parseNumber(get('Value'));
    if (value === 'invalid') {
      reject(`Value "${get('Value')}" is not a number.`);
      continue;
    }
    const category = normaliseCategory(get('Category'));
    if (!category) {
      reject('Category is empty.');
      continue;
    }
    if (kpi.frequency === 'quarterly' && isMonth(period) && !QUARTER_MONTHS.includes(period)) {
      reject(
        `${kpi.name} is quarterly; it takes values in March, June, September and December only.`,
      );
      continue;
    }
    if (period === 'YTD' && kpi.ytd !== 'entered') {
      reject(`${kpi.name} has a calculated YTD; only the P&L KPIs take an uploaded YTD row.`);
      continue;
    }
    const unit = get('Unit');
    if (unit && unit !== kpi.unit) {
      problems.push({
        line,
        severity: 'warn',
        message: `Unit "${unit}" for ${kpi.name}; the board shows ${kpi.unit}.`,
      });
    }

    rows.push({
      line,
      kpi: kpi.code,
      year,
      period,
      country,
      countryRaw: countryRaw.trim(),
      value,
      valueText: value === null ? null : get('Value').replace(/,/g, ''),
      targetWords: get('Target words') || null,
      category,
      unit: kpi.unit,
      sourceRef: idCol >= 0 ? (cells[idCol] ?? '').trim() || null : null,
    });
  }

  if (options.duplicates === 'reject') {
    /* Both copies are rejected: with two values for one cell there is no telling which is right. */
    const lines = new Map<string, number[]>();
    for (const r of rows) lines.set(rowKey(r), [...(lines.get(rowKey(r)) ?? []), r.line]);
    const dupes = new Set<number>();
    for (const ls of lines.values()) {
      if (ls.length < 2) continue;
      for (const l of ls) {
        dupes.add(l);
        problems.push({
          line: l,
          severity: 'reject',
          message: `The same KPI, country, month and year appears on lines ${ls.join(', ')}.`,
        });
      }
    }
    return { rows: rows.filter((r) => !dupes.has(r.line)), problems };
  }
  return { rows, problems };
}
