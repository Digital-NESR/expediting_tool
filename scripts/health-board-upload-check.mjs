#!/usr/bin/env node
/**
 * Exercise the Health Board upload's real SQL against the real `all_kpis`, then roll it back.
 *
 *   node --env-file=.env --env-file-if-exists=.env.local scripts/health-board-upload-check.mjs
 *
 * Builds a small upload (one new cell, one changed cell, one unchanged cell), runs it through the
 * same parse → diff → applyUpload path the /admin action uses, checks the database says what it
 * should, and ROLLS BACK. Nothing is left behind; the script checks that too.
 */
import pg from 'pg';
import { createJiti } from 'jiti';
import { credentials } from '../database/migrations/databases.mjs';

const jiti = createJiti(import.meta.url);
const { parseKpiGrid } = await jiti.import('../src/lib/health-board/parse.ts');
const { diffUpload } = await jiti.import('../src/lib/health-board/diff.ts');
const { applyUpload, fingerprintOf, storedFor, yearsOf } = await jiti.import(
  '../src/lib/health-board/apply.ts',
);

const client = new pg.Client({
  ...credentials('sourceguide'),
  database: process.env.ALL_KPIS_DB_NAME || 'all_kpis',
});
await client.connect();

const count = async (t) => (await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
const cell = async (kpi, period, country, year) =>
  (
    await client.query(
      'SELECT value::text AS v FROM kpi_values WHERE kpi=$1 AND period=$2 AND country=$3 AND year=$4',
      [kpi, period, country, year],
    )
  ).rows[0]?.v ?? null;

const before = {
  values: await count('kpi_values'),
  loads: await count('kpi_loads'),
  history: await count('kpi_value_history'),
  source: await count('kpi_source_rows'),
};
const dsohJuly = await cell('KPI - DSOH', 'July', 'Global', 2026);
const otdJuly = await cell('KPI - OTD', 'July', 'Global', 2026);

const grid = [
  ['Country', 'Value', 'Month', 'Year', 'KPI', 'Category', 'Unit', 'Target words'],
  ['Global', '50.5', 'September', '2026', 'KPI - OTD', 'Purchasing', '%', ''],
  [
    'Global',
    String(Number(dsohJuly) + 1),
    'July',
    '2026',
    'KPI - DSOH',
    'Materials Management ',
    'Days',
    '',
  ],
  ['Global', otdJuly, 'July', '2026', 'KPI - OTD', 'Purchasing', '%', ''],
];
const parsed = parseKpiGrid(grid);
const fails = [];
const expect = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};
expect(parsed.problems.length === 0, 'the test file parses with no problems');
const diff = diffUpload(parsed.rows, await storedFor(client, yearsOf(parsed.rows)));
expect(
  diff.added.length === 1 && diff.changed.length === 1 && diff.unchanged.length === 1,
  'preview: 1 new, 1 changed, 1 unchanged',
);

try {
  await client.query('BEGIN');
  const stale = await applyUpload(client, {
    rows: parsed.rows,
    grid,
    fileName: 'check.csv',
    by: 'upload-check',
    fingerprint: 'not-the-preview',
  });
  expect(!stale.ok && stale.reason === 'stale', 'a commit whose preview is out of date is refused');

  const r = await applyUpload(client, {
    rows: parsed.rows,
    grid,
    fileName: 'check.csv',
    by: 'upload-check',
    fingerprint: fingerprintOf(diff),
  });
  expect(
    r.ok && r.added === 1 && r.changed === 1 && r.unchanged === 1,
    'commit: 1 added, 1 changed, 1 unchanged',
  );
  expect(
    (await cell('KPI - OTD', 'September', 'Global', 2026)) === '50.5',
    'the new cell is stored exactly',
  );
  expect(
    Number(await cell('KPI - DSOH', 'July', 'Global', 2026)) === Number(dsohJuly) + 1,
    'the changed cell holds the new value',
  );
  const h = (
    await client.query(
      "SELECT old_value::text AS o, new_value::text AS n FROM kpi_value_history WHERE changed_by='upload-check'",
    )
  ).rows;
  expect(h.length === 1 && Number(h[0].o) === Number(dsohJuly), 'the old value is in the history');
  expect(
    (await count('kpi_source_rows')) === before.source + 3,
    'all three lines are in the source log',
  );
  expect((await count('kpi_values')) === before.values + 1, 'exactly one value row was added');

  const again = await applyUpload(client, {
    rows: parsed.rows,
    grid,
    fileName: 'check.csv',
    by: 'upload-check',
    fingerprint: fingerprintOf(diff),
  });
  expect(!again.ok && again.reason === 'stale', 'the same preview cannot be committed twice');
} finally {
  await client.query('ROLLBACK');
}

const after = {
  values: await count('kpi_values'),
  loads: await count('kpi_loads'),
  history: await count('kpi_value_history'),
  source: await count('kpi_source_rows'),
};
expect(
  JSON.stringify(after) === JSON.stringify(before),
  `rolled back: database unchanged ${JSON.stringify(after)}`,
);
expect(
  (await cell('KPI - DSOH', 'July', 'Global', 2026)) === dsohJuly,
  'DSOH July is back to its stored value',
);
await client.end();
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll upload checks passed; nothing was left in the database.');
