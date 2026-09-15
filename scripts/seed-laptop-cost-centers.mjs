#!/usr/bin/env node
/**
 * Loads the laptop-procurement Cost Center Mapping into Postgres.
 *
 *   node scripts/seed-laptop-cost-centers.mjs            # dry run against the committed CSV
 *   node scripts/seed-laptop-cost-centers.mjs --apply
 *   node scripts/seed-laptop-cost-centers.mjs --apply --in "<path>/some-export.csv"
 *
 * This replaces scripts/generate-laptop-cost-centers.mjs, which wrote two JSON files into
 * src/data from a workbook that was never committed. The mapping now lives in three tables
 * and is edited at /admin/laptop?section=cost-centers, so this script exists for exactly two
 * jobs: the first load, and re-importing a fresh export from Finance.
 *
 * IDEMPOTENT, AND IT DOES NOT DELETE. Rows in the CSV are inserted or updated; rows already in
 * the database that the CSV does not mention are left alone and reported. That is deliberate —
 * a truncate-and-reload would silently discard every correction an admin had made since the
 * last import. Retiring a company or department is a decision for a person, on the admin page.
 *
 * INPUT: a CSV with a header row naming Country, Company Name, Department, Cost Center and
 * Company Code, in any order. Matching is case-insensitive and ignores spaces and punctuation.
 *
 * VALIDATION. Every row must have all five values, a four-digit company code, and a cost
 * center of "C" plus nine digits. Rows that fail are skipped and listed. This is not
 * pedantry: the export shared in September 2026 carried two rows of test typing
 * ("ughuh"/"dsdf"/"jhjh"/7522 and "852"/"4598"/"kuhjkj"/541) left behind in the spreadsheet,
 * and without a shape check they would have become two fake companies in the request form.
 *
 * ORDERING. sort_order is assigned in file order, which is the order the request form's
 * dropdowns show. Departments already in the database keep the position they have.
 *
 * WHITESPACE. Excel writes this export with NON-BREAKING spaces between words: 1,554 of the
 * 2,335 department names are "SUPPLY\u00A0CHAIN", not "SUPPLY CHAIN". The two look identical on
 * screen, so it went unseen for as long as the data was only ever compared against itself; it
 * broke the moment a department name arrived from anywhere else, such as the employee
 * directory. Every value is folded to plain single spaces on the way in.
 *
 * COUNTRY MAP. laptop_cost_center_country_map is NOT in the CSV — it maps the request form's
 * own COUNTRY_OPTIONS values onto the workbook's country labels, which is a judgement call
 * ("Abu Dhabi" covers both "UAE" and "EOS JAFZA"; "Other" covers nothing). The seed below is
 * the mapping the app shipped with. It is only inserted where a row does not already exist,
 * so admin edits to it survive re-running this script.
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL (or the POSTGRES_* / PGSSL names)
 * and LAPTOP_PROCUREMENT_DB_NAME from .env.local, then .env. Both, because this repo keeps the
 * per-developer overrides in .env.local and the shared Postgres credentials in .env.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CSV = path.join(ROOT, 'data', 'source', 'cost-center-mapping.csv');

/* The mapping the app shipped with, before this data moved into the database. Seeded only
   into empty slots, never overwritten. */
const COUNTRY_MAP_SEED = {
  'Saudi Arabia': ['KSA'],
  'Abu Dhabi': ['UAE', 'EOS JAFZA'],
  'HQ Dubai': ['HQ Dubai'],
  Qatar: ['Qatar'],
  Kuwait: ['Kuwait'],
  Oman: ['Oman'],
  Bahrain: ['Bahrain'],
  Egypt: ['Egypt'],
  Algeria: ['Algeria'],
  Iraq: ['Iraq'],
  Libya: ['Libya'],
  Yemen: ['Yemen'],
  Chad: ['Chad'],
  India: ['India'],
  Indonesia: ['Indonesia'],
};

/* ── args ─────────────────────────────────────────────────────────────────── */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

/* ── env ──────────────────────────────────────────────────────────────────── */

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

/** RFC 4180: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Must stay identical to normaliseCostCenterText in src/lib/laptopCostCenters.ts. Duplicated
 * rather than imported because this is a plain .mjs script and that is TypeScript; if you
 * change one, change both, or the admin page and the importer will disagree about what counts
 * as the same department name.
 */
const tidy = (value) =>
  String(value ?? '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const COLUMNS = {
  country: ['country', 'countryname'],
  code: ['companycode', 'code', 'compcode'],
  name: ['companyname', 'company', 'name'],
  department: ['department', 'departmentname', 'dept'],
  costCenter: ['costcenter', 'costcentre', 'cc'],
};

function locateColumns(header) {
  const idx = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    const at = header.findIndex((c) => aliases.includes(norm(c)));
    if (at < 0) {
      throw new Error(
        `CSV is missing a "${key}" column. Header seen: ${header.map((h) => JSON.stringify(h)).join(', ')}`,
      );
    }
    idx[key] = at;
  }
  return idx;
}

const COMPANY_CODE_RE = /^\d{4}$/;
const COST_CENTER_RE = /^C\d{9}$/;

function readCsv(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error(`${file} is empty.`);
  const idx = locateColumns(rows[0].map((h) => h.trim()));

  const companies = new Map(); // code -> { code, name, country }
  const departments = []; // { code, department, costCenter }
  const seen = new Map(); // `${code}\u0000${lower(department)}` -> { line, costCenter }
  const skipped = [];
  const conflicts = [];
  const duplicates = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.some((c) => c.trim() !== '')) continue; // blank spacer row
    const country = tidy(cells[idx.country]);
    const code = tidy(cells[idx.code]);
    const name = tidy(cells[idx.name]);
    const department = tidy(cells[idx.department]);
    const costCenter = tidy(cells[idx.costCenter]).toUpperCase();

    /* A repeat of a company + department already read. First occurrence wins, which is what
       the generator this replaces did — but silently. Reported here, because a repeat with a
       DIFFERENT cost center means the spreadsheet disagrees with itself and someone should
       look: that is exactly how the malformed "C82113011" row survived in the sheet unseen. */
    const key = `${code}\u0000${department.toLowerCase()}`;
    const first = code && department ? seen.get(key) : null;
    if (first) {
      duplicates.push({ line: r + 1, code, department, costCenter, first });
      continue;
    }

    const why = !country
      ? 'no country'
      : !code
        ? 'no company code'
        : !name
          ? 'no company name'
          : !department
            ? 'no department'
            : !costCenter
              ? 'no cost center'
              : !COMPANY_CODE_RE.test(code)
                ? `company code "${code}" is not four digits`
                : !COST_CENTER_RE.test(costCenter)
                  ? `cost center "${costCenter}" is not C + nine digits`
                  : null;
    if (why) {
      skipped.push({ line: r + 1, why, cells: [country, name, department, costCenter, code] });
      continue;
    }

    const existing = companies.get(code);
    if (!existing) companies.set(code, { code, name, country });
    else if (existing.name !== name || existing.country !== country) {
      conflicts.push({ line: r + 1, code, kept: existing, ignored: { name, country } });
    }

    seen.set(key, { line: r + 1, costCenter });
    departments.push({ code, department, costCenter });
  }

  return { companies: [...companies.values()], departments, skipped, conflicts, duplicates };
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  loadEnvFile(path.join(ROOT, '.env.local')); // first, so its values win
  loadEnvFile(path.join(ROOT, '.env'));

  const file = arg('in', DEFAULT_CSV);
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(2);
  }
  const apply = has('apply');

  const { companies, departments, skipped, conflicts, duplicates } = readCsv(file);
  console.log(
    `${path.relative(ROOT, file)}: ${companies.length} companies, ${departments.length} department rows, ` +
      `${new Set(companies.map((c) => c.country)).size} countries.`,
  );
  if (conflicts.length) {
    console.warn(`\n${conflicts.length} row(s) disagree about a company's name or country:`);
    for (const c of conflicts.slice(0, 20)) {
      console.warn(
        `  line ${c.line}: ${c.code} kept as "${c.kept.name}" / ${c.kept.country}, ` +
          `ignoring "${c.ignored.name}" / ${c.ignored.country}`,
      );
    }
  }
  if (duplicates.length) {
    const disagree = duplicates.filter((d) => d.costCenter !== d.first.costCenter);
    console.warn(
      `\n${duplicates.length} repeated company+department row(s); the first occurrence was kept.` +
        (disagree.length ? ` ${disagree.length} of them name a DIFFERENT cost center:` : ''),
    );
    for (const d of duplicates.slice(0, 20)) {
      const mark = d.costCenter !== d.first.costCenter ? '  <-- disagrees' : '';
      console.warn(
        `  line ${d.line}: ${d.code} "${d.department}" = ${d.costCenter}, ` +
          `already set to ${d.first.costCenter} on line ${d.first.line}${mark}`,
      );
    }
  }
  if (skipped.length) {
    console.warn(`\nSkipped ${skipped.length} row(s):`);
    for (const s of skipped.slice(0, 20)) {
      console.warn(`  line ${s.line}: ${s.why} — ${JSON.stringify(s.cells)}`);
    }
    if (skipped.length > 20) console.warn(`  ... and ${skipped.length - 20} more`);
  }

  if (!apply) {
    console.log('\nDry run. Nothing was written. Re-run with --apply to load these rows.');
    return;
  }

  const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
  const client = new Client({
    host: process.env.DB_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
    user: process.env.DB_USER ?? process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? '',
    database: process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db',
    ssl: sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    // Same DDL the app runs on first use; repeated here so the seed can go first.
    await client.query(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_companies (
        code        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        country     TEXT NOT NULL,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by  TEXT
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_departments (
        id           SERIAL PRIMARY KEY,
        company_code TEXT NOT NULL
                     REFERENCES laptop_cost_center_companies (code)
                     ON UPDATE CASCADE ON DELETE CASCADE,
        department   TEXT NOT NULL,
        cost_center  TEXT NOT NULL,
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by   TEXT
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS laptop_cost_center_country_map (
        requestor_country TEXT NOT NULL,
        mapped_country    TEXT NOT NULL,
        sort_order        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (requestor_country, mapped_country)
      )`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_lcc_departments_company_dept
         ON laptop_cost_center_departments (company_code, LOWER(department))`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_lcc_departments_company
         ON laptop_cost_center_departments (company_code)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_lcc_companies_country
         ON laptop_cost_center_companies (country)`,
    );

    const before = await client.query(
      `SELECT (SELECT COUNT(*) FROM laptop_cost_center_companies)   AS companies,
              (SELECT COUNT(*) FROM laptop_cost_center_departments) AS departments`,
    );

    // Company sort_order follows first appearance in the file; existing rows keep theirs.
    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      await client.query(
        `INSERT INTO laptop_cost_center_companies (code, name, country, sort_order, updated_by)
              VALUES ($1, $2, $3, $4, 'seed-laptop-cost-centers')
         ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    country = EXCLUDED.country,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
              WHERE laptop_cost_center_companies.name <> EXCLUDED.name
                 OR laptop_cost_center_companies.country <> EXCLUDED.country`,
        [c.code, c.name, c.country, i],
      );
    }

    // Departments are numbered within their company, again in file order.
    const perCompany = new Map();
    let inserted = 0;
    let updated = 0;
    for (const d of departments) {
      const n = perCompany.get(d.code) ?? 0;
      perCompany.set(d.code, n + 1);
      const res = await client.query(
        `INSERT INTO laptop_cost_center_departments
                (company_code, department, cost_center, sort_order, updated_by)
              VALUES ($1, $2, $3, $4, 'seed-laptop-cost-centers')
         ON CONFLICT (company_code, LOWER(department)) DO UPDATE
                SET cost_center = EXCLUDED.cost_center,
                    department = EXCLUDED.department,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
              WHERE laptop_cost_center_departments.cost_center <> EXCLUDED.cost_center
                 OR laptop_cost_center_departments.department <> EXCLUDED.department
         RETURNING (xmax = 0) AS was_insert`,
        [d.code, d.department, d.costCenter, n],
      );
      if (res.rows.length) {
        if (res.rows[0].was_insert) inserted++;
        else updated++;
      }
    }

    let mapped = 0;
    for (const [requestor, labels] of Object.entries(COUNTRY_MAP_SEED)) {
      for (let i = 0; i < labels.length; i++) {
        const res = await client.query(
          `INSERT INTO laptop_cost_center_country_map (requestor_country, mapped_country, sort_order)
                VALUES ($1, $2, $3)
           ON CONFLICT (requestor_country, mapped_country) DO NOTHING`,
          [requestor, labels[i], i],
        );
        mapped += res.rowCount ?? 0;
      }
    }

    // Anything in the database the file did not mention. Reported, never deleted.
    const csvCodes = companies.map((c) => c.code);
    const orphanCompanies = await client.query(
      `SELECT code, name FROM laptop_cost_center_companies WHERE code <> ALL($1::text[]) ORDER BY code`,
      [csvCodes],
    );
    const orphanDepartments = await client.query(
      `SELECT d.company_code, d.department
         FROM laptop_cost_center_departments d
        WHERE NOT EXISTS (
                SELECT 1
                  FROM UNNEST($1::text[], $2::text[]) AS k(code, department)
                 WHERE k.code = d.company_code
                   AND LOWER(k.department) = LOWER(d.department))
        ORDER BY d.company_code, d.department`,
      [departments.map((d) => d.code), departments.map((d) => d.department)],
    );

    await client.query('COMMIT');

    const after = await client.query(
      `SELECT (SELECT COUNT(*) FROM laptop_cost_center_companies)   AS companies,
              (SELECT COUNT(*) FROM laptop_cost_center_departments) AS departments`,
    );
    console.log(
      `\nApplied. companies ${before.rows[0].companies} -> ${after.rows[0].companies}, ` +
        `departments ${before.rows[0].departments} -> ${after.rows[0].departments} ` +
        `(${inserted} inserted, ${updated} updated). Country map: ${mapped} new row(s).`,
    );
    if (orphanCompanies.rowCount) {
      console.warn(
        `\n${orphanCompanies.rowCount} company/companies in the database are not in this file, and were left as they are:`,
      );
      for (const r of orphanCompanies.rows) console.warn(`  ${r.code}  ${r.name}`);
      console.warn('  Retire them on /admin/laptop?section=cost-centers if they are gone.');
    }
    if (orphanDepartments.rowCount) {
      console.warn(
        `\n${orphanDepartments.rowCount} department row(s) are not in this file, and were left as they are:`,
      );
      for (const r of orphanDepartments.rows.slice(0, 20)) {
        console.warn(`  ${r.company_code}  ${r.department}`);
      }
      if (orphanDepartments.rowCount > 20) {
        console.warn(`  ... and ${orphanDepartments.rowCount - 20} more`);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
