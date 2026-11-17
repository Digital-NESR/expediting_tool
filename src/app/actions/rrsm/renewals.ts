'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { canAccessCountry, currentRrsmActor, type RrsmActor } from '@/lib/rrsm/access';
import {
  WINDOW_DAYS,
  canChange,
  canDecide,
  extendedTo,
  isoDate,
  type RenewalDecision,
  type RenewalStatus,
} from '@/lib/rrsm/renewals';

/**
 * Annual renewals: which contracts are running out, and what was decided.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT, so each resolves the actor and re-checks the country
 * the line belongs to, read from the row rather than taken from the caller.
 *
 * Opening a renewal is a read-side side effect on purpose: the first time anybody looks at a
 * country's renewals, rows are created for everything inside the window. The alternative is a
 * scheduled job, and until one exists a renewal that only comes into being when a job runs is a
 * renewal nobody sees. Creating them on sight means the list is complete whenever it is opened.
 */

const log = logger('rrsm-renewals');

export interface RenewalRow {
  id: number;
  serviceLineId: number;
  description: string;
  assetRef: string;
  segment: string;
  supplierName: string;
  supplierCode: string;
  uom: string;
  rate: number | null;
  currency: string;
  dueOn: string;
  status: RenewalStatus;
  /** Months of this line that actually carried a quantity in the last twelve cycles. */
  monthsUsed: number;
  qtyTotal: number;
  requesterEmail: string;
  ownerEmail: string;
  decidedBy: string;
  decidedAt: string;
  note: string;
  extendsTo: string;
  remindersSent: number[];
}

export interface RenewalBoard {
  countryName: string;
  currency: string;
  canDecide: boolean;
  rows: RenewalRow[];
}

export type RenewalResult = { success: boolean; error?: string };

const EMPTY: RenewalBoard = { countryName: '', currency: '', canDecide: false, rows: [] };

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

function rolesIn(actor: RrsmActor, code: string): { canBuy: boolean; isAdmin: boolean } {
  if (actor.isAdmin) return { canBuy: true, isAdmin: true };
  const here = actor.grants.filter((g) => g.countryCode === code);
  return {
    canBuy: here.some((g) => g.role === 'buyer' || g.role === 'admin'),
    isAdmin: false,
  };
}

/**
 * Everything due in this country, decided or not.
 *
 * Decided rows stay on the list for their window rather than vanishing, because "we decided not
 * to extend the cranes" is the answer to a question somebody asks three weeks later, and a list
 * that only shows what is outstanding cannot answer it.
 */
export async function getRrsmRenewals(countryCode: string): Promise<RenewalBoard> {
  try {
    const actor = await actorOrThrow();
    const code = String(countryCode ?? '').trim();
    if (!code || !canAccessCountry(actor, code, 'buyer')) return EMPTY;

    /* Open a row for anything newly inside the window. ON CONFLICT means looking twice is the
       same as looking once, which matters because this runs on every page view. */
    await rrsmPool.query(
      `INSERT INTO rrsm_renewals (service_line_id, due_on)
       SELECT s.id, s.contract_ends_on
         FROM rrsm_service_lines s
        WHERE s.country_code = $1 AND s.active
          AND s.off_hire_date IS NULL
          AND s.contract_ends_on IS NOT NULL
          AND s.contract_ends_on <= CURRENT_DATE + ($2 || ' days')::interval
       ON CONFLICT (service_line_id, due_on) DO NOTHING`,
      [code, WINDOW_DAYS],
    );

    const { rows: meta } = await rrsmPool.query<QueryResultRow>(
      `SELECT name, currency FROM rrsm_countries WHERE code = $1`,
      [code],
    );
    if (!meta[0]) return EMPTY;

    /* Twelve months of use, counted from the cycle lines. `months_used` counts months that
       carried a quantity rather than months that existed, so a line sitting at zero all year
       reads as unused rather than as twelve months of service. */
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT r.id, r.service_line_id, r.due_on, r.status, r.decided_by, r.decided_at,
              COALESCE(r.note, '') AS note, r.extends_to, r.reminders_sent,
              s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.segment, s.uom, s.rate,
              COALESCE(s.requester_email, '') AS requester_email,
              COALESCE(s.owner_email, '') AS owner_email,
              s.supplier_code, sup.name AS supplier_name,
              COALESCE(u.months_used, 0) AS months_used,
              COALESCE(u.qty_total, 0)   AS qty_total
         FROM rrsm_renewals r
         JOIN rrsm_service_lines s ON s.id = r.service_line_id
         JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
         LEFT JOIN LATERAL (
              SELECT count(*) FILTER (WHERE l.qty > 0)::int AS months_used,
                     COALESCE(sum(l.qty), 0)                AS qty_total
                FROM rrsm_cycle_lines l
                JOIN rrsm_cycles c ON c.id = l.cycle_id
               WHERE l.service_line_id = s.id
                 AND c.period > (r.due_on - INTERVAL '12 months')
         ) u ON TRUE
        WHERE s.country_code = $1
        ORDER BY r.status <> 'pending', r.due_on, sup.name`,
      [code],
    );

    return {
      countryName: String(meta[0].name),
      currency: String(meta[0].currency),
      canDecide: canDecide(rolesIn(actor, code)),
      rows: rows.map(toRow),
    };
  } catch (err) {
    log.error('getRrsmRenewals.failed', err, { countryCode });
    return EMPTY;
  }
}

function toRow(r: QueryResultRow): RenewalRow {
  return {
    id: Number(r.id),
    serviceLineId: Number(r.service_line_id),
    description: String(r.description),
    assetRef: String(r.asset_ref ?? ''),
    segment: String(r.segment),
    supplierName: String(r.supplier_name),
    supplierCode: String(r.supplier_code),
    uom: String(r.uom),
    rate: r.rate === null ? null : Number(r.rate),
    currency: '',
    dueOn: dateOnly(r.due_on),
    status: String(r.status) as RenewalStatus,
    monthsUsed: Number(r.months_used ?? 0),
    qtyTotal: Number(r.qty_total ?? 0),
    requesterEmail: String(r.requester_email ?? ''),
    ownerEmail: String(r.owner_email ?? ''),
    decidedBy: String(r.decided_by ?? ''),
    decidedAt: r.decided_at ? dateOnly(r.decided_at) : '',
    note: String(r.note ?? ''),
    extendsTo: r.extends_to ? dateOnly(r.extends_to) : '',
    remindersSent: (r.reminders_sent as number[] | null) ?? [],
  };
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

/**
 * Record a decision, and move the contract date when it is an extension.
 *
 * The utilisation figures are frozen onto the row as it is decided, because the design puts
 * twelve months of use in front of the decider and a decision read back next year should show
 * the numbers that were on the screen, not next year's.
 *
 * An extension moves `contract_ends_on` forward, which is what takes the line out of the window
 * and puts it back a year later. A refusal does not: the contract still ends when it ends, and
 * somebody has to off-hire the line when it does. Pretending otherwise would quietly drop it off
 * every list while the asset was still on site.
 */
export async function decideRrsmRenewal(input: {
  renewalId: number;
  decision: RenewalDecision;
  note?: string;
}): Promise<RenewalResult> {
  try {
    const actor = await actorOrThrow();
    const id = Number(input?.renewalId);

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT r.id, r.status, r.due_on, s.country_code, s.id AS service_line_id
         FROM rrsm_renewals r JOIN rrsm_service_lines s ON s.id = r.service_line_id
        WHERE r.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'No such renewal.' };

    const country = String(row.country_code);
    if (!canAccessCountry(actor, country, 'buyer')) {
      return { success: false, error: 'No access to that country.' };
    }
    if (!canDecide(rolesIn(actor, country))) {
      return {
        success: false,
        error: 'Extending a contract is a buyer’s decision. Ops can add a note instead.',
      };
    }
    if (!canChange(String(row.status) as RenewalStatus)) {
      return { success: false, error: 'That renewal has already been decided.' };
    }

    const decision = input?.decision;
    if (!['extended', 'scope_change', 'not_extended'].includes(decision)) {
      return { success: false, error: 'Unknown decision.' };
    }

    const due = new Date(dateOnly(row.due_on) + 'T00:00:00Z');
    /* A scope change is still twelve months; what changes is what is on the line, which is a
       register edit somebody makes separately. Only a refusal leaves the date alone. */
    const newEnd = decision === 'not_extended' ? null : isoDate(extendedTo(due));

    await rrsmPool.query(
      `UPDATE rrsm_renewals r
          SET status = $2,
              note = NULLIF($3, ''),
              decided_by = $4,
              decided_at = NOW(),
              extends_to = $5::date,
              months_used = u.months_used,
              qty_total = u.qty_total,
              updated_at = NOW()
         FROM (
              SELECT count(*) FILTER (WHERE l.qty > 0)::int AS months_used,
                     COALESCE(sum(l.qty), 0)                AS qty_total
                FROM rrsm_cycle_lines l
                JOIN rrsm_cycles c ON c.id = l.cycle_id
               WHERE l.service_line_id = $6
                 AND c.period > ($7::date - INTERVAL '12 months')
         ) u
        WHERE r.id = $1`,
      [
        id,
        decision,
        String(input?.note ?? '').trim(),
        actor.email,
        newEnd,
        Number(row.service_line_id),
        dateOnly(row.due_on),
      ],
    );

    if (newEnd) {
      await rrsmPool.query(
        `UPDATE rrsm_service_lines SET contract_ends_on = $2::date, updated_at = NOW()
          WHERE id = $1`,
        [Number(row.service_line_id), newEnd],
      );
    }

    log.info('renewal.decided', { id, decision, by: actor.email, country });
    return { success: true };
  } catch (err) {
    log.error('decideRrsmRenewal.failed', err, { renewalId: input?.renewalId });
    return { success: false, error: (err as Error).message };
  }
}
