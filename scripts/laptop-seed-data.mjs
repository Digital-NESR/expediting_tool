/**
 * Loads the historic laptop-procurement export (device catalogue CSV + purchase-exception
 * CSV + Power BI workbook) into Postgres.
 *
 *   npm run laptop:db:seed                 # first load: refuses to run if requests exist
 *   npm run laptop:db:seed -- --truncate   # wipe and reload
 *
 * WITHOUT --truncate the script writes nothing unless laptop_requests is empty, and it
 * checks that before it inserts anything at all, so a refusal never leaves a partly
 * loaded database. WITH --truncate it empties laptop_device_catalog, laptop_requests and
 * laptop_activity_log first — and, through the CASCADE that truncating laptop_requests
 * needs, laptop_documents, including uploads that were never part of this export. That
 * truncate used to be unconditional, which meant re-running the seed to top up the
 * catalogue destroyed every attachment anyone had added.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import ExcelJS from 'exceljs';

const cwd = process.cwd();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUNCATE = process.argv.includes('--truncate');
const envPath = path.join(cwd, '.env.local');
const catalogPath = path.join(cwd, 'database', 'seed', 'device_catalog.csv');
const csvPath = path.join(cwd, 'database', 'seed', 'purchase_exceptions.csv');
const xlsxPath = path.join(cwd, 'database', 'seed', 'powerbi_export.xlsx');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsAt = trimmed.indexOf('=');
    if (equalsAt < 0) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

// RFC-4180 CSV parser (handles quoted, multi-line fields).
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const clean = text.replace(/^﻿/, '');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* The statuses the app recognises, read out of its own LaptopRequestStatus union rather
   than copied. The copy that used to live here had fallen two statuses behind the union
   ('Procure New Details' and 'CM Confirm Device'), and every exported row sitting in one
   of them was quietly rewritten to 'Submitted' on the way in.
   This is a .mjs script and that is TypeScript, so the union cannot be imported (the same
   wall seed-laptop-cost-centers.mjs hits); reading the declaration keeps one list instead
   of two, and the throws below turn a rename into a loud failure rather than another
   silent round of coercion. */
function readAllowedStatuses() {
  const typesPath = path.join(ROOT, 'src', 'types', 'laptopProcurement.ts');
  const source = fs.readFileSync(typesPath, 'utf8');
  const union = /export type LaptopRequestStatus\s*=([\s\S]*?);/.exec(source);
  if (!union) throw new Error(`No LaptopRequestStatus union found in ${typesPath}.`);
  const statuses = [...union[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (!statuses.length) throw new Error(`LaptopRequestStatus in ${typesPath} listed no statuses.`);
  return new Set(statuses);
}

const ALLOWED_STATUS = readAllowedStatuses();

const blank = (v) => {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
};
const slug = (v) =>
  (v ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const parseDate = (v) => {
  const s = (v ?? '').toString().trim();
  if (!s) return null;
  // Some columns (e.g. SCD Approval Date) export as raw Excel serial numbers rather than formatted strings.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(EXCEL_EPOCH_MS + Math.round(serial * 86400 * 1000));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const maxIso = (...vals) => {
  const ds = vals.filter(Boolean).map((s) => new Date(s).getTime());
  return ds.length ? new Date(Math.max(...ds)).toISOString() : null;
};

// exceljs cell value -> the string form XLSX.utils.sheet_to_json({ raw: false }) produced.
// Dates come back as real Date objects, rich text as a run array, formulas as { formula, result }.
const xlCellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) {
    return Number.isNaN(v.getTime())
      ? ''
      : `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('');
    if ('formula' in v || 'sharedFormula' in v) return xlCellText(v.result ?? null);
    if ('hyperlink' in v) return v.text != null ? String(v.text) : '';
    if ('error' in v) return String(v.error);
  }
  return String(v);
};

// Row 1 is the header row; every header key is always present ('' when the cell is blank),
// matching the old sheet_to_json({ defval: '' }) behaviour.
const sheetToObjects = (ws) => {
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = xlCellText(cell.value).trim();
  });
  const objs = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const text = xlCellText(row.getCell(i + 1).value);
      if (text !== '') hasValue = true;
      obj[h] = text;
    });
    if (hasValue) objs.push(obj);
  });
  return objs;
};

loadEnvFile(envPath);

const client = new Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.LAPTOP_PROCUREMENT_DB_NAME || 'laptop_procurement_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
await client.connect();

/* Checked before the first write, not between them: a run that is going to refuse should
   refuse while the database is still exactly as it was. */
if (!TRUNCATE) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM laptop_requests');
  if (rows[0].n > 0) {
    console.error(
      `laptop_requests already holds ${rows[0].n} row(s), so this seed would duplicate them.\n` +
        'Nothing was written. Re-run with --truncate to empty laptop_device_catalog,\n' +
        'laptop_requests and laptop_activity_log first — note that emptying laptop_requests\n' +
        'cascades into laptop_documents and takes every uploaded attachment with it.',
    );
    await client.end();
    process.exit(1);
  }
}

if (TRUNCATE) {
  console.log(
    'Truncating laptop_device_catalog, laptop_requests (cascading into laptop_documents) and laptop_activity_log.',
  );
}

/* ── Device catalogue ─────────────────────────────────────────── */
const catRows = parseCsv(fs.readFileSync(catalogPath, 'utf8'));
const catHeader = catRows[0].map((h) => h.trim());
const cTypeIdx = catHeader.indexOf('Type of Device');
const cModelIdx = catHeader.indexOf('Model');
const catalog = catRows
  .slice(1)
  .filter(
    (r) =>
      r.length >= catHeader.length && (r[cTypeIdx] || '').trim() && (r[cModelIdx] || '').trim(),
  )
  .map((r) => [r[cTypeIdx].trim(), r[cModelIdx].trim()]);

// The insert below is ON CONFLICT DO NOTHING, so the catalogue tops up without this;
// truncating only matters when the point is to drop models the CSV no longer lists.
if (TRUNCATE) await client.query('TRUNCATE laptop_device_catalog RESTART IDENTITY');
for (const [type, model] of catalog) {
  await client.query(
    `INSERT INTO laptop_device_catalog (type_of_device, model) VALUES ($1, $2)
     ON CONFLICT (type_of_device, model) DO NOTHING`,
    [type, model],
  );
}
console.log(`Seeded ${catalog.length} device catalogue entries.`);

/* ── Build CSV extras map (justification, existing device, approver names) ── */
const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const csvHeader = csvRows[0].map((h) => h.trim());
const ci = (name) => csvHeader.indexOf(name);
const csvGet = (r, name) => {
  const i = ci(name);
  return i >= 0 ? r[i] : '';
};
const csvData = csvRows
  .slice(1)
  .filter((r) => r.length === csvHeader.length && r.some((x) => (x ?? '').trim()));
const csvMap = new Map();
for (const r of csvData) {
  const id = (csvGet(r, 'Request ID') || '').trim();
  if (!id || csvMap.has(id)) continue;
  csvMap.set(id, r);
}

/* ── Power BI export (dates, pending-with, on-behalf, comments) ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);
const xlObjs = sheetToObjects(wb.worksheets[0]);
const xlMap = new Map();
const orderedIds = [];
for (const o of xlObjs) {
  const id = (o['Request ID'] || '').toString().trim();
  // Skip Power BI export artifacts (e.g. a trailing "No filters applied" footer row).
  if (!/^PLP\d+$/i.test(id)) continue;
  if (!xlMap.has(id)) orderedIds.push(id);
  xlMap.set(id, o);
}
// Append CSV-only ids (present in CSV but missing from the Power BI export).
for (const id of csvMap.keys()) if (!xlMap.has(id)) orderedIds.push(id);

if (TRUNCATE) {
  await client.query('TRUNCATE laptop_requests RESTART IDENTITY CASCADE');
  await client.query('TRUNCATE laptop_activity_log RESTART IDENTITY');
}

const COLS = [
  'reference_number',
  'employee_id',
  'status',
  'priority',
  'request_type',
  'indirect_request',
  'requested_date',
  'pending_with',
  'country',
  'requested_by_name',
  'requested_by_email',
  'on_behalf_of',
  'computer_for',
  'segment',
  'department',
  'position',
  'company_code',
  'company_name',
  'cost_center',
  'type_of_device',
  'requested_model',
  'special_requirements',
  'unit_id',
  'current_brand',
  'current_model',
  'serial_no',
  'age_years',
  'it_manager',
  'it_manager_2',
  'country_manager',
  'it_director',
  'sc_director',
  'itm_comments',
  'cm_comments',
  'itd_comments',
  'scd_comments',
  'it_team_approved_date',
  'cm_approved_date',
  'itd_approved_date',
  'scd_approved_date',
  'reviewed_at',
  'legacy_status',
  'legacy_id',
  'created_at',
  'updated_at',
];

const nowIso = new Date().toISOString();

function buildRow(id) {
  const x = xlMap.get(id) || {};
  const c = csvMap.get(id);
  const xg = (name) => blank(x[name]);
  const cg = (name) => (c ? blank(csvGet(c, name)) : null);
  const pick = (xn, cn) => xg(xn) ?? cg(cn);

  const rawStatus = (x['Status'] || (c ? csvGet(c, 'Status') : '') || '').toString().trim();
  const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : 'Submitted';

  const requestor = xg('Requestor') ?? cg('Requestor');
  /* The export names the requester but never gives an address, and requested_by_email is
     what the app treats as the requester's identity. These rows therefore get a reserved
     .invalid address (RFC 2606 — it can never resolve or be registered) keyed on the name,
     so a person's imported history still groups together while the address stays obviously
     synthetic. It used to read <name>@nesr.local, which looked close enough to a real NESR
     address to be mistaken for one. Nobody signs in as either: a requester who wants to see
     these rows needs them re-pointed at their real account. */
  const email = (slug(requestor) || 'unknown') + '@laptop-seed.invalid';
  const indirect =
    (x['On-Behalf of'] || '').toString().trim() !== '' ||
    ((c ? csvGet(c, 'In-Direct Request') : '') || '').toString().trim().toLowerCase() === 'true';

  const requestedIso = parseDate(x['Requested Date']);
  const itTeamIso = parseDate(x['IT Team Approved Date']);
  const cmIso = parseDate(x['Country Manager Approved Date']);
  const itdIso = parseDate(x['IT Approved Date']);
  const scdIso = parseDate(x['SCD Approval Date']);
  const reviewedIso = maxIso(itTeamIso, cmIso, itdIso, scdIso);
  const createdIso = requestedIso || nowIso;
  const updatedIso = maxIso(reviewedIso, createdIso) || createdIso;

  return [
    id,
    pick('Employee ID', 'Employee ID'),
    status,
    'Normal',
    pick('Type of Request', 'Type of Request'),
    indirect,
    requestedIso,
    xg('Pending With'),
    pick('Country', 'Country'),
    requestor,
    email,
    xg('On-Behalf of'),
    cg('Computer For'),
    pick('Segment', 'Segment'),
    pick('Department', 'Department'),
    cg('Position'),
    pick('Company Code', 'Company Codee'),
    pick('Company Name', 'Company Namee'),
    pick('Cost Center', 'Cost Centerr'),
    pick('Type of Device', 'Type of Device'),
    pick('Model of the Device', 'Model of the Device'),
    cg('Special Requirements'),
    cg('Unit ID'),
    cg('Brand'),
    cg('Model'),
    cg('Serial No.'),
    cg('Age (Years)'),
    cg('IT Manager'),
    cg('IT Manager 2'),
    cg('Country Manager'),
    cg('IT Director'),
    cg('SC Director'),
    xg('IT Team Comments') ?? cg('ITM Comments'),
    xg('Country Manager Comments') ?? cg('CM Comments'),
    xg('IT Director Comments') ?? cg('ITD Comments'),
    xg('SCD Comments') ?? cg('SCD Comments'),
    itTeamIso,
    cmIso,
    itdIso,
    scdIso,
    reviewedIso,
    rawStatus || null,
    cg('ID'),
    createdIso,
    updatedIso,
  ];
}

const CHUNK = 100;
let inserted = 0;
for (let start = 0; start < orderedIds.length; start += CHUNK) {
  const chunk = orderedIds.slice(start, start + CHUNK).map(buildRow);
  const placeholders = chunk
    .map((_, ri) => `(${COLS.map((_, cidx) => `$${ri * COLS.length + cidx + 1}`).join(', ')})`)
    .join(', ');
  await client.query(
    `INSERT INTO laptop_requests (${COLS.join(', ')}) VALUES ${placeholders}`,
    chunk.flat(),
  );
  inserted += chunk.length;
}

console.log(`Seeded ${inserted} laptop procurement requests (merged Power BI dates + CSV detail).`);
await client.end();
console.log('Laptop Procurement seed complete.');
