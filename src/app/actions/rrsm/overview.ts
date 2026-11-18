'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import {
  canAccessCountry,
  currentRrsmActor,
  resolveRrsmCountry,
  rolesIn,
  type RrsmActor,
  type RrsmCountryOption,
} from '@/lib/rrsm/access';
import type { CycleStage } from '@/lib/rrsm/cycle';
import { WINDOW_DAYS } from '@/lib/rrsm/renewals';

/**
 * The reads behind the RRSM shell, the dashboard, the register and the cycle history.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT. Each one resolves the actor and re-checks the country
 * it was handed; a country code from the URL proves nothing about whether the reader holds it.
 * All of them are reads.
 */

const log = logger('rrsm-overview');

/** What every RRSM page needs before it can draw its frame. */
export interface RrsmScope {
  /** Null when the reader holds no live country. */
  country: RrsmCountryOption | null;
  /** More than one means the sidebar draws a picker; one means a static label. */
  available: RrsmCountryOption[];
  canBuy: boolean;
  canValidate: boolean;
  isAdmin: boolean;
}

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

export async function getRrsmScope(requestedCountry?: string | null): Promise<RrsmScope> {
  const actor = await actorOrThrow();
  const { countryCode, available } = await resolveRrsmCountry(actor, requestedCountry);
  const country = available.find((c) => c.code === countryCode) ?? null;
  const roles = country ? rolesIn(actor, country.code) : { canBuy: false, canValidate: false };
  return { country, available, ...roles, isAdmin: actor.isAdmin };
}

/* ─── dashboard ──────────────────────────────────────────────────────────────────────────── */

export interface RrsmOverview {
  cycle: {
    id: number;
    period: string;
    opensOn: string;
    closesOn: string;
    status: string;
    lines: number;
    value: number;
    byStage: Record<CycleStage, number>;
    /** Validated, waiting on a PO number before the buyer can close them. */
    awaitingPo: number;
  } | null;
  suppliers: {
    inCycle: number;
    /** A link exists or not, but no invitation has gone out. */
    notInvited: number;
    /** Invited and not yet submitted. */
    waiting: number;
    submitted: number;
  };
  renewals: {
    /** Pending, and the contract has already ended. */
    overdue: number;
    /** Pending within the next 30 days. */
    dueSoon: number;
    /** Pending anywhere in the reminder window. */
    pending: number;
  };
  register: { activeLines: number; suppliers: number; offHire: number };
}

const NO_STAGES: Record<CycleStage, number> = {
  awaiting_supplier: 0,
  submitted: 0,
  validated: 0,
  returned: 0,
  closed: 0,
};

const EMPTY_OVERVIEW: RrsmOverview = {
  cycle: null,
  suppliers: { inCycle: 0, notInvited: 0, waiting: 0, submitted: 0 },
  renewals: { overdue: 0, dueSoon: 0, pending: 0 },
  register: { activeLines: 0, suppliers: 0, offHire: 0 },
};

/**
 * The dashboard's figures for one country, in four short queries.
 *
 * Renewals are counted from the register rather than from `rrsm_renewals`, because renewal rows
 * are opened when the renewals page is viewed: a contract that crossed into the window this
 * morning has no row yet, and a dashboard that waited for one would report "nothing due" about it.
 * A decision is honoured when one exists for the line's current end date.
 */
export async function getRrsmOverview(countryCode: string): Promise<RrsmOverview> {
  try {
    const actor = await actorOrThrow();
    const code = String(countryCode ?? '').trim();
    if (!code || !canAccessCountry(actor, code, 'buyer')) return EMPTY_OVERVIEW;

    const [cycleRes, registerRes, renewalRes] = await Promise.all([
      rrsmPool.query<QueryResultRow>(
        `SELECT id, period, opens_on, closes_on, status FROM rrsm_cycles
          WHERE country_code = $1 ORDER BY period DESC LIMIT 1`,
        [code],
      ),
      rrsmPool.query<QueryResultRow>(
        `SELECT count(*) FILTER (WHERE active AND off_hire_date IS NULL)::int AS active_lines,
                count(DISTINCT supplier_code) FILTER (WHERE active AND off_hire_date IS NULL)::int
                  AS suppliers,
                count(*) FILTER (WHERE off_hire_date IS NOT NULL)::int AS off_hire
           FROM rrsm_service_lines WHERE country_code = $1`,
        [code],
      ),
      rrsmPool.query<QueryResultRow>(
        `SELECT count(*) FILTER (WHERE s.contract_ends_on < CURRENT_DATE)::int AS overdue,
                count(*) FILTER (WHERE s.contract_ends_on >= CURRENT_DATE
                                   AND s.contract_ends_on <= CURRENT_DATE + 30)::int AS due_soon,
                count(*)::int AS pending
           FROM rrsm_service_lines s
           LEFT JOIN rrsm_renewals r
                  ON r.service_line_id = s.id AND r.due_on = s.contract_ends_on
          WHERE s.country_code = $1 AND s.active AND s.off_hire_date IS NULL
            AND s.contract_ends_on IS NOT NULL
            AND s.contract_ends_on <= CURRENT_DATE + ($2 || ' days')::interval
            AND COALESCE(r.status, 'pending') = 'pending'`,
        [code, WINDOW_DAYS],
      ),
    ]);

    const reg = registerRes.rows[0] ?? {};
    const ren = renewalRes.rows[0] ?? {};
    const out: RrsmOverview = {
      ...EMPTY_OVERVIEW,
      renewals: {
        overdue: Number(ren.overdue ?? 0),
        dueSoon: Number(ren.due_soon ?? 0),
        pending: Number(ren.pending ?? 0),
      },
      register: {
        activeLines: Number(reg.active_lines ?? 0),
        suppliers: Number(reg.suppliers ?? 0),
        offHire: Number(reg.off_hire ?? 0),
      },
    };

    const c = cycleRes.rows[0];
    if (!c) return out;

    const [stageRes, supplierRes] = await Promise.all([
      rrsmPool.query<QueryResultRow>(
        `SELECT stage, count(*)::int AS n, COALESCE(sum(value), 0) AS value,
                count(*) FILTER (WHERE stage = 'validated'
                                   AND COALESCE(po_number, '') = '')::int AS awaiting_po
           FROM rrsm_cycle_lines WHERE cycle_id = $1 GROUP BY stage`,
        [Number(c.id)],
      ),
      /* Suppliers are those with a line in the cycle; the link row, where there is one, says how
         far the invitation got. */
      rrsmPool.query<QueryResultRow>(
        `SELECT count(*)::int AS in_cycle,
                count(*) FILTER (WHERE k.sent_at IS NULL)::int AS not_invited,
                count(*) FILTER (WHERE k.sent_at IS NOT NULL AND k.submitted_at IS NULL)::int
                  AS waiting,
                count(*) FILTER (WHERE k.submitted_at IS NOT NULL)::int AS submitted
           FROM (SELECT DISTINCT s.supplier_code
                   FROM rrsm_cycle_lines l
                   JOIN rrsm_service_lines s ON s.id = l.service_line_id
                  WHERE l.cycle_id = $1) sup
           LEFT JOIN rrsm_supplier_links k
                  ON k.cycle_id = $1 AND k.supplier_code = sup.supplier_code`,
        [Number(c.id)],
      ),
    ]);

    const byStage = { ...NO_STAGES };
    let lines = 0;
    let value = 0;
    let awaitingPo = 0;
    for (const r of stageRes.rows) {
      const stage = String(r.stage) as CycleStage;
      if (stage in byStage) byStage[stage] = Number(r.n);
      lines += Number(r.n);
      value += Number(r.value ?? 0);
      awaitingPo += Number(r.awaiting_po ?? 0);
    }

    const sup = supplierRes.rows[0] ?? {};
    return {
      ...out,
      cycle: {
        id: Number(c.id),
        period: dateOnly(c.period),
        opensOn: dateOnly(c.opens_on),
        closesOn: dateOnly(c.closes_on),
        status: String(c.status),
        lines,
        value,
        byStage,
        awaitingPo,
      },
      suppliers: {
        inCycle: Number(sup.in_cycle ?? 0),
        notInvited: Number(sup.not_invited ?? 0),
        waiting: Number(sup.waiting ?? 0),
        submitted: Number(sup.submitted ?? 0),
      },
    };
  } catch (err) {
    log.error('getRrsmOverview.failed', err, { countryCode });
    return EMPTY_OVERVIEW;
  }
}

/* ─── service register ───────────────────────────────────────────────────────────────────── */

export interface RegisterRow {
  id: number;
  supplierCode: string;
  supplierName: string;
  category: string;
  description: string;
  assetRef: string;
  segment: string;
  costCenter: string;
  costCenterName: string;
  serviceNumber: string;
  operatingModel: string;
  uom: string;
  rate: number | null;
  paymentTerms: string;
  startsOn: string;
  contractEndsOn: string;
  offHireDate: string;
  ownerEmail: string;
  requesterEmail: string;
  entity: string;
  purchasingGroup: string;
  plant: string;
  active: boolean;
  /** Cycles that have carried this line. Above zero, it can be off-hired but not deleted. */
  cycles: number;
}

/**
 * Every service line in the country, on hire or not.
 *
 * Readable by anyone in the country. Changes go through `actions/rrsm/register.ts`, which
 * allows buyers and admins only and logs every one.
 */
export async function getRrsmRegister(countryCode: string): Promise<RegisterRow[]> {
  try {
    const actor = await actorOrThrow();
    const code = String(countryCode ?? '').trim();
    if (!code || !canAccessCountry(actor, code, 'buyer')) return [];

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT s.id, s.supplier_code, sup.name AS supplier_name, s.description,
              COALESCE(s.category, '') AS category,
              COALESCE(s.asset_ref, '') AS asset_ref, s.segment, s.cost_center,
              COALESCE(s.cost_center_name, '') AS cost_center_name,
              COALESCE(s.service_number, '') AS service_number, s.operating_model, s.uom, s.rate,
              COALESCE(s.payment_terms, '') AS payment_terms, s.starts_on, s.contract_ends_on,
              s.off_hire_date, COALESCE(s.owner_email, '') AS owner_email,
              COALESCE(s.requester_email, '') AS requester_email, s.active,
              COALESCE(s.entity, '') AS entity,
              COALESCE(s.purchasing_group, '') AS purchasing_group,
              COALESCE(s.plant, '') AS plant,
              (SELECT count(*)::int FROM rrsm_cycle_lines c WHERE c.service_line_id = s.id)
                AS cycles
         FROM rrsm_service_lines s
         JOIN rrsm_suppliers sup ON sup.code = s.supplier_code
        WHERE s.country_code = $1
        ORDER BY (s.active AND s.off_hire_date IS NULL) DESC, sup.name, s.segment, s.description`,
      [code],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      supplierCode: String(r.supplier_code),
      supplierName: String(r.supplier_name),
      category: String(r.category ?? ''),
      description: String(r.description),
      assetRef: String(r.asset_ref ?? ''),
      segment: String(r.segment),
      costCenter: String(r.cost_center),
      costCenterName: String(r.cost_center_name ?? ''),
      serviceNumber: String(r.service_number ?? ''),
      operatingModel: String(r.operating_model),
      uom: String(r.uom),
      rate: r.rate === null ? null : Number(r.rate),
      paymentTerms: String(r.payment_terms ?? ''),
      startsOn: r.starts_on ? dateOnly(r.starts_on) : '',
      contractEndsOn: r.contract_ends_on ? dateOnly(r.contract_ends_on) : '',
      offHireDate: r.off_hire_date ? dateOnly(r.off_hire_date) : '',
      ownerEmail: String(r.owner_email ?? ''),
      requesterEmail: String(r.requester_email ?? ''),
      entity: String(r.entity ?? ''),
      purchasingGroup: String(r.purchasing_group ?? ''),
      plant: String(r.plant ?? ''),
      active: Boolean(r.active),
      cycles: Number(r.cycles ?? 0),
    }));
  } catch (err) {
    log.error('getRrsmRegister.failed', err, { countryCode });
    return [];
  }
}

/* ─── cycle history ──────────────────────────────────────────────────────────────────────── */

export interface HistoryRow {
  id: number;
  period: string;
  opensOn: string;
  closesOn: string;
  status: string;
  closedAt: string;
  lines: number;
  closedLines: number;
  value: number;
  suppliers: number;
  withPo: number;
}

/** Every cycle the country has run, newest first, with what each one came to. */
export async function getRrsmHistory(countryCode: string): Promise<HistoryRow[]> {
  try {
    const actor = await actorOrThrow();
    const code = String(countryCode ?? '').trim();
    if (!code || !canAccessCountry(actor, code, 'buyer')) return [];

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT c.id, c.period, c.opens_on, c.closes_on, c.status, c.closed_at,
              count(l.id)::int AS lines,
              count(l.id) FILTER (WHERE l.stage = 'closed')::int AS closed_lines,
              COALESCE(sum(l.value), 0) AS value,
              count(DISTINCT s.supplier_code)::int AS suppliers,
              count(l.id) FILTER (WHERE COALESCE(l.po_number, '') <> '')::int AS with_po
         FROM rrsm_cycles c
         LEFT JOIN rrsm_cycle_lines l   ON l.cycle_id = c.id
         LEFT JOIN rrsm_service_lines s ON s.id = l.service_line_id
        WHERE c.country_code = $1
        GROUP BY c.id
        ORDER BY c.period DESC`,
      [code],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      period: dateOnly(r.period),
      opensOn: dateOnly(r.opens_on),
      closesOn: dateOnly(r.closes_on),
      status: String(r.status),
      closedAt: r.closed_at ? dateOnly(r.closed_at) : '',
      lines: Number(r.lines ?? 0),
      closedLines: Number(r.closed_lines ?? 0),
      value: Number(r.value ?? 0),
      suppliers: Number(r.suppliers ?? 0),
      withPo: Number(r.with_po ?? 0),
    }));
  } catch (err) {
    log.error('getRrsmHistory.failed', err, { countryCode });
    return [];
  }
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}
