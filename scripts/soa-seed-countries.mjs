#!/usr/bin/env node
/**
 * Seed soa_consolidation.countries from the countries present in SourceGuide's historic_spend.
 *
 *   node --env-file=.env scripts/soa-seed-countries.mjs          report what would change
 *   node --env-file=.env scripts/soa-seed-countries.mjs --apply  write it
 *
 * Two databases have to agree on what a country is. `historic_spend.country` is free text out of
 * SAP — 'KSA', 'EOS JAFZA', 'Jordon' — while this tool keys on short codes, and SourceGuide's
 * `sg_countries` already uses codes for twelve of them. The mapping below is the reconciliation,
 * and it is deliberately explicit rather than derived: 'KSA' does not fuzzy-match 'Saudi Arabia',
 * and a mapping that guessed would eventually put a country's spend under the wrong champion.
 *
 * Codes come from sg_countries where one exists, so a country means the same thing in both tools.
 * The six countries with spend but no SourceGuide guide get ISO-style codes of their own.
 *
 * If SAP starts spelling a country a way this table does not know, the script REFUSES to run
 * rather than seeding a partial list. Silently dropping a country would take its vendors out of
 * scope and quietly overstate every coverage percentage that country contributes to.
 */
import pg from 'pg';

/** spend spelling(s) → { id, name }. Several spellings may share one code. */
const MAPPING = [
  { id: 'SA', name: 'Saudi Arabia', spend: ['KSA'] },
  { id: 'EOS', name: 'EOS Jafza', spend: ['EOS JAFZA'] },
  { id: 'OM', name: 'Oman', spend: ['Oman'] },
  { id: 'DZ', name: 'Algeria', spend: ['Algeria'] },
  { id: 'KW', name: 'Kuwait', spend: ['Kuwait'] },
  // SourceGuide merged the UAE guide into Abu Dhabi, so the spend country follows it.
  { id: 'AUH', name: 'Abu Dhabi', spend: ['UAE'] },
  { id: 'EG', name: 'Egypt', spend: ['Egypt'] },
  { id: 'IQ', name: 'Iraq', spend: ['Iraq'] },
  { id: 'HQ', name: 'HQ Dubai', spend: ['HQ Dubai'] },
  { id: 'LY', name: 'Libya', spend: ['Libya'] },
  { id: 'ID', name: 'Indonesia', spend: ['Indonesia'] },
  { id: 'IN', name: 'India', spend: ['India'] },
  // No SourceGuide guide for these six; codes are ISO 3166 alpha-2 where one applies.
  { id: 'QA', name: 'Qatar', spend: ['Qatar'] },
  { id: 'DMCC', name: 'EOS DMCC', spend: ['EOS DMCC'] },
  // 'Jordon' is how SAP spells it. The country is Jordan; the misspelling is matched, not fixed,
  // because correcting it at source is not this script's business.
  { id: 'JO', name: 'Jordan', spend: ['Jordon', 'Jordan'] },
  { id: 'TD', name: 'Chad', spend: ['Chad'] },
  { id: 'CG', name: 'Congo', spend: ['Congo'] },
  { id: 'YE', name: 'Yemen', spend: ['Yemen'] },
];

const APPLY = process.argv.includes('--apply');

const creds = (style) =>
  style === 'sourceguide'
    ? {
        host: process.env.POSTGRES_HOST || process.env.DB_HOST,
        port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
        ssl:
          process.env.PGSSL === 'true' || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        host: process.env.DB_HOST ?? process.env.POSTGRES_HOST,
        port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
        user: process.env.DB_USER ?? process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
        ssl:
          (process.env.DB_SSL ?? process.env.PGSSL) === 'true'
            ? { rejectUnauthorized: false }
            : false,
      };

const sg = new pg.Client({
  ...creds('sourceguide'),
  database: process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
});
const soa = new pg.Client({
  ...creds('sns'),
  database: process.env.SOA_DB_NAME || 'soa_consolidation',
});

await sg.connect();
await soa.connect();

try {
  const { rows: spend } = await sg.query(`
    SELECT country, COUNT(*)::int AS lines, SUM(order_value_usd) AS usd
    FROM historic_spend
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY SUM(order_value_usd) DESC NULLS LAST
  `);

  const known = new Map();
  for (const m of MAPPING) for (const s of m.spend) known.set(s, m);

  const unmapped = spend.filter((r) => !known.has(r.country));
  if (unmapped.length) {
    console.error('historic_spend contains countries this script does not know how to map:\n');
    for (const r of unmapped) {
      console.error(
        `  ${r.country.padEnd(16)} ${r.lines} lines, $${(Number(r.usd) / 1e6).toFixed(2)}M`,
      );
    }
    console.error(
      '\nAdd each to MAPPING in this file with the code the tool should use, then re-run.\n' +
        'Seeding without them would drop their vendors out of scope and overstate coverage.',
    );
    process.exit(1);
  }

  // Spend order decides sort order, so the countries that matter most sit at the top of every
  // list in the UI without anyone maintaining a ranking by hand.
  const rank = new Map();
  spend.forEach((r, i) => {
    const m = known.get(r.country);
    if (!rank.has(m.id)) rank.set(m.id, i);
  });

  const rows = MAPPING.map((m) => ({
    ...m,
    // A country in the mapping but absent from the spend data is kept, inactive: it may simply
    // have had no purchases in the loaded window.
    active: rank.has(m.id),
    sort: rank.has(m.id) ? rank.get(m.id) : 999,
  })).sort((a, b) => a.sort - b.sort);

  console.log(`${spend.length} spend countries → ${rows.length} country rows\n`);
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(5)} ${r.name.padEnd(16)} ${r.active ? '' : '(no spend, inactive)'} ← ${r.spend.join(', ')}`,
    );
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    process.exit(0);
  }

  await soa.query('BEGIN');
  for (const r of rows) {
    await soa.query(
      `INSERT INTO countries (id, name, spend_names, sort_order, active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         spend_names = EXCLUDED.spend_names,
         sort_order = EXCLUDED.sort_order,
         active = EXCLUDED.active`,
      [r.id, r.name, r.spend, r.sort, r.active],
    );
  }
  await soa.query('COMMIT');
  console.log(`\nSeeded ${rows.length} countries.`);
} catch (err) {
  await soa.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  await sg.end();
  await soa.end();
}
