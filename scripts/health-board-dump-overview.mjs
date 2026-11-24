#!/usr/bin/env node
/**
 * Dump the Health Board overview for every year and country, as the board computes it, to JSON.
 * Used to reconcile the native board against the Power BI report cell by cell.
 *
 *   node --env-file=.env --env-file-if-exists=.env.local scripts/health-board-dump-overview.mjs --out=<file.json>
 *
 * Reads all_kpis directly and runs the board's own calc (src/lib/health-board/calc.ts via jiti),
 * so what it writes is exactly what the page would show.
 */
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { createJiti } from 'jiti';
import { credentials } from '../database/migrations/databases.mjs';

const jiti = createJiti(import.meta.url);
const { buildOverview } = await jiti.import('../src/lib/health-board/calc.ts');
const { COUNTRIES } = await jiti.import('../src/lib/health-board/definitions.ts');

const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
if (!OUT) {
  console.error('Usage: --out=<file.json>');
  process.exit(2);
}

const client = new pg.Client({
  ...credentials('sourceguide'),
  database: process.env.ALL_KPIS_DB_NAME || 'all_kpis',
});
await client.connect();
const { rows } = await client.query(
  'SELECT kpi, year, period, country, value::text AS value, target_words, category FROM kpi_values',
);
await client.end();

const values = rows.map((r) => ({
  kpi: r.kpi,
  year: r.year,
  period: r.period,
  country: r.country,
  value: r.value === null ? null : Number(r.value),
  targetWords: r.target_words,
  category: r.category,
}));
const years = [...new Set(values.map((v) => v.year))].sort();
const result = {};
for (const year of years) {
  result[year] = {};
  for (const country of COUNTRIES) {
    const o = buildOverview(values, year, country);
    result[year][country] = {
      months: o.months,
      rows: o.groups.flatMap((g) =>
        g.rows.map((r) => ({
          category: g.category,
          kpi: r.kpi.code,
          name: r.kpi.name,
          baseline: r.baseline,
          target: r.target,
          targetWords: r.targetWords,
          months: r.months,
          ytd: r.ytd,
          status: r.status,
        })),
      ),
    };
  }
}
writeFileSync(OUT, JSON.stringify(result));
console.log(`Wrote ${OUT}: ${years.join(', ')} × ${COUNTRIES.length} countries`);
