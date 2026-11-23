import type { PoolClient, QueryResultRow } from 'pg';
import catalogManagerPool from '@/lib/db-catalog-manager';
import { createSqlHelpers } from '@/lib/db/sql';
import { normalizeEmail } from '@/lib/require-access';
import {
  approvalTier,
  effectiveThresholdUsd,
  toUsd,
  usdRatesFrom,
  type ThresholdRule,
  type UsdRates,
} from '@/lib/catalog-manager-utils';
import type { CatalogStatus, SpendType } from '@/types/catalog-manager';

/**
 * The Service Registry's database core, shared by Catalog Manager and RRSM.
 *
 * The registry is Catalog Manager's `catalog_entry` (one item per country + supplier + service +
 * rate). Both tools create and change items, so the code that writes them lives here rather than
 * inside either tool's server actions: a 'use server' file makes every export a public endpoint,
 * which is no place for an insert that trusts its caller to have checked permissions. Each tool's
 * actions check their OWN access first and then call in here.
 *
 * Moved out of src/app/actions/catalog-manager.ts unchanged (23 Nov 2026).
 */

const { sql, exec } = createSqlHelpers(catalogManagerPool);
type QueryParams = Parameters<typeof sql>[1];

/** Who is acting: a display label and the authenticated address the audit trail is keyed on. */
export interface RegistryActor {
  name: string;
  email: string;
}

/**
 * The sql()/exec() pair a piece of work runs its statements through. Defaults to the pool-bound
 * helpers above; inside withTransaction() every statement must instead go through the pair bound
 * to the supplied client (see dbOn) — anything reaching for the pool lands on a DIFFERENT
 * connection, outside the transaction, and will not roll back with it.
 */
export interface CatalogDb {
  sql: <T extends QueryResultRow[]>(statement: string, params?: QueryParams) => Promise<T>;
  exec: (
    statement: string,
    params?: QueryParams,
  ) => Promise<{ rowCount: number; insertId: number }>;
}

export const poolDb: CatalogDb = { sql, exec };

/** Transaction-bound twins of sql()/exec() — same `?` → `$n` rewrite, same param/row handling. */
export function dbOn(client: PoolClient): CatalogDb {
  return createSqlHelpers(client);
}

export async function upsertSupplier(
  name: string,
  vendor: string,
  manager: string | null,
  db: CatalogDb = poolDb,
): Promise<number> {
  const ins = await db.exec(
    `INSERT INTO supplier (vendor_code, name, accountable_manager) VALUES (?, ?, ?)
     ON CONFLICT (vendor_code) DO UPDATE SET name = EXCLUDED.name,
       accountable_manager = COALESCE(EXCLUDED.accountable_manager, supplier.accountable_manager)
     RETURNING id`,
    [vendor, name, manager],
  );
  return ins.insertId;
}

/**
 * One row of approval authority: either a global one (role Admin) or one
 * country_approver assignment. An Approver with NO assignment rows has NO
 * authority — an empty set is never "all countries" (which is what the admin UI
 * promises: "an approver ... can sign off for the countries assigned here").
 */
export interface ApproverScope {
  email: string;
  name: string;
  isGlobal: boolean;
  country_code: string | null;
  spend_category_id: number | null;
}

/**
 * Load every authority row for the given emails in one query — or, when `emails` is null,
 * for every user who can approve at all (used to name the approver an entry is routed to).
 */
export async function loadApproverScopes(
  emails: (string | null | undefined)[] | null,
  db: CatalogDb = poolDb,
): Promise<ApproverScope[]> {
  const list = emails === null ? null : [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (list !== null && !list.length) return [];
  const where =
    list === null
      ? `au.role IN ('Approver', 'Admin')`
      : `LOWER(au.email) IN (${list.map(() => '?').join(', ')})`;
  const rows = await db.sql<QueryResultRow[]>(
    `SELECT LOWER(au.email) AS email, au.full_name, au.role, ca.country_code, ca.spend_category_id
     FROM app_user au
     LEFT JOIN country_approver ca ON ca.user_id = au.id AND ca.is_active = TRUE
     WHERE ${where}`,
    list ?? [],
  );
  return rows.map((r) => ({
    email: String(r.email),
    name: String(r.full_name ?? r.email),
    isGlobal: r.role === 'Admin',
    country_code: r.country_code ?? null,
    spend_category_id: r.spend_category_id != null ? Number(r.spend_category_id) : null,
  }));
}

/**
 * Who will actually decide an entry routed to Pending Approval, for `catalog_entry.approver_name`.
 *
 * Every path that set this field used to write a hardcoded person — 'Daniel Reyes' for country AE,
 * 'Omar Haddad' for everything else — and the entry detail page showed that invented name to the
 * user as "Awaiting <name>". Both names were seeded demo accounts; neither had any connection to
 * the assignment tables the approvals queue actually reads.
 *
 * The answer now comes from the same `country_approver` rows that grant authority, honouring
 * `is_active` and the category scope (a NULL category row covers every category). Returns null —
 * the UI then says "Awaiting approver" — when nobody is assigned, because inventing a name is
 * exactly the bug. A global Admin is deliberately NOT named here: an Admin can approve anything,
 * so naming one would pick an arbitrary system administrator rather than the person responsible.
 * Whoever really decides is recorded by decideCatalogEntry/bulkDecideEntries anyway.
 */
export async function resolveApproverLabel(
  db: CatalogDb,
  countryCode: string,
  categoryId: number | null,
  preloaded?: ApproverScope[],
): Promise<string | null> {
  const scopes = preloaded ?? (await loadApproverScopes(null, db));
  const covering = scopes.filter(
    (s) =>
      s.country_code === countryCode &&
      (s.spend_category_id === null || s.spend_category_id === categoryId),
  );
  if (!covering.length) return null;
  // Most specific first (a category-scoped assignment beats an all-category one), then by name
  // so the same entry always resolves to the same person.
  covering.sort((a, b) => {
    const specificity = Number(b.spend_category_id != null) - Number(a.spend_category_id != null);
    return specificity !== 0 ? specificity : a.name.localeCompare(b.name);
  });
  return covering[0].name;
}

/**
 * The live USD rates, from the `currency` table an admin maintains — NOT the code constants.
 * Every conversion that feeds the approval tier has to read these, or an edited rate changes
 * nothing about how entries are routed.
 */
export async function loadCurrencyRates(db: CatalogDb = poolDb): Promise<UsdRates> {
  const rows = await db.sql<{ code: string; usd_rate: string | number }[]>(
    `SELECT code, usd_rate FROM currency`,
  );
  return usdRatesFrom(rows);
}

/**
 * `userName` is a display label (and may read "X on behalf of Y"), so it is not an identity.
 * `userEmail` is the AUTHENTICATED actor's address and is what the trail is keyed on.
 */
export async function writeAudit(
  action: string,
  target: string,
  userName: string,
  userEmail: string | null,
  detail: string,
  db: CatalogDb = poolDb,
): Promise<void> {
  await db.exec(
    `INSERT INTO audit_log (action, target, user_name, user_email, detail) VALUES (?, ?, ?, ?, ?)`,
    [action, target, userName, normalizeEmail(userEmail) || null, detail],
  );
}

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

/**
 * The entry code is minted by the database, not by the app: `nextval` is atomic, so two concurrent
 * creates (or two people importing at once) can never be handed the same CAT-nnnn. Interpolated
 * into the `code` column of every catalog_entry INSERT; the sequence is set up in the schema init.
 */
export const CODE_NEXTVAL = `('CAT-' || nextval('catalog_entry_code_seq'))`;

/**
 * Whether entries need an approver at all. Paused (false) while the Service Registry is being
 * filled from both tools (decision 23 Nov 2026); an admin switches it back on in Catalog admin.
 * Read on every decision rather than cached, so the switch takes effect at once. A missing row or
 * table (before migration 007) means approvals run as they always did.
 */
export async function approvalsEnabled(db: CatalogDb = poolDb): Promise<boolean> {
  try {
    const rows = await db.sql<{ value: unknown }[]>(
      `SELECT value FROM catalog_setting WHERE key = 'approvals_enabled'`,
    );
    return rows.length ? rows[0].value !== false : true;
  } catch {
    return true;
  }
}

/** A threshold no price reaches: every entry lands in Tier 1 and activates at once. */
export const APPROVALS_PAUSED: ThresholdRule[] = [
  { country_code: null, spend_category_id: null, threshold_usd: Number.POSITIVE_INFINITY },
];

export async function loadThresholdRules(db: CatalogDb = poolDb): Promise<ThresholdRule[]> {
  /* Every approval decision (create, update, submit, bulk import, bulk submit) reads its rules
     here, so pausing approvals is this one line. */
  if (!(await approvalsEnabled(db))) return APPROVALS_PAUSED;
  const rows = await db.sql<
    {
      country_code: string | null;
      spend_category_id: number | null;
      threshold_usd: string | number;
    }[]
  >(`SELECT country_code, spend_category_id, threshold_usd FROM approval_threshold`);
  return rows.map((r) => ({
    country_code: r.country_code,
    spend_category_id: r.spend_category_id != null ? Number(r.spend_category_id) : null,
    threshold_usd: Number(r.threshold_usd),
  }));
}

/**
 * The three reference tables resolveRefs() looks a single entry up in, loaded once so a multi-line
 * create resolves every line in memory instead of issuing 3 lookups per line. They are small,
 * admin-maintained taxonomy tables; the lookups stay exact-name matches, first row wins, exactly as
 * the per-line queries did.
 */
export interface EntryRefLookups {
  categories: Map<string, { id: number; type: string }>;
  subs: { id: number; category_id: number; name: string }[];
  uoms: Map<string, number>;
}

export async function loadEntryRefLookups(db: CatalogDb = poolDb): Promise<EntryRefLookups> {
  const [cats, subs, uoms] = [
    await db.sql<{ id: number; name: string; type: string }[]>(
      `SELECT id, name, type FROM spend_category`,
    ),
    await db.sql<{ id: number; category_id: number; name: string }[]>(
      `SELECT id, category_id, name FROM spend_subcategory`,
    ),
    await db.sql<{ id: number; name: string }[]>(`SELECT id, name FROM unit_of_measure`),
  ];
  const categories = new Map<string, { id: number; type: string }>();
  for (const c of cats)
    if (!categories.has(c.name)) categories.set(c.name, { id: Number(c.id), type: c.type });
  const uomMap = new Map<string, number>();
  for (const u of uoms) if (!uomMap.has(u.name)) uomMap.set(u.name, Number(u.id));
  return { categories, subs, uoms: uomMap };
}

export async function resolveRefs(
  input: CatalogEntryInput,
  db: CatalogDb = poolDb,
  lookups?: EntryRefLookups,
) {
  if (lookups) {
    const hit = lookups.categories.get(input.category_name);
    const categoryId = hit?.id ?? null;
    const spendType = input.spend_type ?? (hit?.type as SpendType) ?? 'Indirect';
    let subId: number | null = null;
    if (categoryId && input.subcategory_name) {
      subId =
        lookups.subs.find(
          (s) => Number(s.category_id) === categoryId && s.name === input.subcategory_name,
        )?.id ?? null;
      subId = subId != null ? Number(subId) : null;
    }
    return { categoryId, spendType, subId, uomId: lookups.uoms.get(input.uom_name) ?? null };
  }
  const cat = await db.sql<{ id: number; type: string }[]>(
    `SELECT id, type FROM spend_category WHERE name = ?`,
    [input.category_name],
  );
  const categoryId = cat[0]?.id ?? null;
  const spendType = input.spend_type ?? (cat[0]?.type as SpendType) ?? 'Indirect';
  let subId: number | null = null;
  if (categoryId && input.subcategory_name) {
    const sub = await db.sql<{ id: number }[]>(
      `SELECT id FROM spend_subcategory WHERE category_id = ? AND name = ?`,
      [categoryId, input.subcategory_name],
    );
    subId = sub[0]?.id ?? null;
  }
  const uom = await db.sql<{ id: number }[]>(`SELECT id FROM unit_of_measure WHERE name = ?`, [
    input.uom_name,
  ]);
  return { categoryId, spendType, subId, uomId: uom[0]?.id ?? null };
}

/**
 * The body of createCatalogEntry, already inside a transaction. The entry, its first rate version
 * and the audit row are one unit of work: a failure between them used to leave an entry with no
 * version (or an orphan version whose number collided with the next edit).
 */
/**
 * Everything an insert needs that does NOT vary line to line. A multi-line create resolves it once
 * and hands it down, so the 6 lookups below (supplier upsert, taxonomy, rates, thresholds, approver
 * scopes) are paid once per request instead of once per line.
 */
export interface InsertContext {
  supplierId: number;
  lookups: EntryRefLookups;
  rates: UsdRates;
  rules: ThresholdRule[];
  scopes: ApproverScope[];
}

export async function insertCatalogEntry(
  db: CatalogDb,
  actor: RegistryActor,
  input: CatalogEntryInput,
  mode: 'draft' | 'submit',
  ctx?: InsertContext,
): Promise<{ id: number; code: string; status: CatalogStatus }> {
  const supplierId =
    ctx?.supplierId ??
    (await upsertSupplier(input.supplier_name, input.supplier_code, input.manager, db));
  const { categoryId, spendType, subId, uomId } = await resolveRefs(input, db, ctx?.lookups);
  const usd = toUsd(
    input.unit_price,
    input.currency_code,
    ctx?.rates ?? (await loadCurrencyRates(db)),
  );
  const threshold = effectiveThresholdUsd(
    ctx?.rules ?? (await loadThresholdRules(db)),
    input.country_code,
    categoryId,
  );
  const tier = approvalTier(usd, threshold);
  const status: CatalogStatus =
    mode === 'draft' ? 'Draft' : tier.needsApproval ? 'Pending Approval' : 'Active';
  const approver =
    status === 'Pending Approval'
      ? await resolveApproverLabel(db, input.country_code, categoryId, ctx?.scopes)
      : null;

  const ins = await db.sql<{ id: number; code: string }[]>(
    `INSERT INTO catalog_entry
      (code, country_code, supplier_id, category_id, subcategory_id, uom_id, spend_type, family, commodity,
       unspsc_code, item_name, description, sirion_contract_id, sirion_url, notes, incoterms, incoterms_location, lead_time_days,
       status, tier_label, current_version_no, manager, approver_name, created_by, modified_by)
     VALUES (${CODE_NEXTVAL}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING id, code`,
    [
      input.country_code,
      supplierId,
      categoryId,
      subId,
      uomId,
      spendType,
      input.family,
      input.commodity,
      input.unspsc_code,
      input.item_name,
      input.description,
      input.sirion_contract_id,
      input.sirion_url,
      input.notes,
      input.incoterms,
      input.incoterms_location,
      input.lead_time_days,
      status,
      tier.label,
      input.manager,
      approver,
      actor.name,
      actor.name,
    ],
  );
  const id = Number(ins[0]?.id);
  const code = String(ins[0]?.code);
  await db.exec(
    `INSERT INTO rate_version (entry_id, version_no, unit_price, currency_code, effective_date, expiry_date, change_reason, modified_by)
     VALUES (?, 1, ?, ?, ?, ?, 'Initial agreed rate', ?)`,
    [
      id,
      input.unit_price,
      input.currency_code,
      input.effective_date,
      input.expiry_date,
      actor.name,
    ],
  );
  await writeAudit(
    'Create',
    code,
    actor.name,
    actor.email,
    mode === 'draft'
      ? 'Saved new draft entry'
      : status === 'Active'
        ? 'New entry created & activated'
        : 'New entry submitted for approval',
    db,
  );
  return { id, code, status };
}
