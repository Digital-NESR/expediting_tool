'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { currentActor } from '@/lib/require-access';
import {
  currentRrsmActor,
  resolveRrsmCountry,
  rolesIn,
  type RrsmActor,
  type RrsmCountryOption,
} from '@/lib/rrsm/access';
import { rrsmHref } from '@/lib/rrsm/nav';
import { recurrentDecisionMail, sendRrsmMail } from '@/lib/rrsm/notify';
import {
  DECISION_LABEL,
  RENEWAL_PERIODS,
  canDecideRenewal,
  checkRecurrent,
  cleanPeople,
  isRequesterOf,
  poIssue,
  recurrentStatus,
  suggestNextExpiry,
  type Person,
  type PoIssue,
  type RecurrentDraft,
  type RecurrentStatus,
  type RecurrentStoredStatus,
  type RenewalDecision,
  type RenewalPeriod,
} from '@/lib/rrsm/recurrent';
import { daysUntil } from '@/lib/rrsm/renewals';
import { EMPTY_SAP, type SapStatus } from '@/lib/rrsm/sap';
import {
  readPoHistory,
  readPoValue,
  type PoHistory,
  type PoValue,
} from '@/lib/rrsm/po-history-read';
import { readSapStatus } from '@/lib/rrsm/sap-status';
import { checkDoc } from '@/lib/rrsm/submission';
import { appBase } from '@/lib/rrsm/supplier-access';

/**
 * Recurrent services: the register, the requester's decision and the buyer's renewal.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT. Each one resolves the actor and re-reads the service's
 * country (and, for a requester, whether the service is theirs) from the row, never from the
 * caller. Buyers and admins edit; a requester decides on their own services and nothing else.
 */

const log = logger('rrsm-recurrent');

export type RecurrentDocKind = 'contract' | 'quotation' | 'other';

export interface RecurrentRow {
  id: number;
  description: string;
  serviceName: string;
  storedStatus: RecurrentStoredStatus;
  status: RecurrentStatus;
  renewalPeriod: RenewalPeriod;
  poRenewalPeriod: string;
  department: string;
  contractExpiry: string;
  /** Days until expiry; negative once expired; null with no date. */
  daysLeft: number | null;
  lastPoNumber: string;
  lastPoValidTill: string;
  supplierCode: string;
  supplierName: string;
  supplierContactName: string;
  supplierContactEmail: string;
  /** The requester-validators, in the buyer's order. Any of them decides on the renewal. */
  requesters: Person[];
  buyerName: string;
  buyerEmail: string;
  approver: string;
  requestType: string;
  annualValue: number | null;
  currency: string;
  comments: string;
  /** The renewal open for the current expiry, if any. */
  renewal: {
    id: number;
    dueOn: string;
    decision: RenewalDecision | null;
    decisionNote: string;
    decidedBy: string;
    decidedAt: string;
    remindersSent: number[];
  } | null;
  /** The buyer's suggested next expiry: current expiry plus one renewal period. */
  suggestedExpiry: string;
  documents: { id: number; kind: RecurrentDocKind; fileName: string; uploadedAt: string }[];
  /** True when the reader may decide on this service's renewal. */
  canDecide: boolean;
  /** Why the buyer should update the PO number (none, not in SAP, or old), or null. */
  poIssue: PoIssue | null;
}

export interface RecurrentBoard {
  country: RrsmCountryOption | null;
  available: RrsmCountryOption[];
  enabled: boolean;
  canEdit: boolean;
  canBuy: boolean;
  canValidate: boolean;
  isAdmin: boolean;
  isRequester: boolean;
  /** True when the reader sees only their own services. */
  ownOnly: boolean;
  rows: RecurrentRow[];
  sap: SapStatus;
}

export type RecurrentResult = { success: boolean; error?: string; id?: number };

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}
function txt(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** A service's requesters: the list, or the one legacy requester on a row saved before it. */
function requestersOf(r: QueryResultRow): Person[] {
  const list = cleanPeople(Array.isArray(r.requesters) ? (r.requesters as Person[]) : []);
  if (list.length) return list;
  return cleanPeople([{ name: txt(r.requester_name), email: txt(r.requester_email) }]);
}

/** Matches a service on which $N is one of the requesters (lower-cased email). */
const REQUESTER_IS = (n: number) =>
  `(EXISTS (SELECT 1 FROM jsonb_array_elements(s.requesters) p WHERE lower(p ->> 'email') = $${n})
     OR lower(s.requester_email) = $${n})`;

/** The service's country and requesters, read from the row. A service id proves nothing. */
async function serviceOwner(
  id: number,
): Promise<{ country: string; requesters: Person[]; recurrentOn: boolean }> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT s.country_code, s.requesters, s.requester_name, s.requester_email, c.recurrent_enabled
       FROM rrsm_recurrent_services s JOIN rrsm_countries c ON c.code = s.country_code
      WHERE s.id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error('No such service.');
  return {
    country: String(rows[0].country_code),
    requesters: requestersOf(rows[0]),
    recurrentOn: Boolean(rows[0].recurrent_enabled),
  };
}

/* ─── read ───────────────────────────────────────────────────────────────────────────────── */

export async function getRecurrentBoard(requestedCountry?: string | null): Promise<RecurrentBoard> {
  const actor = await actorOrThrow();
  const { countryCode, available } = await resolveRrsmCountry(actor, requestedCountry);
  const country = available.find((c) => c.code === countryCode) ?? null;
  const roles = country
    ? rolesIn(actor, country.code)
    : { canBuy: false, canValidate: false, isRequester: false };
  const empty: RecurrentBoard = {
    country,
    available,
    enabled: Boolean(country?.recurrentEnabled),
    canEdit: roles.canBuy,
    canBuy: roles.canBuy,
    canValidate: roles.canValidate,
    isAdmin: actor.isAdmin,
    isRequester: roles.isRequester,
    ownOnly: !roles.canBuy && !actor.isAdmin,
    rows: [],
    sap: EMPTY_SAP,
  };
  if (!country || !country.recurrentEnabled) return empty;

  try {
    /* A requester (or anybody who is not a buyer or admin here) sees only the services where
       they are the requester-validator. */
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT s.*,
              r.id AS renewal_id, r.due_on, r.decision, r.decision_note, r.decided_by,
              r.decided_at, r.reminders_sent, r.completed
         FROM rrsm_recurrent_services s
         LEFT JOIN LATERAL (
              SELECT * FROM rrsm_recurrent_renewals x
               WHERE x.service_id = s.id AND NOT x.completed
               ORDER BY x.due_on DESC LIMIT 1
         ) r ON TRUE
        WHERE s.country_code = $1
          AND ($2::text IS NULL OR ${REQUESTER_IS(2)})
        ORDER BY s.contract_expiry NULLS LAST, s.description`,
      [country.code, empty.ownOnly ? actor.email.toLowerCase() : null],
    );

    const ids = rows.map((r) => Number(r.id));
    const docs = ids.length
      ? (
          await rrsmPool.query<QueryResultRow>(
            `SELECT id, service_id, kind, file_name, uploaded_at FROM rrsm_recurrent_documents
              WHERE service_id = ANY($1) ORDER BY uploaded_at DESC`,
            [ids],
          )
        ).rows
      : [];

    const today = new Date();
    const out: RecurrentRow[] = rows.map((r) => {
      const expiry = r.contract_expiry instanceof Date ? r.contract_expiry : null;
      const renewal = r.renewal_id
        ? {
            id: Number(r.renewal_id),
            dueOn: day(r.due_on),
            decision: (r.decision ? String(r.decision) : null) as RenewalDecision | null,
            decisionNote: txt(r.decision_note),
            decidedBy: txt(r.decided_by),
            decidedAt: r.decided_at ? day(r.decided_at) : '',
            remindersSent: ((r.reminders_sent as number[] | null) ?? []).map(Number),
          }
        : null;
      const period = (RENEWAL_PERIODS as readonly string[]).includes(String(r.renewal_period))
        ? (String(r.renewal_period) as RenewalPeriod)
        : 'other';
      const next = suggestNextExpiry(expiry, period);
      return {
        id: Number(r.id),
        description: txt(r.description),
        serviceName: txt(r.service_name),
        storedStatus: String(r.status) as RecurrentStoredStatus,
        status: recurrentStatus({
          stored: String(r.status) as RecurrentStoredStatus,
          expiry,
          today,
          renewal: renewal ? { decision: renewal.decision, completed: false } : null,
        }),
        renewalPeriod: period,
        poRenewalPeriod: txt(r.po_renewal_period),
        department: txt(r.department),
        contractExpiry: expiry ? day(expiry) : '',
        daysLeft: expiry ? daysUntil(expiry, today) : null,
        lastPoNumber: txt(r.last_po_number),
        lastPoValidTill: r.last_po_valid_till ? day(r.last_po_valid_till) : '',
        supplierCode: txt(r.supplier_code),
        supplierName: txt(r.supplier_name),
        supplierContactName: txt(r.supplier_contact_name),
        supplierContactEmail: txt(r.supplier_contact_email),
        requesters: requestersOf(r),
        buyerName: txt(r.buyer_name),
        buyerEmail: txt(r.buyer_email),
        approver: txt(r.approver),
        requestType: txt(r.request_type),
        annualValue: r.annual_value === null ? null : Number(r.annual_value),
        currency: txt(r.currency),
        comments: txt(r.comments),
        renewal,
        suggestedExpiry: next ? day(next) : '',
        documents: docs
          .filter((d) => Number(d.service_id) === Number(r.id))
          .map((d) => ({
            id: Number(d.id),
            kind: String(d.kind) as RecurrentDocKind,
            fileName: txt(d.file_name),
            uploadedAt: day(d.uploaded_at),
          })),
        canDecide:
          String(r.status) === 'active' &&
          canDecideRenewal({
            actorEmail: actor.email,
            requesters: requestersOf(r),
            canBuy: roles.canBuy,
          }),
        poIssue: null, // set below, once SAP has been read
      };
    });

    const sap = await readSapStatus(
      out.map((r) => r.lastPoNumber),
      [],
    );
    for (const r of out) {
      r.poIssue = poIssue({
        active: r.storedStatus === 'active',
        poNumber: r.lastPoNumber,
        period: r.renewalPeriod,
        sapRead: sap.ok,
        createdOn: sap.pos[r.lastPoNumber]?.createdOn || null,
        today,
      });
    }
    return { ...empty, rows: out, sap };
  } catch (err) {
    log.error('getRecurrentBoard.failed', err, { country: country.code });
    return empty;
  }
}

/** The change log for one service, newest first. Anybody who can see the service may read it. */
export async function getRecurrentHistory(serviceId: number): Promise<
  {
    at: string;
    actor: string;
    action: string;
    note: string;
    changes: Record<string, [unknown, unknown]>;
  }[]
> {
  try {
    const actor = await actorOrThrow();
    const owner = await serviceOwner(Number(serviceId));
    const roles = rolesIn(actor, owner.country);
    const mine = isRequesterOf(actor.email, owner.requesters);
    if (!roles.canBuy && !mine) return [];
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT created_at, actor, action, COALESCE(note, '') AS note, changes
         FROM rrsm_recurrent_log WHERE service_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [Number(serviceId)],
    );
    return rows.map((r) => ({
      at:
        r.created_at instanceof Date
          ? r.created_at.toISOString().slice(0, 16).replace('T', ' ')
          : '',
      actor: txt(r.actor),
      action: txt(r.action),
      note: txt(r.note),
      changes: (r.changes as Record<string, [unknown, unknown]>) ?? {},
    }));
  } catch (err) {
    log.error('getRecurrentHistory.failed', err, { serviceId });
    return [];
  }
}

/**
 * The service's POs in SAP, year on year. Read-only on Materials DB; the same people who may see
 * the service's change history may see this.
 */
export async function getRecurrentPoHistory(serviceId: number): Promise<PoHistory> {
  const empty: PoHistory = { ok: false, pos: [], years: [] };
  try {
    const id = Number(serviceId);
    const actor = await actorOrThrow();
    const owner = await serviceOwner(id);
    const roles = rolesIn(actor, owner.country);
    const mine = isRequesterOf(actor.email, owner.requesters);
    if (!roles.canBuy && !mine) return empty;

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT s.service_name, s.description, s.supplier_name, s.supplier_code, s.last_po_number,
              ARRAY(SELECT new_po_number FROM rrsm_recurrent_renewals
                     WHERE service_id = s.id AND new_po_number IS NOT NULL) AS renewal_pos,
              ARRAY(SELECT x FROM rrsm_recurrent_log l,
                           LATERAL jsonb_array_elements_text(l.changes -> 'lastPoNumber') x
                     WHERE l.service_id = s.id AND jsonb_typeof(l.changes -> 'lastPoNumber') = 'array'
                   ) AS logged_pos
         FROM rrsm_recurrent_services s WHERE s.id = $1`,
      [id],
    );
    const s = rows[0];
    if (!s) return empty;
    return await readPoHistory({
      text: `${txt(s.service_name)} ${txt(s.description)}`,
      supplierName: txt(s.supplier_name),
      supplierCode: txt(s.supplier_code),
      recorded: [
        txt(s.last_po_number),
        ...((s.renewal_pos as string[] | null) ?? []),
        ...((s.logged_pos as string[] | null) ?? []),
      ].filter((p) => /^\d{6,12}$/.test(p)),
    });
  } catch (err) {
    log.error('getRecurrentPoHistory.failed', err, { serviceId });
    return empty;
  }
}

/**
 * A PO's value for a service, read from SAP while the buyer types it in, so the form can fill the
 * annual value and currency. Buyers only (they are the ones who edit); read-only on Materials DB.
 */
export async function lookupRecurrentPo(input: {
  countryCode: string;
  poNumber: string;
  serviceName: string;
  description: string;
  supplierName: string;
}): Promise<{ ok: boolean; po: PoValue | null; error?: string }> {
  try {
    const actor = await actorOrThrow();
    if (!rolesIn(actor, String(input?.countryCode ?? '')).canBuy) {
      return { ok: false, po: null, error: 'Only a buyer or an admin edits recurrent services.' };
    }
    const po = await readPoValue({
      poNumber: String(input?.poNumber ?? ''),
      text: `${String(input?.serviceName ?? '')} ${String(input?.description ?? '')}`,
      supplierName: String(input?.supplierName ?? ''),
    });
    return { ok: true, po };
  } catch (err) {
    log.error('lookupRecurrentPo.failed', err, { po: input?.poNumber });
    return { ok: false, po: null, error: 'SAP could not be read just now.' };
  }
}

/** SAP's value for the PO, or null; never throws (a save must not fail because SAP is down). */
async function sapValueOf(poNumber: string, text: string, supplierName: string) {
  try {
    return await readPoValue({ poNumber, text, supplierName });
  } catch (err) {
    log.error('sapValueOf.failed', err, { poNumber });
    return null;
  }
}

/* ─── buyers: add, edit, remove ──────────────────────────────────────────────────────────── */

/* The plain columns. The requesters list is saved beside them (with its first person copied into
   the legacy requester_name / requester_email columns). */
const FIELDS: [Exclude<keyof RecurrentDraft, 'requesters'>, string][] = [
  ['description', 'description'],
  ['serviceName', 'service_name'],
  ['status', 'status'],
  ['renewalPeriod', 'renewal_period'],
  ['poRenewalPeriod', 'po_renewal_period'],
  ['department', 'department'],
  ['contractExpiry', 'contract_expiry'],
  ['lastPoNumber', 'last_po_number'],
  ['lastPoValidTill', 'last_po_valid_till'],
  ['supplierCode', 'supplier_code'],
  ['supplierName', 'supplier_name'],
  ['supplierContactName', 'supplier_contact_name'],
  ['supplierContactEmail', 'supplier_contact_email'],
  ['buyerName', 'buyer_name'],
  ['buyerEmail', 'buyer_email'],
  ['approver', 'approver'],
  ['requestType', 'request_type'],
  ['annualValue', 'annual_value'],
  ['currency', 'currency'],
  ['comments', 'comments'],
];

/** How a person reads in the change log. */
function label(p: Person): string {
  return p.name && p.email ? `${p.name} <${p.email}>` : p.name || p.email;
}

function valuesOf(d: RecurrentDraft): (string | number | null)[] {
  return FIELDS.map(([k]) => {
    const v = String(d[k] ?? '').trim();
    if (k === 'annualValue') return v ? Number(v.replace(/,/g, '')) : null;
    if (k === 'buyerEmail' || k === 'supplierContactEmail') return v ? v.toLowerCase() : null;
    if (k === 'currency') return v ? v.toUpperCase() : null;
    return v || null;
  });
}

export async function saveRecurrentService(input: {
  countryCode: string;
  id?: number;
  draft: RecurrentDraft;
}): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const code = String(input?.countryCode ?? '').trim();
    if (input?.id) {
      const owner = await serviceOwner(Number(input.id));
      if (owner.country !== code)
        return { success: false, error: 'That service is in another country.' };
    }
    if (!rolesIn(actor, code).canBuy) {
      return { success: false, error: 'Only a buyer or an admin edits recurrent services.' };
    }
    const problem = checkRecurrent(input.draft);
    if (problem) return { success: false, error: problem };
    /* A PO with no annual value: take the value and currency from SAP, when SAP has the PO. */
    const draft = { ...input.draft };
    /* A new service's buyer is the buyer adding it. */
    if (!input.id) {
      const who = await currentActor();
      draft.buyerEmail = actor.email;
      draft.buyerName = who?.name && who.name !== who.email ? who.name : '';
    }
    if (draft.lastPoNumber.trim() && !draft.annualValue.trim()) {
      const sap = await sapValueOf(
        draft.lastPoNumber,
        `${draft.serviceName} ${draft.description}`,
        draft.supplierName,
      );
      if (sap && sap.value > 0) {
        draft.annualValue = String(sap.value);
        draft.currency = sap.currency || draft.currency;
      }
    }
    const values = valuesOf(draft);
    const people = cleanPeople(draft.requesters);
    const peopleJson = JSON.stringify(people);
    const n = FIELDS.length;

    const client = await rrsmPool.connect();
    try {
      await client.query('BEGIN');
      let id = Number(input.id ?? 0);
      let changes: Record<string, [unknown, unknown]> = {};
      if (id) {
        const { rows: before } = await client.query<QueryResultRow>(
          `SELECT * FROM rrsm_recurrent_services WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const sets = FIELDS.map(([, col], i) => `${col} = ${i + 2}`).join(', ');
        await client.query(
          `UPDATE rrsm_recurrent_services
              SET ${sets}, requesters = $${n + 2}::jsonb, requester_name = $${n + 3},
                  requester_email = $${n + 4}, updated_at = NOW()
            WHERE id = $1`,
          [id, ...values, peopleJson, people[0]?.name || null, people[0]?.email || null],
        );
        const wasPeople = requestersOf(before[0]);
        if (JSON.stringify(wasPeople) !== peopleJson) {
          changes.requesters = [wasPeople.map(label), people.map(label)];
        }
        FIELDS.forEach(([key, col], i) => {
          const was = before[0][col] instanceof Date ? day(before[0][col]) : before[0][col];
          const now = values[i];
          if (
            String(was ?? '') !== String(now ?? '') &&
            !(Number(was) === Number(now) && now !== null && was !== null && key === 'annualValue')
          )
            changes[key] = [was ?? null, now];
        });
      } else {
        const cols = FIELDS.map(([, col]) => col).join(', ');
        const params = FIELDS.map((_, i) => `${i + 3}`).join(', ');
        const { rows } = await client.query<QueryResultRow>(
          `INSERT INTO rrsm_recurrent_services
                  (country_code, created_by, ${cols}, requesters, requester_name, requester_email)
           VALUES ($1, $2, ${params}, $${n + 3}::jsonb, $${n + 4}, $${n + 5}) RETURNING id`,
          [
            code,
            actor.email,
            ...values,
            peopleJson,
            people[0]?.name || null,
            people[0]?.email || null,
          ],
        );
        id = Number(rows[0].id);
        changes = Object.fromEntries(FIELDS.map(([key], i) => [key, [null, values[i]]]));
        if (people.length) changes.requesters = [null, people.map(label)];
      }
      if (Object.keys(changes).length) {
        await client.query(
          `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, changes)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            id,
            code,
            actor.email,
            input.id ? 'service_updated' : 'service_created',
            JSON.stringify(changes),
          ],
        );
      }
      await client.query('COMMIT');
      return { success: true, id };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    log.error('saveRecurrentService.failed', err, { id: input?.id });
    return { success: false, error: (err as Error).message };
  }
}

/** Remove a service. Its renewals and documents go with it; the log keeps the record. */
export async function deleteRecurrentService(serviceId: number): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const id = Number(serviceId);
    const owner = await serviceOwner(id);
    if (!rolesIn(actor, owner.country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin removes recurrent services.' };
    }
    const client = await rrsmPool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<QueryResultRow>(
        `DELETE FROM rrsm_recurrent_services WHERE id = $1
         RETURNING description, service_name, supplier_name, contract_expiry, last_po_number`,
        [id],
      );
      await client.query(
        `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, changes, note)
         VALUES ($1, $2, $3, 'service_deleted', $4::jsonb, $5)`,
        [
          id,
          owner.country,
          actor.email,
          JSON.stringify(rows[0] ?? {}),
          `Removed ${txt(rows[0]?.service_name) || txt(rows[0]?.description)}`,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (err) {
    log.error('deleteRecurrentService.failed', err, { serviceId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── the requester's decision ───────────────────────────────────────────────────────────── */

/**
 * Renew as is, renew with changes (described in free text, which the buyer turns into field
 * edits), or cancel. Recorded against the renewal for the current expiry, opened here if the
 * reminder run has not opened it yet. The buyer is told by mail; best effort.
 */
export async function decideRecurrentRenewal(input: {
  serviceId: number;
  decision: RenewalDecision;
  note?: string;
}): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const id = Number(input?.serviceId);
    const owner = await serviceOwner(id);
    const roles = rolesIn(actor, owner.country);
    if (
      !canDecideRenewal({
        actorEmail: actor.email,
        requesters: owner.requesters,
        canBuy: roles.canBuy,
      })
    ) {
      return {
        success: false,
        error: "Only the service's requester-validators or a buyer decide on renewal.",
      };
    }
    if (!(['renew', 'renew_changes', 'cancel'] as string[]).includes(input?.decision)) {
      return { success: false, error: 'Pick renew, renew with changes or cancel.' };
    }
    const note = String(input?.note ?? '')
      .trim()
      .slice(0, 2000);
    if (input.decision === 'renew_changes' && !note) {
      return { success: false, error: 'Say what should change, so the buyer can update it.' };
    }

    const { rows: svc } = await rrsmPool.query<QueryResultRow>(
      `SELECT status, contract_expiry, description, service_name, supplier_name, buyer_email,
              requester_email
         FROM rrsm_recurrent_services WHERE id = $1`,
      [id],
    );
    const s = svc[0];
    if (s.status !== 'active') return { success: false, error: 'This service is cancelled.' };
    const dueOn = s.contract_expiry instanceof Date ? day(s.contract_expiry) : day(new Date());

    await rrsmPool.query(
      `INSERT INTO rrsm_recurrent_renewals (service_id, due_on, decision, decision_note, decided_by, decided_at)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5, NOW())
       ON CONFLICT (service_id, due_on) DO UPDATE
         SET decision = EXCLUDED.decision, decision_note = EXCLUDED.decision_note,
             decided_by = EXCLUDED.decided_by, decided_at = NOW()
         WHERE NOT rrsm_recurrent_renewals.completed`,
      [id, dueOn, input.decision, note, actor.email],
    );
    await rrsmPool.query(
      `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, changes, note)
       VALUES ($1, $2, $3, 'renewal_decided', $4::jsonb, NULLIF($5, ''))`,
      [id, owner.country, actor.email, JSON.stringify({ decision: [null, input.decision] }), note],
    );

    /* The buyer on the service, and every buyer for the country: whoever acts on it next. */
    const { rows: buyers } = await rrsmPool.query<QueryResultRow>(
      `SELECT DISTINCT lower(email) AS email FROM rrsm_users
        WHERE active AND country_code = $1 AND role IN ('buyer', 'admin')`,
      [owner.country],
    );
    const to = [
      ...new Set(
        [s.buyer_email, ...buyers.map((b) => b.email)]
          .map((e) => String(e ?? '').toLowerCase())
          .filter((e) => e.includes('@')),
      ),
    ];
    if (to.length) {
      try {
        await sendRrsmMail(
          recurrentDecisionMail({
            to,
            /* The other requesters, so they know it has been decided. */
            cc: owner.requesters
              .map((p) => p.email)
              .filter((e) => e.includes('@') && e !== actor.email.toLowerCase() && !to.includes(e)),
            serviceName: txt(s.service_name) || txt(s.description),
            supplierName: txt(s.supplier_name),
            expiresOn: dueOn,
            decisionLabel: DECISION_LABEL[input.decision],
            note,
            decidedBy: actor.email,
            url: appBase() + rrsmHref('/rrsm/recurrent', owner.country),
          }),
        );
      } catch (err) {
        log.error('decideRecurrentRenewal.mail', err, { id });
      }
    }
    return { success: true };
  } catch (err) {
    log.error('decideRecurrentRenewal.failed', err, { serviceId: input?.serviceId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── the buyer closes the renewal ───────────────────────────────────────────────────────── */

/**
 * Record the outcome: the new PO and the new expiry (renewed), or cancelled. Closes the open
 * renewal, moves the service on to its next term, and starts the clock again from the new
 * expiry. Field changes the requester asked for are made with the ordinary edit.
 */
export async function completeRecurrentRenewal(input: {
  serviceId: number;
  outcome: 'renewed' | 'cancelled';
  newPoNumber?: string;
  newExpiry?: string;
  newPoValidTill?: string;
  note?: string;
}): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const id = Number(input?.serviceId);
    const owner = await serviceOwner(id);
    if (!rolesIn(actor, owner.country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin records a renewal.' };
    }
    const po = String(input?.newPoNumber ?? '').trim();
    const expiry = String(input?.newExpiry ?? '').trim();
    const validTill = String(input?.newPoValidTill ?? '').trim() || expiry;
    const note = String(input?.note ?? '')
      .trim()
      .slice(0, 2000);
    if (input.outcome === 'renewed') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry))
        return { success: false, error: 'Give the new expiry date.' };
      if (po && !/^\d{6,12}$/.test(po))
        return { success: false, error: 'A PO number is digits only.' };
    }

    const client = await rrsmPool.connect();
    try {
      await client.query('BEGIN');
      const { rows: before } = await client.query<QueryResultRow>(
        `SELECT contract_expiry, last_po_number, last_po_valid_till, status, annual_value, currency,
                service_name, description, supplier_name
           FROM rrsm_recurrent_services WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const b = before[0];
      const dueOn = b.contract_expiry instanceof Date ? day(b.contract_expiry) : day(new Date());
      await client.query(
        `INSERT INTO rrsm_recurrent_renewals (service_id, due_on, completed, completed_by, completed_at, new_po_number, new_expiry)
         VALUES ($1, $2, TRUE, $3, NOW(), NULLIF($4, ''), NULLIF($5, '')::date)
         ON CONFLICT (service_id, due_on) DO UPDATE
           SET completed = TRUE, completed_by = EXCLUDED.completed_by, completed_at = NOW(),
               new_po_number = EXCLUDED.new_po_number, new_expiry = EXCLUDED.new_expiry`,
        [id, dueOn, actor.email, po, input.outcome === 'renewed' ? expiry : ''],
      );
      /* The new PO's value, from SAP, is the service's annual value from now on. */
      const sap =
        input.outcome === 'renewed' && po
          ? await sapValueOf(
              po,
              `${txt(b.service_name)} ${txt(b.description)}`,
              txt(b.supplier_name),
            )
          : null;
      const newValue = sap && sap.value > 0 ? sap : null;
      if (input.outcome === 'renewed') {
        await client.query(
          `UPDATE rrsm_recurrent_services
              SET contract_expiry = $2::date,
                  last_po_number = COALESCE(NULLIF($3, ''), last_po_number),
                  last_po_valid_till = $4::date,
                  annual_value = COALESCE($5::numeric, annual_value),
                  currency = COALESCE($6, currency),
                  updated_at = NOW()
            WHERE id = $1`,
          [id, expiry, po, validTill, newValue?.value ?? null, newValue?.currency || null],
        );
      } else {
        await client.query(
          `UPDATE rrsm_recurrent_services SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [id],
        );
      }
      await client.query(
        `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, changes, note)
         VALUES ($1, $2, $3, $4, $5::jsonb, NULLIF($6, ''))`,
        [
          id,
          owner.country,
          actor.email,
          input.outcome === 'renewed' ? 'renewal_completed' : 'service_cancelled',
          JSON.stringify(
            input.outcome === 'renewed'
              ? {
                  contractExpiry: [day(b.contract_expiry), expiry],
                  lastPoNumber: [b.last_po_number, po || b.last_po_number],
                  lastPoValidTill: [day(b.last_po_valid_till), validTill],
                  ...(newValue
                    ? {
                        annualValue: [b.annual_value, newValue.value],
                        currency: [b.currency, newValue.currency],
                      }
                    : {}),
                }
              : { status: [b.status, 'cancelled'] },
          ),
          note,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (err) {
    log.error('completeRecurrentRenewal.failed', err, { serviceId: input?.serviceId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── documents ──────────────────────────────────────────────────────────────────────────── */

/** Contract, quotation or other document on a service. Buyers, and the service's requester. */
export async function uploadRecurrentDocument(form: FormData): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const id = Number(form.get('serviceId'));
    const kind = String(form.get('kind') ?? '') as RecurrentDocKind;
    const file = form.get('file');
    const owner = await serviceOwner(id);
    if (
      !canDecideRenewal({
        actorEmail: actor.email,
        requesters: owner.requesters,
        canBuy: rolesIn(actor, owner.country).canBuy,
      })
    ) {
      return {
        success: false,
        error: "Only a buyer or the service's requester-validators add documents.",
      };
    }
    if (!(['contract', 'quotation', 'other'] as string[]).includes(kind)) {
      return { success: false, error: 'Pick contract, quotation or other.' };
    }
    if (!(file instanceof File)) return { success: false, error: 'Choose a file to upload.' };
    const ok = checkDoc({ name: file.name, size: file.size });
    if (!ok.ok) return { success: false, error: ok.error };
    const bytes = Buffer.from(await file.arrayBuffer());
    await rrsmPool.query(
      `INSERT INTO rrsm_recurrent_documents (service_id, kind, file_name, content_type, size_bytes, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, kind, ok.name, ok.contentType, bytes.length, bytes, actor.email],
    );
    await rrsmPool.query(
      `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, note)
       VALUES ($1, $2, $3, 'document_added', $4)`,
      [id, owner.country, actor.email, `${kind}: ${ok.name}`],
    );
    return { success: true };
  } catch (err) {
    log.error('uploadRecurrentDocument.failed', err);
    return { success: false, error: 'The upload did not go through. Try again.' };
  }
}

export async function removeRecurrentDocument(documentId: number): Promise<RecurrentResult> {
  try {
    const actor = await actorOrThrow();
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT service_id, file_name, kind FROM rrsm_recurrent_documents WHERE id = $1`,
      [Number(documentId)],
    );
    if (!rows[0]) return { success: false, error: 'No such document.' };
    const owner = await serviceOwner(Number(rows[0].service_id));
    if (!rolesIn(actor, owner.country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin removes documents.' };
    }
    await rrsmPool.query(`DELETE FROM rrsm_recurrent_documents WHERE id = $1`, [
      Number(documentId),
    ]);
    await rrsmPool.query(
      `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, note)
       VALUES ($1, $2, $3, 'document_removed', $4)`,
      [
        Number(rows[0].service_id),
        owner.country,
        actor.email,
        `${rows[0].kind}: ${rows[0].file_name}`,
      ],
    );
    return { success: true };
  } catch (err) {
    log.error('removeRecurrentDocument.failed', err, { documentId });
    return { success: false, error: (err as Error).message };
  }
}
