'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import type { PoolClient } from 'pg';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminEmail } from '@/lib/require-access';
import snsPool from '@/lib/db-sns';
import { logger } from '@/lib/logger';
import { ROLES } from '@/app/sns-registry/lib/constants';
import { addDays, parseISODate, toISODate, today, todayISO } from '@/app/sns-registry/lib/date';
import { roleKind } from '@/app/sns-registry/lib/helpers';
import { submissionError, validateForSubmission } from '@/app/sns-registry/lib/validate';
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

/** The actor string written into the audit trail for a given step. */
function actorFor(viewer: SnsViewer, kind: 'req' | 'l1' | 'l2', country: string): string {
  const who = viewer.name;
  if (kind === 'req') return `${who} — Sourcing / Procurement, ${country}`;
  if (kind === 'l1') return `${who} — Country Supply Chain Manager, ${country}`;
  return `${who} — Category Manager / Supply Chain Director`;
}

/* ═══ Reference data ═════════════════════════════════════════════ */

/** Taxonomy tree, countries, segments and reason codes for the wizard. */
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
    const [cats, subs, fams, coms, countries, segments, reasons] = await Promise.all([
      snsPool.query(
        `SELECT id, name, spend_type FROM sns_category WHERE active ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, category_id, name FROM sns_sub_category WHERE active ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, sub_category_id, name FROM sns_family WHERE active ORDER BY sort_order, name`,
      ),
      snsPool.query(
        `SELECT id, family_id, name FROM sns_commodity WHERE active ORDER BY sort_order, name`,
      ),
      snsPool.query(`SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT name FROM sns_segment WHERE active ORDER BY sort_order, name`),
      snsPool.query(
        `SELECT classification, name FROM sns_reason WHERE active ORDER BY classification, sort_order, name`,
      ),
    ]);

    // Assemble the four flat tables into the nested tree the wizard walks.
    const comsByFamily = new Map<number, string[]>();
    for (const c of coms.rows) {
      const list = comsByFamily.get(c.family_id) ?? [];
      list.push(String(c.name));
      comsByFamily.set(c.family_id, list);
    }
    const famsBySub = new Map<number, { name: string; commodities: string[] }[]>();
    for (const f of fams.rows) {
      const list = famsBySub.get(f.sub_category_id) ?? [];
      list.push({ name: String(f.name), commodities: comsByFamily.get(f.id) ?? [] });
      famsBySub.set(f.sub_category_id, list);
    }
    const subsByCat = new Map<
      number,
      { name: string; families: { name: string; commodities: string[] }[] }[]
    >();
    for (const s of subs.rows) {
      const list = subsByCat.get(s.category_id) ?? [];
      list.push({ name: String(s.name), families: famsBySub.get(s.id) ?? [] });
      subsByCat.set(s.category_id, list);
    }

    const tax: TaxCategory[] = cats.rows.map((c) => ({
      name: String(c.name),
      spendType: c.spend_type as 'Direct' | 'Indirect',
      subs: subsByCat.get(c.id) ?? [],
    }));

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
    const [recs, nodes, segs, hist] = await Promise.all([
      /* COALESCE covers records raised before `country_code` existed: fall back
         to matching the stored display name, with no `active` filter, so a
         deactivated country still resolves. Unresolvable stays NULL. */
      snsPool.query(
        `SELECT r.rid, r.classification, r.country, r.scope_level, r.supplier_id, r.supplier_name,
                r.reason, r.justification, r.base_status, r.spend, r.registry_id,
                r.issue_date, r.expiry_date, r.requestor,
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
async function nextRegistryId(
  client: PoolClient,
  cls: Classification,
  code: string,
): Promise<string> {
  const year = today().getFullYear();
  const prefix = `${cls}-${code}-${year}-`;

  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);

  const { rows } = await client.query(
    `SELECT registry_id FROM sns_record
      WHERE registry_id LIKE $1
      ORDER BY registry_id DESC
      LIMIT 1`,
    [prefix + '%'],
  );
  const last = rows[0]?.registry_id ? parseInt(String(rows[0].registry_id).slice(-4), 10) : 0;
  return prefix + String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0');
}

/** Creates a record as either a private Draft or a submission awaiting Level 1. */
export async function createSnsRecord(
  draft: Draft,
  base: 'Draft' | 'Pending Level 1',
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
          justification, base_status, spend, requestor, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      ],
    );
    const rid = Number(rows[0].rid);

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
      base === 'Draft' ? 'Draft saved' : 'Draft submitted for Level 1 validation',
      requestor,
      viewer.email,
    );

    await client.query('COMMIT');
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
      await addHistory(
        client,
        rid,
        'Submitted for Level 1 validation',
        actorFor(viewer, 'req', country),
        viewer.email,
      );
    } else if (base === 'Pending Level 1') {
      if (!isAdminOr(viewer, 'l1')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Only a Level 1 validator can approve this record.' };
      }
      await client.query(
        `UPDATE sns_record SET base_status = 'Pending Level 2', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid],
      );
      await addHistory(
        client,
        rid,
        'Level 1 validated — routed to Level 2',
        actorFor(viewer, 'l1', country),
        viewer.email,
      );
    } else if (base === 'Pending Level 2') {
      if (!isAdminOr(viewer, 'l2')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Only a Level 2 validator can sign this record off.' };
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
          'Original Registry ID retained. Review history kept for audit.',
        );
      } else {
        /* The Registry ID is immutable once written, so its country token is
           resolved here, inside the minting transaction, from the code pinned
           on the record — falling back to a name lookup only for records raised
           before `country_code` existed. If neither resolves, the sign-off
           fails rather than minting a guessed, colliding ID. */
        const mintCode = code || (await resolveCountryCode(client, country));
        const newId = await nextRegistryId(client, rec.classification as Classification, mintCode);
        await client.query(
          `UPDATE sns_record
              SET base_status = 'Active', issue_date = $2, expiry_date = $3,
                  registry_id = $4, country_code = $5, updated_at = CURRENT_TIMESTAMP
            WHERE rid = $1`,
          [rid, toISODate(now), toISODate(addDays(now, 365)), newId, mintCode],
        );
        await addHistory(
          client,
          rid,
          `Level 2 sign-off — published to Active as ${newId}`,
          actorFor(viewer, 'l2', country),
          viewer.email,
        );
      }
    } else {
      await client.query('ROLLBACK');
      return { success: false, error: `A ${base} record cannot be advanced.` };
    }

    await client.query('COMMIT');
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
    await addHistory(
      client,
      rid,
      // The status written is 'Rejected', not 'Draft' — the trail says so.
      `Rejected at ${base === 'Pending Level 1' ? 'Level 1' : 'Level 2'} — returned to the requestor as Rejected`,
      actorFor(viewer, needed, country),
      viewer.email,
      note || 'No reason recorded.',
    );

    await client.query('COMMIT');
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
      'Periodic review started — routed to Level 1',
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

  if (!ROLES.includes(requestedRole as SnsRole)) {
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
