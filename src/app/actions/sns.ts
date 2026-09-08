'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import type { PoolClient } from 'pg';
import { authOptions } from '@/lib/auth';
import snsPool from '@/lib/db-sns';
import { ROLES } from '@/app/sns-registry/lib/constants';
import { addDays, parseISODate, toISODate, today } from '@/app/sns-registry/lib/date';
import { countryCode, roleKind } from '@/app/sns-registry/lib/helpers';
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

export interface ActionResult {
  success: boolean;
  error?: string;
}

/* ═══ Viewer / permissions ═══════════════════════════════════════ */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

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

  if (adminEmails().includes(email.toLowerCase())) {
    return { email, name, isAdmin: true, role: null, roleKind: 'admin', countries: [] };
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
      countries: (r.approved_countries as string[]) ?? [],
    };
  } catch (err) {
    console.error('[getSnsViewer]', err);
    return null;
  }
}

/** Empty `countries` means unrestricted — admins, and roles approved globally. */
function canActInCountry(viewer: SnsViewer, country: string): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.countries.length === 0) return true;
  return viewer.countries.includes(country);
}

function isAdminOr(viewer: SnsViewer | null, ...kinds: string[]): boolean {
  if (!viewer) return false;
  return viewer.isAdmin || kinds.includes(viewer.roleKind);
}

async function requireAdmin(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email || !adminEmails().includes(email.toLowerCase())) return null;
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
  const empty: ReferenceData = { tax: [], countries: [], segments: [], reasons: { SGL: [], SOL: [] } };
  try {
    const [cats, subs, fams, coms, countries, segments, reasons] = await Promise.all([
      snsPool.query(`SELECT id, name, spend_type FROM sns_category WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, category_id, name FROM sns_sub_category WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, sub_category_id, name FROM sns_family WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT id, family_id, name FROM sns_commodity WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT name FROM sns_segment WHERE active ORDER BY sort_order, name`),
      snsPool.query(`SELECT classification, name FROM sns_reason WHERE active ORDER BY classification, sort_order, name`),
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
    const subsByCat = new Map<number, { name: string; families: { name: string; commodities: string[] }[] }[]>();
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
    console.error('[getSnsReferenceData]', err);
    return empty;
  }
}

/* ═══ Records ════════════════════════════════════════════════════ */

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? toISODate(v) : String(v).slice(0, 10);
}

/** Loads every record with its scope nodes, segments and audit trail. */
export async function getSnsRecords(): Promise<RegistryRecord[]> {
  try {
    const [recs, nodes, segs, hist] = await Promise.all([
      snsPool.query(`SELECT * FROM sns_record ORDER BY created_at DESC, rid DESC`),
      snsPool.query(`SELECT * FROM sns_record_node ORDER BY record_rid, sort_order, id`),
      snsPool.query(`SELECT * FROM sns_record_segment ORDER BY record_rid, segment`),
      snsPool.query(`SELECT * FROM sns_record_history ORDER BY record_rid, id`),
    ]);

    const nodesBy = new Map<number, ScopeNode[]>();
    for (const n of nodes.rows) {
      const list = nodesBy.get(n.record_rid) ?? [];
      list.push({ cat: String(n.category), sub: String(n.sub_category), fam: String(n.family), com: String(n.commodity ?? '') });
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
      list.push({ step: String(h.step), actor: String(h.actor ?? ''), date: isoOrNull(h.entry_date) ?? '', note: String(h.note ?? '') });
      histBy.set(h.record_rid, list);
    }

    return recs.rows.map((r) => ({
      rid: Number(r.rid),
      cls: r.classification as Classification,
      country: String(r.country),
      level: r.scope_level as ScopeLevel,
      nodes: nodesBy.get(Number(r.rid)) ?? [],
      segments: segsBy.get(Number(r.rid)) ?? [],
      supplierId: String(r.supplier_id ?? ''),
      supplierName: String(r.supplier_name ?? ''),
      reason: String(r.reason ?? ''),
      justification: String(r.justification ?? ''),
      base: r.base_status as BaseStatus,
      spend: Number(r.spend ?? 0),
      poCount: Number(r.po_count ?? 0),
      evidence: String(r.evidence ?? 'No attachment'),
      id: r.registry_id ? String(r.registry_id) : null,
      issue: isoOrNull(r.issue_date),
      expiry: isoOrNull(r.expiry_date),
      requestor: String(r.requestor ?? ''),
      history: histBy.get(Number(r.rid)) ?? [],
    }));
  } catch (err) {
    console.error('[getSnsRecords]', err);
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
    [rid, step, actor, actorEmail, toISODate(today()), note],
  );
}

/**
 * Issues the next Registry ID for a classification/country/year.
 *
 * Takes a transaction-scoped advisory lock on the ID prefix so two concurrent
 * Level 2 sign-offs in the same country cannot both read the same maximum and
 * mint a duplicate. The lock releases when the transaction ends.
 */
async function nextRegistryId(
  client: PoolClient,
  cls: Classification,
  country: string,
  countries: Country[],
): Promise<string> {
  const year = today().getFullYear();
  const code = countryCode(countries, country);
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
export async function createSnsRecord(draft: Draft, base: 'Draft' | 'Pending Level 1'): Promise<ActionResult & { rid?: number }> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!isAdminOr(viewer, 'req')) return { success: false, error: 'Only Requestors can create records.' };
  if (!draft.country) return { success: false, error: 'Select a country.' };
  if (!canActInCountry(viewer, draft.country)) {
    return { success: false, error: `You are not approved to raise records for ${draft.country}.` };
  }
  if (draft.nodes.length === 0) return { success: false, error: 'Select at least one scope item.' };
  if (!draft.supplierId || !draft.supplierName) return { success: false, error: 'Supplier SAP ID and name are required.' };
  if (!draft.reason) return { success: false, error: 'Select a reason code.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');

    const requestor = actorFor(viewer, 'req', draft.country);
    const spend = parseInt(String(draft.spend).replace(/[^0-9]/g, ''), 10) || 0;

    const { rows } = await client.query(
      `INSERT INTO sns_record
         (classification, country, scope_level, supplier_id, supplier_name, reason,
          justification, base_status, spend, evidence, requestor, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING rid`,
      [
        draft.cls, draft.country, draft.level, draft.supplierId, draft.supplierName,
        draft.reason, draft.justification, base, spend,
        draft.evidence || 'No attachment', requestor, viewer.email,
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
      client, rid,
      base === 'Draft' ? 'Draft saved' : 'Draft submitted for Level 1 validation',
      requestor, viewer.email,
    );

    await client.query('COMMIT');
    revalidatePath('/sns-registry');
    return { success: true, rid };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createSnsRecord]', err);
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
      `SELECT rid, classification, country, base_status, registry_id, expiry_date
         FROM sns_record WHERE rid = $1 FOR UPDATE`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const rec = rows[0];
    const country = String(rec.country);
    const base = String(rec.base_status) as BaseStatus;

    if (!canActInCountry(viewer, country)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    const now = today();

    if (base === 'Draft' || base === 'Rejected') {
      if (!isAdminOr(viewer, 'req')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Only a Requestor can submit this record.' };
      }
      await client.query(
        `UPDATE sns_record SET base_status = 'Pending Level 1', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid],
      );
      await addHistory(client, rid, 'Submitted for Level 1 validation', actorFor(viewer, 'req', country), viewer.email);
    } else if (base === 'Pending Level 1') {
      if (!isAdminOr(viewer, 'l1')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Only a Level 1 validator can approve this record.' };
      }
      await client.query(
        `UPDATE sns_record SET base_status = 'Pending Level 2', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
        [rid],
      );
      await addHistory(client, rid, 'Level 1 validated — routed to Level 2', actorFor(viewer, 'l1', country), viewer.email);
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
          client, rid, 'Periodic review complete — expiry extended 12 months',
          actorFor(viewer, 'l2', country), viewer.email,
          'Original Registry ID retained. Review history kept for audit.',
        );
      } else {
        const ref = await getSnsReferenceData();
        const newId = await nextRegistryId(client, rec.classification as Classification, country, ref.countries);
        await client.query(
          `UPDATE sns_record
              SET base_status = 'Active', issue_date = $2, expiry_date = $3,
                  registry_id = $4, updated_at = CURRENT_TIMESTAMP
            WHERE rid = $1`,
          [rid, toISODate(now), toISODate(addDays(now, 365)), newId],
        );
        await addHistory(
          client, rid, `Level 2 sign-off — published to Active as ${newId}`,
          actorFor(viewer, 'l2', country), viewer.email,
        );
      }
    } else {
      await client.query('ROLLBACK');
      return { success: false, error: `A ${base} record cannot be advanced.` };
    }

    await client.query('COMMIT');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[advanceSnsRecord]', err);
    return { success: false, error: 'Could not update the record.' };
  } finally {
    client.release();
  }
}

/** Rejects a pending record back to Draft, recording the reason in the audit trail. */
export async function rejectSnsRecord(rid: number, note: string): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT country, base_status FROM sns_record WHERE rid = $1 FOR UPDATE`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const country = String(rows[0].country);
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
    if (!canActInCountry(viewer, country)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    await client.query(
      `UPDATE sns_record SET base_status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
      [rid],
    );
    await addHistory(
      client, rid,
      `Rejected at ${base === 'Pending Level 1' ? 'Level 1' : 'Level 2'} — returned to Draft`,
      actorFor(viewer, needed, country), viewer.email,
      note || 'No reason recorded.',
    );

    await client.query('COMMIT');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[rejectSnsRecord]', err);
    return { success: false, error: 'Could not reject the record.' };
  } finally {
    client.release();
  }
}

/** Sends a published record back through validation ahead of its 12-month expiry. */
export async function startSnsReview(rid: number): Promise<ActionResult> {
  const viewer = await getSnsViewer();
  if (!viewer) return { success: false, error: 'You do not have access to the S&S Registry.' };
  if (!isAdminOr(viewer, 'req')) return { success: false, error: 'Only a Requestor can start a periodic review.' };

  const client = await snsPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT country, base_status FROM sns_record WHERE rid = $1 FOR UPDATE`,
      [rid],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Record not found.' };
    }
    const country = String(rows[0].country);
    const base = String(rows[0].base_status) as BaseStatus;

    if (base === 'Pending Level 1' || base === 'Pending Level 2') {
      await client.query('ROLLBACK');
      return { success: false, error: 'This record is already in validation.' };
    }
    if (!canActInCountry(viewer, country)) {
      await client.query('ROLLBACK');
      return { success: false, error: `You are not approved to act on ${country} records.` };
    }

    await client.query(
      `UPDATE sns_record SET base_status = 'Pending Level 1', updated_at = CURRENT_TIMESTAMP WHERE rid = $1`,
      [rid],
    );
    await addHistory(
      client, rid, 'Periodic review started — routed to Level 1',
      actorFor(viewer, 'req', country), viewer.email,
      'Re-validation ahead of the 12-month expiry.',
    );

    await client.query('COMMIT');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[startSnsReview]', err);
    return { success: false, error: 'Could not start the review.' };
  } finally {
    client.release();
  }
}

/* ═══ Access requests ════════════════════════════════════════════ */

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
    console.error('[getMySnsAccessRequest]', err);
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
        requestedCountries,
        reason || null,
      ],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[submitSnsAccessRequest]', err);
    return { success: false, error: 'Could not submit your request.' };
  }
}

/** The full queue for the /admin console — Pending first, then most recent. */
export async function getSnsAccessRequests(): Promise<SnsAccessRequestRow[]> {
  try {
    const { rows } = await snsPool.query(
      `SELECT * FROM sns_access_requests
        ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, requested_at DESC`,
    );
    return rows.map(mapAccessRow);
  } catch (err) {
    console.error('[getSnsAccessRequests]', err);
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
    console.error('[getSnsPendingAccessCount]', err);
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
  if (!ROLES.includes(approvedRole as SnsRole)) return { success: false, error: 'Select a valid role.' };

  try {
    const { rowCount } = await snsPool.query(
      `UPDATE sns_access_requests
          SET status = 'Approved', approved_role = $2, approved_countries = $3,
              reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $4
        WHERE LOWER(user_email) = LOWER($1)`,
      [userEmail, approvedRole, approvedCountries, admin],
    );
    if (!rowCount) return { success: false, error: 'Request not found.' };
    revalidatePath('/admin');
    revalidatePath('/sns-registry');
    return { success: true };
  } catch (err) {
    console.error('[approveSnsAccess]', err);
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
    console.error('[rejectSnsAccess]', err);
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
    console.error('[revokeSnsAccess]', err);
    return { success: false, error: 'Could not revoke access.' };
  }
}

/** Removes the row entirely, letting the user request access from scratch. */
export async function deleteSnsAccessRequest(userEmail: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: 'Admins only.' };
  try {
    await snsPool.query(`DELETE FROM sns_access_requests WHERE LOWER(user_email) = LOWER($1)`, [userEmail]);
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[deleteSnsAccessRequest]', err);
    return { success: false, error: 'Could not delete the request.' };
  }
}
