#!/usr/bin/env node
/**
 * Regenerates the laptop-procurement Cost Center Mapping data from its Excel export.
 *
 *   node scripts/generate-laptop-cost-centers.mjs --in "<path>/cost center.xlsx"
 *   node scripts/generate-laptop-cost-centers.mjs --in "<path>/cost center.xlsx" --verify
 *
 * Writes two files, split by where the data is allowed to go:
 *   src/data/laptop-cost-center-companies.json    ~4.8 KB, imported by a client component
 *   src/data/laptop-cost-center-departments.json  ~138 KB, server-side only
 *
 * !! THE SOURCE WORKBOOK IS NOT IN THIS REPOSITORY. !!
 * "cost center.xlsx" was shared out-of-band and never committed, so this script cannot be run
 * as-is by anyone who does not already have a copy. Before it is usable, a maintainer must
 * either commit the workbook (e.g. under data/source/) or record its canonical location here.
 * Until then, run with --verify against a candidate workbook: a clean --verify proves that
 * workbook still reproduces exactly what ships today.
 *
 * Flags
 *   --in <path>     Source workbook. Required. Defaults to $LAPTOP_COST_CENTER_XLSX if set.
 *   --sheet <name>  Worksheet to read. Default: the first sheet in the workbook.
 *   --verify        Compare against the committed JSON and exit non-zero on any difference,
 *                   without writing.
 *
 * INPUT CONTRACT
 *   One header row (found automatically anywhere in the first 20 rows) with these columns, in
 *   any order. Matching is case-insensitive and ignores spaces, underscores and hyphens.
 *     Country        required   the Excel country label, e.g. "KSA", "EOS JAFZA", "HQ Dubai"
 *     Company Code   required   e.g. "2112"
 *     Company Name   required
 *     Department     required
 *     Cost Center    required   e.g. "C548800004"
 *   Each company code belongs to exactly one country in the current export; a code seen under
 *   more than one country accumulates both, in first-appearance order.
 *
 * NOT DERIVED FROM THE WORKBOOK
 *   `countryMap` (COUNTRY_TO_COST_CENTER_COUNTRIES) maps the form's own COUNTRY_OPTIONS values
 *   onto the workbook's country labels — e.g. "Abu Dhabi" -> ["UAE", "EOS JAFZA"], and "Other"
 *   maps to nothing. That is hand-maintained, so this script carries the committed map through
 *   untouched rather than inventing one. Edit it in the JSON, not here.
 *
 * OUTPUT ORDERING — matches the committed files exactly
 *   countries:   unique workbook country labels, default JS string sort.
 *   companies:   sorted by company name with localeCompare.
 *   departments: object keyed by company code in ascending code order; each company's rows in
 *                workbook order, first occurrence of a department name wins.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_COMPANIES = path.join(ROOT, 'src', 'data', 'laptop-cost-center-companies.json');
const OUT_DEPARTMENTS = path.join(ROOT, 'src', 'data', 'laptop-cost-center-departments.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_-]/g, '');
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((r) => r.text).join('') ?? '').trim();
  return String(v).trim();
};

const COLUMNS = {
  country: ['country', 'countryname'],
  code: ['companycode', 'code', 'compcode'],
  name: ['companyname', 'company', 'name'],
  department: ['department', 'departmentname', 'dept'],
  costCenter: ['costcenter', 'costcentre', 'cc'],
};

function locateColumns(sheet) {
  for (let r = 1; r <= Math.min(20, sheet.rowCount); r++) {
    const cells = sheet.getRow(r).values.map(text);
    const idx = {};
    for (const [key, aliases] of Object.entries(COLUMNS)) {
      const at = cells.findIndex((c) => aliases.includes(norm(c)));
      if (at > 0) idx[key] = at;
    }
    if (Object.keys(COLUMNS).every((k) => idx[k] != null)) return { headerRow: r, idx };
  }
  throw new Error(
    `Could not find a header row with ${Object.keys(COLUMNS).join(', ')} in the first 20 rows. Check --sheet and the workbook layout.`,
  );
}

function build(sheet) {
  const { headerRow, idx } = locateColumns(sheet);
  const companies = new Map(); // code -> { code, name, countries: string[] }
  const departments = new Map(); // code -> Map<department, costCenter>
  const countries = new Set();
  let skipped = 0;

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const cells = sheet.getRow(r).values.map(text);
    const country = cells[idx.country] ?? '';
    const code = cells[idx.code] ?? '';
    const name = cells[idx.name] ?? '';
    const department = cells[idx.department] ?? '';
    const costCenter = cells[idx.costCenter] ?? '';
    if (!country && !code && !name && !department && !costCenter) continue; // blank spacer row
    if (!country || !code || !name || !department || !costCenter) {
      skipped++;
      continue;
    }

    countries.add(country);
    if (!companies.has(code)) companies.set(code, { code, name, countries: [] });
    const company = companies.get(code);
    if (!company.countries.includes(country)) company.countries.push(country);
    if (!departments.has(code)) departments.set(code, new Map());
    const deptMap = departments.get(code);
    if (!deptMap.has(department)) deptMap.set(department, costCenter);
  }

  if (skipped) console.warn(`[cost centers] skipped ${skipped} row(s) missing a Country / Company Code / Company Name / Department / Cost Center value`);

  const companyList = [...companies.values()].sort((a, b) => a.name.localeCompare(b.name));
  const departmentMap = {};
  for (const code of [...departments.keys()].sort()) {
    departmentMap[code] = [...departments.get(code).entries()].map(([department, costCenter]) => ({ department, costCenter }));
  }
  return { countries: [...countries].sort(), companies: companyList, departments: departmentMap };
}

async function main() {
  const input = arg('in', process.env.LAPTOP_COST_CENTER_XLSX);
  if (!input) {
    console.error('Missing --in "<path to cost center.xlsx>". The workbook is NOT in this repository — see the header of this file.');
    process.exit(2);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);
  const sheetName = arg('sheet');
  const sheet = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!sheet) {
    console.error(`Worksheet "${sheetName}" not found. Available: ${wb.worksheets.map((w) => w.name).join(', ')}`);
    process.exit(2);
  }

  const { countries, companies, departments } = build(sheet);

  // countryMap is hand-maintained, not derivable from the workbook — carry the committed one through.
  const committedCompanies = JSON.parse(fs.readFileSync(OUT_COMPANIES, 'utf8'));
  const companiesJson = JSON.stringify({ countries, companies, countryMap: committedCompanies.countryMap });
  const departmentsJson = JSON.stringify(departments);

  const unmapped = countries.filter((c) => !Object.values(committedCompanies.countryMap).some((labels) => labels.includes(c)));
  if (unmapped.length) {
    console.warn(
      `[cost centers] ${unmapped.length} workbook country label(s) are not reachable from any COUNTRY_OPTIONS value ` +
        `and will show an empty company list: ${unmapped.join(', ')}. Add them to "countryMap" in ` +
        `${path.relative(ROOT, OUT_COMPANIES)} if that is wrong.`,
    );
  }

  const rows = Object.values(departments).reduce((n, v) => n + v.length, 0);
  const summary = `${countries.length} countries, ${companies.length} companies, ${rows} department rows`;

  if (has('verify')) {
    const diffs = [
      ['laptop-cost-center-companies.json', fs.readFileSync(OUT_COMPANIES, 'utf8'), companiesJson],
      ['laptop-cost-center-departments.json', fs.readFileSync(OUT_DEPARTMENTS, 'utf8'), departmentsJson],
    ].filter(([, current, generated]) => current !== generated);
    if (!diffs.length) {
      console.log(`OK — ${input} reproduces both committed JSON files exactly (${summary}).`);
      return;
    }
    console.error(`MISMATCH — ${input} does not reproduce: ${diffs.map(([f]) => f).join(', ')} (generated ${summary}).`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_COMPANIES, companiesJson);
  fs.writeFileSync(OUT_DEPARTMENTS, departmentsJson);
  console.log(`Wrote src/data/laptop-cost-center-{companies,departments}.json — ${summary}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
