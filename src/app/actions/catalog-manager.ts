'use server';

import type { QueryResultRow } from 'pg';
import ExcelJS from 'exceljs';
import catalogManagerPool from '@/lib/db-catalog-manager';
import { getProcureGuardUser } from '@/lib/auth';
import { getDelegatorsForApp } from '@/app/actions/delegation';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy';
import { SERVICE_ACTIVITIES } from '@/lib/catalog-service-activities';
import {
  SEED_COUNTRIES,
  SEED_CURRENCIES,
  SEED_UOMS,
  APPROVAL_THRESHOLD_USD,
  approvalTier,
  effectiveThresholdUsd,
  type ThresholdRule,
  toUsd,
  isExpiringSoon,
  sirionUrlFor,
  INCOTERM_CODES,
  FIELD_MAX,
  LEAD_TIME_MAX_DAYS,
  UNIT_PRICE_MAX,
  sanitizeImportText,
} from '@/lib/catalog-manager-utils';
import type {
  AppUserRow,
  ApprovalThresholdRule,
  AuditEvent,
  CatalogActor,
  CatalogDelegationGrant,
  CatalogAnalyticsData,
  CatalogEntry,
  CatalogManagerDashboardData,
  CatalogRole,
  CatalogStatus,
  CategoryBar,
  PirEntry,
  RateMover,
  SpendByCategory,
  SpendByCountry,
  CountryApproverRow,
  CountryRow,
  CurrencyRow,
  SpendCategoryRow,
  SpendSubcategoryRow,
  SpendType,
  SupplierRow,
  UomRow,
} from '@/types/catalog-manager';

type QueryParams = (string | number | boolean | null | undefined | string[])[];

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}
function normaliseParams(params: QueryParams): QueryParams {
  return params.map((value) => (value === undefined ? null : value));
}
function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await catalogManagerPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}
async function exec(statement: string, params: QueryParams = []): Promise<{ rowCount: number; insertId: number }> {
  const result = await catalogManagerPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return { rowCount: result.rowCount ?? 0, insertId: Number.isFinite(insertId) ? insertId : 0 };
}

/* ============================================================================
   SCHEMA — created in code (idempotent), ensured before every action.
   Mirrors the ERD: country / currency / unit_of_measure / spend_category /
   spend_subcategory / app_user / supplier / catalog_entry / rate_version /
   entry_document / approval_decision / audit_log + country_approver.
============================================================================ */

// Memoized so concurrent callers (e.g. a page's Promise.all) share ONE init/seed run
// instead of racing — racing seeders previously collided on the catalog_entry code key.
let schemaPromise: Promise<void> | null = null;

function ensureCatalogManagerSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initCatalogManagerSchema().catch((err) => {
      schemaPromise = null; // let a later request retry if init failed
      throw err;
    });
  }
  return schemaPromise;
}

async function initCatalogManagerSchema(): Promise<void> {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710' && code !== '42701') throw err;
    }
  }

  await execSchema(`CREATE TABLE IF NOT EXISTS currency (
    code VARCHAR(3) PRIMARY KEY,
    decimals SMALLINT NOT NULL DEFAULT 2,
    usd_rate NUMERIC(14,6) NOT NULL DEFAULT 1
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS country (
    code VARCHAR(2) PRIMARY KEY,
    name TEXT NOT NULL,
    default_currency VARCHAR(3),
    flag TEXT,
    status TEXT NOT NULL DEFAULT 'Active'
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS unit_of_measure (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Active'
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS spend_category (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'Services',
    status TEXT NOT NULL DEFAULT 'Active'
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS spend_subcategory (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES spend_category(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    UNIQUE (category_id, name)
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    country_code VARCHAR(2),
    role TEXT NOT NULL DEFAULT 'Viewer'
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS supplier (
    id SERIAL PRIMARY KEY,
    vendor_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    accountable_manager TEXT
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS catalog_entry (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    country_code VARCHAR(2) NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES supplier(id),
    category_id INTEGER REFERENCES spend_category(id),
    subcategory_id INTEGER REFERENCES spend_subcategory(id),
    uom_id INTEGER REFERENCES unit_of_measure(id),
    spend_type TEXT,
    family TEXT,
    commodity TEXT,
    unspsc_code TEXT,
    item_name TEXT NOT NULL,
    description TEXT,
    sirion_contract_id TEXT,
    sirion_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Draft',
    tier_label TEXT NOT NULL DEFAULT 'Tier 1 — Auto',
    current_version_no INTEGER NOT NULL DEFAULT 1,
    manager TEXT,
    approver_name TEXT,
    approval_comment TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by TEXT,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS rate_version (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    unit_price NUMERIC(16,3) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    effective_date DATE NOT NULL,
    expiry_date DATE,
    change_reason TEXT,
    modified_by TEXT,
    modified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entry_id, version_no)
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS entry_document (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    doc_type TEXT,
    size_label TEXT
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS approval_decision (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    decided_by TEXT,
    decision TEXT NOT NULL,
    tier SMALLINT NOT NULL DEFAULT 2,
    comment TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    target TEXT,
    user_name TEXT,
    detail TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // NEW (per request): people who approve for certain countries, linked to app_user.
  await execSchema(`CREATE TABLE IF NOT EXISTS country_approver (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    country_code VARCHAR(2) NOT NULL,
    spend_category_id INTEGER REFERENCES spend_category(id),
    tier SMALLINT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // partial unique: one row per (user, country, category) — NULL category treated as "all".
  await execSchema(`CREATE UNIQUE INDEX IF NOT EXISTS country_approver_uniq
    ON country_approver (user_id, country_code, COALESCE(spend_category_id, 0))`);

  // Logistics fields (added later): Incoterms 2020 code + supplier lead time in days.
  await execSchema(`ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS incoterms TEXT`);
  await execSchema(`ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS incoterms_location TEXT`);
  await execSchema(`ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS lead_time_days INTEGER`);

  // Real uploaded proof-of-agreement files are stored inline as a data URL (local-first).
  await execSchema(`ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS data_url TEXT`);
  await execSchema(`ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS uploaded_by TEXT`);
  await execSchema(`ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);

  // Approval thresholds — a global default plus optional per-country / per-category overrides.
  await execSchema(`CREATE TABLE IF NOT EXISTS approval_threshold (
    id SERIAL PRIMARY KEY,
    country_code VARCHAR(2),
    spend_category_id INTEGER REFERENCES spend_category(id),
    threshold_usd NUMERIC(16,2) NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE UNIQUE INDEX IF NOT EXISTS approval_threshold_uniq
    ON approval_threshold (COALESCE(country_code, ''), COALESCE(spend_category_id, 0))`);

  // SAP service-activity reference list (every service in the system).
  await execSchema(`CREATE TABLE IF NOT EXISTS service_activity (
    activity_number TEXT PRIMARY KEY,
    short_text TEXT NOT NULL,
    base_uom TEXT
  )`);

  // Supplier directory — the SAP supplier master, owned by the catalog DB (seeded once
  // from the expediting DB, then queried locally so runtime never depends on that DB).
  await execSchema(`CREATE TABLE IF NOT EXISTS supplier_directory (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emails TEXT,
    additional_email TEXT
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS supplier_directory_name_idx ON supplier_directory (LOWER(name))`);

  // PIR / Inventory catalog — a READ-ONLY mirror of SAP Purchasing Info Records, loaded by an
  // external n8n job (Power BI → truncate + insert). The app never writes to this table.
  await execSchema(`CREATE TABLE IF NOT EXISTS pir_catalog (
    info_record_number TEXT,
    product_number TEXT,
    material_description TEXT,
    material_group TEXT,
    suppliers_account_number TEXT,
    supplier_name TEXT,
    purchasing_organization TEXT,
    purchase_org_description TEXT,
    purchasing_group TEXT,
    plant TEXT,
    country TEXT,
    order_unit TEXT,
    base_unit_of_measure TEXT,
    numerator_for_conversion NUMERIC,
    unit_price NUMERIC,
    currency_key TEXT,
    standard_qty NUMERIC,
    planned_delivery_time_days NUMERIC,
    overdelivery_tolerance_limit NUMERIC,
    shipping_instructions TEXT,
    minimum_remaining_shelf_life NUMERIC,
    incoterms TEXT,
    incoterms_location_1 TEXT,
    valid_days NUMERIC,
    valid_till_expiry_date TEXT,
    expiring_in TEXT,
    status TEXT,
    deletion_flag TEXT,
    material_supplier TEXT,
    material_supplier_org TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await seedMasterData();
  await seedDemoData();
  await seedSupplierDirectory();

  // Re-classify entries still tagged with the old Direct/Indirect spend types to the
  // new three-way classification (Materials & Assets / Consumables / Services) from their category.
  await execSchema(`UPDATE catalog_entry e SET spend_type = sc.type
    FROM spend_category sc WHERE sc.id = e.category_id AND e.spend_type IN ('Direct', 'Indirect')`);
}

/**
 * One-time copy of the SAP supplier master (nesr_expediting_db.supplier_contacts) into the
 * catalog DB's supplier_directory. Only runs when the local table is empty; batched for speed.
 * Fail-safe: if the expediting DB is unreachable the table stays empty and a later restart retries.
 */
async function seedSupplierDirectory(): Promise<void> {
  const cnt = await sql<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM supplier_directory`);
  if (Number(cnt[0]?.n ?? 0) > 0) return;
  try {
    const { default: expeditingPool } = await import('@/lib/db-expediting');
    const res = await expeditingPool.query(
      `SELECT supplier_id, supplier_name, supplier_emails, additional_supplier_email
       FROM supplier_contacts WHERE supplier_id IS NOT NULL AND supplier_name IS NOT NULL`,
    );
    const rows = (res.rows as { supplier_id: string; supplier_name: string; supplier_emails: string | null; additional_supplier_email: string | null }[])
      .map((r) => ({ code: String(r.supplier_id).trim(), name: String(r.supplier_name).trim(), emails: r.supplier_emails ?? null, add: r.additional_supplier_email ?? null }))
      .filter((r) => r.code && r.name);
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const values: string[] = [];
      const params: (string | null)[] = [];
      let p = 1;
      for (const r of slice) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(r.code, r.name, r.emails, r.add);
      }
      await catalogManagerPool.query(
        `INSERT INTO supplier_directory (code, name, emails, additional_email) VALUES ${values.join(', ')} ON CONFLICT (code) DO NOTHING`,
        params,
      );
    }
  } catch {
    // expediting DB not reachable — leave the directory empty for now.
  }
}

/**
 * Typeahead over the SAP supplier directory, now stored in the catalog DB
 * (supplier_directory, seeded once from the expediting DB). Returns up to 20 distinct-by-name matches.
 */
export async function searchSupplierDirectory(query: string): Promise<{ name: string; code: string }[]> {
  await ensureCatalogManagerSchema();
  const q = (query ?? '').trim();
  if (q.length < 2) return [];
  const rows = await sql<{ code: string; name: string }[]>(
    `SELECT DISTINCT ON (LOWER(name)) code, name FROM supplier_directory
      WHERE name ILIKE ? ORDER BY LOWER(name) LIMIT 20`,
    [`%${q}%`],
  );
  return rows.map((r) => ({ name: String(r.name), code: String(r.code) }));
}

/* ---------------- seeding ---------------- */

async function seedMasterData(): Promise<void> {
  // Upsert so the ProcureGuard-aligned country/currency lists land on already-seeded DBs too
  // (names/rates/flags refresh from the constants; country.status is left untouched for admins).
  for (const c of SEED_CURRENCIES) {
    await exec(
      `INSERT INTO currency (code, decimals, usd_rate) VALUES (?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET decimals = EXCLUDED.decimals, usd_rate = EXCLUDED.usd_rate`,
      [c.code, c.decimals, c.usd_rate],
    );
  }
  for (const c of SEED_COUNTRIES) {
    await exec(
      `INSERT INTO country (code, name, default_currency, flag, status) VALUES (?, ?, ?, ?, 'Active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, default_currency = EXCLUDED.default_currency, flag = EXCLUDED.flag`,
      [c.code, c.name, c.ccy, c.flag],
    );
  }
  for (const u of SEED_UOMS) {
    await exec(`INSERT INTO unit_of_measure (name, status) VALUES (?, 'Active') ON CONFLICT (name) DO NOTHING`, [u]);
  }
  for (const cat of SPEND_TAXONOMY) {
    const res = await exec(
      `INSERT INTO spend_category (name, type, status) VALUES (?, ?, 'Active')
       ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type RETURNING id`,
      [cat.name, cat.type],
    );
    let categoryId = res.insertId;
    if (!categoryId) {
      const rows = await sql<{ id: number }[]>(`SELECT id FROM spend_category WHERE name = ?`, [cat.name]);
      categoryId = rows[0]?.id ?? 0;
    }
    for (const sub of cat.subs) {
      await exec(
        `INSERT INTO spend_subcategory (category_id, name, status) VALUES (?, ?, 'Active')
         ON CONFLICT (category_id, name) DO NOTHING`,
        [categoryId, sub.name],
      );
    }
  }
  // global default approval threshold (country/category null), if not already set
  await exec(
    `INSERT INTO approval_threshold (country_code, spend_category_id, threshold_usd, updated_by)
     VALUES (NULL, NULL, ?, 'system')
     ON CONFLICT (COALESCE(country_code, ''), COALESCE(spend_category_id, 0)) DO NOTHING`,
    [APPROVAL_THRESHOLD_USD],
  );

  // service-activity reference list (only seed when empty, to avoid 127 upserts each boot)
  const svcCount = await sql<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM service_activity`);
  if (Number(svcCount[0]?.n ?? 0) === 0) {
    for (const s of SERVICE_ACTIVITIES) {
      await exec(
        `INSERT INTO service_activity (activity_number, short_text, base_uom) VALUES (?, ?, ?) ON CONFLICT (activity_number) DO NOTHING`,
        [s.no, s.text, s.uom],
      );
    }
  }
}

const DEMO_USERS: { name: string; email: string; role: CatalogRole; country: string }[] = [
  { name: 'Layla Al-Rashid', email: 'layla.alrashid@nesr.com', role: 'Contributor', country: 'SA' },
  { name: 'Omar Haddad', email: 'omar.haddad@nesr.com', role: 'Approver', country: 'SA' },
  { name: 'Fatima Noor', email: 'fatima.noor@nesr.com', role: 'Contributor', country: 'AE' },
  { name: 'Daniel Reyes', email: 'daniel.reyes@nesr.com', role: 'Approver', country: 'AE' },
  { name: 'Khalid Mansour', email: 'khalid.mansour@nesr.com', role: 'Admin', country: 'SA' },
  { name: 'Priya Menon', email: 'priya.menon@nesr.com', role: 'Viewer', country: 'KW' },
];

async function seedDemoData(): Promise<void> {
  const users = await sql<{ id: number; email: string }[]>(`SELECT id, email FROM app_user`);
  if (users.length === 0) {
    for (const u of DEMO_USERS) {
      await exec(`INSERT INTO app_user (full_name, email, country_code, role) VALUES (?, ?, ?, ?)
        ON CONFLICT (email) DO NOTHING`, [u.name, u.email, u.country, u.role]);
    }
    // seed per-country approvers from the two Approver users
    const omar = await sql<{ id: number }[]>(`SELECT id FROM app_user WHERE email = ?`, ['omar.haddad@nesr.com']);
    const daniel = await sql<{ id: number }[]>(`SELECT id FROM app_user WHERE email = ?`, ['daniel.reyes@nesr.com']);
    if (omar[0]) {
      await exec(`INSERT INTO country_approver (user_id, country_code, tier) VALUES (?, 'SA', 2) ON CONFLICT DO NOTHING`, [omar[0].id]);
      await exec(`INSERT INTO country_approver (user_id, country_code, tier) VALUES (?, 'KW', 2) ON CONFLICT DO NOTHING`, [omar[0].id]);
    }
    if (daniel[0]) {
      await exec(`INSERT INTO country_approver (user_id, country_code, tier) VALUES (?, 'AE', 2) ON CONFLICT DO NOTHING`, [daniel[0].id]);
    }
  }

  const existing = await sql<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM catalog_entry`);
  if (Number(existing[0]?.n ?? 0) > 0) return;

  await seedDemoEntries();
}

interface PriorVersion {
  price: number;
  effective: string;
  reason: string;
  modifiedAt: string;
}
interface DemoEntrySpec {
  supplier: string;
  vendor: string;
  manager: string;
  country: string;
  ccy: string;
  category: string;
  sub: string;
  commodity: string;
  family: string;
  unspsc: string;
  item: string;
  uom: string;
  price: number;
  effective: string;
  expiry: string | null;
  status: CatalogStatus;
  sirion: string | null;
  createdBy: string;
  notes?: string | null;
  withDoc?: boolean;
  priors?: PriorVersion[];
}

// Reference "today" for the seed = 2026-06-18. A few entries expire within 30 days so the
// dashboard "Expiring soon" tile and the catalog "Expiring ≤ 30 days" facet have content.
const DEMO_ENTRIES: DemoEntrySpec[] = [
  {
    supplier: 'Arabian Drilling Solutions', vendor: 'V-100517', manager: 'Layla Al-Rashid', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Drilling Product & Services', commodity: 'Directional Drilling', family: 'Drilling Services', unspsc: '20121401',
    item: 'Directional drilling service — per well', uom: 'Per Well', price: 184500, effective: '2026-01-15', expiry: '2026-07-05', status: 'Active',
    sirion: 'SIR-CN-204815', createdBy: 'Layla Al-Rashid', notes: 'Rate per MSA-SA-2026-014. Mobilization billed separately.', withDoc: true,
    priors: [
      { price: 168000, effective: '2025-01-10', reason: 'Initial agreed rate', modifiedAt: '2025-01-06' },
      { price: 176000, effective: '2025-07-01', reason: 'Annual escalation +4.8%', modifiedAt: '2025-12-20' },
    ],
  },
  {
    supplier: 'Gulf Assurance Brokers', vendor: 'V-200118', manager: 'Mona Saleh', country: 'SA', ccy: 'SAR',
    category: 'Professional Services', sub: 'Insurance', commodity: 'Property Insurance', family: 'Property Insurance', unspsc: '84131500',
    item: 'Annual property & assets policy renewal', uom: 'Lump Sum', price: 412000, effective: '2026-06-20', expiry: '2027-06-19', status: 'Pending Approval',
    sirion: 'SIR-CN-209473', createdBy: 'Layla Al-Rashid', notes: 'Annual policy renewal — awaiting category manager sign-off.', withDoc: true,
  },
  {
    supplier: 'Gulf Cementing Co.', vendor: 'V-100482', manager: 'Omar Haddad', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Drilling Product & Services', commodity: 'Primary Cementing', family: 'Cementing', unspsc: '20121501',
    item: 'Primary cementing — 9-5/8" casing string', uom: 'Per Well', price: 128000, effective: '2026-02-01', expiry: '2027-01-31', status: 'Active',
    sirion: 'SIR-CN-231004', createdBy: 'Layla Al-Rashid', withDoc: true,
    priors: [{ price: 119000, effective: '2025-02-01', reason: 'Initial agreed rate', modifiedAt: '2025-01-28' }],
  },
  {
    supplier: 'Skyline Travel Services', vendor: 'V-200517', manager: 'Sara Bishara', country: 'SA', ccy: 'SAR',
    category: 'Travel & Entertainment', sub: 'Air Tickets', commodity: 'Corporate Air Travel', family: 'Travel', unspsc: '90121500',
    item: 'Corporate travel management fee', uom: 'Month', price: 18000, effective: '2026-03-01', expiry: '2026-07-12', status: 'Active',
    sirion: null, createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Falcon Wireline Group', vendor: 'V-100915', manager: 'Daniel Reyes', country: 'AE', ccy: 'AED',
    category: 'Field Technical Equipment & Services', sub: 'Logging tools', commodity: 'Cased-Hole Logging', family: 'Wireline', unspsc: '20122000',
    item: 'Cased-hole logging run', uom: 'Per Job', price: 54000, effective: '2026-04-15', expiry: '2027-04-14', status: 'Active',
    sirion: 'SIR-CN-231245', createdBy: 'Fatima Noor', withDoc: true,
  },
  {
    supplier: 'MENA IT Systems', vendor: 'V-200245', manager: 'Sara Bishara', country: 'AE', ccy: 'AED',
    category: 'IT', sub: 'Software', commodity: 'SaaS Subscription', family: 'Software', unspsc: '43232300',
    item: 'Field reporting SaaS — annual licence', uom: 'Lump Sum', price: 210000, effective: '2026-08-01', expiry: '2027-07-31', status: 'Pending Approval',
    sirion: 'SIR-CN-231640', createdBy: 'Fatima Noor', withDoc: true,
  },
  {
    supplier: 'Desert Logistics LLC', vendor: 'V-100631', manager: 'Rashid Al-Maktoum', country: 'KW', ccy: 'KWD',
    category: 'Logistics', sub: 'Heavy Trucks and Parts', commodity: 'Heavy Equipment Haulage', family: 'Transport', unspsc: '78101800',
    item: 'Lowbed transport — rig move', uom: 'Per Trip', price: 1450, effective: '2026-03-10', expiry: '2027-03-09', status: 'Active',
    sirion: 'SIR-CN-231390', createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'SafeGuard PPE Supplies', vendor: 'V-200922', manager: 'Mona Saleh', country: 'SA', ccy: 'SAR',
    category: 'Safety', sub: 'Life Safety (PPE)', commodity: 'Personal Protective Equipment', family: 'PPE', unspsc: '46181500',
    item: 'FR coverall set — per person', uom: 'Per Person', price: 640, effective: '2026-02-15', expiry: '2028-02-14', status: 'Active',
    sirion: null, createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Najd Stimulation Services', vendor: 'V-100822', manager: 'Yousef Karim', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Completion Tools', commodity: 'Frac Plug Assembly', family: 'Completions', unspsc: '20122100',
    item: 'Composite frac plug — per stage', uom: 'Per Stage', price: 96500, effective: '2025-11-01', expiry: '2026-06-25', status: 'Active',
    sirion: 'SIR-CN-231118', createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Peninsula HSE Services', vendor: 'V-101508', manager: 'Mona Saleh', country: 'AE', ccy: 'AED',
    category: 'Safety', sub: 'Safety Equipment', commodity: 'Safety Standby', family: 'HSE', unspsc: '46180000',
    item: 'HSE standby crew — day rate', uom: 'Day', price: 4200, effective: '2026-01-20', expiry: null, status: 'Draft',
    sirion: null, createdBy: 'Fatima Noor', withDoc: false,
  },
  {
    supplier: 'Oryx Filtration Systems', vendor: 'V-102156', manager: 'Yousef Karim', country: 'OM', ccy: 'OMR',
    category: 'Maintenance & Repair Operations', sub: 'Filters', commodity: 'Filter Element Replacement', family: 'MRO', unspsc: '40161500',
    item: 'Filtration element replacement programme', uom: 'Month', price: 3100, effective: '2025-05-01', expiry: '2026-05-30', status: 'Expired',
    sirion: null, createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Tigris Well Testing', vendor: 'V-101733', manager: 'Daniel Reyes', country: 'QA', ccy: 'QAR',
    category: 'Field Technical Equipment & Services', sub: 'Pressure Containment Equipment', commodity: 'Surface Well Test Package', family: 'Well Testing', unspsc: '20122200',
    item: 'Surface well test package — day rate', uom: 'Day', price: 88000, effective: '2026-05-01', expiry: '2027-04-30', status: 'Rejected',
    sirion: null, createdBy: 'Fatima Noor', notes: 'Resubmitted after benchmark review requested.', withDoc: true,
  },
  // Crescent Pressure Control — a single supplier with several pending Tier-2 lines,
  // so the Approvals queue shows an "Approve all" group out of the box.
  {
    supplier: 'Crescent Pressure Control', vendor: 'V-102011', manager: 'Yousef Karim', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Pressure Containment Equipment', commodity: 'BOP Rental & Service', family: 'Pressure Control', unspsc: '20122300',
    item: 'Annular BOP rental & service — per job', uom: 'Per Job', price: 320000, effective: '2026-06-25', expiry: '2027-06-24', status: 'Pending Approval',
    sirion: 'SIR-CN-240118', createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Crescent Pressure Control', vendor: 'V-102011', manager: 'Yousef Karim', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Pressure Containment Equipment', commodity: 'Choke Manifold Package', family: 'Pressure Control', unspsc: '20122301',
    item: 'Choke manifold package — per well', uom: 'Per Well', price: 245000, effective: '2026-06-25', expiry: '2027-06-24', status: 'Pending Approval',
    sirion: 'SIR-CN-240119', createdBy: 'Layla Al-Rashid', withDoc: true,
  },
  {
    supplier: 'Crescent Pressure Control', vendor: 'V-102011', manager: 'Yousef Karim', country: 'SA', ccy: 'SAR',
    category: 'Field Technical Equipment & Services', sub: 'Pressure Containment Equipment', commodity: 'Wellhead Pressure Test', family: 'Pressure Control', unspsc: '20122302',
    item: 'Wellhead pressure-test crew — day rate', uom: 'Day', price: 410000, effective: '2026-06-25', expiry: '2027-06-24', status: 'Pending Approval',
    sirion: null, createdBy: 'Layla Al-Rashid', withDoc: false,
  },
];

const APPROVER_BY_COUNTRY: Record<string, string> = { SA: 'Omar Haddad', KW: 'Omar Haddad', AE: 'Daniel Reyes' };
const approverFor = (country: string) => APPROVER_BY_COUNTRY[country] ?? 'Omar Haddad';

async function seedDemoEntries(): Promise<void> {
  let seq = 1040;
  for (const d of DEMO_ENTRIES) {
    const supplierId = await upsertSupplier(d.supplier, d.vendor, d.manager);
    const cat = await sql<{ id: number; type: string }[]>(`SELECT id, type FROM spend_category WHERE name = ?`, [d.category]);
    const categoryId = cat[0]?.id ?? null;
    const spendType = (cat[0]?.type as SpendType) ?? 'Services';
    const sub = categoryId
      ? await sql<{ id: number }[]>(`SELECT id FROM spend_subcategory WHERE category_id = ? AND name = ?`, [categoryId, d.sub])
      : [];
    const subId = sub[0]?.id ?? null;
    const uom = await sql<{ id: number }[]>(`SELECT id FROM unit_of_measure WHERE name = ?`, [d.uom]);
    const uomId = uom[0]?.id ?? null;
    const usd = toUsd(d.price, d.ccy);
    const tier = approvalTier(usd);
    const code = `CAT-${seq++}`;
    const sirionUrl = d.sirion ? `https://nesr.sirion.ai/contracts/${d.sirion.replace(/\D/g, '')}` : null;

    const priors = d.priors ?? [];
    const currentVersion = priors.length + 1;

    // approver / decision per status
    const isApproved = d.status === 'Active' && tier.needsApproval;
    const isRejected = d.status === 'Rejected';
    const isPending = d.status === 'Pending Approval';
    const approverName = isApproved || isRejected || isPending ? approverFor(d.country) : null;
    const approvalComment = isApproved ? 'Approved — within regional benchmark.' : isRejected ? 'Rejected — price above benchmark, please revise.' : null;

    const ins = await exec(
      `INSERT INTO catalog_entry
        (code, country_code, supplier_id, category_id, subcategory_id, uom_id, spend_type, family, commodity,
         unspsc_code, item_name, description, sirion_contract_id, sirion_url, notes, status, tier_label,
         current_version_no, manager, approver_name, approval_comment, created_by, modified_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [
        code, d.country, supplierId, categoryId, subId, uomId, spendType, d.family, d.commodity,
        d.unspsc, d.item, d.item, d.sirion, sirionUrl, d.notes ?? null, d.status, tier.label,
        currentVersion, d.manager, approverName, approvalComment, d.createdBy, d.createdBy,
      ],
    );
    if (!ins.insertId) continue; // entry already seeded by a concurrent run — skip its children

    // prior versions (oldest first), then the current version
    for (let v = 0; v < priors.length; v++) {
      const p = priors[v];
      await exec(
        `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by, modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, v + 1, p.price, d.ccy, p.effective, null, p.reason, d.createdBy, p.modifiedAt],
      );
    }
    await exec(
      `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ins.insertId, currentVersion, d.price, d.ccy, d.effective, d.expiry, priors.length ? 'Annual rate escalation' : 'Initial agreed rate', d.createdBy],
    );

    if (d.withDoc) {
      await exec(
        `INSERT INTO entry_document (entry_id, file_name, doc_type, size_label) VALUES (?, ?, ?, ?)`,
        [ins.insertId, `${d.supplier} — Rate Card 2026 (signed).pdf`, 'Signed Rate Agreement', '2.1 MB'],
      );
    }

    if (isApproved || isRejected) {
      await exec(
        `INSERT INTO approval_decision (entry_id, version_no, decided_by, decision, tier, comment) VALUES (?, ?, ?, ?, 2, ?)`,
        [ins.insertId, currentVersion, approverName, isApproved ? 'Approved' : 'Rejected', approvalComment],
      );
    }

    const auditAction = isApproved ? 'Approve' : isRejected ? 'Reject' : isPending ? 'Create' : 'Create';
    const auditDetail = isApproved ? 'Approved — within regional benchmark.'
      : isRejected ? 'Rejected — price above benchmark, please revise.'
      : isPending ? 'New entry submitted for approval'
      : d.status === 'Draft' ? 'Saved new draft entry' : 'New entry created & activated';
    await writeAudit(auditAction, code, d.createdBy, auditDetail);
  }

  await writeAudit('Master data', 'Spend Categories', 'Khalid Mansour', `Loaded NESR spend taxonomy (${SPEND_TAXONOMY.length} categories)`);
}

async function upsertSupplier(name: string, vendor: string, manager: string | null): Promise<number> {
  const ins = await exec(
    `INSERT INTO supplier (vendor_code, name, accountable_manager) VALUES (?, ?, ?)
     ON CONFLICT (vendor_code) DO UPDATE SET name = EXCLUDED.name,
       accountable_manager = COALESCE(EXCLUDED.accountable_manager, supplier.accountable_manager)
     RETURNING id`,
    [vendor, name, manager],
  );
  return ins.insertId;
}

/* ============================================================================
   ACTOR / PERMISSIONS
============================================================================ */

export async function getCatalogActor(): Promise<CatalogActor> {
  await ensureCatalogManagerSchema();
  const sessionUser = await getProcureGuardUser();
  const email = (sessionUser?.email ?? '').toLowerCase();
  const name = sessionUser?.name ?? 'Catalog User';

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const rows = email ? await sql<AppUserRow[]>(`SELECT * FROM app_user WHERE LOWER(email) = ?`, [email]) : [];
  const userRow = rows[0];

  let role: CatalogRole;
  let countryCode: string | null;
  const userId: number | null = userRow?.id ?? null;

  if (userRow) {
    role = userRow.role;
    countryCode = userRow.country_code;
  } else if (adminEmails.includes(email)) {
    // Admin-preview: configured admins with no app_user row act as Admin.
    role = 'Admin';
    countryCode = (process.env.CATALOG_HOME_COUNTRY ?? '').trim().toUpperCase() || null;
  } else {
    role = 'Viewer';
    countryCode = null;
  }

  const canCreate = role === 'Contributor' || role === 'Approver' || role === 'Admin';
  const canApprove = role === 'Approver' || role === 'Admin';
  const canAdmin = role === 'Admin';

  let ownApproverCountries: string[] = [];
  if (role === 'Admin') {
    const all = await sql<{ code: string }[]>(`SELECT code FROM country WHERE status = 'Active'`);
    ownApproverCountries = all.map((c) => c.code);
  } else if (canApprove && userId) {
    const ca = await sql<{ country_code: string }[]>(
      `SELECT DISTINCT country_code FROM country_approver WHERE user_id = ? AND is_active = TRUE`,
      [userId],
    );
    ownApproverCountries = ca.map((c) => c.country_code);
  }

  // Merge in any active delegations TO this user for the Catalog Repo app.
  const delegatedFrom = await resolveCatalogDelegations(email);
  const delegatedCountries = delegatedFrom.flatMap((d) => d.countries);
  const approverCountries = [...new Set([...ownApproverCountries, ...delegatedCountries])];

  return {
    email,
    name,
    role,
    country_code: countryCode,
    canCreate,
    canApprove: canApprove || delegatedFrom.length > 0,
    canAdmin,
    approverCountries,
    canApproveOwn: canApprove,
    ownApproverCountries,
    delegatedFrom,
  };
}

/**
 * Resolve active delegations TO `email` for Catalog Repo, expanding each
 * delegator into the countries they can approve (from this DB's own tables).
 * Fail-safe: returns [] if delegation_db is unavailable.
 */
async function resolveCatalogDelegations(email: string): Promise<CatalogDelegationGrant[]> {
  const delegators = await getDelegatorsForApp(email, 'catalog');
  if (!delegators.length) return [];

  const grants: CatalogDelegationGrant[] = [];
  for (const d of delegators) {
    const rows = await sql<AppUserRow[]>(`SELECT * FROM app_user WHERE LOWER(email) = ?`, [d.email.toLowerCase()]);
    const u = rows[0];
    if (!u) continue;
    const canApprove = u.role === 'Approver' || u.role === 'Admin';
    if (!canApprove) continue;

    let countries: string[];
    if (u.role === 'Admin') {
      const all = await sql<{ code: string }[]>(`SELECT code FROM country WHERE status = 'Active'`);
      countries = all.map((c) => c.code);
    } else {
      const ca = await sql<{ country_code: string }[]>(
        `SELECT DISTINCT country_code FROM country_approver WHERE user_id = ? AND is_active = TRUE`,
        [u.id],
      );
      countries = ca.map((c) => c.country_code);
    }
    grants.push({ email: d.email, name: u.full_name ?? d.name ?? d.email, countries });
  }
  return grants;
}

/**
 * For a catalog entry's country, decide whether the actor is acting under their
 * OWN authority or on behalf of a delegator. Returns the display label to record
 * and whether the action is permitted at all.
 */
function catalogActingIdentity(
  actor: CatalogActor,
  countryCode: string,
): { allowed: boolean; label: string } {
  const ownCovers =
    actor.role === 'Admin' ||
    (actor.canApproveOwn === true &&
      ((actor.ownApproverCountries?.length ?? 0) === 0 || (actor.ownApproverCountries ?? []).includes(countryCode)));
  if (ownCovers) return { allowed: true, label: actor.name };

  const delegator = (actor.delegatedFrom ?? []).find((d) => d.countries.includes(countryCode));
  if (delegator) return { allowed: true, label: `${actor.name} (on behalf of ${delegator.name})` };

  return { allowed: false, label: actor.name };
}

/* ============================================================================
   ENTRY READ — flatten catalog_entry + current rate_version + joins.
============================================================================ */

const ENTRY_SELECT = `
  SELECT
    e.id, e.code, e.country_code,
    c.name AS country_name, c.flag AS country_flag,
    e.supplier_id, s.name AS supplier_name, s.vendor_code AS supplier_code, e.manager,
    e.spend_type, e.category_id, cat.name AS category_name,
    e.subcategory_id, sub.name AS subcategory_name,
    e.family, e.commodity, e.unspsc_code, e.item_name, e.description,
    e.uom_id, u.name AS uom_name,
    rv.unit_price, rv.currency_code,
    rv.effective_date::text AS effective_date, rv.expiry_date::text AS expiry_date,
    e.status, e.tier_label, e.current_version_no AS version_no,
    e.sirion_contract_id, e.sirion_url, e.notes, e.incoterms, e.incoterms_location, e.lead_time_days,
    e.approver_name, e.approval_comment,
    e.created_by, e.created_at::text AS created_at,
    e.modified_by, e.modified_at::text AS modified_at
  FROM catalog_entry e
  JOIN supplier s ON s.id = e.supplier_id
  JOIN country c ON c.code = e.country_code
  LEFT JOIN spend_category cat ON cat.id = e.category_id
  LEFT JOIN spend_subcategory sub ON sub.id = e.subcategory_id
  LEFT JOIN unit_of_measure u ON u.id = e.uom_id
  LEFT JOIN rate_version rv ON rv.entry_id = e.id AND rv.version_no = e.current_version_no
`;

function mapEntry(row: QueryResultRow): CatalogEntry {
  const price = Number(row.unit_price ?? 0);
  const ccy = String(row.currency_code ?? 'USD');
  return {
    id: Number(row.id),
    code: String(row.code),
    country_code: String(row.country_code),
    country_name: String(row.country_name),
    country_flag: row.country_flag ?? null,
    supplier_id: Number(row.supplier_id),
    supplier_name: String(row.supplier_name),
    supplier_code: String(row.supplier_code),
    manager: row.manager ?? null,
    spend_type: (row.spend_type as SpendType) ?? null,
    category_id: row.category_id ? Number(row.category_id) : null,
    category_name: row.category_name ?? null,
    subcategory_id: row.subcategory_id ? Number(row.subcategory_id) : null,
    subcategory_name: row.subcategory_name ?? null,
    family: row.family ?? null,
    commodity: row.commodity ?? null,
    unspsc_code: row.unspsc_code ?? null,
    item_name: String(row.item_name),
    description: row.description ?? null,
    uom_id: row.uom_id ? Number(row.uom_id) : null,
    uom_name: row.uom_name ?? null,
    unit_price: price,
    currency_code: ccy,
    usd_equivalent: toUsd(price, ccy),
    effective_date: row.effective_date ? String(row.effective_date).slice(0, 10) : '',
    expiry_date: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    status: row.status as CatalogStatus,
    tier_label: String(row.tier_label),
    version_no: Number(row.version_no ?? 1),
    sirion_contract_id: row.sirion_contract_id ?? null,
    sirion_url: row.sirion_url ?? null,
    notes: row.notes ?? null,
    incoterms: row.incoterms ?? null,
    incoterms_location: row.incoterms_location ?? null,
    lead_time_days: row.lead_time_days != null ? Number(row.lead_time_days) : null,
    approver_name: row.approver_name ?? null,
    approval_comment: row.approval_comment ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at ? String(row.created_at).slice(0, 10) : '',
    modified_by: row.modified_by ?? null,
    modified_at: row.modified_at ? String(row.modified_at).slice(0, 10) : '',
    documents: [],
    history: [],
  };
}

export interface CatalogListFilters {
  country?: string; // 'ALL' or a code
}

export async function listCatalogEntries(filters: CatalogListFilters = {}): Promise<CatalogEntry[]> {
  await ensureCatalogManagerSchema();
  const params: QueryParams = [];
  let where = '';
  if (filters.country && filters.country !== 'ALL') {
    where = `WHERE e.country_code = ?`;
    params.push(filters.country);
  }
  const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} ${where} ORDER BY e.modified_at DESC`, params);
  return rows.map(mapEntry);
}

/**
 * Read-only PIR / Inventory catalog rows (mirror loaded by n8n). The app never writes here.
 * Numeric columns come back from pg as strings, so they're coerced to numbers for the client.
 */
export async function listPirEntries(): Promise<PirEntry[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT * FROM pir_catalog ORDER BY supplier_name NULLS LAST, product_number NULLS LAST, info_record_number NULLS LAST`,
  );
  const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
  const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
  return rows.map((r) => ({
    info_record_number: str(r.info_record_number),
    product_number: str(r.product_number),
    material_description: str(r.material_description),
    material_group: str(r.material_group),
    suppliers_account_number: str(r.suppliers_account_number),
    supplier_name: str(r.supplier_name),
    purchasing_organization: str(r.purchasing_organization),
    purchase_org_description: str(r.purchase_org_description),
    purchasing_group: str(r.purchasing_group),
    plant: str(r.plant),
    country: str(r.country),
    order_unit: str(r.order_unit),
    base_unit_of_measure: str(r.base_unit_of_measure),
    numerator_for_conversion: num(r.numerator_for_conversion),
    unit_price: num(r.unit_price),
    currency_key: str(r.currency_key),
    standard_qty: num(r.standard_qty),
    planned_delivery_time_days: num(r.planned_delivery_time_days),
    overdelivery_tolerance_limit: num(r.overdelivery_tolerance_limit),
    shipping_instructions: str(r.shipping_instructions),
    minimum_remaining_shelf_life: num(r.minimum_remaining_shelf_life),
    incoterms: str(r.incoterms),
    incoterms_location_1: str(r.incoterms_location_1),
    valid_days: num(r.valid_days),
    valid_till_expiry_date: str(r.valid_till_expiry_date),
    expiring_in: str(r.expiring_in),
    status: str(r.status),
    deletion_flag: str(r.deletion_flag),
    material_supplier: str(r.material_supplier),
    material_supplier_org: str(r.material_supplier_org),
  }));
}

/** All SAP supplier names (from the seeded directory) — feeds the import template's supplier dropdown. */
export async function getSupplierDirectoryNames(): Promise<string[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<{ name: string }[]>(
    `SELECT DISTINCT name FROM supplier_directory WHERE name IS NOT NULL AND name <> '' ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

export async function getPendingApprovalCount(country = 'ALL'): Promise<number> {
  await ensureCatalogManagerSchema();
  const params: QueryParams = ['Pending Approval'];
  let where = `WHERE status = ?`;
  if (country && country !== 'ALL') {
    where += ` AND country_code = ?`;
    params.push(country);
  }
  const rows = await sql<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM catalog_entry ${where}`, params);
  return Number(rows[0]?.n ?? 0);
}

export async function getCatalogEntry(id: number): Promise<CatalogEntry | null> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.id = ?`, [id]);
  if (!rows[0]) return null;
  const entry = mapEntry(rows[0]);

  const docs = await sql<QueryResultRow[]>(
    `SELECT id, file_name, doc_type, size_label, (data_url IS NOT NULL) AS has_file, uploaded_by
     FROM entry_document WHERE entry_id = ? ORDER BY id`,
    [id],
  );
  entry.documents = docs.map((d) => ({
    id: Number(d.id),
    file_name: String(d.file_name),
    doc_type: d.doc_type ?? null,
    size_label: d.size_label ?? null,
    has_file: Boolean(d.has_file),
    uploaded_by: d.uploaded_by ?? null,
  }));

  const versions = await sql<QueryResultRow[]>(
    `SELECT version_no, unit_price, currency_code, effective_date::text AS effective_date,
            expiry_date::text AS expiry_date, change_reason, modified_by, modified_at::text AS modified_at
     FROM rate_version WHERE entry_id = ? ORDER BY version_no DESC`,
    [id],
  );
  entry.history = versions.map((v) => ({
    version_no: Number(v.version_no),
    unit_price: Number(v.unit_price),
    currency_code: String(v.currency_code),
    effective_date: v.effective_date ? String(v.effective_date).slice(0, 10) : '',
    expiry_date: v.expiry_date ? String(v.expiry_date).slice(0, 10) : null,
    change_reason: v.change_reason ?? null,
    modified_by: v.modified_by ?? null,
    modified_at: v.modified_at ? String(v.modified_at).slice(0, 10) : '',
  }));

  return entry;
}

/* ============================================================================
   DASHBOARD
============================================================================ */

export async function getCatalogManagerDashboardData(country = 'ALL'): Promise<CatalogManagerDashboardData> {
  await ensureCatalogManagerSchema();
  const scoped = country !== 'ALL';
  const scopeWhere = scoped ? `WHERE e.country_code = ?` : '';
  const scopeParams: QueryParams = scoped ? [country] : [];
  const activeScope = scoped ? `AND e.country_code = ?` : '';

  const [totals, byCategoryRows, expiringRows, countryRows, recent] = await Promise.all([
    sql<{
      active_count: number;
      supplier_count: number;
      category_count: number;
      pending_count: number;
      expiring_count: number;
    }[]>(`
      SELECT
        COUNT(*) FILTER (WHERE e.status = 'Active')::int AS active_count,
        COUNT(DISTINCT e.supplier_id) FILTER (WHERE e.status = 'Active')::int AS supplier_count,
        COUNT(DISTINCT COALESCE(e.category_id, 0)) FILTER (WHERE e.status = 'Active')::int AS category_count,
        COUNT(*) FILTER (WHERE e.status = 'Pending Approval')::int AS pending_count,
        COUNT(*) FILTER (
          WHERE e.status = 'Active'
            AND rv.expiry_date IS NOT NULL
            AND rv.expiry_date >= CURRENT_DATE
            AND rv.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        )::int AS expiring_count
      FROM catalog_entry e
      LEFT JOIN rate_version rv ON rv.entry_id = e.id AND rv.version_no = e.current_version_no
      ${scopeWhere}
    `, scopeParams),
    sql<CategoryBar[]>(`
      SELECT COALESCE(cat.name, 'Uncategorized') AS name, COUNT(*)::int AS count
      FROM catalog_entry e
      LEFT JOIN spend_category cat ON cat.id = e.category_id
      WHERE e.status = 'Active' ${activeScope}
      GROUP BY COALESCE(cat.name, 'Uncategorized')
      ORDER BY count DESC
      LIMIT 7
    `, scopeParams),
    sql<QueryResultRow[]>(`
      ${ENTRY_SELECT}
      WHERE e.status = 'Active'
        AND rv.expiry_date IS NOT NULL
        AND rv.expiry_date >= CURRENT_DATE
        AND rv.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        ${activeScope}
      ORDER BY rv.expiry_date ASC
      LIMIT 5
    `, scopeParams),
    scoped ? sql<{ name: string }[]>(`SELECT name FROM country WHERE code = ? LIMIT 1`, [country]) : Promise.resolve([]),
    getAuditLog(8),
  ]);

  const total = totals[0] ?? { active_count: 0, supplier_count: 0, category_count: 0, pending_count: 0, expiring_count: 0 };

  return {
    scope: country === 'ALL' ? 'all operating countries' : (countryRows[0]?.name ?? country),
    activeCount: Number(total.active_count ?? 0),
    supplierCount: Number(total.supplier_count ?? 0),
    categoryCount: Number(total.category_count ?? 0),
    expiringCount: Number(total.expiring_count ?? 0),
    pendingCount: Number(total.pending_count ?? 0),
    byCategory: byCategoryRows.map((r) => ({ name: String(r.name), count: Number(r.count) })),
    expiringSoon: expiringRows.map(mapEntry),
    recent,
  };
}

/* ============================================================================
   CREATE / EDIT / WORKFLOW
============================================================================ */

export interface CatalogEntryInput {
  id?: number;
  supplier_name: string;
  supplier_code: string;
  manager: string | null;
  country_code: string;
  category_name: string;
  subcategory_name: string | null;
  spend_type: SpendType | null;
  family: string | null;
  commodity: string | null;
  unspsc_code: string | null;
  item_name: string;
  description: string | null;
  uom_name: string;
  unit_price: number;
  currency_code: string;
  effective_date: string;
  expiry_date: string | null;
  notes: string | null;
  sirion_contract_id: string | null;
  sirion_url: string | null;
  incoterms: string | null;
  incoterms_location: string | null;
  lead_time_days: number | null;
}

async function nextEntryCode(): Promise<string> {
  const rows = await sql<{ n: number }[]>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 1039) AS n
     FROM catalog_entry WHERE code ~ '^CAT-[0-9]+$'`,
  );
  return `CAT-${Number(rows[0]?.n ?? 1039) + 1}`;
}

async function loadThresholdRules(): Promise<ThresholdRule[]> {
  const rows = await sql<{ country_code: string | null; spend_category_id: number | null; threshold_usd: string | number }[]>(
    `SELECT country_code, spend_category_id, threshold_usd FROM approval_threshold`,
  );
  return rows.map((r) => ({
    country_code: r.country_code,
    spend_category_id: r.spend_category_id != null ? Number(r.spend_category_id) : null,
    threshold_usd: Number(r.threshold_usd),
  }));
}

async function resolveRefs(input: CatalogEntryInput) {
  const cat = await sql<{ id: number; type: string }[]>(`SELECT id, type FROM spend_category WHERE name = ?`, [input.category_name]);
  const categoryId = cat[0]?.id ?? null;
  const spendType = (input.spend_type ?? (cat[0]?.type as SpendType)) ?? 'Services';
  let subId: number | null = null;
  if (categoryId && input.subcategory_name) {
    const sub = await sql<{ id: number }[]>(`SELECT id FROM spend_subcategory WHERE category_id = ? AND name = ?`, [categoryId, input.subcategory_name]);
    subId = sub[0]?.id ?? null;
  }
  const uom = await sql<{ id: number }[]>(`SELECT id FROM unit_of_measure WHERE name = ?`, [input.uom_name]);
  return { categoryId, spendType, subId, uomId: uom[0]?.id ?? null };
}

/** Create a new entry. mode 'draft' keeps it Draft; 'submit' sends for approval (or auto-activates Tier 1). */
export async function createCatalogEntry(input: CatalogEntryInput, mode: 'draft' | 'submit'): Promise<{ id: number; code: string; status: CatalogStatus }> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to create catalog entries.');

  const supplierId = await upsertSupplier(input.supplier_name, input.supplier_code, input.manager);
  const { categoryId, spendType, subId, uomId } = await resolveRefs(input);
  const usd = toUsd(input.unit_price, input.currency_code);
  const threshold = effectiveThresholdUsd(await loadThresholdRules(), input.country_code, categoryId);
  const tier = approvalTier(usd, threshold);
  const status: CatalogStatus = mode === 'draft' ? 'Draft' : tier.needsApproval ? 'Pending Approval' : 'Active';
  const code = await nextEntryCode();
  const approver = status === 'Pending Approval' ? (input.country_code === 'AE' ? 'Daniel Reyes' : 'Omar Haddad') : null;

  const ins = await exec(
    `INSERT INTO catalog_entry
      (code, country_code, supplier_id, category_id, subcategory_id, uom_id, spend_type, family, commodity,
       unspsc_code, item_name, description, sirion_contract_id, sirion_url, notes, incoterms, incoterms_location, lead_time_days,
       status, tier_label, current_version_no, manager, approver_name, created_by, modified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING id`,
    [
      code, input.country_code, supplierId, categoryId, subId, uomId, spendType, input.family, input.commodity,
      input.unspsc_code, input.item_name, input.description, input.sirion_contract_id, input.sirion_url, input.notes,
      input.incoterms, input.incoterms_location, input.lead_time_days,
      status, tier.label, input.manager, approver, actor.name, actor.name,
    ],
  );
  await exec(
    `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by)
     VALUES (?, 1, ?, ?, ?, ?, 'Initial agreed rate', ?)`,
    [ins.insertId, input.unit_price, input.currency_code, input.effective_date, input.expiry_date, actor.name],
  );
  await writeAudit('Create', code, actor.name,
    mode === 'draft' ? 'Saved new draft entry' : status === 'Active' ? 'New entry created & activated' : 'New entry submitted for approval');
  return { id: ins.insertId, code, status };
}

export type CatalogEntryLine = Omit<CatalogEntryInput, 'id' | 'supplier_name' | 'supplier_code' | 'manager' | 'country_code'>;

/** Create several entries that share one supplier + country (the manual "add more lines" flow). */
export async function createCatalogEntriesBatch(
  shared: { supplier_name: string; supplier_code: string; manager: string | null; country_code: string },
  lines: CatalogEntryLine[],
  mode: 'draft' | 'submit',
): Promise<{ created: number; firstId: number | null }> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to create catalog entries.');
  if (!lines.length) throw new Error('Add at least one line item.');

  let firstId: number | null = null;
  let created = 0;
  for (const line of lines) {
    const res = await createCatalogEntry({ ...line, ...shared }, mode);
    if (firstId === null) firstId = res.id;
    created++;
  }
  return { created, firstId };
}

/** Edit an entry — retains the prior version and bumps the version number. */
export async function updateCatalogEntry(input: CatalogEntryInput, mode: 'draft' | 'submit'): Promise<{ id: number; status: CatalogStatus }> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to edit catalog entries.');
  if (!input.id) throw new Error('Missing entry id.');

  const current = await sql<{ code: string; current_version_no: number }[]>(
    `SELECT code, current_version_no FROM catalog_entry WHERE id = ?`,
    [input.id],
  );
  if (!current[0]) throw new Error('Entry not found.');
  const nextVersion = Number(current[0].current_version_no) + 1;

  const supplierId = await upsertSupplier(input.supplier_name, input.supplier_code, input.manager);
  const { categoryId, spendType, subId, uomId } = await resolveRefs(input);
  const usd = toUsd(input.unit_price, input.currency_code);
  const threshold = effectiveThresholdUsd(await loadThresholdRules(), input.country_code, categoryId);
  const tier = approvalTier(usd, threshold);
  const status: CatalogStatus = mode === 'draft' ? 'Draft' : tier.needsApproval ? 'Pending Approval' : 'Active';
  const approver = status === 'Pending Approval' ? (input.country_code === 'AE' ? 'Daniel Reyes' : 'Omar Haddad') : null;

  await exec(
    `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by)
     VALUES (?, ?, ?, ?, ?, ?, 'Edited — new version saved', ?)`,
    [input.id, nextVersion, input.unit_price, input.currency_code, input.effective_date, input.expiry_date, actor.name],
  );
  await exec(
    `UPDATE catalog_entry SET
      country_code = ?, supplier_id = ?, category_id = ?, subcategory_id = ?, uom_id = ?, spend_type = ?,
      family = ?, commodity = ?, unspsc_code = ?, item_name = ?, description = ?,
      sirion_contract_id = ?, sirion_url = ?, notes = ?, incoterms = ?, incoterms_location = ?, lead_time_days = ?, manager = ?,
      status = ?, tier_label = ?, current_version_no = ?, approver_name = ?,
      modified_by = ?, modified_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.country_code, supplierId, categoryId, subId, uomId, spendType,
      input.family, input.commodity, input.unspsc_code, input.item_name, input.description,
      input.sirion_contract_id, input.sirion_url, input.notes, input.incoterms, input.incoterms_location, input.lead_time_days, input.manager,
      status, tier.label, nextVersion, approver, actor.name, input.id,
    ],
  );
  await writeAudit('Edit', current[0].code, actor.name, `Edited entry — version ${nextVersion} saved`);
  return { id: input.id, status };
}

export async function submitForApproval(entryId: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('Not permitted.');
  const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.id = ?`, [entryId]);
  if (!rows[0]) throw new Error('Entry not found.');
  const e = mapEntry(rows[0]);
  const threshold = effectiveThresholdUsd(await loadThresholdRules(), e.country_code, e.category_id);
  const tier = approvalTier(e.usd_equivalent, threshold);
  const next: CatalogStatus = tier.needsApproval ? 'Pending Approval' : 'Active';
  const approver = next === 'Pending Approval' ? (e.country_code === 'AE' ? 'Daniel Reyes' : 'Omar Haddad') : null;
  await exec(`UPDATE catalog_entry SET status = ?, approver_name = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [next, approver, actor.name, entryId]);
  await writeAudit('Status change', e.code, actor.name, `${e.status} → ${next}`);
}

export async function decideCatalogEntry(entryId: number, decision: 'approve' | 'reject' | 'revise', comment: string): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canApprove) throw new Error('You do not have approver permission.');
  if (!comment.trim()) throw new Error('A comment is required to record this decision.');

  const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.id = ?`, [entryId]);
  if (!rows[0]) throw new Error('Entry not found.');
  const e = mapEntry(rows[0]);

  const acting = catalogActingIdentity(actor, e.country_code);
  if (!acting.allowed) {
    throw new Error(`You are not an approver for ${e.country_name}.`);
  }

  const next: CatalogStatus = decision === 'approve' ? 'Active' : decision === 'revise' ? 'Draft' : 'Rejected';
  const decisionLabel = decision === 'approve' ? 'Approved' : decision === 'revise' ? 'Revision' : 'Rejected';

  await exec(
    `UPDATE catalog_entry SET status = ?, approver_name = ?, approval_comment = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [next, acting.label, comment.trim(), acting.label, entryId],
  );
  await exec(
    `INSERT INTO approval_decision (entry_id, version_no, decided_by, decision, tier, comment) VALUES (?, ?, ?, ?, 2, ?)`,
    [entryId, e.version_no, acting.label, decisionLabel, comment.trim()],
  );
  await writeAudit(decision === 'approve' ? 'Approve' : 'Reject', e.code, acting.label,
    `${decision === 'approve' ? 'Approved' : decision === 'revise' ? 'Revision requested' : 'Rejected'} — "${comment.trim().slice(0, 48)}"`);
}

export async function deactivateCatalogEntry(entryId: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('Not permitted.');
  const rows = await sql<{ code: string; status: string }[]>(`SELECT code, status FROM catalog_entry WHERE id = ?`, [entryId]);
  if (!rows[0]) throw new Error('Entry not found.');
  await exec(`UPDATE catalog_entry SET status = 'Expired', modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`, [actor.name, entryId]);
  await writeAudit('Status change', rows[0].code, actor.name, `${rows[0].status} → Deactivated`);
}

/* ============================================================================
   BULK IMPORT  (mirrors the TI-TE migration pattern: parse client-side, validate
   + insert server-side, return a per-row log)
============================================================================ */

export interface CatalogImportRow {
  rowIndex: number;
  supplier: string;
  supplier_code: string;
  manager: string | null;
  country: string; // code (SA) or name (Saudi Arabia)
  category: string;
  subcategory: string | null;
  commodity: string | null;
  description: string | null;
  uom: string;
  unit_price: number | null;
  currency: string;
  effective_date: string | null;
  expiry_date: string | null;
  sirion_contract_id: string | null;
  notes: string | null;
  incoterms: string | null;
  incoterms_location: string | null;
  lead_time_days: number | null;
}

export interface CatalogImportResult {
  inserted: number;
  skipped: number;
  errors: number;
  log: string[];
}

function normalizeImportDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t || t.startsWith('=')) return null;
  const parts = t.split(/[/-]/);
  if (parts.length === 3 && parts.every((p) => p.trim() !== '')) {
    // YYYY-MM-DD when the first part is a 4-digit year; otherwise DD-MM-YYYY / DD/MM/YYYY.
    const [d, m, y] = parts[0].length === 4 ? [parts[2], parts[1], parts[0]] : parts;
    const dt = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  const dt = new Date(t);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

export async function bulkImportCatalogEntries(input: { rows: CatalogImportRow[]; filename: string }): Promise<CatalogImportResult> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to import catalog entries.');

  // reference lookups (resolved once per call)
  const countries = await sql<{ code: string; name: string }[]>(`SELECT code, name FROM country`);
  const countryByCode = new Map(countries.map((c) => [c.code.toUpperCase(), c.code]));
  const countryByName = new Map(countries.map((c) => [c.name.toLowerCase(), c.code]));
  const ccyRows = await sql<{ code: string }[]>(`SELECT code FROM currency`);
  const ccySet = new Set(ccyRows.map((c) => c.code.toUpperCase()));
  const uomRows = await sql<{ id: number; name: string }[]>(`SELECT id, name FROM unit_of_measure`);
  const uomByName = new Map(uomRows.map((u) => [u.name.toLowerCase(), u]));
  const catRows = await sql<{ id: number; name: string; type: string }[]>(`SELECT id, name, type FROM spend_category`);
  const catByName = new Map(catRows.map((c) => [c.name.toLowerCase(), c]));
  const subRows = await sql<{ id: number; category_id: number; name: string }[]>(`SELECT id, category_id, name FROM spend_subcategory`);
  const incotermSet = new Set(INCOTERM_CODES);

  const maxRows = await sql<{ n: number }[]>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 1039) AS n FROM catalog_entry WHERE code ~ '^CAT-[0-9]+$'`,
  );
  let codeSeq = Number(maxRows[0]?.n ?? 1039);

  const thresholdRules = await loadThresholdRules();
  let inserted = 0, skipped = 0, errors = 0;
  const log: string[] = [];

  for (const r of input.rows) {
    try {
      const missing: string[] = [];
      if (!r.supplier?.trim()) missing.push('supplier');
      if (!r.supplier_code?.trim()) missing.push('supplier code');
      if (!r.country?.trim()) missing.push('country');
      if (!r.commodity?.trim()) missing.push('commodity');
      if (!r.uom?.trim()) missing.push('UOM');
      if (!r.currency?.trim()) missing.push('currency');
      if (!r.effective_date?.trim()) missing.push('effective date');
      if (!r.expiry_date?.trim()) missing.push('expiry date');
      if (missing.length) { errors++; log.push(`❌ Row ${r.rowIndex}: missing ${missing.join(', ')}`); continue; }

      // Clean text (trim + strip control chars) and enforce length caps — mirrors the template.
      const supplier = sanitizeImportText(r.supplier);
      const supplierCode = sanitizeImportText(r.supplier_code);
      const commodity = sanitizeImportText(r.commodity);
      const description = sanitizeImportText(r.description);
      const manager = sanitizeImportText(r.manager);
      const sirion = sanitizeImportText(r.sirion_contract_id);
      const notes = sanitizeImportText(r.notes);
      if (!supplier || !supplierCode || !commodity) { errors++; log.push(`❌ Row ${r.rowIndex}: supplier, supplier code and commodity cannot be blank`); continue; }
      const tooLong =
        supplier.length > FIELD_MAX.supplier ? `supplier (max ${FIELD_MAX.supplier})`
        : supplierCode.length > FIELD_MAX.supplier_code ? `supplier code (max ${FIELD_MAX.supplier_code})`
        : commodity.length > FIELD_MAX.commodity ? `commodity (max ${FIELD_MAX.commodity})`
        : description && description.length > FIELD_MAX.description ? `description (max ${FIELD_MAX.description})`
        : manager && manager.length > FIELD_MAX.manager ? `supplier manager (max ${FIELD_MAX.manager})`
        : sirion && sirion.length > FIELD_MAX.sirion_contract_id ? `Sirion contract ID (max ${FIELD_MAX.sirion_contract_id})`
        : notes && notes.length > FIELD_MAX.notes ? `notes (max ${FIELD_MAX.notes})`
        : null;
      if (tooLong) { errors++; log.push(`❌ Row ${r.rowIndex}: ${tooLong} is too long`); continue; }

      if (r.unit_price == null || r.unit_price <= 0) { errors++; log.push(`❌ Row ${r.rowIndex}: unit price must be greater than 0`); continue; }
      if (r.unit_price > UNIT_PRICE_MAX) { errors++; log.push(`❌ Row ${r.rowIndex}: unit price looks wrong (over ${UNIT_PRICE_MAX.toLocaleString()})`); continue; }

      const ccy = r.currency.trim().toUpperCase();
      if (!ccySet.has(ccy)) { errors++; log.push(`❌ Row ${r.rowIndex}: unknown currency "${r.currency}"`); continue; }

      const countryCode = countryByCode.get(r.country.trim().toUpperCase()) ?? countryByName.get(r.country.trim().toLowerCase());
      if (!countryCode) { errors++; log.push(`❌ Row ${r.rowIndex}: unknown country "${r.country}"`); continue; }

      // Spend category is optional; validate only when provided.
      let cat: { id: number; name: string; type: string } | undefined;
      if (r.category?.trim()) {
        cat = catByName.get(r.category.trim().toLowerCase());
        if (!cat) { errors++; log.push(`❌ Row ${r.rowIndex}: unknown spend category "${r.category}"`); continue; }
      }
      const categoryId = cat?.id ?? null;
      const spendType = cat?.type ?? null;

      const uom = uomByName.get(r.uom.trim().toLowerCase());
      if (!uom) { errors++; log.push(`❌ Row ${r.rowIndex}: unknown UOM "${r.uom}"`); continue; }

      let subId: number | null = null;
      if (cat && r.subcategory?.trim()) {
        const s = subRows.find((x) => x.category_id === cat!.id && x.name.toLowerCase() === r.subcategory!.trim().toLowerCase());
        subId = s?.id ?? null;
      }

      // Incoterms optional; validate against the Incoterms 2020 list when provided.
      let incoterms: string | null = null;
      if (r.incoterms?.trim()) {
        const ic = r.incoterms.trim().toUpperCase();
        if (!incotermSet.has(ic)) { errors++; log.push(`❌ Row ${r.rowIndex}: unknown Incoterm "${r.incoterms}"`); continue; }
        incoterms = ic;
      }
      const incotermsLocation = sanitizeImportText(r.incoterms_location);
      if (incotermsLocation && incotermsLocation.length > FIELD_MAX.incoterms_location) { errors++; log.push(`❌ Row ${r.rowIndex}: incoterms location is too long (max ${FIELD_MAX.incoterms_location})`); continue; }

      // Lead time optional; whole number of days between 0 and the sanity cap.
      let leadTime: number | null = null;
      if (r.lead_time_days != null) {
        if (!Number.isFinite(r.lead_time_days) || r.lead_time_days < 0 || r.lead_time_days > LEAD_TIME_MAX_DAYS) { errors++; log.push(`❌ Row ${r.rowIndex}: lead time must be a whole number of days between 0 and ${LEAD_TIME_MAX_DAYS}`); continue; }
        leadTime = Math.round(r.lead_time_days);
      }

      // Description is optional — fall back to the (required) commodity as the item name.
      const itemName = description ?? commodity;

      const eff = normalizeImportDate(r.effective_date);
      if (!eff) { errors++; log.push(`❌ Row ${r.rowIndex}: invalid effective date "${r.effective_date}"`); continue; }
      let exp: string | null = null;
      if (r.expiry_date?.trim()) {
        exp = normalizeImportDate(r.expiry_date);
        if (!exp) { errors++; log.push(`❌ Row ${r.rowIndex}: invalid expiry date "${r.expiry_date}"`); continue; }
      }

      const dup = await sql<{ code: string }[]>(
        `SELECT e.code FROM catalog_entry e JOIN supplier s ON s.id = e.supplier_id
         WHERE s.vendor_code = ? AND e.country_code = ? AND LOWER(e.item_name) = LOWER(?) AND e.status = 'Active' LIMIT 1`,
        [supplierCode, countryCode, itemName],
      );
      if (dup[0]) { skipped++; log.push(`⚠️ Row ${r.rowIndex}: looks like a duplicate of active ${dup[0].code} — skipped`); continue; }

      const supplierId = await upsertSupplier(supplier, supplierCode, manager);
      const usd = toUsd(r.unit_price, ccy);
      const tier = approvalTier(usd, effectiveThresholdUsd(thresholdRules, countryCode, categoryId));
      const status: CatalogStatus = tier.needsApproval ? 'Pending Approval' : 'Active';
      const approver = status === 'Pending Approval' ? (countryCode === 'AE' ? 'Daniel Reyes' : 'Omar Haddad') : null;
      const code = `CAT-${++codeSeq}`;
      const sirionUrl = sirionUrlFor(sirion);

      const ins = await exec(
        `INSERT INTO catalog_entry
          (code, country_code, supplier_id, category_id, subcategory_id, uom_id, spend_type, commodity,
           item_name, description, sirion_contract_id, sirion_url, notes, incoterms, incoterms_location, lead_time_days, status, tier_label,
           current_version_no, manager, approver_name, created_by, modified_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING id`,
        [
          code, countryCode, supplierId, categoryId, subId, uom.id, spendType, commodity,
          itemName, description, sirion, sirionUrl, notes,
          incoterms, incotermsLocation, leadTime, status, tier.label, manager, approver, actor.name, actor.name,
        ],
      );
      await exec(
        `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by)
         VALUES (?, 1, ?, ?, ?, ?, 'Imported via bulk upload', ?)`,
        [ins.insertId, r.unit_price, ccy, eff, exp, actor.name],
      );
      inserted++;
      log.push(`✅ Row ${r.rowIndex}: ${code} — ${r.supplier.trim()} (${status})`);
    } catch (err) {
      errors++;
      log.push(`❌ Row ${r.rowIndex}: ${err instanceof Error ? err.message : 'unexpected error'}`);
    }
  }

  if (inserted > 0) {
    await writeAudit('Import', `Catalog — ${input.filename}`, actor.name, `Bulk imported ${inserted} entries (${skipped} skipped, ${errors} errors)`);
  }
  return { inserted, skipped, errors, log };
}

/* ============================================================================
   COMMODITY / TAXONOMY / SAP-SUPPLIER REFERENCE WORKBOOK
   A standalone, downloadable Excel reference so anyone filling the import
   template can look up the exact commodity, taxonomy path, and — critically —
   the supplier name spelled exactly as it is in SAP. Generated live so it
   always reflects current SourceGuide commodities + the seeded SAP directory.
============================================================================ */

export interface CommodityReferenceFile {
  base64: string;
  filename: string;
  counts: { taxonomy: number };
}

export async function buildCommodityReference(): Promise<CommodityReferenceFile> {
  await getCatalogActor(); // ensure an authenticated catalog user
  await ensureCatalogManagerSchema();

  // The full catalog spend taxonomy (Category → Sub-category → Commodity), no UNSPSC codes.
  const taxonomyRows: { spend_type: string; category: string; sub: string; family: string; commodity: string; description: string }[] = [];
  for (const c of SPEND_TAXONOMY) {
    for (const s of c.subs) {
      for (const com of s.commodities) {
        taxonomyRows.push({ spend_type: c.type, category: c.name, sub: s.name, family: com.f, commodity: com.n, description: com.desc });
      }
    }
  }

  /* ---- workbook (single Spend taxonomy sheet) ---- */
  const GREEN = 'FF307C4C';
  const PALE = 'FFEAF4EF';
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } } as ExcelJS.Fill;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR Catalog Repo';
  wb.created = new Date();

  const columns = [
    { header: 'Spend type', key: 'spend_type', width: 20 },
    { header: 'Category', key: 'category', width: 34 },
    { header: 'Sub-category', key: 'sub', width: 30 },
    { header: 'Family', key: 'family', width: 26 },
    { header: 'Commodity', key: 'commodity', width: 44 },
    { header: 'Description', key: 'description', width: 52 },
  ];
  const ws = wb.addWorksheet('Spend taxonomy', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 20;
  head.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle' };
  });
  taxonomyRows.forEach((r, i) => {
    const row = ws.addRow(r);
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } } as ExcelJS.Fill; });
    row.alignment = { vertical: 'top', wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
  return {
    base64,
    filename: 'NESR_Catalog_Spend_Taxonomy.xlsx',
    counts: { taxonomy: taxonomyRows.length },
  };
}

/** Approve every pending entry in a supplier group in one action (Approvals "Approve all"). */
export async function bulkDecideEntries(entryIds: number[], comment: string): Promise<{ approved: number }> {
  const actor = await getCatalogActor();
  if (!actor.canApprove) throw new Error('You do not have approver permission.');
  if (!comment.trim()) throw new Error('A comment is required to record this decision.');

  let approved = 0;
  for (const id of entryIds) {
    const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.id = ?`, [id]);
    if (!rows[0]) continue;
    const e = mapEntry(rows[0]);
    if (e.status !== 'Pending Approval') continue;
    const acting = catalogActingIdentity(actor, e.country_code);
    if (!acting.allowed) continue;

    await exec(
      `UPDATE catalog_entry SET status = 'Active', approver_name = ?, approval_comment = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [acting.label, comment.trim(), acting.label, id],
    );
    await exec(
      `INSERT INTO approval_decision (entry_id, version_no, decided_by, decision, tier, comment) VALUES (?, ?, ?, 'Approved', 2, ?)`,
      [id, e.version_no, acting.label, comment.trim()],
    );
    await writeAudit('Approve', e.code, acting.label, `Approved (bulk) — "${comment.trim().slice(0, 48)}"`);
    approved++;
  }
  return { approved };
}

/* ============================================================================
   MASTER DATA
============================================================================ */

export async function getCountries(): Promise<CountryRow[]> {
  await ensureCatalogManagerSchema();
  return sql<CountryRow[]>(`SELECT code, name, default_currency, flag, status FROM country ORDER BY name`);
}
export async function getCurrencies(): Promise<CurrencyRow[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(`SELECT code, decimals, usd_rate FROM currency ORDER BY code`);
  return rows.map((r) => ({ code: String(r.code), decimals: Number(r.decimals), usd_rate: Number(r.usd_rate) }));
}
export async function getUoms(): Promise<UomRow[]> {
  await ensureCatalogManagerSchema();
  return sql<UomRow[]>(`SELECT id, name, status FROM unit_of_measure ORDER BY name`);
}
export async function getSuppliers(): Promise<SupplierRow[]> {
  await ensureCatalogManagerSchema();
  return sql<SupplierRow[]>(`SELECT id, vendor_code, name, accountable_manager FROM supplier ORDER BY name`);
}
export async function getServiceActivities(): Promise<{ no: string; text: string; uom: string }[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<{ activity_number: string; short_text: string; base_uom: string | null }[]>(
    `SELECT activity_number, short_text, base_uom FROM service_activity ORDER BY short_text`,
  );
  return rows.map((r) => ({ no: String(r.activity_number), text: String(r.short_text), uom: String(r.base_uom ?? '') }));
}
export async function getCategoriesWithSubs(): Promise<(SpendCategoryRow & { subs: SpendSubcategoryRow[] })[]> {
  await ensureCatalogManagerSchema();
  const cats = await sql<SpendCategoryRow[]>(`SELECT id, name, type, status FROM spend_category ORDER BY type, name`);
  const subs = await sql<SpendSubcategoryRow[]>(`SELECT id, category_id, name, status FROM spend_subcategory ORDER BY name`);
  return cats.map((c) => ({ ...c, subs: subs.filter((s) => Number(s.category_id) === Number(c.id)) }));
}
export async function getUsers(): Promise<AppUserRow[]> {
  await ensureCatalogManagerSchema();
  return sql<AppUserRow[]>(`SELECT id, full_name, email, country_code, role FROM app_user ORDER BY full_name`);
}

export async function getCountryApprovers(): Promise<CountryApproverRow[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT ca.id, ca.user_id, au.full_name AS user_name, au.email AS user_email,
            ca.country_code, c.name AS country_name,
            ca.spend_category_id, sc.name AS spend_category_name, ca.tier, ca.is_active
     FROM country_approver ca
     JOIN app_user au ON au.id = ca.user_id
     LEFT JOIN country c ON c.code = ca.country_code
     LEFT JOIN spend_category sc ON sc.id = ca.spend_category_id
     ORDER BY au.full_name, ca.country_code`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    user_name: r.user_name ?? undefined,
    user_email: r.user_email ?? undefined,
    country_code: String(r.country_code),
    country_name: r.country_name ?? undefined,
    spend_category_id: r.spend_category_id ? Number(r.spend_category_id) : null,
    spend_category_name: r.spend_category_name ?? null,
    tier: Number(r.tier),
    is_active: Boolean(r.is_active),
  }));
}

export async function addCountryApprover(userId: number, countryCode: string, spendCategoryId: number | null, tier = 2): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  await exec(
    `INSERT INTO country_approver (user_id, country_code, spend_category_id, tier, is_active)
     VALUES (?, ?, ?, ?, TRUE)
     ON CONFLICT (user_id, country_code, COALESCE(spend_category_id, 0)) DO UPDATE SET is_active = TRUE, tier = EXCLUDED.tier`,
    [userId, countryCode, spendCategoryId, tier],
  );
  const u = await sql<{ full_name: string }[]>(`SELECT full_name FROM app_user WHERE id = ?`, [userId]);
  await writeAudit('Master data', 'Country approvers', actor.name, `Assigned ${u[0]?.full_name ?? 'user'} as approver for ${countryCode}`);
}

export async function removeCountryApprover(id: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  await exec(`DELETE FROM country_approver WHERE id = ?`, [id]);
  await writeAudit('Master data', 'Country approvers', actor.name, `Removed a country-approver assignment`);
}

export async function setUserRole(userId: number, role: CatalogRole): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  const u = await sql<{ full_name: string }[]>(`SELECT full_name FROM app_user WHERE id = ?`, [userId]);
  await exec(`UPDATE app_user SET role = ? WHERE id = ?`, [role, userId]);
  await writeAudit('Master data', 'Users & roles', actor.name, `Changed ${u[0]?.full_name ?? 'user'} role → ${role}`);
}

export async function toggleCountryStatus(code: string): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  await exec(`UPDATE country SET status = CASE WHEN status = 'Active' THEN 'Inactive' ELSE 'Active' END WHERE code = ?`, [code]);
  await writeAudit('Master data', 'Countries', actor.name, `Toggled country ${code} status`);
}

export async function toggleCategoryStatus(id: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  await exec(`UPDATE spend_category SET status = CASE WHEN status = 'Active' THEN 'Inactive' ELSE 'Active' END WHERE id = ?`, [id]);
  await writeAudit('Master data', 'Spend categories', actor.name, `Toggled a spend category status`);
}

export async function addUom(name: string): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  await exec(`INSERT INTO unit_of_measure (name, status) VALUES (?, 'Active') ON CONFLICT (name) DO NOTHING`, [name]);
  await writeAudit('Master data', 'Units of measure', actor.name, `Added UOM ${name}`);
}

/* ============================================================================
   AUDIT
============================================================================ */

async function writeAudit(action: string, target: string, userName: string, detail: string): Promise<void> {
  await exec(`INSERT INTO audit_log (action, target, user_name, detail) VALUES (?, ?, ?, ?)`, [action, target, userName, detail]);
}

export async function getAuditLog(limit = 200): Promise<AuditEvent[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, action, target, user_name, detail,
            to_char(occurred_at, 'YYYY-MM-DD HH24:MI') AS occurred_at
     FROM audit_log ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    action: String(r.action),
    target: String(r.target ?? '—'),
    user_name: String(r.user_name ?? '—'),
    detail: r.detail ?? null,
    occurred_at: String(r.occurred_at ?? ''),
  }));
}

export async function logExport(scopeLabel: string, rowCount: number): Promise<void> {
  const actor = await getCatalogActor();
  await writeAudit('Export', `Catalog — ${scopeLabel}`, actor.name, `Exported ${rowCount} rows to CSV`);
}

/* ============================================================================
   DOCUMENTS — real proof-of-agreement uploads (stored inline as a data URL)
============================================================================ */

const MAX_DOC_DATAURL_LEN = 7_000_000; // ~5 MB once base64-encoded

export async function addEntryDocument(
  entryId: number,
  input: { fileName: string; docType: string | null; sizeLabel: string | null; dataUrl: string },
): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to attach documents.');
  if (!input.dataUrl) throw new Error('No file content received.');
  if (input.dataUrl.length > MAX_DOC_DATAURL_LEN) throw new Error('File is too large — max ~5 MB.');

  await exec(
    `INSERT INTO entry_document (entry_id, file_name, doc_type, size_label, data_url, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entryId, input.fileName, input.docType, input.sizeLabel, input.dataUrl, actor.name],
  );
  const code = await sql<{ code: string }[]>(`SELECT code FROM catalog_entry WHERE id = ?`, [entryId]);
  await writeAudit('Document', code[0]?.code ?? String(entryId), actor.name, `Attached ${input.docType || 'document'}: ${input.fileName}`);
}

export async function deleteEntryDocument(docId: number, entryId: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('You do not have permission to remove documents.');
  await exec(`DELETE FROM entry_document WHERE id = ? AND entry_id = ?`, [docId, entryId]);
}

/** Returns the stored data URL for a document (for download), or null if it's a seeded placeholder. */
export async function getDocumentDataUrl(docId: number): Promise<string | null> {
  await ensureCatalogManagerSchema();
  const rows = await sql<{ data_url: string | null }[]>(`SELECT data_url FROM entry_document WHERE id = ?`, [docId]);
  return rows[0]?.data_url ?? null;
}

/* ============================================================================
   ANALYTICS — spend by category/country, status mix, and rate-history movers
============================================================================ */

export async function getCatalogAnalyticsData(country = 'ALL'): Promise<CatalogAnalyticsData> {
  const entries = await listCatalogEntries({ country });
  const today = new Date();
  const active = entries.filter((e) => e.status === 'Active');

  // active-rate count by category
  const catMap = new Map<string, SpendByCategory>();
  for (const e of active) {
    const name = e.category_name ?? 'Uncategorized';
    const row = catMap.get(name) ?? { name, type: e.spend_type, activeCount: 0 };
    row.activeCount += 1;
    catMap.set(name, row);
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.activeCount - a.activeCount);

  // active-rate count by country
  const ctyMap = new Map<string, SpendByCountry>();
  for (const e of active) {
    const row = ctyMap.get(e.country_code) ?? { code: e.country_code, name: e.country_name, flag: e.country_flag, activeCount: 0 };
    row.activeCount += 1;
    ctyMap.set(e.country_code, row);
  }
  const byCountry = [...ctyMap.values()].sort((a, b) => b.activeCount - a.activeCount);

  // status mix
  const statusOrder: CatalogStatus[] = ['Active', 'Pending Approval', 'Draft', 'Expired', 'Rejected'];
  const statusCounts = statusOrder
    .map((status) => ({ status, count: entries.filter((e) => e.status === status).length }))
    .filter((s) => s.count > 0);

  // rate-history movers — entries with >1 version: first vs current price
  const moverParams: QueryParams = [];
  let moverWhere = `WHERE e.current_version_no > 1`;
  if (country && country !== 'ALL') { moverWhere += ` AND e.country_code = ?`; moverParams.push(country); }
  const moverRows = await sql<QueryResultRow[]>(
    `SELECT e.id, e.code, s.name AS supplier_name, e.commodity, e.item_name, e.country_code,
            rvc.currency_code, rvc.unit_price AS current_price, e.current_version_no AS versions,
            (SELECT unit_price FROM rate_version WHERE entry_id = e.id ORDER BY version_no ASC LIMIT 1) AS first_price
     FROM catalog_entry e
     JOIN supplier s ON s.id = e.supplier_id
     JOIN rate_version rvc ON rvc.entry_id = e.id AND rvc.version_no = e.current_version_no
     ${moverWhere}`,
    moverParams,
  );
  const movers: RateMover[] = moverRows
    .map((r) => {
      const firstPrice = Number(r.first_price ?? 0);
      const currentPrice = Number(r.current_price ?? 0);
      const changePct = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;
      return {
        id: Number(r.id),
        code: String(r.code),
        supplier_name: String(r.supplier_name),
        commodity: r.commodity ?? null,
        item_name: String(r.item_name),
        country_code: String(r.country_code),
        currency_code: String(r.currency_code),
        firstPrice,
        currentPrice,
        changePct,
        versions: Number(r.versions),
      };
    })
    .filter((m) => m.firstPrice > 0);
  const avgRateChangePct = movers.length ? movers.reduce((s, m) => s + m.changePct, 0) / movers.length : null;
  const topMovers = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8);

  return {
    activeCount: active.length,
    supplierCount: new Set(active.map((e) => e.supplier_id)).size,
    pendingCount: entries.filter((e) => e.status === 'Pending Approval').length,
    expiringCount: active.filter((e) => isExpiringSoon(e.status, e.expiry_date, today)).length,
    avgRateChangePct,
    byCategory,
    byCountry,
    topMovers,
    statusCounts,
  };
}

/* ============================================================================
   APPROVAL THRESHOLDS (admin)
============================================================================ */

export async function getApprovalThresholds(): Promise<ApprovalThresholdRule[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT t.id, t.country_code, c.name AS country_name, t.spend_category_id, sc.name AS spend_category_name, t.threshold_usd
     FROM approval_threshold t
     LEFT JOIN country c ON c.code = t.country_code
     LEFT JOIN spend_category sc ON sc.id = t.spend_category_id
     ORDER BY (t.country_code IS NULL) DESC, t.country_code, sc.name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    country_code: r.country_code ?? null,
    country_name: r.country_name ?? null,
    spend_category_id: r.spend_category_id != null ? Number(r.spend_category_id) : null,
    spend_category_name: r.spend_category_name ?? null,
    threshold_usd: Number(r.threshold_usd),
  }));
}

export async function setApprovalThreshold(input: { country_code: string | null; spend_category_id: number | null; threshold_usd: number }): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  if (!Number.isFinite(input.threshold_usd) || input.threshold_usd < 0) throw new Error('Enter a valid threshold amount.');
  await exec(
    `INSERT INTO approval_threshold (country_code, spend_category_id, threshold_usd, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (COALESCE(country_code, ''), COALESCE(spend_category_id, 0))
       DO UPDATE SET threshold_usd = EXCLUDED.threshold_usd, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [input.country_code, input.spend_category_id, input.threshold_usd, actor.name],
  );
  await writeAudit('Master data', 'Thresholds', actor.name, `Set ${input.country_code ?? 'Any country'}${input.spend_category_id != null ? ' (category)' : ''} threshold to $${input.threshold_usd.toLocaleString()}`);
}

export async function removeApprovalThreshold(id: number): Promise<void> {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) throw new Error('Admin only.');
  const rows = await sql<{ country_code: string | null; spend_category_id: number | null }[]>(
    `SELECT country_code, spend_category_id FROM approval_threshold WHERE id = ?`, [id],
  );
  if (rows[0] && rows[0].country_code == null && rows[0].spend_category_id == null) {
    throw new Error('The global default threshold cannot be removed — edit its value instead.');
  }
  await exec(`DELETE FROM approval_threshold WHERE id = ?`, [id]);
  await writeAudit('Master data', 'Thresholds', actor.name, 'Removed a threshold override');
}

/* ============================================================================
   SUPPLIER 360
============================================================================ */

export interface SupplierStats {
  id: number;
  name: string;
  vendor_code: string;
  manager: string | null;
  entryCount: number;
  activeCount: number;
}

export async function getSuppliersWithStats(): Promise<SupplierStats[]> {
  await ensureCatalogManagerSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT s.id, s.name, s.vendor_code, s.accountable_manager AS manager,
            COUNT(e.id)::int AS entry_count,
            COUNT(*) FILTER (WHERE e.status = 'Active')::int AS active_count
     FROM supplier s
     LEFT JOIN catalog_entry e ON e.supplier_id = s.id
     GROUP BY s.id, s.name, s.vendor_code, s.accountable_manager
     HAVING COUNT(e.id) > 0
     ORDER BY s.name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    vendor_code: String(r.vendor_code),
    manager: r.manager ?? null,
    entryCount: Number(r.entry_count),
    activeCount: Number(r.active_count),
  }));
}

export interface SupplierProfile {
  id: number;
  name: string;
  vendor_code: string;
  manager: string | null;
  entries: CatalogEntry[];
  countries: { code: string; name: string; flag: string | null }[];
  activeCount: number;
  contactEmails: string[];
}

export async function getSupplierProfile(supplierId: number): Promise<SupplierProfile | null> {
  await ensureCatalogManagerSchema();
  const sup = await sql<SupplierRow[]>(`SELECT id, vendor_code, name, accountable_manager FROM supplier WHERE id = ?`, [supplierId]);
  if (!sup[0]) return null;
  const supplier = sup[0];

  const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.supplier_id = ? ORDER BY e.modified_at DESC`, [supplierId]);
  const entries = rows.map(mapEntry);
  const active = entries.filter((e) => e.status === 'Active');
  const countryMap = new Map<string, { code: string; name: string; flag: string | null }>();
  entries.forEach((e) => countryMap.set(e.country_code, { code: e.country_code, name: e.country_name, flag: e.country_flag }));

  // contact emails from the local supplier directory (seeded from the SAP master)
  const dir = await sql<{ emails: string | null; additional_email: string | null }[]>(
    `SELECT emails, additional_email FROM supplier_directory WHERE code = ? LIMIT 1`,
    [supplier.vendor_code],
  );
  const rawEmails = `${dir[0]?.emails ?? ''},${dir[0]?.additional_email ?? ''}`;
  const contactEmails = [...new Set(rawEmails.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@')))];

  return {
    id: supplier.id,
    name: supplier.name,
    vendor_code: supplier.vendor_code,
    manager: supplier.accountable_manager,
    entries,
    countries: [...countryMap.values()],
    activeCount: active.length,
    contactEmails,
  };
}

/* ============================================================================
   BULK LIST ACTIONS (multi-select on the catalog)
============================================================================ */

export async function bulkDeactivateEntries(entryIds: number[]): Promise<{ count: number }> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('Not permitted.');
  let count = 0;
  for (const id of entryIds) {
    const rows = await sql<{ code: string; status: string }[]>(`SELECT code, status FROM catalog_entry WHERE id = ?`, [id]);
    if (!rows[0] || rows[0].status === 'Expired') continue;
    await exec(`UPDATE catalog_entry SET status = 'Expired', modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`, [actor.name, id]);
    await writeAudit('Status change', rows[0].code, actor.name, `${rows[0].status} → Deactivated (bulk)`);
    count++;
  }
  return { count };
}

export async function bulkSubmitEntries(entryIds: number[]): Promise<{ count: number }> {
  const actor = await getCatalogActor();
  if (!actor.canCreate) throw new Error('Not permitted.');
  const rules = await loadThresholdRules();
  let count = 0;
  for (const id of entryIds) {
    const rows = await sql<QueryResultRow[]>(`${ENTRY_SELECT} WHERE e.id = ?`, [id]);
    if (!rows[0]) continue;
    const e = mapEntry(rows[0]);
    if (e.status !== 'Draft' && e.status !== 'Rejected') continue;
    const tier = approvalTier(e.usd_equivalent, effectiveThresholdUsd(rules, e.country_code, e.category_id));
    const next: CatalogStatus = tier.needsApproval ? 'Pending Approval' : 'Active';
    const approver = next === 'Pending Approval' ? (e.country_code === 'AE' ? 'Daniel Reyes' : 'Omar Haddad') : null;
    await exec(`UPDATE catalog_entry SET status = ?, approver_name = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`, [next, approver, actor.name, id]);
    await writeAudit('Status change', e.code, actor.name, `${e.status} → ${next} (bulk)`);
    count++;
  }
  return { count };
}

/* ============================================================================
   GLOBAL SEARCH (command palette)
============================================================================ */

export interface GlobalSearchResult {
  entries: { id: number; code: string; supplier_name: string; label: string; country_code: string; status: CatalogStatus }[];
  suppliers: { id: number; name: string; vendor_code: string }[];
}

export async function globalCatalogSearch(query: string): Promise<GlobalSearchResult> {
  await ensureCatalogManagerSchema();
  const q = (query ?? '').trim();
  if (q.length < 2) return { entries: [], suppliers: [] };
  const like = `%${q}%`;
  const entryRows = await sql<QueryResultRow[]>(
    `SELECT e.id, e.code, e.status, e.country_code, e.item_name, e.commodity, s.name AS supplier_name
     FROM catalog_entry e JOIN supplier s ON s.id = e.supplier_id
     WHERE e.code ILIKE ? OR s.name ILIKE ? OR e.item_name ILIKE ? OR e.commodity ILIKE ?
     ORDER BY e.modified_at DESC LIMIT 8`,
    [like, like, like, like],
  );
  const supplierRows = await sql<QueryResultRow[]>(
    `SELECT id, name, vendor_code FROM supplier WHERE name ILIKE ? OR vendor_code ILIKE ? ORDER BY name LIMIT 6`,
    [like, like],
  );
  return {
    entries: entryRows.map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      supplier_name: String(r.supplier_name),
      label: String(r.commodity || r.item_name),
      country_code: String(r.country_code),
      status: r.status as CatalogStatus,
    })),
    suppliers: supplierRows.map((r) => ({ id: Number(r.id), name: String(r.name), vendor_code: String(r.vendor_code) })),
  };
}
