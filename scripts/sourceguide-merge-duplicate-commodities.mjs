/**
 * Merge the commodities that exist twice under different capitalisation.
 *
 *   node --env-file=.env scripts/sourceguide-merge-duplicate-commodities.mjs            # dry run
 *   node --env-file=.env scripts/sourceguide-merge-duplicate-commodities.mjs --apply
 *   node --env-file=.env scripts/sourceguide-merge-duplicate-commodities.mjs --rollback
 *
 * WHY. Three commodities are in `sg_commodities` more than once, differing only by letter case,
 * each pair carrying the same UNSPSC code. A buyer searching "detergent surfactants" landed on
 * one of the two and saw 5 suppliers in 1 country, or 11 in 3 -- never all 16. Same shape as the
 * catch-all problem: one thing in the buyer's head, several rows in the table.
 *
 * WHICH ROW SURVIVES. Not the one with more mappings -- the one that is correctly filed. Every
 * duplicate here has a `family` that merely repeats its own name (`Detergent Surfactants` inside
 * family `Detergent Surfactants`), which is the signature of a second import pass; its twin
 * carries a real family (`Surfactants`). The real one is kept and the artefact is merged into it,
 * even where the artefact holds more mappings, because the mappings move and the taxonomy
 * position does not.
 *
 * WHAT IS DELIBERATELY NOT MERGED. `Inorganic metal salts` exists three times, and one of them
 * (id 1826) sits under sub-category `Commodities Chemicals` rather than `Specialty Chemicals`.
 * That is not a capitalisation duplicate, it is the same commodity filed in two branches -- which
 * may well be intentional, and is a question for whoever owns the taxonomy rather than something
 * to decide in a script. Only the two inside `Specialty Chemicals` are merged.
 *
 * SAFETY. `sg_commodities` has no foreign keys pointing at it, so nothing cascades and nothing is
 * deleted implicitly; the mappings are repointed explicitly first. `sg_supplier_matrix` is a view
 * and follows on its own. Both the commodity row and every mapping are copied before anything
 * moves, and `--rollback` puts them back.
 */

import { Client } from 'pg';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const BAK_COMMODITY = 'sg_commodities_bak_casemerge';
const BAK_MAPPINGS = 'sg_mappings_bak_casemerge';

/**
 * loser -> winner, for duplicates that are unambiguously the same commodity: same name ignoring
 * case, same UNSPSC code, same sub-category.
 *
 * TWO SHAPES, TWO RULES FOR PICKING THE WINNER.
 *
 * Where the families differ, one of them merely repeats the commodity's own name -- `Detergent
 * Surfactants` inside family `Detergent Surfactants` -- which is the signature of a second import
 * pass. The twin carrying a real family (`Surfactants`) is kept, even where the artefact holds
 * more mappings: the mappings move, the taxonomy position does not.
 *
 * Where the families are identical, there is nothing to choose between them on content, so the
 * lower id wins -- the row that was there first. In all four of those cases it is also the row
 * carrying more mappings, so the two readings agree.
 */
const MERGES = [
  // differing families: keep the one that is properly filed
  { loser: 1765, winner: 1808, label: 'Detergent surfactants' },
  { loser: 1767, winner: 1814, label: 'Inorganic clay stabilizers' },
  { loser: 1773, winner: 1839, label: 'Inorganic metal salts' },
  // identical families: keep the original
  { loser: 1830, winner: 1815, label: 'Class G Cement' },
  { loser: 1858, winner: 1775, label: 'Fracturing Sands' },
  { loser: 1854, winner: 1749, label: 'Liquid Nitrogen' },
  { loser: 1831, winner: 1812, label: 'Oil Well Lightweight Cement' },
];

function connect() {
  const sslFlag = (process.env.PGSSL ?? process.env.DB_SSL ?? '').toLowerCase();
  return new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    ssl:
      sslFlag === 'true' || sslFlag === 'require' || sslFlag === '1'
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function main() {
  const c = connect();
  await c.connect();

  if (ROLLBACK) {
    const present = await c.query(`SELECT to_regclass($1) AS t`, [`public.${BAK_COMMODITY}`]);
    if (!present.rows[0].t) {
      console.log(`No ${BAK_COMMODITY} table — nothing to roll back.`);
      await c.end();
      return;
    }
    await c.query('BEGIN');
    const com = await c.query(
      `INSERT INTO sg_commodities SELECT * FROM ${BAK_COMMODITY} ON CONFLICT (id) DO NOTHING`,
    );
    /* Most mappings were repointed rather than deleted, so they go back by id -- re-inserting
       them would duplicate every one. The exception is the exact-duplicate rows the merge
       dropped, which no longer exist and have to be inserted. */
    const maps = await c.query(
      `UPDATE sg_mappings m SET commodity_id = b.commodity_id
         FROM ${BAK_MAPPINGS} b WHERE b.id = m.id`,
    );
    const reinserted = await c.query(
      `INSERT INTO sg_mappings
       SELECT * FROM ${BAK_MAPPINGS} b
        WHERE NOT EXISTS (SELECT 1 FROM sg_mappings m WHERE m.id = b.id)`,
    );
    await c.query(
      `SELECT setval(pg_get_serial_sequence('sg_mappings','id'),
                     GREATEST((SELECT MAX(id) FROM sg_mappings), 1))`,
    );
    await c.query(
      `SELECT setval(pg_get_serial_sequence('sg_commodities','id'),
                     GREATEST((SELECT MAX(id) FROM sg_commodities), 1))`,
    );
    await c.query('COMMIT');
    console.log(
      `Restored ${com.rowCount} commodities, repointed ${maps.rowCount} mappings, re-inserted ${reinserted.rowCount}.`,
    );
    await c.end();
    return;
  }

  let refused = false;
  const plan = [];

  for (const { loser, winner, label } of MERGES) {
    const { rows } = await c.query(
      `SELECT id, code, name, sub_category, family FROM sg_commodities WHERE id = ANY($1)`,
      [[loser, winner]],
    );
    const l = rows.find((r) => r.id === loser);
    const w = rows.find((r) => r.id === winner);

    if (!l && w) {
      console.log(`${label}: already merged.`);
      continue;
    }
    if (!l || !w) {
      console.log(
        `${label}: REFUSING — expected both ${loser} and ${winner}, found ${rows.length}.`,
      );
      refused = true;
      continue;
    }
    /* Re-checked rather than trusted: these ids were chosen by reading the table, and a script
       that merges whatever it is pointed at is one taxonomy edit away from destroying a real
       commodity. */
    if (l.name.trim().toLowerCase() !== w.name.trim().toLowerCase()) {
      console.log(`${label}: REFUSING — "${l.name}" and "${w.name}" are not the same name.`);
      refused = true;
      continue;
    }
    if ((l.code ?? '') !== (w.code ?? '')) {
      console.log(`${label}: REFUSING — codes differ (${l.code} vs ${w.code}).`);
      refused = true;
      continue;
    }
    if ((l.sub_category ?? '') !== (w.sub_category ?? '')) {
      console.log(
        `${label}: REFUSING — different sub-categories (${l.sub_category} vs ${w.sub_category}). That is a taxonomy decision, not a duplicate.`,
      );
      refused = true;
      continue;
    }

    const clash = await c.query(
      `SELECT count(*)::int AS n FROM sg_mappings l
        WHERE l.commodity_id = $1
          AND EXISTS (SELECT 1 FROM sg_mappings w
                       WHERE w.commodity_id = $2
                         AND w.country_code = l.country_code
                         AND w.supplier_code = l.supplier_code)`,
      [loser, winner],
    );
    const moving = await c.query(
      `SELECT count(*)::int AS n FROM sg_mappings WHERE commodity_id = $1`,
      [loser],
    );

    /* A supplier mapped to BOTH twins in the same country. There is no unique constraint on
       (commodity_id, country_code, supplier_code), so moving it would be absorbed silently as a
       second identical row rather than rejected.

       Dropped, but only when the two rows say exactly the same thing -- same tier, same status.
       Then nothing is lost: the winner already carries that fact. If they disagree, one of them
       says a supplier is Preferred and the other says Backup, and picking a side is a sourcing
       decision rather than a dedupe, so the merge refuses and says so. */
    const conflicting = await c.query(
      `SELECT l.id, l.country_code, l.supplier_code, l.tier AS loser_tier, w.tier AS winner_tier,
              l.status AS loser_status, w.status AS winner_status
         FROM sg_mappings l
         JOIN sg_mappings w
           ON w.commodity_id = $2 AND w.country_code = l.country_code
          AND w.supplier_code = l.supplier_code
        WHERE l.commodity_id = $1
          AND (l.tier IS DISTINCT FROM w.tier OR l.status IS DISTINCT FROM w.status)`,
      [loser, winner],
    );
    if (conflicting.rows.length) {
      console.log(
        `${label}: REFUSING — ${conflicting.rows.length} mapping(s) disagree on tier or status:`,
      );
      for (const r of conflicting.rows)
        console.log(
          `    ${r.country_code} ${r.supplier_code}: loser ${r.loser_tier}/${r.loser_status} vs winner ${r.winner_tier}/${r.winner_status}`,
        );
      refused = true;
      continue;
    }

    plan.push({ loser, winner, label, moving: moving.rows[0].n, dropping: clash.rows[0].n, l, w });
    console.log(
      `${label}: move ${moving.rows[0].n} mapping(s) from ${loser} ("${l.name}", family ${l.family}) ` +
        `to ${winner} ("${w.name}", family ${w.family}), then delete ${loser}.`,
    );
    if (clash.rows[0].n > 0)
      console.log(
        `  ...of which ${clash.rows[0].n} is an exact duplicate of a row ${winner} already has, and is dropped.`,
      );
  }

  if (refused) {
    console.log('\nOne or more merges were refused. Nothing will be written.');
    await c.end();
    process.exitCode = 1;
    return;
  }
  if (!plan.length) {
    console.log('\nNothing to do.');
    await c.end();
    return;
  }
  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply.');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  await c.query(
    `CREATE TABLE IF NOT EXISTS ${BAK_COMMODITY} (LIKE sg_commodities INCLUDING DEFAULTS)`,
  );
  await c.query(`CREATE TABLE IF NOT EXISTS ${BAK_MAPPINGS} (LIKE sg_mappings INCLUDING DEFAULTS)`);

  let moved = 0;
  for (const { loser, winner } of plan) {
    await c.query(`INSERT INTO ${BAK_COMMODITY} SELECT * FROM sg_commodities WHERE id = $1`, [
      loser,
    ]);
    await c.query(`INSERT INTO ${BAK_MAPPINGS} SELECT * FROM sg_mappings WHERE commodity_id = $1`, [
      loser,
    ]);
    /* Backed up above, so a dropped row is restorable. Removed BEFORE the repoint, because
       afterwards the two rows are indistinguishable. */
    await c.query(
      `DELETE FROM sg_mappings l
        WHERE l.commodity_id = $1
          AND EXISTS (SELECT 1 FROM sg_mappings w
                       WHERE w.commodity_id = $2
                         AND w.country_code = l.country_code
                         AND w.supplier_code = l.supplier_code)`,
      [loser, winner],
    );
    const r = await c.query(`UPDATE sg_mappings SET commodity_id = $2 WHERE commodity_id = $1`, [
      loser,
      winner,
    ]);
    moved += r.rowCount ?? 0;
    await c.query(`DELETE FROM sg_commodities WHERE id = $1`, [loser]);
  }
  await c.query('COMMIT');

  console.log(`\nMerged ${plan.length} duplicates, moving ${moved} mappings.`);
  console.log(`Originals kept in ${BAK_COMMODITY} and ${BAK_MAPPINGS}. Undo with --rollback.`);
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
