#!/usr/bin/env node
/**
 * One-off: give the Chemicals category its missing UNSPSC codes.
 *
 *   node --env-file=.env scripts/sourceguide-chemicals-unspsc.mjs            dry run, prints the mapping
 *   node --env-file=.env scripts/sourceguide-chemicals-unspsc.mjs --apply
 *   node --env-file=.env scripts/sourceguide-chemicals-unspsc.mjs --rollback restore from the backup
 *
 * WHY
 * 1,101 of 1,221 commodities in `sg_commodities` carry a UNSPSC code. The 120 that do not are 78
 * Chemicals plus a thin tail elsewhere; this script does the 78. They feed the Spend Taxonomy
 * Excel export, the SourceGuide search export and the Catalog Repo's auto-fill, all of which were
 * emitting a blank code for every chemical NESR buys.
 *
 * WHERE THE CODES COME FROM
 * The published UNSPSC code set, read from a government procurement listing of the full catalogue
 * (University of Louisiana at Lafayette). NOT from memory: a wrong eight-digit code is worse than
 * a blank one, because it looks valid and nothing downstream can detect it.
 *
 * The mapping is mostly mechanical rather than invented. Whoever built this taxonomy clearly had
 * UNSPSC open: the `family` column already contains the UNSPSC CLASS NAMES more or less verbatim —
 * "Fluid Loss Additives", "Friction Reducer", "Clay Stabilizer", "Scavengers", "Buffer",
 * "Curing agents", "Indicators and Reagents", "Drilling mud and materials", "Well fracturing
 * proppants", "Completion fluids". They just never wrote the numbers down. Most rows below are
 * therefore a family name matched back to the class it was taken from.
 *
 * Two families carry almost all of it:
 *   12 16 xx  ADDITIVES                              (the oilfield chemistry: breakers, reducers,
 *                                                     inhibitors, stabilizers, scavengers...)
 *   20 13 xx  OIL AND GAS DRILLING AND OPERATION MATERIALS  (mud, proppant, completion fluids,
 *                                                            oil well cement)
 *
 * CONFIDENCE IS RECORDED PER ROW. `exact` means the NESR family name is the UNSPSC class name.
 * `judged` means UNSPSC has no class for that concept and the nearest sensible parent was chosen;
 * those are the ones worth a second opinion from whoever owns the taxonomy, and they are printed
 * separately on every run.
 *
 * SAFETY. sg_commodities is copied to sg_commodities_bak_chemunspsc before anything is written,
 * the whole run is one transaction, and only rows whose code is currently empty are touched — a
 * code somebody has already set is never overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = 'sg_commodities_bak_chemunspsc';
const has = (f) => process.argv.includes(`--${f}`);

/** The UNSPSC classes this mapping draws on, so the printout can name them. */
const UNSPSC = {
  '11101500': 'Minerals',
  '12000000': 'Chemicals incl. bio chemicals and gas materials (segment level)',
  '12141900': 'Non metals and pure and elemental gases',
  '12142100': 'Industrial use gases',
  '12160000': 'Additives (family level)',
  '12161500': 'Indicators and Reagents',
  '12161700': 'Buffers',
  '12161800': 'Colloids',
  '12161900': 'Surfactants',
  '12162300': 'Curing agents',
  '12162400': 'Polymer breakers',
  '12162600': 'Clay stabilizers',
  '12162700': 'Fluid loss additives',
  '12162800': 'Friction reducers',
  '12163000': 'Mud removal mixtures',
  '12163100': 'Anti sludgers',
  '12163200': 'Anti gas migration agents',
  '12163300': 'Expanding agents',
  '12163400': 'Extenders',
  '12163600': 'Corrosion inhibitors',
  '12163800': 'Chemical scavengers',
  '12163900': 'Scale controllers',
  '12164000': 'Bactericides',
  '12164200': 'Retarders',
  '12164300': 'Iron controllers',
  '12191500': 'Hydrocarbonated solvents',
  '12191600': 'Oxygenated solvents',
  '12350000': 'Compounds and mixtures (family level)',
  '12352300': 'Inorganic compounds',
  '20131000': 'Drilling mud and materials',
  '20131100': 'Well fracturing proppants',
  '20131200': 'Completion fluids',
  '20131300': 'Oil well cement',
};

/** commodity id -> [code, confidence, note when judged] */
const MAP = {
  // ── Base Fluids & Brines ────────────────────────────────────────────────
  1851: ['20131200', 'exact'],   // Monovalent brines      (family: Completion fluids)
  1750: ['20131200', 'judged', 'Sub-category roll-up row, coded to the class its children use'],

  // ── Commodities Chemicals ───────────────────────────────────────────────
  1820: ['12352300', 'exact'],   // Hydrochloric acid      (an inorganic compound)
  1815: ['20131300', 'exact'],   // Class G Cement
  1812: ['20131300', 'exact'],   // Oil Well Lightweight Cement
  1817: ['20131300', 'exact'],   // Oil well standard fine type III cement
  1761: ['12163400', 'exact'],   // Cement Extenders       (family: Extenders)
  1772: ['20131000', 'exact'],   // Drilling mud and materials
  1757: ['12163400', 'judged', 'Mud weighting agent: UNSPSC has no weighting-agent class; barite-type weighting sits with drilling materials'],
  1845: ['12142100', 'judged', 'Acetylene is a manufactured industrial gas, not an elemental one'],
  1756: ['12142100', 'judged', 'Carbon dioxide supplied as an industrial gas'],
  1819: ['12141900', 'exact'],   // Nitrogen               (a pure elemental gas)
  1848: ['12352300', 'exact'],   // Ammonium sulphate
  1828: ['12352300', 'exact'],   // Inorganic acids
  1826: ['12352300', 'exact'],   // Inorganic metal salts
  1855: ['12352300', 'exact'],   // Sodium hydroxide
  1749: ['12141900', 'exact'],   // Liquid Nitrogen
  1760: ['12161900', 'exact'],   // Wetting Agents         (surfactants)
  1743: ['12350000', 'judged', 'Sub-category roll-up row, coded at family level'],
  1850: ['12191600', 'exact'],   // Methanol               (an oxygenated solvent)

  // ── Minerals ────────────────────────────────────────────────────────────
  1852: ['11101500', 'judged', 'Barite listed as a mineral rather than as a drilling weighting material'],
  1771: ['11101500', 'judged', 'Sub-category roll-up row'],

  // ── Proppant ────────────────────────────────────────────────────────────
  1755: ['12163300', 'exact'],   // Cement expanding agents
  1752: ['20131100', 'exact'],   // Ceramic proppants
  1753: ['20131100', 'exact'],   // Resin Coated Ceramics
  1775: ['20131100', 'exact'],   // Fracturing Sands

  // ── Specialty Chemicals ─────────────────────────────────────────────────
  1792: ['12162400', 'exact'],   // Acidic polymer breakers
  1832: ['12162400', 'exact'],   // Organic polymer breakers
  1766: ['12162800', 'exact'],   // Anionic Friction Reducer
  1797: ['12162800', 'exact'],   // Cationic friction reducers
  1825: ['12162800', 'exact'],   // Anionic friction reducers
  1769: ['12164000', 'exact'],   // Bactericide
  1824: ['12161700', 'exact'],   // Acid buffers
  1840: ['12161700', 'exact'],   // Basic buffers
  1847: ['12161700', 'exact'],   // Neutral buffers
  1759: ['12161900', 'judged', 'Defoamer: no defoamer class; silicone defoamers are surface-active'],
  1813: ['12163300', 'exact'],   // Cement expanding agents
  1780: ['12163400', 'exact'],   // Cement Extenders
  1856: ['12162600', 'exact'],   // Organic clay stabilizers
  1767: ['12162600', 'exact'],   // Inorganic Clay Stabilizers
  1814: ['12162600', 'exact'],   // Inorganic clay stabilizers
  1787: ['12163600', 'exact'],   // Corrosion Inhibitors
  1774: ['12162300', 'judged', 'Crosslinker: no crosslinker class; it cures a gel, so Curing agents'],
  1836: ['12162300', 'exact'],   // Cement Accelerator     (family: Curing agents)
  1806: ['12164200', 'exact'],   // Cement Retarders
  1765: ['12161900', 'exact'],   // Detergent Surfactants
  1808: ['12161900', 'exact'],   // Detergent surfactants
  1805: ['12161900', 'exact'],   // Anti-Foam
  1803: ['12161900', 'exact'],   // Dispersant
  1827: ['12161900', 'exact'],   // Foaming Agent
  1799: ['12161900', 'exact'],   // Wetting Agents
  1821: ['12163100', 'exact'],   // Anti-Sludge Agent      (Anti sludgers)
  1776: ['20131000', 'exact'],   // Drilling mud and materials
  1849: ['20131000', 'exact'],   // General drilling chemical
  1811: ['20131000', 'judged', 'Lost circulation material is a drilling material; UNSPSC has no LCM class'],
  1807: ['12163000', 'exact'],   // Fluid spacers          (Mud removal mixtures)
  1843: ['12162700', 'exact'],   // Fluid Loss Additives
  1804: ['12162700', 'exact'],   // Modified polymer fluid loss additives
  1833: ['12162700', 'exact'],   // Other Fluid Loss Additives
  1809: ['12163200', 'exact'],   // Anti gas migration additives
  1810: ['12161800', 'judged', 'Canthaxanthin is filed under Gelling Agent here; gels are colloids'],
  1796: ['12161800', 'judged', 'Natural gelling agents: no gelling-agent class, gels are colloids'],
  1816: ['12161800', 'judged', 'Synthetic gelling agent, as above'],
  1778: ['12161800', 'judged', 'Suspending agent: a suspension is a colloid'],
  1770: ['12352300', 'exact'],   // Hydrochloric acid
  1818: ['12161500', 'exact'],   // Diverting agents       (family: Indicators and Reagents)
  1839: ['12352300', 'exact'],   // Inorganic metal salts
  1773: ['12352300', 'exact'],   // Inorganic metal Salts
  1785: ['12164300', 'exact'],   // Iron Control Agent
  1801: ['20131200', 'exact'],   // Monovalent brines
  1800: ['12191600', 'exact'],   // Oxygenated solvents
  1822: ['12191500', 'exact'],   // Hydrocarbonated solvents
  1791: ['12163900', 'exact'],   // Scale Inhibitor
  1823: ['12163800', 'exact'],   // H2S absorbent          (family: Scavengers)
  1859: ['12163800', 'exact'],   // Production oil treatment chemicals
  1844: ['12163800', 'exact'],   // Scavengers
  1742: ['12160000', 'judged', 'Sub-category roll-up row, coded at family level'],

  // ── The category's own roll-up row ──────────────────────────────────────
  1837: ['12000000', 'judged', 'Category roll-up row; segment level, since Chemicals spans segments 12 and 20'],
};

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

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT) || 5432,
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.SourceGuide_DB || process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    ssl:
      (process.env.PGSSL ?? process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    if (has('rollback')) {
      const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [BACKUP]);
      if (!rows[0]?.t) throw new Error(`No backup table ${BACKUP}.`);
      await client.query('BEGIN');
      await client.query(
        `UPDATE sg_commodities c SET code = b.code FROM ${BACKUP} b WHERE b.id = c.id`,
      );
      await client.query('COMMIT');
      console.log('Rolled back from', BACKUP);
      return;
    }

    const { rows } = await client.query(
      `SELECT id, name, sub_category, family, code FROM sg_commodities
        WHERE category = 'Chemicals' ORDER BY sub_category, family, name`,
    );

    const ids = new Set(rows.map((r) => Number(r.id)));
    const unknown = Object.keys(MAP).map(Number).filter((id) => !ids.has(id));
    if (unknown.length) {
      throw new Error(
        `The mapping names ${unknown.length} commodity id(s) that are not Chemicals any more: ` +
          `${unknown.join(', ')}. The taxonomy has moved; re-check before writing.`,
      );
    }

    const todo = [];
    const skipped = [];
    const unmapped = [];
    for (const r of rows) {
      const entry = MAP[Number(r.id)];
      if (!entry) {
        unmapped.push(r);
        continue;
      }
      if (String(r.code ?? '').trim()) {
        skipped.push(r);
        continue;
      }
      todo.push({ ...r, code: entry[0], confidence: entry[1], note: entry[2] });
    }

    const pad = (s, n) => String(s).padEnd(n).slice(0, n);
    console.log(`\n${rows.length} Chemicals commodities. ${todo.length} to code.\n`);
    let section = '';
    for (const t of todo) {
      const s = `${t.sub_category ?? '(none)'}`;
      if (s !== section) {
        console.log(`\n  ${s}`);
        section = s;
      }
      console.log(
        `    ${pad(t.name, 46)} ${t.code}  ${pad(UNSPSC[t.code] ?? '?', 40)} ${t.confidence}`,
      );
    }

    const judged = todo.filter((t) => t.confidence === 'judged');
    console.log(`\n\n  ${judged.length} judgement calls, worth a second opinion:\n`);
    for (const j of judged) console.log(`    ${pad(j.name, 40)} -> ${j.code}  ${j.note}`);

    if (skipped.length) console.log(`\n  ${skipped.length} already had a code and were left alone.`);
    if (unmapped.length) {
      console.log(`\n  ${unmapped.length} NOT in the mapping:`);
      for (const u of unmapped) console.log(`    ${u.id}  ${u.name}`);
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
      /* The guard is repeated in SQL as well as in the loop above: between the read and the write
         somebody could have set a code, and theirs wins. */
      const res = await client.query(
        `UPDATE sg_commodities SET code = $1 WHERE id = $2 AND (code IS NULL OR code = '')`,
        [t.code, t.id],
      );
      n += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\nCommitted. ${n} commodities coded. Backup: ${BACKUP}`);

    const after = await client.query(
      `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE code IS NOT NULL AND code <> '')::int coded
         FROM sg_commodities`,
    );
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
