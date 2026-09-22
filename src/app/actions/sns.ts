'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import type { PoolClient } from 'pg';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminEmail } from '@/lib/require-access';
import snsPool from '@/lib/db-sns';
import { logger } from '@/lib/logger';
import { GRANTABLE_ROLES, ROLES } from '@/app/sns-registry/lib/constants';
import { addDays, parseISODate, toISODate, today, todayISO } from '@/app/sns-registry/lib/date';
import { roleKind } from '@/app/sns-registry/lib/helpers';
import { nextRegistryIdFrom, registryIdPrefix } from '@/app/sns-registry/lib/registry-id';
import { fetchSnsTaxonomyTree } from '@/lib/sns-taxonomy';
import { buildWorkflowEmail, snsRecordUrl, trySnsWebhook } from '@/lib/sns-notify';
import {
  isSnsLevel1Approver,
  isSnsLevel2Approver,
  resolveSnsLevel1Approver,
  resolveSnsLevel2Approvers,
} from './sns-approvers';
import {
  isExpiryDate,
  submissionError,
  validateForSubmission,
} from '@/app/sns-registry/lib/validate';
import type {
  BaseStatus,
  Classification,
  Country,
  Draft,
  ReferenceData,
  RegistryRecord,
  ScopeLevel,
  ScopeNode,
  SnsAccessRequestRow,
  SnsRole,
  SnsViewer,
  TaxCategory,
} from '@/app/sns-registry/lib/types';

const log = logger('sns-registry');

export interface ActionResult {
  success: boolean;
  error?: string;
}

/** The pool and a transaction client both satisfy this. */
type Queryable = Pick<PoolClient, 'query'>;

/* ═══ Viewer / permissions ═══════════════════════════════════════ */

/**
 * Resolves the signed-in user's S&S permissions.
 *
 * Env-listed platform admins bypass the request queue entirely and act with
 * every role's powers in every country. Everyone else needs an Approved row in
 * sns_access_requests; anything else (pending, rejected, revoked, absent)
 * resolves to null and the layout bounces them to the request page.
 */
export async function getSnsViewer(): Promise<SnsViewer | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const name = session.user.name ?? email;

  if (isPlatformAdminEmail(email)) {
    return { email, name, isAdmin: true, role: null, roleKind: 'admin', countryCodes: [] };
  }

  try {
    const { rows } = await snsPool.query(
      `SELECT status, approved_role, approved_countries
         FROM sns_access_requests
        WHERE LOWER(user_email) = LOWER($1)`,
      [email],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    if (String(r.status) !== 'Approved' || !r.approved_role) return null;

    return {
      email,
      name,
      isAdmin: false,
      role: r.approved_role as SnsRole,
      roleKind: roleKind(r.approved_role),
      countryCodes: await normaliseCountryCodes((r.approved_countries as string[]) ?? []),
    };
  } catch (err) {
    log.error('viewer.load.failed', err);
    return null;
  }
}

/**
 * Resolves an approved-country array to `sns_country.code` values.
 *
 * Grants are written as codes, but rows predating that hold display names, so
 * both are accepted. Deliberately unfiltered by `active`: deactivating a country
 * must not silently widen or void a live grant. Anything that resolves to
 * nothing is dropped — an unknown country fails closed rather than matching.
 */
async function normaliseCountryCodes(values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const { rows } = await snsPool.query(
    `SELECT code FROM sns_country WHERE code = ANY($1) OR name = ANY($1)`,
    [values],
  );
  return rows.map((r) => String(r.code));
}

/** Empty `countryCodes` means unrestricted — admins, and roles approved globally. */
function canActInCountry(viewer: SnsViewer, code: string): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.countryCodes.length === 0) return true;
  if (!code) return false; // unresolvable country — never in scope for a scoped role
  return viewer.countryCodes.includes(code);
}

function isAdminOr(viewer: SnsViewer | null, ...kinds: string[]): boolean {
  if (!viewer) return false;
  return viewer.isAdmin || kinds.includes(viewer.roleKind);
}

/* Platform ADMIN_EMAILS only — the S&S registry has no per-tool admin env list, so a
   SourceGuide/TI-TE style `*_ADMIN_EMAILS` merge would WIDEN this gate. Returns the
   session-cased email (not the normalised one) because callers write it straight into
   the audit trail, and returns null rather than throwing because every caller degrades
   to an empty list or a failure result instead of a digest error. */
async function requireAdmin(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email || !isPlatformAdminEmail(email)) return null;
  return email;
}

/* --- Approval gates -----------------------------------------------------
   Two things have to hold before someone can validate: they must carry the
   role, and they must be the person named for this country or category.

   The one deliberate exception is a country or category with nobody assigned
   yet. Rather than deadlock those records, the gate falls back to the role
   grant alone and logs it, so a missing assignment shows up in the logs rather
   than as a stuck queue. Once the approver list is loaded the fallback stops
   applying on its own.

   Both return an error message, or null when the caller may proceed. */

async function requireLevel1(
  viewer: SnsViewer,
  code: string,
  country: string,
): Promise<string | null> {
  if (viewer.isAdmin) return null;
  if (viewer.roleKind !== 'l1')
    return 'Only the Country Supply Chain Manager can approve this record.';

  const { allowed, unassigned } = await isSnsLevel1Approver(viewer.email, code);
  if (allowed) return null;
  if (unassigned) {
    log.warn('level1.unassigned', { countryCode: code, actor: viewer.email });
    return null;
  }
  return `First-stage validation for ${country} is assigned to that country's Supply Chain Manager.`;
}

async function requireLevel2(viewer: SnsViewer, categories: string[]): Promise<string | null> {
  if (viewer.isAdmin) return null;
  if (viewer.roleKind !== 'l2')
    return 'Only the Supply Chain Director or Category Manager can sign this record off.';

  const { allowed, unassigned } = await isSnsLevel2Approver(viewer.email, categories);
  if (allowed) return null;
  if (unassigned) {
    log.warn('level2.unassigned', { categories, actor: viewer.email });
    return null;
  }
  return 'Final sign-off is assigned to the Category Manager for this record, or to a Supply Chain Director.';
}

/** The actor string written into the audit trail for a given step. */
function actorFor(viewer: SnsViewer, kind: 'req' | 'l1' | 'l2', country: string): string {
  const who = viewer.name;
  if (kind === 'req') return `${who} — Sourcing / Procurement, ${country}`;
  if (kind === 'l1') return `${who} — Country Supply Chain Manager, ${country}`;
  return `${who} — Category Manager / Supply Chain Director`;
}

/* ═══ Reference data ═════════════════════════════════════════════ */

/**
 * Taxonomy tree, countries, segments and reason codes for the wizard.
 *
 * The Category > Sub-Category > Family > Commodity tree is read live from
 * `sg_commodities` in SourceGuide's database, not from the registry's own
 * sns_category/sub_category/family/commodity tables. Those still exist as a
 * record of the tree as it stood for records raised before the switch, but
 * nothing reads them: the platform keeps one spend taxonomy, maintained in
 * /admin > SourceGuide > Spend Taxonomy, rather than a second copy that drifts.
 *
 * Scope is denormalised onto sns_record_node as text either way, so an existing
 * record never depends on the tree still containing its branch.
 */
export async function getSnsReferenceData(): Promise<ReferenceData> {
  const empty: ReferenceData = {
    tax: [],
    countries: [],
    segments: [],
    reasons: { SGL: [], SOL: [] },
  };

  /* A `'use server'` export is a public POST endpoint — any signed-in employee
     can call it directly, so the layout redirect is not a control. Gate on the
     S&S viewer, but degrade to the empty shape rather than throwing so the
     pages that render this still paint. */
  const viewer = await getSnsViewer();
  if (!viewer) return empty;

  try {
    /* The taxonomy lives in SourceGuide's database, so it is settled separately
       from the registry's own reference data: if that database is unreachable
       the wizard should still open with its countries, segments and reason
       codes rather than failing whole. */
    const [tax, countries, segments, reasons] = await Promise.all([
      fetchSnsTaxonomyTree().catch((err) => {
        log.error('referenceData.taxonomy.unavailable', err);
        return [] as TaxCategory[];
      }),
      snsPool.query(`SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT name FROM sns_segment WHERE active ORDER BY sort_order, name`),
      snsPool.query(
        `SELECT classification, name FROM sns_reason WHERE active ORDER BY classification, sort_order, name`,
      ),
    ]);

    const reasonMap: Record<Classification, string[]> = { SGL: [], SOL: [] };
    for (const r of reasons.rows) {
      reasonMap[r.classification as Classification].push(String(r.name));
    }

    return {
      tax,
      countries: countries.rows.map((c) => [String(c.name), String(c.code)] as Country),
      segments: segments.rows.map((s) => String(s.name)),
      reasons: reasonMap,
    };
  } catch (err) {
    log.error('referenceData.load.failed', err);
    return empty;
  }
}

/**
 * Country name/code pairs, for the request-access form.
 *
 * That form is the one S&S screen a user reaches BEFORE they have a viewer, so
 * it cannot read the (now gated) reference tree. This exposes nothing beyond
 * the active country list, to signed-in users only. The code travels with the
 * name because a request is stored by code.
 */
export async function getSnsCountryOptions(): Promise<Country[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];
  try {
    const { rows } = await snsPool.query(
      `SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`,
    );
    return rows.map((r) => [String(r.name), String(r.code)] as Country);
  } catch (err) {
    log.error('countryOptions.load.failed', err);
    return [];
  }
}

/* ═══ Records ════════════════════════════════════════════════════ */

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? toISODate(v) : String(v).slice(0, 10);
}

/** Loads every record with its scope nodes, segments and audit trail. */
export async function getSnsRecords(): Promise<RegistryRecord[]> {
  /* Without this gate any signed-in employee could POST to this action and
     dump the whole registry — supplier SAP IDs, spend, justification
     narratives, requestor names and the audit trail. Degrade to an empty list
     so the page renders an empty state instead of throwing. */
  const viewer = await getSnsViewer();
  if (!viewer) return [];

  try {
    const [recs, nodes, segs, hist, docs] = await Promise.all([
      /* COALESCE covers records raised before `country_code` existed: fall back
         to matching the stored display name, with no `active` filter, so a
         deactivated country still resolves. Unresolvable stays NULL. */
      snsPool.query(
        `SELECT r.rid, r.classification, r.country, r.scope_level, r.supplier_id, r.supplier_name,
                r.reason, r.justification, r.base_status, r.spend, r.registry_id,
                r.issue_date, r.expiry_date, r.requestor,
                r.renewal_count, r.closed_at, r.closed_by, r.closed_reason,
                COALESCE(r.country_code, c.code) AS resolved_country_code
           FROM sns_record r
           LEFT JOIN sns_country c ON c.name = r.country
          ORDER BY r.created_at DESC, r.rid DESC`,
      ),
      /* Only the columns the shaper below reads: these three child tables are
         fetched for the whole registry, so every unused column is dead payload. */
      snsPool.query(
        `SELECT record_rid, category, sub_category, family, commodity
           FROM sns_record_node ORDER BY record_rid, sort_order, id`,
      ),
      snsPool.query(
        `SELECT record_rid, segment FROM sns_record_segment ORDER BY record_rid, segment`,
      ),
      snsPool.query(
        `SELECT record_rid, step, actor, entry_date, note
           FROM sns_record_history ORDER BY record_rid, id`,
      ),
      /* Counts only. The bytes are served by /api/sns-registry/documents/[id];
         selecting file_content here would pull every attachment in the registry
         into memory to render a number. */
      snsPool.query(
        `SELECT record_rid, kind, COUNT(*)::int AS n
           FROM sns_record_document GROUP BY record_rid, kind`,
      ),
    ]);

    const nodesBy = new Map<number, ScopeNode[]>();
    for (const n of nodes.rows) {
      const list = nodesBy.get(n.record_rid) ?? [];
      list.push({
        cat: String(n.category),
        sub: String(n.sub_category),
        fam: String(n.family),
        com: String(n.commodity ?? ''),
      });
      nodesBy.set(n.record_rid, list);
    }
    const segsBy = new Map<number, string[]>();
    for (const s of segs.rows) {
      const list = segsBy.get(s.record_rid) ?? [];
      list.push(String(s.segment));
      segsBy.set(s.record_rid, list);
    }
    const histBy = new Map<number, RegistryRecord['history']>();
    for (const h of hist.rows) {
      const list = histBy.get(h.record_rid) ?? [];
      list.push({
        step: String(h.step),
        actor: String(h.actor ?? ''),
        date: isoOrNull(h.entry_date) ?? '',
        note: String(h.note ?? ''),
      });
      histBy.set(h.record_rid, list);
    }

    const docsBy = new Map<number, { evidence: number; review: number }>();
    for (const d of docs.rows) {
      const rid = Number(d.record_rid);
      const entry = docsBy.get(rid) ?? { evidence: 0, review: 0 };
      if (String(d.kind) === 'review') entry.review = Number(d.n);
      else entry.evidence = Number(d.n);
      docsBy.set(rid, entry);
    }

    return recs.rows.map((r) => ({
      rid: Number(r.rid),
      cls: r.classification as Classification,
      country: String(r.country),
      countryCode: r.resolved_country_code ? String(r.resolved_country_code) : '',
      level: r.scope_level as ScopeLevel,
      nodes: nodesBy.get(Number(r.rid)) ?? [],
      segments: segsBy.get(Number(r.rid)) ?? [],
      supplierId: String(r.supplier_id ?? ''),
      supplierName: String(r.supplier_name ?? ''),
      reason: String(r.reason ?? ''),
      justification: String(r.justification ?? ''),
      base: r.base_status as BaseStatus,
      spend: Number(r.spend ?? 0),
      id: r.registry_id ? String(r.registry_id) : null,
      issue: isoOrNull(r.issue_date),
      expiry: isoOrNull(r.expiry_date),
      requestor: String(r.requestor ?? ''),
      history: histBy.get(Number(r.rid)) ?? [],
      renewalCount: Number(r.renewal_count ?? 0),
      closed: r.closed_at
        ? {
            at: r.closed_at instanceof Date ? r.closed_at.toISOString() : String(r.closed_at),
            by: String(r.closed_by ?? ''),
            reason: String(r.closed_reason ?? ''),
          }
        : null,
      evidenceCount: docsBy.get(Number(r.rid))?.evidence ?? 0,
      reviewCount: docsBy.get(Number(r.rid))?.review ?? 0,
    }));
  } catch (err) {
    log.error('records.load.failed', err, { actor: viewer.email, role: viewer.role });
    return [];
  }
}

async function addHistory(
  client: PoolClient,
  rid: number,
  step: string,
  actor: string,
  actorEmail: string,
  note = '',
) {
  await client.query(
    `INSERT INTO sns_record_history (record_rid, step, actor, actor_email, entry_date, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [rid, step, actor, actorEmail, todayISO(), note],
  );
}

/**
 * Rebuilds a stored record into the `Draft` shape so the shared submission
 * rules can be applied to it. Used when a record is submitted from the detail
 * screen rather than through the wizard.
 */
async function draftFromRecord(client: PoolClient, rec: Record<string, unknown>): Promise<Draft> {
  const rid = Number(rec.rid);
  const [nodes, segs] = await Promise.all([
    client.query(
      `SELECT category, sub_category, family, commodity FROM sns_record_node
        WHERE record_rid = $1 ORDER BY sort_order, id`,
      [rid],
    ),
    client.query(`SELECT segment FROM sns_record_segment WHERE record_rid = $1`, [rid]),
  ]);
  return {
    cls: rec.classification as Classification,
    country: String(rec.country ?? ''),
    // ISO date only; a DATE column comes back as a Date object over the wire.
    expiry: rec.expiry_date
      ? rec.expiry_date instanceof Date
        ? toISODate(rec.expiry_date)
        : String(rec.expiry_date).slice(0, 10)
      : '',
    level: rec.scope_level as ScopeLevel,
    nodes: nodes.rows.map((n) => ({
      cat: String(n.category),
      sub: String(n.sub_category),
      fam: String(n.family),
      com: String(n.commodity ?? ''),
    })),
    segments: segs.rows.map((s) => String(s.segment)),
    supplierId: String(rec.supplier_id ?? ''),
    supplierName: String(rec.supplier_name ?? ''),
    spend: '',
    reason: String(rec.reason ?? ''),
    justification: String(rec.justification ?? ''),
  };
}

/**
 * Resolves a country display name to its immutable `sns_country.code`.
 *
 * Runs on the caller's transaction client, so the code it returns is the code
 * the rest of that transaction sees. Deliberately NOT filtered by `active`: a
 * country that has been retired still has records to sign off, and its code is
 * already embedded in every Registry ID issued for it.
 *
 * Throws when nothing matches. A Registry ID is an immutable identifier on a
 * compliance record — minting one against a guessed country code would collide
 * with real IDs, so the sign-off fails instead.
 */
async function resolveCountryCode(db: Queryable, country: string): Promise<string> {
  const { rows } = await db.query(`SELECT code FROM sns_country WHERE name = $1`, [country]);
  if (rows.length === 0) {
    throw new UnknownCountryError(country);
  }
  return String(rows[0].code);
}

class UnknownCountryError extends Error {
  constructor(readonly country: string) {
    super(`Unknown country: ${country}`);
    this.name = 'UnknownCountryError';
  }
}

function unknownCountryMessage(err: unknown): string | null {
  return err instanceof UnknownCountryError
    ? `"${err.country}" is not a country in the S&S reference list. Ask an admin to add it before continuing.`
    : null;
}

/**
 * Issues the next Registry ID for a classification/country/year.
 *
 * Takes a transaction-scoped advisory lock on the ID prefix so two concurrent
 * Level 2 sign-offs in the same country cannot both read the same maximum and
 * mint a duplicate. The lock releases when the transaction ends. The year is
 * the business-timezone year, not the server's.
 */
/* --- Supplier master ----------------------------------------------------- */

/**
 * Records the supplier named on a record in the supplier master.
 *
 * The record keeps its own denormalised supplier_id/supplier_name — a
 * compliance artefact must read the way it read at sign-off — so this is not a
 * foreign key. It is the roll-up that makes "close this supplier's account" a
 * single act across every record naming it.
 *
 * An existing row's name is refreshed but its status is left alone: re-raising
 * a record must not quietly reopen an account somebody deliberately closed.
 */
async function upsertSupplier(client: PoolClient, sapId: string, name: string): Promise<void> {
  const id = sapId.trim();
  if (!id) return;
  await client.query(
    `INSERT INTO sns_supplier (sap_id, name) VALUES ($1, $2)
     ON CONFLICT (sap_id) DO UPDATE
       SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP`,
    [id, name.trim()],
  );
}

/* --- Notification plumbing ------------------------------------------------ */

interface RecordContext {
  rid: number;
  registryId: string;
  cls: Classification;
  clsLabel: string;
  country: string;
  countryCode: string;
  supplierId: string;
  supplierName: string;
  scope: string;
  categories: string[];
  requestorEmail: string;
  /** Everyone who has touched the record: the requestor and each validator. */
  stakeholders: string[];
}

/**
 * Gathers what the emails and the approver lookup need about a record.
 *
 * "Stakeholders" is deliberately wide — whoever raised it plus whoever has
 * acted on it — because the outcome notices go to the people who own the
 * record, not just to whoever happens to be the next approver.
 */
async function loadRecordContext(client: PoolClient, rid: number): Promise<RecordContext | null> {
  const { rows } = await client.query(
    `SELECT r.rid, r.registry_id, r.classification, r.country, r.supplier_id, r.supplier_name,
            r.created_by, COALESCE(r.country_code, c.code) AS resolved_country_code
       FROM sns_record r
       LEFT JOIN sns_country c ON c.name = r.country
      WHERE r.rid = $1`,
    [rid],
  );
  if (!rows.length) return null;
  const r = rows[0];

  const [nodes, history] = await Promise.all([
    client.query(
      `SELECT category, family, commodity FROM sns_record_node
        WHERE record_rid = $1 ORDER BY sort_order, id`,
      [rid],
    ),
    client.query(
      `SELECT DISTINCT actor_email FROM sns_record_history
        WHERE record_rid = $1 AND COALESCE(actor_email, '') <> ''`,
      [rid],
    ),
  ]);

  const requestorEmail = r.created_by ? String(r.created_by).toLowerCase() : '';
  const stakeholders = new Set<string>();
  if (requestorEmail) stakeholders.add(requestorEmail);
  for (const h of history.rows) stakeholders.add(String(h.actor_email).toLowerCase());

  return {
    rid: Number(r.rid),
    registryId: r.registry_id ? String(r.registry_id) : `Draft #${r.rid}`,
    cls: r.classification as Classification,
    clsLabel: r.classification === 'SGL' ? 'Single-Source' : 'Sole-Source',
    country: String(r.country),
    countryCode: r.resolved_country_code ? String(r.resolved_country_code) : '',
    supplierId: String(r.supplier_id ?? ''),
    supplierName: String(r.supplier_name ?? ''),
    scope: nodes.rows.map((n) => String(n.commodity || n.family)).join(', ') || '—',
    categories: [...new Set(nodes.rows.map((n) => String(n.category)))],
    requestorEmail,
    stakeholders: [...stakeholders],
  };
}

/**
 * The people a record's outcome belongs to: whoever raised it, whoever
 * validated it, and the two approvers responsible for it going forward.
 */
async function stakeholderRecipients(
  ctx: RecordContext,
): Promise<{ name: string; email: string; title: string }[]> {
  const [l1, l2] = await Promise.all([
    resolveSnsLevel1Approver(ctx.countryCode),
    resolveSnsLevel2Approvers(ctx.categories),
  ]);

  const seen = new Set<string>();
  const out: { name: string; email: string; title: string }[] = [];
  const add = (name: string, email: string, title: string) => {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: name || email, email, title });
  };

  for (const email of ctx.stakeholders) add(email, email, 'Record stakeholder');
  if (l1) add(l1.name, l1.email, l1.title);
  for (const a of l2) add(a.name, a.email, a.title);
  return out;
}

/**
 * Hands one workflow event to n8n.
 *
 * Never allowed to throw: a record that has been validated stays validated
 * whether or not the email went out. Failures are logged for the n8n run
 * history to reconcile against.
 */
async function notifyWorkflow(
  event: 'submitted' | 'level1_approved' | 'published' | 'rejected' | 'renewed' | 'closed',
  ctx: RecordContext,
  to: { name: string; email: string; title: string }[],
  actor: string,
  note = '',
): Promise<void> {
  const recipients = to.filter((p) => p.email);
  if (!recipients.length) {
    log.warn('notify.noRecipients', { event, registryId: ctx.registryId });
    return;
  }

  const email = buildWorkflowEmail({
    event,
    registryId: ctx.registryId,
    classification: ctx.clsLabel,
    country: ctx.country,
    supplierName: ctx.supplierName,
    supplierId: ctx.supplierId,
    scope: ctx.scope,
    actor,
    note,
    recordUrl: snsRecordUrl(ctx.rid),
  });

  await trySnsWebhook(`workflow.${event}`, {
    event: `record.${event}`,
    source: 'sns-registry',
    occurred_at: new Date().toISOString(),
    record: {
      rid: ctx.rid,
      registry_id: ctx.registryId,
      classification: ctx.cls,
      country: ctx.country,
      country_code: ctx.countryCode,
      supplier_id: ctx.supplierId,
      supplier_name: ctx.supplierName,
      scope: ctx.scope,
      categories: ctx.categories,
      url: snsRecordUrl(ctx.rid),
    },
    recipients: recipients.map((p) => ({
      display_name: p.name,
      email: p.email,
      notification_role: p.title,
    })),
    cc: ctx.stakeholders.filter((e) => !recipients.some((p) => p.email.toLowerCase() === e)),
    actor,
    note,
    subject: email.subject,
    body_html: email.bodyHtml,
  });
}

/**
 * Issues the next Registry ID.
 *
 * Format: {SGL|SOL}-{COUNTRY}-{SAP ID}-{IYIMEYEM}{NN}
 *   e.g.  SGL-IRQ-0001103296-2609270901
 *
 * Years are two digits and months are zero-padded, so the supplier and the
 * whole validity window are legible from the ID itself — which is the point,
 * since it is typed into SAP by hand and read by people who will not have the
 * registry open.
 *
 * The trailing sequence is not decoration. Including the SAP ID makes a clash
 * unlikely but not impossible: the same supplier can hold more than one record
 * in a country for different taxonomy scopes, and two raised in the same month
 * with the same validity would otherwise mint a byte-identical ID. Since
 * `registry_id` is UNIQUE, that second record could not be published at all.
 *
 * The advisory lock is taken on the prefix so two concurrent sign-offs cannot
 * both read the same maximum and mint a duplicate. It releases with the
 * transaction.
 */
async function nextRegistryId(
  client: PoolClient,
  cls: Classification,
  code: string,
  supplierId: string,
  issue: Date,
  expiry: Date,
): Promise<string> {
  const prefix = registryIdPrefix(cls, code, supplierId, issue, expiry);

  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);

  const { rows } = await client.query(
    `SELECT registry_id FROM sns_record
      WHERE registry_id LIKE $1
      ORDER BY registry_id DESC
      LIMIT 1`,
    [prefix + '%'],
  );
  return nextRegistryIdFrom(prefix, rows[0]?.registry_id ? String(rows[0].registry_id) : null);
}

/**
 * Creates a record as either a private Draft or a submission awaiting Level 1.
 *
 * `renewalOfRid` marks this as the replacement for an existing record — a
 * periodic review. The parent is left completely alone here: it keeps its ID,
 * its status and its place in the registry until the replacement is actually
 * published, so an ID already quoted on a SAP PO does not stop working the
 * moment somebody opens a review.
 */
export async function createSnsRecord(
  draft: Draft,
  base: 'Draft' | 'Pending Level 1',
  renewalOfRid?: number | null,
): Promise<ActionResult & { rid?: number }> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!isAdminOr(viewer, 'req'))
    return { success: false, error: 'Only Requestors can create records.' };
  if (!draft.country) return { success: false, error: 'Select a country.' };

  /* A Draft may be incomplete by definition; a submission may not. The wizard
     runs the same rules, but it is not the only way in — this action is a
     public POST endpoint. */
  if (base === 'Pending Level 1') {
    const missing = validateForSubmission(draft);
    if (missing.length) return { success: false, error: submissionError(missing) };
  } else {
    if (draft.nodes.length === 0)
      return { success: false, error: 'Select at least one scope item.' };
    if (!draft.supplierId || !draft.supplierName)
      return { success: false, error: 'Supplier SAP ID and name are required.' };
    if (!draft.reason) return { success: false, error: 'Select a reason code.' };
  }

  /* A renewal must name a record that exists and has actually been published.
     Renewing a Draft is meaningless — there is nothing to replace — and the
     unique index refuses a second live replacement, so catch it here with a
     sentence rather than a constraint violation. */
  if (renewalOfRid != null) {
    const { rows: parent } = await snsPool.query(
      `SELECT r.base_status,
              (SELECT count(*) FROM sns_record c
                WHERE c.renewal_of_rid = r.rid
                  AND c.base_status NOT IN ('Rejected', 'Closed')) AS live_replacements
         FROM sns_record r WHERE r.rid = $1`,
      [renewalOfRid],
    );
    if (!parent.length) return { success: false, error: 'The record being renewed was not found.' };
    const pb = String(parent[0].base_status);
    if (!['Active', 'Extended', 'Expired'].includes(pb)) {
      return { success: false, error: `A ${pb} record has no published ID to renew.` };
    }
    if (Number(parent[0].live_replacements) > 0) {
      return {
        success: false,
        error: 'A renewal for this record is already in progress.',
      };
    }
  }

  /* Resolving before the transaction keeps the access decision off a held
     connection. It also validates the country against sns_country, and pins the
     immutable code onto the record so a later rename cannot move it out of
     anyone's scope or change the Registry ID it will eventually be issued. */
  let code: string;
  try {
    code = await resolveCountryCode(snsPool, draft.country);
  } catch (err) {
    const msg = unknownCountryMessage(err);
    if (msg) return { success: false, error: msg };
    log.error('record.create.countryLookup.failed', err, {
      country: draft.country,
      actor: viewer.email,
    });
    return { success: false, error: 'Could not save the record.' };
  }
  if (!canActInCountry(viewer, code)) {
    return { success: false, error: `You are not approved to raise records for ${draft.country}.` };
  }

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');

    const requestor = actorFor(viewer, 'req', draft.country);
    const spend = parseInt(String(draft.spend).replace(/[^0-9]/g, ''), 10) || 0;

    const { rows } = await client.query(
      `INSERT INTO sns_record
         (classification, country, country_code, scope_level, supplier_id, supplier_name, reason,
          justification, base_status, spend, requestor, created_by, expiry_date, renewal_of_rid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING rid`,
      [
        draft.cls,
        draft.country,
        code,
        draft.level,
        draft.supplierId,
        draft.supplierName,
        draft.reason,
        draft.justification,
        base,
        spend,
        requestor,
        viewer.email,
        // A Draft may legitimately have no expiry yet; a submission cannot get
        // past validateForSubmission without one.
        isExpiryDate(draft.expiry) ? draft.expiry.trim() : null,
        renewalOfRid ?? null,
      ],
    );
    const rid = Number(rows[0].rid);

    await upsertSupplier(client, draft.supplierId, draft.supplierName);

    for (const [i, n] of draft.nodes.entries()) {
      await client.query(
        `INSERT INTO sns_record_node (record_rid, category, sub_category, family, commodity, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rid, n.cat, n.sub, n.fam, n.com ?? '', i],
      );
    }
    for (const s of draft.segments) {
      await client.query(
        `INSERT INTO sns_record_segment (record_rid, segment) VALUES ($1,$2)
         ON CONFLICT (record_rid, segment) DO NOTHING`,
        [rid, s],
      );
    }

    await addHistory(
      client,
      rid,
      base === 'Draft'
        ? 'Draft saved'
        : renewalOfRid != null
          ? 'Periodic review raised — submitted for Country Supply Chain Manager validation'
          : 'Submitted for Country Supply Chain Manager validation',
      requestor,
      viewer.email,
    );

    /* Read inside the transaction, sent after it: a webhook must never be made
       while a connection is held. */
    const ctx = base === 'Pending Level 1' ? await loadRecordContext(client, rid) : null;

    await client.query('COMMIT');

    if (ctx) {
      const approver = await resolveSnsLevel1Approver(ctx.countryCode);
      await notifyWorkflow(
        'submitted',
        ctx,
        approver ? [approver] : [],
        requestor,
        approver ? '' : `No Country Supply Chain Manager is configured for ${ctx.country}.`,
      );
    }

    return { success: true, rid };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.create.failed', err, {
      country: code,
      base,
      actor: viewer.email,
      supplierId: draft.supplierId,
    });
    return { success: false, error: 'Could not save the record.' };
  } finally {
    client.release();
  }
}

/**
 * Moves a record one step along the validation chain. Which step is legal
 * depends on the record's current status and the caller's role:
 *   Draft/Rejected  → Pending Level 1   (Requestor)
 *   Pending Level 1 → Pending Level 2   (Validator L1)
 *   Pending Level 2 → Active | Extended (Validator L2)
 * "Extended" is the periodic-review path: a record that already holds a
 * Registry ID keeps it and gains another 12 months.
 */
export async function advanceSnsRecord(rid: number): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.rid, r.classification, r.country, r.scope_level, r.supplier_id, r.supplier_name,
              r.reason, r.justification, r.base_status, r.registry_id, r.expiry_date,
              r.renewal_of_rid,
              COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1
          FOR UPDATE OF r`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const rec = rows[0];
    const country = String(rec.country);
    const code = rec.resolved_country_code ? String(rec.resolved_country_code) : '';
    const base = String(rec.base_status) as BaseStatus;

    if (!canActInCountry(viewer, code)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    const now = today();

    /* Decided inside the transaction while the row is locked, sent after the
       commit — a webhook must never be made on a held connection. */
    let notify: (() => Promise<void>) | null = null;

    if (base === 'Draft' || base === 'Rejected') {
      if (!isAdminOr(viewer, 'req')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Only a Requestor can submit this record.' };
      }
      /* Same completeness rules as the wizard, from the same module — calling
         this action directly must not be a way past them. */
      const missing = validateForSubmission(await draftFromRecord(client, rec));
      if (missing.length) {
        await client.query('ROLLBACK');
        return { success: false, error: submissionError(missing) };
      }
      await client.query(
        `UPDATE sns_record SET base_status = 'Pending Level 1', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid],
      );
      const actor = actorFor(viewer, 'req', country);
      await addHistory(
        client,
        rid,
        'Submitted for Country Supply Chain Manager validation',
        actor,
        viewer.email,
      );
      const ctx = await loadRecordContext(client, rid);
      notify = async () => {
        if (!ctx) return;
        const approver = await resolveSnsLevel1Approver(ctx.countryCode);
        await notifyWorkflow(
          'submitted',
          ctx,
          approver ? [approver] : [],
          actor,
          approver ? '' : `No Country Supply Chain Manager is configured for ${country}.`,
        );
      };
    } else if (base === 'Pending Level 1') {
      const gate = await requireLevel1(viewer, code, country);
      if (gate) {
        await client.query('ROLLBACK');
        return { success: false, error: gate };
      }
      await client.query(
        `UPDATE sns_record SET base_status = 'Pending Level 2', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid],
      );
      const actor = actorFor(viewer, 'l1', country);
      await addHistory(
        client,
        rid,
        'Validated by the Country Supply Chain Manager — sent for final sign-off',
        actor,
        viewer.email,
      );
      const ctx = await loadRecordContext(client, rid);
      notify = async () => {
        if (!ctx) return;
        const approvers = await resolveSnsLevel2Approvers(ctx.categories);
        await notifyWorkflow(
          'level1_approved',
          ctx,
          approvers,
          actor,
          approvers.length
            ? ''
            : `No Category Manager is configured for ${ctx.categories.join(', ') || 'this record'}, and no Supply Chain Director is on file.`,
        );
      };
    } else if (base === 'Pending Level 2') {
      const ctxForGate = await loadRecordContext(client, rid);
      const gate = await requireLevel2(viewer, ctxForGate?.categories ?? []);
      if (gate) {
        await client.query('ROLLBACK');
        return { success: false, error: gate };
      }
      if (rec.registry_id) {
        // Periodic review: keep the existing Registry ID, extend 12 months.
        const from = rec.expiry_date ? parseISODate(isoOrNull(rec.expiry_date) as string) : now;
        await client.query(
          `UPDATE sns_record SET base_status = 'Extended', expiry_date = $2, updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
          [rid, toISODate(addDays(from, 365))],
        );
        await addHistory(
          client,
          rid,
          'Periodic review complete — expiry extended 12 months',
          actorFor(viewer, 'l2', country),
          viewer.email,
          // The ID embeds the validity window it was minted with, and it is
          // immutable once quoted into SAP — so after a renewal it states the
          // original window, not the current one. The record's own expiry date
          // is the live figure; say so here rather than let someone read the ID
          // as authoritative.
          'Original Registry ID retained — it still reads with the validity window it was issued under. The expiry date on this record is the current one.',
        );
        notify = async () => {
          if (!ctxForGate) return;
          await notifyWorkflow(
            'renewed',
            ctxForGate,
            await stakeholderRecipients(ctxForGate),
            actorFor(viewer, 'l2', country),
          );
        };
      } else {
        /* The Registry ID is immutable once written, so its country token is
           resolved here, inside the minting transaction, from the code pinned
           on the record — falling back to a name lookup only for records raised
           before `country_code` existed. If neither resolves, the sign-off
           fails rather than minting a guessed, colliding ID. */
        const mintCode = code || (await resolveCountryCode(client, country));

        /* Expiry is entered by the requestor, not derived from the issue date,
           and the ID encodes its year and month — so a record that reached
           Level 2 without one cannot be minted. validateForSubmission blocks
           that at submission; this is the backstop for a row that predates the
           field or was written another way. */
        const storedExpiry = isoOrNull(rec.expiry_date);
        if (!storedExpiry) {
          await client.query('ROLLBACK');
          return {
            success: false,
            error:
              'This record has no expiry date, which the Registry ID is built from. Set one before signing it off.',
          };
        }
        const expiryDate = parseISODate(storedExpiry);

        const newId = await nextRegistryId(
          client,
          rec.classification as Classification,
          mintCode,
          String(rec.supplier_id ?? ''),
          now,
          expiryDate,
        );
        await client.query(
          `UPDATE sns_record
              SET base_status = 'Active', issue_date = $2, expiry_date = $3,
                  registry_id = $4, country_code = $5, updated_at = CURRENT_TIMESTAMP
            WHERE rid = $1`,
          [rid, toISODate(now), storedExpiry, newId, mintCode],
        );
        await addHistory(
          client,
          rid,
          `Final sign-off by the Supply Chain Director / Category Manager — published to Active as ${newId}`,
          actorFor(viewer, 'l2', country),
          viewer.email,
        );

        /* A periodic review replaces its parent, but only now — not when the
           review was started. Until this moment the old ID was still the
           current one and may have been quoted on a PO; closing it earlier
           would have invalidated a reference that was legitimately in use.

           The parent is closed, never deleted or rewritten: it keeps its own
           ID, history and documents so the audit trail shows what was in force
           during its window. Closed is also what stops its expiry reminders,
           which is now the replacement's job. */
        const parentRid = rec.renewal_of_rid == null ? null : Number(rec.renewal_of_rid);
        if (parentRid != null) {
          const { rows: parentRows } = await client.query(
            `UPDATE sns_record
                SET base_status = 'Closed',
                    closed_at = CURRENT_TIMESTAMP,
                    closed_by = $2,
                    closed_reason = $3,
                    renewal_count = renewal_count + 1,
                    updated_at = CURRENT_TIMESTAMP
              WHERE rid = $1
                AND base_status <> 'Closed'
              RETURNING registry_id`,
            [parentRid, viewer.email, `Superseded by ${newId}`],
          );
          if (parentRows.length) {
            await addHistory(
              client,
              parentRid,
              `Superseded by ${newId} — replaced at periodic review`,
              actorFor(viewer, 'l2', country),
              viewer.email,
              'This record stays on file for audit. Reference the replacement in SAP from now on.',
            );
            const previousId = parentRows[0].registry_id
              ? String(parentRows[0].registry_id)
              : `Draft #${parentRid}`;
            await addHistory(
              client,
              rid,
              `Replaces ${previousId}`,
              actorFor(viewer, 'l2', country),
              viewer.email,
            );
          }
        }
        notify = async () => {
          if (!ctxForGate) return;
          const published = { ...ctxForGate, registryId: newId };
          await notifyWorkflow(
            'published',
            published,
            await stakeholderRecipients(published),
            actorFor(viewer, 'l2', country),
          );
        };
      }
    } else {
      await client.query('ROLLBACK');
      return { success: false, error: `A ${base} record cannot be advanced.` };
    }

    await client.query('COMMIT');
    if (notify) await notify();
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.advance.failed', err, { rid, actor: viewer.email });
    return { success: false, error: unknownCountryMessage(err) ?? 'Could not update the record.' };
  } finally {
    client.release();
  }
}

/** Rejects a pending record, recording the reason in the audit trail. */
export async function rejectSnsRecord(rid: number, note: string): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.country, r.base_status, COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1
          FOR UPDATE OF r`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const country = String(rows[0].country);
    const code = rows[0].resolved_country_code ? String(rows[0].resolved_country_code) : '';
    const base = String(rows[0].base_status) as BaseStatus;

    if (base !== 'Pending Level 1' && base !== 'Pending Level 2') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Only a pending record can be rejected.' };
    }
    const needed = base === 'Pending Level 1' ? 'l1' : 'l2';
    if (!isAdminOr(viewer, needed)) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You are not the validator for this stage.' };
    }
    if (!canActInCountry(viewer, code)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    await client.query(
      `UPDATE sns_record SET base_status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
      [rid],
    );
    const rejectActor = actorFor(viewer, needed, country);
    await addHistory(
      client,
      rid,
      // The status written is 'Rejected', not 'Draft' — the trail says so.
      `Rejected by the ${base === 'Pending Level 1' ? 'Country Supply Chain Manager' : 'Supply Chain Director / Category Manager'} — returned to the requestor as Rejected`,
      rejectActor,
      viewer.email,
      note || 'No reason recorded.',
    );
    const ctx = await loadRecordContext(client, rid);

    await client.query('COMMIT');

    /* Straight to the requestor: a rejection is theirs to act on, and copying
       the validators on their own decision is noise. */
    if (ctx?.requestorEmail) {
      await notifyWorkflow(
        'rejected',
        ctx,
        [{ name: ctx.requestorEmail, email: ctx.requestorEmail, title: 'Requestor' }],
        rejectActor,
        note || 'No reason recorded.',
      );
    }

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.reject.failed', err, { rid, actor: viewer.email });
    return { success: false, error: 'Could not reject the record.' };
  } finally {
    client.release();
  }
}

/** Sends a published record back through validation ahead of its 12-month expiry. */
export async function startSnsReview(rid: number): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!isAdminOr(viewer, 'req'))
    return { success: false, error: 'Only a Requestor can start a periodic review.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.country, r.base_status, COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1
          FOR UPDATE OF r`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const country = String(rows[0].country);
    const code = rows[0].resolved_country_code ? String(rows[0].resolved_country_code) : '';
    const base = String(rows[0].base_status) as BaseStatus;

    /* A periodic review re-validates something that was already published.
       Draft and Rejected records have never been signed off, so there is
       nothing to review — they go through submission instead. */
    if (base !== 'Active' && base !== 'Extended' && base !== 'Expired') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error:
          base === 'Pending Level 1' || base === 'Pending Level 2'
            ? 'This record is already in validation.'
            : `A ${base} record has no published ID to review — submit it for validation instead.`,
      };
    }
    if (!canActInCountry(viewer, code)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    await client.query(
      `UPDATE sns_record SET base_status = 'Pending Level 1', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
      [rid],
    );
    await addHistory(
      client,
      rid,
      'Periodic review started — sent to the Country Supply Chain Manager',
      actorFor(viewer, 'req', country),
      viewer.email,
      'Re-validation ahead of the 12-month expiry.',
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.review.start.failed', err, { rid, actor: viewer.email });
    return { success: false, error: 'Could not start the review.' };
  } finally {
    client.release();
  }
}

/* ═══ Closing out ════════════════════════════════════════════════ */

/**
 * Closes a record — the alternative the renewal reminders offer to renewing.
 *
 * Closing is the only thing that stops the reminders, so it has to be a real
 * state rather than a silenced flag: a record nobody renewed and nobody closed
 * is exactly what the registry exists to surface.
 *
 * `alsoCloseSupplier` extends the close to the supplier master, which retires
 * every other live record naming the same SAP ID in the same country. That is
 * the "the arrangement has ended" case, as against "this one scope no longer
 * applies", so it is opt-in rather than automatic.
 */
export async function closeSnsRecord(
  rid: number,
  reason: string,
  alsoCloseSupplier: boolean,
): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!reason.trim()) return { success: false, error: 'Give a reason for closing the record.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.country, r.base_status, r.supplier_id,
              COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1
          FOR UPDATE OF r`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const country = String(rows[0].country);
    const code = String(rows[0].resolved_country_code ?? '');
    const base = String(rows[0].base_status) as BaseStatus;
    const supplierId = String(rows[0].supplier_id ?? '');

    if (base === 'Closed') {
      await client.query('ROLLBACK');
      return { success: false, error: 'This record is already closed.' };
    }
    // Closing is a requestor or validator act; a read-only role must not be
    // able to retire a record it could not have raised.
    if (!isAdminOr(viewer, 'req', 'l1', 'l2')) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You cannot close this record.' };
    }
    if (!canActInCountry(viewer, code)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    const ctx = await loadRecordContext(client, rid);

    await client.query(
      `UPDATE sns_record
          SET base_status = 'Closed', closed_at = CURRENT_TIMESTAMP,
              closed_by = $2, closed_reason = $3, updated_at = CURRENT_TIMESTAMP
        WHERE rid = $1`,
      [rid, viewer.email, reason.trim()],
    );

    let alsoClosed = 0;
    if (alsoCloseSupplier && supplierId) {
      await client.query(
        `UPDATE sns_supplier
            SET status = 'Closed', closed_at = CURRENT_TIMESTAMP, closed_by = $2,
                closed_reason = $3, updated_at = CURRENT_TIMESTAMP
          WHERE sap_id = $1`,
        [supplierId, viewer.email, reason.trim()],
      );
      /* Every other live record for the same supplier in the same country goes
         with it — leaving them open would keep chasing an account that is
         gone. Matched on the resolved code so a record filed under the old
         display name is not missed. */
      const others = await client.query(
        `UPDATE sns_record r
            SET base_status = 'Closed', closed_at = CURRENT_TIMESTAMP, closed_by = $3,
                closed_reason = $4, updated_at = CURRENT_TIMESTAMP
          FROM (SELECT rid, COALESCE(country_code, (SELECT code FROM sns_country WHERE name = country)) AS cc
                  FROM sns_record) x
          WHERE r.rid = x.rid AND x.cc = $2 AND r.supplier_id = $1 AND r.rid <> $5
            AND r.base_status IN ('Active', 'Extended', 'Expired')
          RETURNING r.rid`,
        [supplierId, code, viewer.email, `Supplier account closed: ${reason.trim()}`, rid],
      );
      alsoClosed = others.rowCount ?? 0;
      for (const o of others.rows) {
        await addHistory(
          client,
          Number(o.rid),
          'Closed — supplier account closed',
          viewer.name,
          viewer.email,
          reason.trim(),
        );
      }
    }

    await addHistory(
      client,
      rid,
      alsoCloseSupplier ? 'Closed — supplier account closed' : 'Closed — record retired',
      viewer.name,
      viewer.email,
      alsoClosed
        ? `${reason.trim()} (${alsoClosed} further record${alsoClosed === 1 ? '' : 's'} closed with it.)`
        : reason.trim(),
    );

    await client.query('COMMIT');

    if (ctx) {
      await notifyWorkflow(
        'closed',
        ctx,
        await stakeholderRecipients(ctx),
        viewer.name,
        reason.trim(),
      );
    }

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.close.failed', err, { rid });
    return { success: false, error: 'Could not close the record.' };
  } finally {
    client.release();
  }
}

/** Puts a closed record back into the registry, at Level 1, to be revalidated. */
export async function reopenSnsRecord(rid: number): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!isAdminOr(viewer, 'req'))
    return { success: false, error: 'Only a Requestor can reopen a record.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT r.country, r.base_status, r.supplier_id,
              COALESCE(r.country_code, c.code) AS resolved_country_code
         FROM sns_record r
         LEFT JOIN sns_country c ON c.name = r.country
        WHERE r.rid = $1
          FOR UPDATE OF r`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    if (String(rows[0].base_status) !== 'Closed') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Only a closed record can be reopened.' };
    }
    const country = String(rows[0].country);
    const code = String(rows[0].resolved_country_code ?? '');
    if (!canActInCountry(viewer, code)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    /* Straight back to Level 1 rather than to whatever it was before: a record
       that was retired has to earn its validity again before it can be quoted
       in SAP. */
    await client.query(
      `UPDATE sns_record
          SET base_status = 'Pending Level 1', closed_at = NULL, closed_by = NULL,
              closed_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE rid = $1`,
      [rid],
    );
    const supplierId = String(rows[0].supplier_id ?? '');
    if (supplierId) {
      await client.query(
        `UPDATE sns_supplier
            SET status = 'Active', closed_at = NULL, closed_by = NULL,
                closed_reason = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE sap_id = $1`,
        [supplierId],
      );
    }
    const actor = actorFor(viewer, 'req', country);
    await addHistory(
      client,
      rid,
      'Reopened — sent to the Country Supply Chain Manager',
      actor,
      viewer.email,
      'Record reopened after closure; revalidation required.',
    );

    const ctx = await loadRecordContext(client, rid);
    await client.query('COMMIT');

    if (ctx) {
      const approver = await resolveSnsLevel1Approver(ctx.countryCode);
      await notifyWorkflow('submitted', ctx, approver ? [approver] : [], actor);
    }

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('record.reopen.failed', err, { rid });
    return { success: false, error: 'Could not reopen the record.' };
  } finally {
    client.release();
  }
}

/* ═══ Access requests ════════════════════════════════════════════ */

/**
 * Validates a country list against `sns_country` and returns it as codes.
 *
 * A grant keyed on a display name breaks the moment an admin renames the
 * country, so both sides of a request are stored as codes. Names are still
 * accepted on the way in (the pickers send codes; this keeps older clients and
 * re-submissions of a legacy request working). Unmatched entries are rejected
 * rather than silently dropped — a grant must mean exactly what it says.
 */
async function checkCountries(values: string[]): Promise<{ codes: string[] } | { error: string }> {
  if (values.length === 0) return { codes: [] };
  try {
    const { rows } = await snsPool.query(
      `SELECT code, name FROM sns_country WHERE code = ANY($1) OR name = ANY($1)`,
      [values],
    );
    const byKey = new Map<string, string>();
    for (const r of rows) {
      byKey.set(String(r.code), String(r.code));
      byKey.set(String(r.name), String(r.code));
    }
    const unknown = values.filter((v) => !byKey.has(v));
    if (unknown.length) {
      return { error: `Not a country in the S&S reference list: ${unknown.join(', ')}.` };
    }
    return { codes: Array.from(new Set(values.map((v) => byKey.get(v) as string))) };
  } catch (err) {
    log.error('countries.check.failed', err, { requested: values });
    return { error: 'Could not verify the country list.' };
  }
}

function mapAccessRow(r: Record<string, unknown>): SnsAccessRequestRow {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
  return {
    userEmail: String(r.user_email),
    displayName: r.display_name ? String(r.display_name) : null,
    jobTitle: r.job_title ? String(r.job_title) : null,
    status: String(r.status) as SnsAccessRequestRow['status'],
    requestedRole: String(r.requested_role),
    approvedRole: r.approved_role ? String(r.approved_role) : null,
    requestedCountries: (r.requested_countries as string[]) ?? [],
    approvedCountries: (r.approved_countries as string[]) ?? [],
    reason: r.reason ? String(r.reason) : null,
    requestedAt: iso(r.requested_at) ?? '',
    reviewedAt: iso(r.reviewed_at),
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
  };
}

/** The caller's own request, so the request page can show its current state. */
export async function getMySnsAccessRequest(): Promise<SnsAccessRequestRow | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  try {
    const { rows } = await snsPool.query(
      `SELECT * FROM sns_access_requests WHERE LOWER(user_email) = LOWER($1)`,
      [email],
    );
    return rows.length ? mapAccessRow(rows[0]) : null;
  } catch (err) {
    log.error('access.request.load.failed', err);
    return null;
  }
}

/**
 * Submits (or re-submits) a request for access. One row per user, upserted —
 * re-applying after a rejection overwrites the old request and clears the
 * previous review, matching how Catalog Repo handles reapplication.
 */
export async function submitSnsAccessRequest(
  requestedRole: string,
  requestedCountries: string[],
  reason: string,
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { success: false, error: 'You must be signed in to request access.' };

  /* GRANTABLE_ROLES, not ROLES: the validator roles are no longer offered, and
     the form is not the gate — a crafted call must not be able to request one
     either. Approval below still validates against the full ROLES, so an
     existing grant of a retired role can be re-saved. */
  if (!GRANTABLE_ROLES.includes(requestedRole as SnsRole)) {
    return { success: false, error: 'Select a valid role.' };
  }
  if (!requestedCountries.length) {
    return { success: false, error: 'Select at least one country.' };
  }

  const checked = await checkCountries(requestedCountries);
  if ('error' in checked) return { success: false, error: checked.error };

  try {
    await snsPool.query(
      `INSERT INTO sns_access_requests
         (user_email, display_name, job_title, status, requested_role, requested_countries, reason)
       VALUES ($1, $2, $3, 'Pending', $4, $5, $6)
       ON CONFLICT (user_email) DO UPDATE
         SET display_name        = EXCLUDED.display_name,
             job_title           = EXCLUDED.job_title,
             status              = 'Pending',
             requested_role      = EXCLUDED.requested_role,
             requested_countries = EXCLUDED.requested_countries,
             reason              = EXCLUDED.reason,
             approved_role       = NULL,
             approved_countries  = '{}',
             requested_at        = CURRENT_TIMESTAMP,
             reviewed_at         = NULL,
             reviewed_by         = NULL`,
      [
        email.toLowerCase(),
        session.user.name ?? email,
        session.user.jobTitle ?? null,
        requestedRole,
        checked.codes,
        reason || null,
      ],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('access.request.submit.failed', err, { user: email, requestedRole });
    return { success: false, error: 'Could not submit your request.' };
  }
}

/** The full queue for the /admin console — Pending first, then most recent. */
export async function getSnsAccessRequests(): Promise<SnsAccessRequestRow[]> {
  /* The queue carries requester PII (name, job title, stated reason). Admins
     only; everyone else gets an empty queue rather than an error. */
  if (!(await requireAdmin())) return [];

  try {
    const { rows } = await snsPool.query(
      `SELECT * FROM sns_access_requests
        ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, requested_at DESC`,
    );
    return rows.map(mapAccessRow);
  } catch (err) {
    log.error('access.requests.load.failed', err);
    return [];
  }
}

export async function getSnsPendingAccessCount(): Promise<number> {
  try {
    const { rows } = await snsPool.query(
      `SELECT COUNT(*)::int AS n FROM sns_access_requests WHERE status = 'Pending'`,
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    log.error('access.pendingCount.failed', err);
    return 0;
  }
}

/**
 * Grants access. The admin may override both the role and the countries the
 * user asked for — an empty country list means unrestricted.
 */
export async function approveSnsAccess(
  userEmail: string,
  approvedRole: string,
  approvedCountries: string[],
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  if (!ROLES.includes(approvedRole as SnsRole))
    return { success: false, error: 'Select a valid role.' };

  // Empty stays empty — that is the "all countries" grant.
  const checked = await checkCountries(approvedCountries);
  if ('error' in checked) return { success: false, error: checked.error };

  try {
    const { rowCount } = await snsPool.query(
      `UPDATE sns_access_requests
          SET status = 'Approved', approved_role = $2, approved_countries = $3,
              reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $4
        WHERE LOWER(user_email) = LOWER($1)`,
      [userEmail, approvedRole, checked.codes, admin],
    );
    if (!rowCount) return { success: false, error: 'Request not found.' };
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('access.approve.failed', err, { user: userEmail, approvedRole, actor: admin });
    return { success: false, error: 'Could not approve the request.' };
  }
}

export async function rejectSnsAccess(userEmail: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    await snsPool.query(
      `UPDATE sns_access_requests
          SET status = 'Rejected', approved_role = NULL, approved_countries = '{}',
              reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
        WHERE LOWER(user_email) = LOWER($1)`,
      [userEmail, admin],
    );
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('access.reject.failed', err, { user: userEmail, actor: admin });
    return { success: false, error: 'Could not reject the request.' };
  }
}

export async function revokeSnsAccess(userEmail: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    await snsPool.query(
      `UPDATE sns_access_requests
          SET status = 'Revoked', approved_role = NULL, approved_countries = '{}',
              reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
        WHERE LOWER(user_email) = LOWER($1)`,
      [userEmail, admin],
    );
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    log.error('access.revoke.failed', err, { user: userEmail, actor: admin });
    return { success: false, error: 'Could not revoke access.' };
  }
}

/** Removes the row entirely, letting the user request access from scratch. */
export async function deleteSnsAccessRequest(userEmail: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    await snsPool.query(`DELETE FROM sns_access_requests WHERE LOWER(user_email) = LOWER($1)`, [
      userEmail,
    ]);
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('access.delete.failed', err, { user: userEmail, actor: admin });
    return { success: false, error: 'Could not delete the request.' };
  }
}
