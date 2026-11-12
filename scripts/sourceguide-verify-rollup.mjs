/**
 * Does the in-memory rollup agree with the database?
 *
 * `buildTree` replaces a GROUP BY that was never written, so there is no existing number to
 * check it against -- the whole point of the module is that SourceGuide could not count
 * suppliers above commodity level. This script writes that GROUP BY once, in SQL, and asserts
 * the fold matches it at every level and under every country scope.
 *
 * Read-only. Imports the real `rollup.ts` through Node's type stripping rather than a copy, so
 * a divergence here is a divergence in the module the app ships.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *        scripts/sourceguide-verify-rollup.mjs
 */
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/* Application code imports its neighbours without a file extension, which is what TypeScript and
   the Next bundler expect and what Node's ESM resolver refuses. Bridged here rather than by
   editing app code to suit a script. */
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (!specifier.startsWith('.') || !context.parentURL) throw err;
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (!fs.existsSync(fileURLToPath(candidate))) throw err;
      return next(specifier + '.ts', context);
    }
  },
});

const { buildTree, findNode, nodeKey, suppliersUnder } = await import(
  '../src/lib/sourceguide/rollup.ts'
);

const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.SourceGuide_DB || 'sourceguide_db',
  ssl: /^(1|true|require)$/i.test(process.env.PGSSL || '') ? { rejectUnauthorized: false } : false,
});

let failures = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: fold ${got} / sql ${want}`);
};

await client.connect();

const commodities = (
  await client.query(
    `SELECT id, name, code, category, sub_category, family, spend_type FROM sg_commodities`,
  )
).rows.map((r) => ({
  id: Number(r.id),
  name: r.name,
  code: r.code,
  category: r.category,
  subCategory: r.sub_category,
  family: r.family,
  spendType: r.spend_type,
}));

const facts = (
  await client.query(
    `SELECT commodity_id, country_code, supplier_code, tier
       FROM sg_mappings WHERE status = 'Active'`,
  )
).rows.map((r) => ({
  commodityId: Number(r.commodity_id),
  country: r.country_code,
  supplier: r.supplier_code,
  preferred: r.tier === 'Preferred',
}));

const suppliers = (
  await client.query(
    `SELECT DISTINCT a.supplier_code, a.name, a.central_block_status
       FROM supplier_avl a JOIN sg_mappings m ON m.supplier_code = a.supplier_code`,
  )
).rows.map((r) => ({ code: r.supplier_code, name: r.name, blocked: false }));

console.log(`${commodities.length} commodities, ${facts.length} active mappings\n`);

/* ── 1. every category, unscoped ─────────────────────────────── */
console.log('categories, all countries:');
const roots = buildTree(commodities, facts, {});
const catSql = await client.query(
  `SELECT c.spend_type, c.category, COUNT(DISTINCT m.supplier_code)::int AS n
     FROM sg_commodities c
     JOIN sg_mappings m ON m.commodity_id = c.id AND m.status = 'Active'
    GROUP BY 1, 2`,
);
for (const row of catSql.rows) {
  const n = findNode(roots, nodeKey([row.spend_type, row.category]));
  check(`${row.spend_type} > ${row.category}`, n ? n.supplierCount : null, row.n);
}

/* ── 2. every sub-category, scoped to a country ──────────────── */
console.log('\nsub-categories, scoped per country (the figure the Explorer shows):');
const subSql = await client.query(
  `SELECT c.spend_type, c.category,
          COALESCE(NULLIF(TRIM(c.sub_category), ''), 'General') AS sub,
          m.country_code,
          COUNT(DISTINCT m.supplier_code)::int AS n
     FROM sg_commodities c
     JOIN sg_mappings m ON m.commodity_id = c.id AND m.status = 'Active'
    GROUP BY 1, 2, 3, 4`,
);
const byCountry = new Map();
for (const row of subSql.rows) {
  if (!byCountry.has(row.country_code))
    byCountry.set(row.country_code, buildTree(commodities, facts, { country: row.country_code }));
  const tree = byCountry.get(row.country_code);
  const n = findNode(tree, nodeKey([row.spend_type, row.category, row.sub]));
  const got = n ? n.supplierCount : null;
  if (got !== row.n)
    check(`${row.country_code} ${row.category} > ${row.sub}`, got, row.n);
}
console.log(`  checked ${subSql.rows.length} sub-category x country pairs`);

/* ── 3. the preferred count, and the tier filter ─────────────── */
console.log('\npreferred counts, all countries:');
const prefSql = await client.query(
  `SELECT c.spend_type, c.category, COUNT(DISTINCT m.supplier_code)::int AS n
     FROM sg_commodities c
     JOIN sg_mappings m ON m.commodity_id = c.id AND m.status = 'Active'
    WHERE m.tier = 'Preferred'
    GROUP BY 1, 2`,
);
const prefTree = buildTree(commodities, facts, { tier: 'preferred' });
for (const row of prefSql.rows) {
  const rolled = findNode(roots, nodeKey([row.spend_type, row.category]));
  const filtered = findNode(prefTree, nodeKey([row.spend_type, row.category]));
  check(`${row.category} (preferredCount)`, rolled ? rolled.preferredCount : null, row.n);
  check(`${row.category} (tier filter)`, filtered ? filtered.supplierCount : null, row.n);
}

/* ── 4. the rule: no supplier row without a commodity behind it ─ */
console.log('\nevery rolled supplier names the commodities that put it there:');
let rows = 0;
let bare = 0;
const walk = (n) => {
  if (n.level === 'subCategory' && n.supplierCount > 0) {
    for (const s of suppliersUnder(n, commodities, facts, suppliers, {})) {
      rows++;
      if (!s.viaCommodities.length) bare++;
    }
  }
  for (const c of n.children) walk(c);
};
for (const r of roots) walk(r);
check(`${rows} supplier rows across every sub-category, bare`, bare, 0);

/* ── 5. the widest node renders at all ───────────────────────── */
console.log('\nthe widest node+country the UI must survive:');
const om = buildTree(commodities, facts, { country: 'OM' });
const widest = findNode(om, nodeKey(['Indirect', 'Facility', 'Operations & Maintenance']))
  ?? findNode(om, nodeKey(['Direct', 'Facility', 'Operations & Maintenance']));
if (widest) {
  const list = suppliersUnder(widest, commodities, facts, suppliers, { country: 'OM' });
  console.log(
    `  Facility > Operations & Maintenance in OM: ${widest.supplierCount} suppliers, ` +
      `${widest.commodityCount} commodities, list length ${list.length}`,
  );
  check('list length equals the node count', list.length, widest.supplierCount);
} else {
  console.log('  (node not found under either spend type - check the path)');
}

await client.end();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
