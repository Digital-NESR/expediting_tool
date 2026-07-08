import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import XLSX from 'xlsx';

const cwd = process.cwd();
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
        if (clean[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const ALLOWED_STATUS = new Set([
  'Submitted', 'IT Approval', 'CM Approval', 'IT Director Approval', 'Supply Chain Director Approval',
  'Procure New', 'Approved', 'Assign from Inventory', 'Assign from Inventory & Closed', 'Repaired & Closed',
  'Rejected', 'Rejected by CM', 'Rejected by ITD', 'Rejected by SCD', 'Cancelled',
]);

const blank = v => { const s = (v ?? '').toString().trim(); return s === '' ? null : s; };
const slug = v => (v ?? '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const parseDate = v => {
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
const maxIso = (...vals) => { const ds = vals.filter(Boolean).map(s => new Date(s).getTime()); return ds.length ? new Date(Math.max(...ds)).toISOString() : null; };

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

/* ── Device catalogue ─────────────────────────────────────────── */
const catRows = parseCsv(fs.readFileSync(catalogPath, 'utf8'));
const catHeader = catRows[0].map(h => h.trim());
const cTypeIdx = catHeader.indexOf('Type of Device');
const cModelIdx = catHeader.indexOf('Model');
const catalog = catRows.slice(1)
  .filter(r => r.length >= catHeader.length && (r[cTypeIdx] || '').trim() && (r[cModelIdx] || '').trim())
  .map(r => [r[cTypeIdx].trim(), r[cModelIdx].trim()]);

await client.query('TRUNCATE laptop_device_catalog RESTART IDENTITY');
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
const csvHeader = csvRows[0].map(h => h.trim());
const ci = name => csvHeader.indexOf(name);
const csvGet = (r, name) => { const i = ci(name); return i >= 0 ? r[i] : ''; };
const csvData = csvRows.slice(1).filter(r => r.length === csvHeader.length && r.some(x => (x ?? '').trim()));
const csvMap = new Map();
for (const r of csvData) {
  const id = (csvGet(r, 'Request ID') || '').trim();
  if (!id || csvMap.has(id)) continue;
  csvMap.set(id, r);
}

/* ── Power BI export (dates, pending-with, on-behalf, comments) ── */
const wb = XLSX.readFile(xlsxPath);
const xlObjs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
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

await client.query('TRUNCATE laptop_requests RESTART IDENTITY CASCADE');
await client.query('TRUNCATE laptop_activity_log RESTART IDENTITY');

const COLS = [
  'reference_number', 'employee_id', 'status', 'priority', 'request_type', 'indirect_request',
  'requested_date', 'pending_with', 'country', 'requested_by_name', 'requested_by_email', 'on_behalf_of',
  'computer_for', 'segment', 'department', 'position', 'company_code', 'company_name', 'cost_center',
  'type_of_device', 'requested_model', 'special_requirements',
  'unit_id', 'current_brand', 'current_model', 'serial_no', 'age_years',
  'it_manager', 'it_manager_2', 'country_manager', 'it_director', 'sc_director',
  'itm_comments', 'cm_comments', 'itd_comments', 'scd_comments',
  'it_team_approved_date', 'cm_approved_date', 'itd_approved_date', 'scd_approved_date',
  'reviewed_at', 'legacy_status', 'legacy_id', 'created_at', 'updated_at',
];

const nowIso = new Date().toISOString();

function buildRow(id) {
  const x = xlMap.get(id) || {};
  const c = csvMap.get(id);
  const xg = name => blank(x[name]);
  const cg = name => (c ? blank(csvGet(c, name)) : null);
  const pick = (xn, cn) => xg(xn) ?? cg(cn);

  const rawStatus = (x['Status'] || (c ? csvGet(c, 'Status') : '') || '').toString().trim();
  const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : 'Submitted';

  const requestor = xg('Requestor') ?? cg('Requestor');
  const email = (slug(requestor) || 'unknown') + '@nesr.local';
  const indirect = ((x['On-Behalf of'] || '').toString().trim() !== '')
    || ((c ? csvGet(c, 'In-Direct Request') : '') || '').toString().trim().toLowerCase() === 'true';

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
  await client.query(`INSERT INTO laptop_requests (${COLS.join(', ')}) VALUES ${placeholders}`, chunk.flat());
  inserted += chunk.length;
}

console.log(`Seeded ${inserted} laptop procurement requests (merged Power BI dates + CSV detail).`);
await client.end();
console.log('Laptop Procurement seed complete.');
