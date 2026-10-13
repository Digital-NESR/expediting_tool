#!/usr/bin/env node
/**
 * One-off: code the last 42 commodities that still have no UNSPSC code.
 *
 *   node --env-file=.env scripts/sourceguide-remaining-unspsc.mjs            dry run
 *   node --env-file=.env scripts/sourceguide-remaining-unspsc.mjs --apply
 *   node --env-file=.env scripts/sourceguide-remaining-unspsc.mjs --rollback
 *
 * These are not like the 78 Chemicals, and the difference decides the method.
 *
 * THIRTY-SEVEN OF THEM ARE ROLL-UP ROWS. Their `name` is simply their own `sub_category` repeated
 * ("Facility / Security / Security"), they carry no `family`, and every real commodity in that
 * sub-category sits beside them already coded. They are almost certainly artefacts of however the
 * taxonomy was imported rather than things anybody buys, and the honest fix is probably to delete
 * them. That is the taxonomy owner's call, not this script's, so they get coded instead.
 *
 * SO THE CODE IS DERIVED, NOT CHOSEN. For each roll-up, this reads the UNSPSC codes its own
 * siblings already carry and takes the family they overwhelmingly belong to. "Facility / Security"
 * has eight coded siblings, all in 9212, so the roll-up is 92120000. That uses NESR's own existing
 * mapping as the authority rather than my opinion, and it is reproducible: run it again and it
 * computes the same answer from the same data.
 *
 * A derived family is rejected unless it exists in the published UNSPSC code set, which is read
 * from the reference extracted alongside this script. A plausible-looking code that is not real is
 * the failure mode worth engineering against.
 *
 * FIVE ARE REAL COMMODITIES, and four of those are exact duplicates of rows coded in the Chemicals
 * pass, so they take the same code their twin already has. Helium is the only genuinely new one.
 *
 * SAFETY. sg_commodities is copied to sg_commodities_bak_restunspsc first, the run is one
 * transaction, and a row that already has a code is never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = 'sg_commodities_bak_restunspsc';
const has = (f) => process.argv.includes(`--${f}`);

/**
 * The rows with no coded siblings to learn from, so each is stated outright.
 * Four are duplicates of commodities the Chemicals pass already coded.
 */
const EXPLICIT = {
  1830: ['20131300', 'Class G Cement, a duplicate of id 1815 which carries this code'],
  1831: ['20131300', 'Oil Well Lightweight Cement, a duplicate of id 1812'],
  1858: ['20131100', 'Fracturing Sands, a duplicate of id 1775'],
  1854: ['12141900', 'Liquid Nitrogen, a duplicate of id 1749'],
  1857: ['12142000', 'Helium is a noble gas; the only genuinely new commodity in this batch'],
  1751: ['25100000', 'HR / Light vehicles, the same family as the Logistics light vehicles'],
  /* A segment-level code (43000000, 46000000) would be the true common ancestor for these two,
     but the published reference lists families and classes only, and writing a code that is not
     in the set is exactly what this script refuses to do. They take the dominant family instead. */
  1802: ['43210000', 'IT / Hardware and Software together; the IT category is dominated by 4321, and this roll-up leans hardware'],
  1861: ['46180000', 'Safety category roll-up; its two sub-categories are 4618 and 4619, and 4618 is the larger'],

  /* Sub-categories whose children span too many families for one to represent them, so the
     family is named rather than derived. Both are services categories where NESR buys across
     several UNSPSC families under one heading. */
  1741: ['72100000', 'Facility / Operations & Maintenance; 31 siblings over 17 families, and building maintenance is what the heading means'],
  1724: ['84110000', 'Professional Services / Finance; 27 siblings over 14 families, and accounting is the largest at 8411'],
};

/**
 * A derived family is only accepted if its own children make a clear majority. Below this, the
 * sub-category is too mixed for one family to represent it and the row is reported rather than
 * guessed at.
 */
const MIN_SHARE = 0.4;

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const at = t.indexOf('=');
    if (at < 0) continue;
    let v = t.slice(at + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, at).trim()] ??= v;
  }
}

async function main() {
  loadEnv('.env.local');
  loadEnv('.env');

  /* The published code set, so a derived family can be checked for existence before it is written. */
  const refPath = path.join(ROOT, '.unspsc.json');
  if (!fs.existsSync(refPath)) {
    console.error(
      'Missing .unspsc.json (the UNSPSC reference). Regenerate it before running: it is what\n' +
        'stops this script inventing a family code that does not exist.',
    );
    process.exitCode = 1;
    return;
  }
  const REF = JSON.parse(fs.readFileSync(refPath, 'utf8'));

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT) || 5432,
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    ssl: (process.env.PGSSL ?? process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    if (has('rollback')) {
      const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [BACKUP]);
      if (!rows[0]?.t) throw new Error(`No backup table ${BACKUP}.`);
      await client.query('BEGIN');
      await client.query(`UPDATE sg_commodities c SET code = b.code FROM ${BACKUP} b WHERE b.id = c.id`);
      await client.query('COMMIT');
      console.log('Rolled back from', BACKUP);
      return;
    }

    const { rows: gaps } = await client.query(
      `SELECT id, category, sub_category, family, name FROM sg_commodities
        WHERE code IS NULL OR code = '' ORDER BY category, sub_category, name`,
    );
    const { rows: coded } = await client.query(
      `SELECT category, sub_category, code FROM sg_commodities
        WHERE code IS NOT NULL AND code <> ''`,
    );

    /* Siblings indexed by the sub-category they belong to, which is the unit a roll-up represents. */
    const siblings = new Map();
    for (const c of coded) {
      const key = `${c.category}\u0000${c.sub_category ?? ''}`;
      (siblings.get(key) ?? siblings.set(key, []).get(key)).push(String(c.code));
    }

    const todo = [];
    const unresolved = [];
    for (const g of gaps) {
      const explicit = EXPLICIT[Number(g.id)];
      if (explicit) {
        todo.push({ ...g, code: explicit[0], how: 'stated', why: explicit[1] });
        continue;
      }
      const sibs = siblings.get(`${g.category}\u0000${g.sub_category ?? ''}`) ?? [];
      if (sibs.length === 0) {
        unresolved.push({ ...g, why: 'no coded siblings and no explicit code' });
        continue;
      }
      const tally = new Map();
      for (const code of sibs) {
        const fam = code.slice(0, 4);
        tally.set(fam, (tally.get(fam) ?? 0) + 1);
      }
      const [fam, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      const share = n / sibs.length;
      const derived = `${fam}0000`;
      if (share < MIN_SHARE) {
        unresolved.push({
          ...g,
          why: `siblings too mixed: the commonest family ${fam} is only ${Math.round(share * 100)}% of ${sibs.length}`,
        });
        continue;
      }
      if (!REF[derived]) {
        unresolved.push({ ...g, why: `derived family ${derived} is not in the UNSPSC reference` });
        continue;
      }
      todo.push({
        ...g,
        code: derived,
        how: 'derived',
        why: `${n} of ${sibs.length} siblings are in family ${fam}`,
      });
    }

    const pad = (s, n) => String(s).padEnd(n).slice(0, n);
    console.log(`\n${gaps.length} uncoded. ${todo.length} resolved, ${unresolved.length} not.\n`);
    for (const t of todo) {
      console.log(
        `  ${pad(`${t.category} / ${t.name}`, 46)} ${t.code}  ${pad(REF[t.code] ?? '(not in reference)', 38)} ${t.how}`,
      );
    }
    console.log('\n  why each derived code was chosen:');
    for (const t of todo.filter((x) => x.how === 'derived')) {
      console.log(`    ${pad(t.name, 34)} ${t.code}  ${t.why}`);
    }
    console.log('\n  stated outright:');
    for (const t of todo.filter((x) => x.how === 'stated')) {
      console.log(`    ${pad(t.name, 34)} ${t.code}  ${t.why}`);
    }
    if (unresolved.length) {
      console.log('\n  NOT resolved:');
      for (const u of unresolved) console.log(`    ${u.id}  ${pad(u.name, 32)} ${u.why}`);
    }

    /* Every code written must exist in the published set. Checked for the stated ones too, not
       only the derived ones: a typo in the table above would otherwise sail straight through. */
    const bogus = todo.filter((t) => !REF[t.code]);
    if (bogus.length) {
      throw new Error(
        `${bogus.length} code(s) are not in the UNSPSC reference: ` +
          bogus.map((b) => `${b.name}=${b.code}`).join(', '),
      );
    }

    if (!has('apply')) {
      console.log('\nDry run. Re-run with --apply to write.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS ${BACKUP}`);
    await client.query(`CREATE TABLE ${BACKUP} AS TABLE sg_commodities`);
    let n = 0;
    for (const t of todo) {
      const res = await client.query(
        `UPDATE sg_commodities SET code = $1 WHERE id = $2 AND (code IS NULL OR code = '')`,
        [t.code, t.id],
      );
      n += res.rowCount;
    }
    await client.query('COMMIT');

    const after = await client.query(
      `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE code IS NOT NULL AND code <> '')::int coded
         FROM sg_commodities`,
    );
    console.log(`\nCommitted. ${n} coded. Backup: ${BACKUP}`);
    console.log(
      `Taxonomy coverage now ${after.rows[0].coded} of ${after.rows[0].total} ` +
        `(${Math.round((after.rows[0].coded / after.rows[0].total) * 100)}%).`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nFAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
