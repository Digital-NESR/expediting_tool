'use server';

import type { PoolClient, QueryResultRow } from 'pg';
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
import { canMove, cycleWindow, isoDate, type CycleStage, type ErpStatus } from '@/lib/rrsm/cycle';
import {
  EMPTY_SAP,
  autoPrFor,
  cleanPrNumber,
  lineSap,
  rankCandidates,
  type PrAutoReason,
  type PrCandidate,
  type SapStatus,
} from '@/lib/rrsm/sap';
import { readPrCandidates, readSapStatus } from '@/lib/rrsm/sap-status';
import { pushRateToRegistry, syncRatesFromRegistry } from '@/lib/rrsm/registry-sync';
import type { DocKind } from '@/lib/rrsm/submission';
import { openingStage, stageAfterBuyerDecision, type CycleSteps } from '@/lib/rrsm/steps';

/**
 * The monthly cycle, for the Ops and Buyer screens.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT, so each one resolves the actor and re-checks the
 * country it is about. A screen that only draws a button for a buyer is not a gate; the gate is
 * `requireCountry` below, and it is called by everything that touches a row.
 */

const log = logger('rrsm-cycle');

export interface BoardLine {
  id: number;
  serviceLineId: number;
  description: string;
  assetRef: string;
  segment: string;
  costCenter: string;
  serviceNumber: string;
  uom: string;
  onHire: boolean;
  days: number | null;
  qty: number;
  rate: number | null;
  value: number;
  stage: CycleStage;
  erpStatus: ErpStatus | null;
  prNumber: string;
  poNumber: string;
  supplierInvoice: number | null;
  opsNote: string;
  /** Last cycle's figures for this same service line, or null when it is new this month. */
  previous: { qty: number; rate: number | null } | null;
  /** A rate / pricing unit the supplier proposed on their submission; null where unchanged. */
  supplierRate: number | null;
  supplierUom: string | null;
  /** 'pending' blocks Ops validation until a buyer accepts or rejects it. */
  changeStatus: 'pending' | 'accepted' | 'rejected' | null;
  /** Set when RRSM linked the PR on its own from SAP (see autoPrFor); null when a buyer did. */
  prAuto: PrAutoReason | null;
}

export interface BoardSupplier {
  code: string;
  name: string;
  paymentTerms: string;
  lines: BoardLine[];
  /** The documents this month's invitation asked for, and what the supplier uploaded. */
  requires: { deliveryNote: boolean; timesheet: boolean };
  documents: { id: number; kind: DocKind; fileName: string }[];
}

export interface RrsmBoard {
  /** Null when the signed-in user has no live country at all. */
  country: RrsmCountryOption | null;
  /** More than one means the caller draws a picker; one means a static label. */
  available: RrsmCountryOption[];
  canBuy: boolean;
  canValidate: boolean;
  isAdmin: boolean;
  cycle: { id: number; period: string; opensOn: string; closesOn: string; status: string } | null;
  /** The period a cycle would be opened for, when there is none. */
  suggestedPeriod: string;
  suppliers: BoardSupplier[];
  /** Live SAP state of the lines' PRs and POs, from Materials DB. */
  sap: SapStatus;
}

export type RrsmResult = { success: boolean; error?: string };

/* ─── gates ──────────────────────────────────────────────────────────────────────────────── */

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

/** The actor, having proved they hold this country. Everything that touches a row calls this. */
async function requireCountry(code: string): Promise<RrsmActor> {
  const actor = await actorOrThrow();
  if (!canAccessCountry(actor, code, 'buyer')) throw new Error('No access to that country.');
  return actor;
}

/** The country a cycle belongs to, read from the row rather than trusted from the caller. */
/** The validation steps a country runs (Admin -> RRSM). Both on when the row says nothing. */
async function stepsOf(
  code: string,
  db: { query: PoolClient['query'] } = rrsmPool,
): Promise<CycleSteps> {
  const { rows } = await db.query<QueryResultRow>(
    `SELECT supplier_validation, ops_validation FROM rrsm_countries WHERE code = $1`,
    [code],
  );
  return {
    supplier:
      rows[0]?.supplier_validation === undefined ? true : Boolean(rows[0].supplier_validation),
    ops: rows[0]?.ops_validation === undefined ? true : Boolean(rows[0].ops_validation),
  };
}

async function countryOfCycle(cycleId: number): Promise<string> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT country_code FROM rrsm_cycles WHERE id = $1`,
    [cycleId],
  );
  if (!rows[0]) throw new Error('No such cycle.');
  return String(rows[0].country_code);
}

/** The country a line belongs to, likewise. A line id from a URL proves nothing. */
async function countryOfLine(lineId: number): Promise<{ country: string; stage: CycleStage }> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT c.country_code, l.stage
       FROM rrsm_cycle_lines l JOIN rrsm_cycles c ON c.id = l.cycle_id
      WHERE l.id = $1`,
    [lineId],
  );
  if (!rows[0]) throw new Error('No such line.');
  return { country: String(rows[0].country_code), stage: String(rows[0].stage) as CycleStage };
}

/* ─── read ───────────────────────────────────────────────────────────────────────────────── */

/** The first day of the month a new cycle would be opened for, as `yyyy-mm-01`. */
function suggestPeriod(): string {
  const now = new Date();
  /* Past the 25th, the month that is starting is the one to open. On the 25th itself the current
     cycle is still closing, so the suggestion stays on it. */
  const month = now.getUTCDate() > 25 ? now.getUTCMonth() + 1 : now.getUTCMonth();
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), month, 1)));
}

/**
 * Everything both screens draw, in one round trip.
 *
 * One call rather than four because the screens are a single view of a single cycle: fetching the
 * cycle, then its lines, then last month's lines, then the country list would make four states
 * that can disagree while they settle, and the Ops grid would flicker through three of them.
 */
export async function getRrsmBoard(requestedCountry?: string | null): Promise<RrsmBoard> {
  const actor = await actorOrThrow();
  const { countryCode, available } = await resolveRrsmCountry(actor, requestedCountry);

  const empty: RrsmBoard = {
    country: null,
    available,
    canBuy: false,
    canValidate: false,
    isAdmin: actor.isAdmin,
    cycle: null,
    suggestedPeriod: suggestPeriod(),
    suppliers: [],
    sap: EMPTY_SAP,
  };
  if (!countryCode) return empty;

  const country = available.find((c) => c.code === countryCode) ?? null;
  const { canBuy, canValidate } = rolesIn(actor, countryCode);

  try {
    const cycleRows = await rrsmPool.query<QueryResultRow>(
      `SELECT id, period, opens_on, closes_on, status FROM rrsm_cycles
        WHERE country_code = $1 ORDER BY period DESC LIMIT 1`,
      [countryCode],
    );
    const c = cycleRows.rows[0];
    if (!c) {
      return { ...empty, country, canBuy, canValidate, available };
    }

    /* Last month's figures come back on the same row via a lateral join rather than as a second
       query keyed by service line: "vs last month" is wanted on every row, and N+1 of those is
       the Ops grid's whole latency. */
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT l.id, l.service_line_id, l.qty, l.rate, l.value, l.stage, l.erp_status,
              COALESCE(l.pr_number, '') AS pr_number, COALESCE(l.po_number, '') AS po_number,
              l.supplier_invoice, COALESCE(l.ops_note, '') AS ops_note,
              l.on_hire, l.days,
              s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.segment,
              s.cost_center, COALESCE(s.service_number, '') AS service_number,
              COALESCE(l.uom, s.uom) AS uom,
              l.supplier_rate, l.supplier_uom, l.change_status, l.pr_link_source,
              s.supplier_code, sup.name AS supplier_name,
              COALESCE(s.payment_terms, '') AS payment_terms,
              prev.qty AS prev_qty, prev.rate AS prev_rate
         FROM rrsm_cycle_lines l
         JOIN rrsm_service_lines s ON s.id = l.service_line_id
         JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
         LEFT JOIN LATERAL (
              SELECT p.qty, p.rate
                FROM rrsm_cycle_lines p
                JOIN rrsm_cycles pc ON pc.id = p.cycle_id
               WHERE p.service_line_id = l.service_line_id
                 AND pc.country_code = $2
                 AND pc.period < $3
               ORDER BY pc.period DESC
               LIMIT 1
         ) prev ON TRUE
        WHERE l.cycle_id = $1
        ORDER BY sup.name, s.segment, s.description`,
      [Number(c.id), countryCode, c.period],
    );

    const suppliers = new Map<string, BoardSupplier>();
    for (const r of rows) {
      const code = String(r.supplier_code);
      let group = suppliers.get(code);
      if (!group) {
        group = {
          code,
          name: String(r.supplier_name),
          paymentTerms: String(r.payment_terms ?? ''),
          lines: [],
          requires: { deliveryNote: false, timesheet: false },
          documents: [],
        };
        suppliers.set(code, group);
      }
      group.lines.push(toBoardLine(r));
    }

    /* Each supplier's invitation: what it asked for and what came back. One query for the cycle. */
    const { rows: linkRows } = await rrsmPool.query<QueryResultRow>(
      `SELECT k.supplier_code, k.requires_delivery_note, k.requires_timesheet,
              COALESCE(json_agg(json_build_object('id', d.id, 'kind', d.kind, 'fileName', d.file_name)
                                ORDER BY d.kind) FILTER (WHERE d.id IS NOT NULL), '[]'::json) AS documents
         FROM rrsm_supplier_links k
         LEFT JOIN rrsm_submission_documents d ON d.link_id = k.id
        WHERE k.cycle_id = $1
        GROUP BY k.id`,
      [Number(c.id)],
    );
    for (const k of linkRows) {
      const group = suppliers.get(String(k.supplier_code));
      if (!group) continue;
      group.requires = {
        deliveryNote: Boolean(k.requires_delivery_note),
        timesheet: Boolean(k.requires_timesheet),
      };
      group.documents = (
        (k.documents as { id: number; kind: DocKind; fileName: string }[]) ?? []
      ).map((d) => ({ id: Number(d.id), kind: d.kind, fileName: String(d.fileName) }));
    }

    /* Lines with no PR get one on their own once SAP has a PO naming the vendor (SAP's rental
       PRs carry no vendor, so the PO is the first place a PR meets its supplier). Only when the
       PR is clear-cut; see autoPrFor. Written with `pr_number IS NULL` in the WHERE, so a
       buyer linking at the same moment wins. */
    await autoLinkPrs(Number(c.id), dateOnly(c.opens_on), dateOnly(c.closes_on), suppliers);

    const sap = await readSapStatus(
      [...suppliers.values()].flatMap((g) => g.lines.map((l) => l.poNumber)),
      [...suppliers.values()].flatMap((g) => g.lines.map((l) => l.prNumber)),
    );

    /* A line with a PR and no PO gets the PO SAP raised from that PR, recorded on the line, once
       SAP has exactly one. Recorded rather than only shown so "Close all ready" and the cycle
       history see it too. `po_number IS NULL` in the WHERE makes a second page load, or a buyer
       typing a PO at the same moment, a no-op rather than an overwrite. */
    if (sap.ok) {
      for (const group of suppliers.values()) {
        for (const line of group.lines) {
          const auto = lineSap(line, sap).autoPo;
          if (!auto) continue;
          try {
            const filled = await rrsmPool.query(
              `UPDATE rrsm_cycle_lines SET po_number = $2, updated_at = NOW()
                WHERE id = $1 AND COALESCE(po_number, '') = '' RETURNING id`,
              [line.id, auto],
            );
            if (filled.rowCount) {
              line.poNumber = auto;
              await rrsmPool.query(
                `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, note)
                 VALUES ($1, $2, 'sap: Materials DB', 'po_from_sap', $3)`,
                [line.id, Number(c.id), `PO ${auto} found in SAP for PR ${line.prNumber}`],
              );
            }
          } catch (err) {
            log.error('getRrsmBoard.autoPo.failed', err, { lineId: line.id });
          }
        }
      }
    }

    return {
      sap,
      country,
      available,
      canBuy,
      canValidate,
      isAdmin: actor.isAdmin,
      cycle: {
        id: Number(c.id),
        period: dateOnly(c.period),
        opensOn: dateOnly(c.opens_on),
        closesOn: dateOnly(c.closes_on),
        status: String(c.status),
      },
      suggestedPeriod: suggestPeriod(),
      suppliers: [...suppliers.values()],
    };
  } catch (err) {
    log.error('getRrsmBoard.failed', err, { country: countryCode });
    return { ...empty, country, canBuy, canValidate };
  }
}

/** The window SAP POs are looked for in: a week before the cycle opens to a week after it closes. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function autoLinkPrs(
  cycleId: number,
  opensOn: string,
  closesOn: string,
  suppliers: Map<string, BoardSupplier>,
): Promise<void> {
  const from = shiftDays(opensOn, -7);
  const to = shiftDays(closesOn, 8);
  for (const group of suppliers.values()) {
    const open = group.lines.filter((l) => !l.prNumber && l.stage !== 'closed');
    if (!open.length) continue;
    const cands = await readPrCandidates(group.code, from, to);
    if (!cands?.length) continue;
    for (const line of open) {
      const pick = autoPrFor(cands, line.value);
      if (!pick) continue;
      try {
        const done = await rrsmPool.query(
          `UPDATE rrsm_cycle_lines SET pr_number = $2, pr_link_source = $3, updated_at = NOW()
            WHERE id = $1 AND COALESCE(pr_number, '') = '' RETURNING id`,
          [line.id, pick.pr, pick.reason],
        );
        if (!done.rowCount) continue;
        line.prNumber = pick.pr;
        line.prAuto = pick.reason;
        await rrsmPool.query(
          `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, note)
           VALUES ($1, $2, 'sap: Materials DB', 'pr_auto_linked', $3)`,
          [
            line.id,
            cycleId,
            pick.reason === 'exact'
              ? `PR ${pick.pr} linked: the one ${group.name} PR in SAP worth exactly this line`
              : pick.reason === 'near'
                ? `PR ${pick.pr} linked, to check: the one ${group.name} PR within 1% of this line`
                : `PR ${pick.pr} linked, to check: ${group.name}'s only PR in SAP for this cycle`,
          ],
        );
      } catch (err) {
        log.error('autoLinkPrs.failed', err, { lineId: line.id });
      }
    }
  }
}

function toBoardLine(r: QueryResultRow): BoardLine {
  return {
    id: Number(r.id),
    serviceLineId: Number(r.service_line_id),
    description: String(r.description),
    assetRef: String(r.asset_ref ?? ''),
    segment: String(r.segment),
    costCenter: String(r.cost_center),
    serviceNumber: String(r.service_number ?? ''),
    uom: String(r.uom),
    onHire: Boolean(r.on_hire),
    days: r.days === null ? null : Number(r.days),
    qty: Number(r.qty ?? 0),
    rate: r.rate === null ? null : Number(r.rate),
    value: Number(r.value ?? 0),
    stage: String(r.stage) as CycleStage,
    erpStatus: r.erp_status === null ? null : (String(r.erp_status) as ErpStatus),
    prNumber: String(r.pr_number ?? ''),
    poNumber: String(r.po_number ?? ''),
    supplierInvoice: r.supplier_invoice === null ? null : Number(r.supplier_invoice),
    opsNote: String(r.ops_note ?? ''),
    previous:
      r.prev_qty === null || r.prev_qty === undefined
        ? null
        : { qty: Number(r.prev_qty), rate: r.prev_rate === null ? null : Number(r.prev_rate) },
    supplierRate:
      r.supplier_rate === null || r.supplier_rate === undefined ? null : Number(r.supplier_rate),
    supplierUom: r.supplier_uom ? String(r.supplier_uom) : null,
    changeStatus: r.change_status ? (String(r.change_status) as BoardLine['changeStatus']) : null,
    prAuto: r.pr_link_source ? (String(r.pr_link_source) as PrAutoReason) : null,
  };
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

/* ─── open a cycle, and carry last month forward ─────────────────────────────────────────── */

/**
 * Open the cycle for a period, copying last month's register forward.
 *
 * This is the tracker's "Copy {month} assets" in one step, because the two are never wanted
 * apart: an empty cycle is nothing anybody can work, and the flow the design describes is "copy
 * every asset from last month for this segment, then Ops confirm each one".
 *
 * Carried forward: the service line, its rate as it stands TODAY, and the quantity Ops confirmed
 * last month. Not carried: the stage, the PR and PO numbers, the invoice and the notes — those
 * are statements about last month and re-using them would have Ops confirming a figure somebody
 * else wrote about a different month.
 *
 * Lines already off hire are skipped. One transaction, so a half-copied cycle cannot exist.
 */
export async function openRrsmCycle(countryCode: string, period: string): Promise<RrsmResult> {
  let client: PoolClient | null = null;
  try {
    const actor = await requireCountry(countryCode);
    /* Ops open the month; a buyer may too, because a country that does not run Ops validation
       has no Ops to do it. */
    const { canValidate, canBuy } = rolesIn(actor, countryCode);
    if (!canValidate && !canBuy) {
      return { success: false, error: 'Only Ops, a buyer or an admin opens a cycle.' };
    }

    const first = `${String(period ?? '').slice(0, 7)}-01`;
    const asDate = new Date(first + 'T00:00:00Z');
    if (Number.isNaN(asDate.getTime())) return { success: false, error: 'Unreadable period.' };
    const { opensOn, closesOn } = cycleWindow(asDate);

    client = await rrsmPool.connect();
    await client.query('BEGIN');

    const { rows: made } = await client.query<QueryResultRow>(
      `INSERT INTO rrsm_cycles (country_code, period, opens_on, closes_on, status)
       VALUES ($1, $2, $3, $4, 'open')
       ON CONFLICT (country_code, period) DO NOTHING
       RETURNING id`,
      [countryCode, first, isoDate(opensOn), isoDate(closesOn)],
    );
    if (!made[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'That cycle is already open.' };
    }
    const cycleId = Number(made[0].id);
    /* Lines start at the first step this country runs: with no supplier validation they skip
       straight to Ops, and with neither step they open ready for the PO. */
    const start = openingStage(await stepsOf(countryCode, client));

    /* Units linked to a Service Registry item take the item's current rate first, so a rate
       changed in the Catalog reaches this month. */
    await syncRatesFromRegistry(client, countryCode, actor.email);

    /* The rate comes from the register (today's agreed rate) and the quantity from last month's
       confirmed figure, defaulting to 1 where there is no history. */
    await client.query(
      `INSERT INTO rrsm_cycle_lines (cycle_id, service_line_id, qty, rate, on_hire, stage)
       SELECT $1, s.id, COALESCE(prev.qty, 1), s.rate, TRUE, $4
         FROM rrsm_service_lines s
         LEFT JOIN LATERAL (
              SELECT p.qty FROM rrsm_cycle_lines p
                JOIN rrsm_cycles pc ON pc.id = p.cycle_id
               WHERE p.service_line_id = s.id AND pc.country_code = $2 AND pc.period < $3
               ORDER BY pc.period DESC LIMIT 1
         ) prev ON TRUE
        WHERE s.country_code = $2 AND s.active AND s.off_hire_date IS NULL
       ON CONFLICT (cycle_id, service_line_id) DO NOTHING`,
      [cycleId, countryCode, first, start],
    );

    await client.query(
      `INSERT INTO rrsm_activity_log (cycle_id, actor, action, note)
       VALUES ($1, $2, 'cycle_opened', $3)`,
      [cycleId, actor.email, `Opened ${first} and carried the register forward`],
    );

    await client.query('COMMIT');
    log.info('cycle.opened', { country: countryCode, period: first, by: actor.email });
    return { success: true };
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    log.error('openRrsmCycle.failed', err, { countryCode, period });
    return { success: false, error: (err as Error).message };
  } finally {
    client?.release();
  }
}

/* ─── Ops: confirm what was used ─────────────────────────────────────────────────────────── */

/**
 * What Ops confirms: on hire, days, quantity, and a note. NOT the rate, and never the value.
 *
 * The process maps are explicit that the Ops step captures utilisation and not value, so the rate
 * is absent from this signature on purpose. A validator who believes a rate is wrong raises it
 * with the buyer; they do not quietly restate what the line costs.
 */
export async function saveOpsLine(input: {
  lineId: number;
  onHire: boolean;
  days: number | null;
  qty: number;
  opsNote?: string;
}): Promise<RrsmResult> {
  try {
    const { country, stage } = await countryOfLine(Number(input?.lineId));
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canValidate) {
      return { success: false, error: 'Only Ops or an admin confirms utilisation.' };
    }
    if (stage === 'closed') return { success: false, error: 'That line is closed.' };
    if (stage === 'validated') {
      return { success: false, error: 'Already validated. Send it back before changing it.' };
    }

    const qty = Number(input?.qty);
    if (!Number.isFinite(qty) || qty < 0)
      return { success: false, error: 'Quantity must be 0 or more.' };
    const days = input?.days === null || input?.days === undefined ? null : Number(input.days);
    if (days !== null && (!Number.isFinite(days) || days < 0 || days > 31)) {
      return { success: false, error: 'Days must be between 0 and 31.' };
    }

    await rrsmPool.query(
      `UPDATE rrsm_cycle_lines
          SET on_hire = $2, days = $3, qty = $4, ops_note = NULLIF($5, ''), updated_at = NOW()
        WHERE id = $1`,
      [Number(input.lineId), Boolean(input.onHire), days, qty, String(input?.opsNote ?? '').trim()],
    );
    return { success: true };
  } catch (err) {
    log.error('saveOpsLine.failed', err, { lineId: input?.lineId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── both: move a line ──────────────────────────────────────────────────────────────────── */

/**
 * Move a line between stages, and say so in the log.
 *
 * `canMove` in lib/rrsm/cycle.ts is the only place the rules live; this endpoint asks it rather
 * than restating it, which is what stops the fifth caller inventing a sixth rule.
 */
export async function moveRrsmLine(input: {
  lineId: number;
  to: CycleStage;
  note?: string;
}): Promise<RrsmResult> {
  try {
    const { country, stage } = await countryOfLine(Number(input?.lineId));
    const actor = await requireCountry(country);
    const { canBuy, canValidate } = rolesIn(actor, country);

    const as =
      canValidate && canMove(stage, input.to, 'ops')
        ? 'ops'
        : canBuy && canMove(stage, input.to, 'buyer')
          ? 'buyer'
          : null;
    if (!as) return { success: false, error: 'That move is not yours to make.' };

    /* A supplier's proposed rate or pricing unit is a buyer's decision, and Ops validating the
       line first would validate a value nobody has agreed. */
    if (input.to === 'validated') {
      const { rows: pending } = await rrsmPool.query<QueryResultRow>(
        `SELECT change_status FROM rrsm_cycle_lines WHERE id = $1`,
        [Number(input.lineId)],
      );
      if (pending[0]?.change_status === 'pending') {
        return {
          success: false,
          error: 'The supplier changed the rate or pricing unit. A buyer has to review it first.',
        };
      }
    }

    const returnedTo = input.to === 'returned' ? (as === 'buyer' ? 'ops' : 'buyer') : null;

    await rrsmPool.query(
      `UPDATE rrsm_cycle_lines
          SET stage = $2,
              returned_to = $3,
              validated_by = CASE WHEN $2 = 'validated' THEN $4 ELSE validated_by END,
              validated_at = CASE WHEN $2 = 'validated' THEN NOW() ELSE validated_at END,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(input.lineId), input.to, returnedTo, actor.email],
    );

    await rrsmPool.query(
      `INSERT INTO rrsm_activity_log (cycle_line_id, actor, action, from_stage, to_stage, note)
       VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))`,
      [
        Number(input.lineId),
        actor.email,
        input.to,
        stage,
        input.to,
        String(input?.note ?? '').trim(),
      ],
    );

    return { success: true };
  } catch (err) {
    log.error('moveRrsmLine.failed', err, { lineId: input?.lineId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── Buyer: the ERP references ──────────────────────────────────────────────────────────── */

/**
 * Record what SAP says. Typed by the buyer, because there is no integration.
 *
 * `erpStatus` is SAP's state and is deliberately not `stage`: a line can be closed here and still
 * sitting at "PO under approval" over there, which is the distinction the baseline's two columns
 * exist to keep sayable.
 */
export async function saveBuyerRefs(input: {
  lineId: number;
  prNumber?: string;
  poNumber?: string;
  erpStatus?: ErpStatus | null;
  supplierInvoice?: number | null;
}): Promise<RrsmResult> {
  try {
    const { country, stage } = await countryOfLine(Number(input?.lineId));
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin records ERP references.' };
    }
    if (stage === 'awaiting_supplier' || stage === 'submitted') {
      return { success: false, error: 'Validate the line before putting it on a PO.' };
    }

    const invoice =
      input?.supplierInvoice === null || input?.supplierInvoice === undefined
        ? null
        : Number(input.supplierInvoice);
    if (invoice !== null && (!Number.isFinite(invoice) || invoice < 0)) {
      return { success: false, error: 'The invoice amount is not a number.' };
    }

    await rrsmPool.query(
      /* The PR is left alone unless one is passed: the PR is linked with `linkLinePr` now, and
         a Save from a row drawn before that link must not put the old PR back. */
      `UPDATE rrsm_cycle_lines
          SET pr_number = CASE WHEN $6 THEN NULLIF($2, '') ELSE pr_number END,
              po_number = NULLIF($3, ''),
              erp_status = $4, supplier_invoice = $5, updated_at = NOW()
        WHERE id = $1`,
      [
        Number(input.lineId),
        String(input?.prNumber ?? '').trim(),
        String(input?.poNumber ?? '').trim(),
        input?.erpStatus ?? null,
        invoice,
        input?.prNumber !== undefined,
      ],
    );
    return { success: true };
  } catch (err) {
    log.error('saveBuyerRefs.failed', err, { lineId: input?.lineId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── Buyer: a supplier's proposed rate or pricing unit ──────────────────────────────────── */

/**
 * Accept or reject what a supplier proposed for one line.
 *
 * Accepting sets this month's rate and pricing unit to the proposal. `updateRegister` also writes
 * them to the service register, so next month opens on them; that is logged in the register's own
 * trail like any other register edit. Rejecting keeps the agreed terms. Either way the line can
 * then be validated by Ops; a buyer who wants the supplier to look again uses Return.
 */
export async function decideSupplierChange(input: {
  lineId: number;
  accept: boolean;
  updateRegister?: boolean;
  note?: string;
}): Promise<RrsmResult> {
  const lineId = Number(input?.lineId);
  try {
    const { country } = await countryOfLine(lineId);
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin decides on a supplier change.' };
    }
    const note = String(input?.note ?? '')
      .trim()
      .slice(0, 500);

    const client = await rrsmPool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<QueryResultRow>(
        `SELECT l.id, l.cycle_id, l.rate, COALESCE(l.uom, s.uom) AS uom, s.uom AS register_uom,
                l.supplier_rate, l.supplier_uom, l.change_status,
                s.id AS service_line_id, s.rate AS register_rate, s.supplier_code,
                s.registry_code
           FROM rrsm_cycle_lines l JOIN rrsm_service_lines s ON s.id = l.service_line_id
          WHERE l.id = $1
          FOR UPDATE OF l`,
        [lineId],
      );
      const r = rows[0];
      if (!r || r.change_status !== 'pending') {
        await client.query('ROLLBACK');
        return { success: false, error: 'There is no supplier change waiting on this line.' };
      }

      const newRate = r.supplier_rate === null ? r.rate : r.supplier_rate;
      const newUom = r.supplier_uom ?? r.uom;
      const describe = `rate ${r.rate ?? '—'} → ${newRate ?? '—'}, unit ${r.uom} → ${newUom}`;

      if (input.accept) {
        await client.query(
          `UPDATE rrsm_cycle_lines
              SET rate = $2::numeric, uom = CASE WHEN $3::text = $4::text THEN NULL ELSE $3::text END,
                  change_status = 'accepted', change_decided_by = $5, change_decided_at = NOW(),
                  change_note = NULLIF($6, ''), updated_at = NOW()
            WHERE id = $1`,
          [lineId, newRate, newUom, r.register_uom, actor.email, note],
        );
        if (input.updateRegister) {
          await client.query(
            `UPDATE rrsm_service_lines SET rate = $2, uom = $3, updated_at = NOW() WHERE id = $1`,
            [Number(r.service_line_id), newRate, newUom],
          );
          const changes: Record<string, [unknown, unknown]> = {};
          if (Number(r.register_rate) !== Number(newRate))
            changes.rate = [r.register_rate, newRate];
          if (r.register_uom !== newUom) changes.uom = [r.register_uom, newUom];
          await client.query(
            `INSERT INTO rrsm_register_log
               (country_code, service_line_id, supplier_code, actor, action, changes, note)
             VALUES ($1, $2, $3, $4, 'line_updated', $5::jsonb, $6)`,
            [
              country,
              Number(r.service_line_id),
              String(r.supplier_code),
              actor.email,
              JSON.stringify(changes),
              'Supplier-proposed terms accepted on the monthly cycle' + (note ? `: ${note}` : ''),
            ],
          );
        }
      } else {
        await client.query(
          `UPDATE rrsm_cycle_lines
              SET change_status = 'rejected', change_decided_by = $2, change_decided_at = NOW(),
                  change_note = NULLIF($3, ''), updated_at = NOW()
            WHERE id = $1`,
          [lineId, actor.email, note],
        );
      }

      /* With no Ops step in this country, the buyer's decision is the last check: the line is
         validated by it. */
      const next = stageAfterBuyerDecision(await stepsOf(country, client));
      if (next) {
        await client.query(
          `UPDATE rrsm_cycle_lines
              SET stage = $2, validated_by = $3, validated_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND stage = 'submitted'`,
          [lineId, next, actor.email],
        );
      }

      await client.query(
        `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          lineId,
          Number(r.cycle_id),
          actor.email,
          input.accept ? 'supplier_change_accepted' : 'supplier_change_rejected',
          describe +
            (input.accept && input.updateRegister ? '; register updated' : '') +
            (note ? `; ${note}` : ''),
        ],
      );
      await client.query('COMMIT');

      /* The register is shared with the Catalog: the unit's registry item takes the new rate as
         a new version, and its other units follow. After the commit, best effort. */
      if (input.accept && input.updateRegister && r.registry_code && newRate !== null) {
        await pushRateToRegistry({
          actor: { name: actor.email, email: actor.email },
          code: String(r.registry_code),
          countryCode: country,
          rate: Number(newRate),
          reason: 'Supplier-proposed rate accepted in RRSM' + (note ? `: ${note}` : ''),
        });
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (err) {
    log.error('decideSupplierChange.failed', err, { lineId });
    return { success: false, error: (err as Error).message };
  }
}

/* ─── Buyer: linking a line to its PR ────────────────────────────────────────────────────── */

export interface PrSuggestions {
  /** Null when Materials DB could not be read. */
  candidates: PrCandidate[] | null;
  /** PR → how many other lines in this cycle already carry it. */
  usedOnLines: Record<string, number>;
}

/**
 * The PRs SAP has put on a service PO for this line's supplier during its cycle (with a week's
 * slack either side, since a month's PO is often raised a few days early or late), nearest the
 * line's value first.
 */
export async function getPrSuggestions(lineId: number): Promise<PrSuggestions> {
  const empty: PrSuggestions = { candidates: [], usedOnLines: {} };
  try {
    const { country } = await countryOfLine(Number(lineId));
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) return empty;

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT l.cycle_id, l.value, s.supplier_code,
              (c.opens_on - 7)::text AS from_on, (c.closes_on + 8)::text AS to_on
         FROM rrsm_cycle_lines l
         JOIN rrsm_service_lines s ON s.id = l.service_line_id
         JOIN rrsm_cycles c        ON c.id = l.cycle_id
        WHERE l.id = $1`,
      [Number(lineId)],
    );
    const r = rows[0];
    if (!r) return empty;

    const found = await readPrCandidates(
      String(r.supplier_code),
      String(r.from_on),
      String(r.to_on),
    );
    if (found === null) return { candidates: null, usedOnLines: {} };

    const { rows: used } = await rrsmPool.query<QueryResultRow>(
      `SELECT pr_number, count(*)::int AS n FROM rrsm_cycle_lines
        WHERE cycle_id = $1 AND id <> $2 AND pr_number = ANY($3) GROUP BY pr_number`,
      [Number(r.cycle_id), Number(lineId), found.map((f) => f.pr)],
    );
    return {
      candidates: rankCandidates(found, Number(r.value ?? 0)),
      usedOnLines: Object.fromEntries(used.map((u) => [String(u.pr_number), Number(u.n)])),
    };
  } catch (err) {
    log.error('getPrSuggestions.failed', err, { lineId });
    return { candidates: null, usedOnLines: {} };
  }
}

/**
 * Put a PR on a line, and optionally on other lines of the same supplier in the same cycle (one
 * monthly PR often covers several of a supplier's lines).
 *
 * Allowed at any stage before closed: the PR is usually raised before Ops have validated the
 * month. Changing a line's PR clears its PO, since the PO came from the old PR; the next page load
 * fills it again from the new one. An empty PR unlinks.
 */
export async function linkLinePr(input: {
  lineId: number;
  pr: string;
  alsoLineIds?: number[];
}): Promise<RrsmResult & { linked?: number }> {
  try {
    const lineId = Number(input?.lineId);
    const { country, stage } = await countryOfLine(lineId);
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin links PRs.' };
    }
    if (stage === 'closed') return { success: false, error: 'That line is closed.' };

    const raw = String(input?.pr ?? '').trim();
    const pr = raw ? cleanPrNumber(raw) : '';
    if (pr === null)
      return { success: false, error: 'A PR number is digits only, like 1016006595.' };

    /* The other lines must be this supplier's, in this cycle, and not closed. Checked against the
       rows, not trusted from the browser. */
    const extra = [...new Set((input?.alsoLineIds ?? []).map(Number))].filter(
      (id) => Number.isInteger(id) && id !== lineId,
    );
    const { rows: targets } = await rrsmPool.query<QueryResultRow>(
      `SELECT o.id, COALESCE(o.pr_number, '') AS pr_number
         FROM rrsm_cycle_lines me
         JOIN rrsm_service_lines ms ON ms.id = me.service_line_id
         JOIN rrsm_cycle_lines o    ON o.cycle_id = me.cycle_id
         JOIN rrsm_service_lines os ON os.id = o.service_line_id
        WHERE me.id = $1 AND os.supplier_code = ms.supplier_code AND o.stage <> 'closed'
          AND (o.id = $1 OR o.id = ANY($2))`,
      [lineId, extra],
    );

    const client = await rrsmPool.connect();
    let linked = 0;
    try {
      await client.query('BEGIN');
      for (const t of targets) {
        const before = String(t.pr_number);
        if (before === pr) continue;
        await client.query(
          `UPDATE rrsm_cycle_lines
              SET pr_number = NULLIF($2, ''), po_number = NULL, pr_link_source = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [Number(t.id), pr],
        );
        await client.query(
          `INSERT INTO rrsm_activity_log (cycle_line_id, actor, action, note)
           VALUES ($1, $2, $3, $4)`,
          [
            Number(t.id),
            actor.email,
            pr ? 'pr_linked' : 'pr_unlinked',
            pr ? `PR ${pr}${before ? ` (was ${before})` : ''}` : `PR ${before} removed`,
          ],
        );
        linked++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return { success: true, linked };
  } catch (err) {
    log.error('linkLinePr.failed', err, { lineId: input?.lineId });
    return { success: false, error: (err as Error).message };
  }
}

/** A buyer agrees with a PR RRSM linked on its own: the line stops asking to be checked. */
export async function confirmLinePr(lineIds: number[]): Promise<RrsmResult & { linked?: number }> {
  try {
    const ids = [...new Set((lineIds ?? []).map(Number))].filter(Number.isInteger);
    if (!ids.length) return { success: true, linked: 0 };
    const { country } = await countryOfLine(ids[0]);
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin confirms PRs.' };
    }
    /* Only lines in that same country, and only ones still waiting for a check. */
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `UPDATE rrsm_cycle_lines l SET pr_link_source = NULL, updated_at = NOW()
         FROM rrsm_service_lines s
        WHERE s.id = l.service_line_id AND s.country_code = $2 AND l.id = ANY($1)
          AND l.pr_link_source IN ('near', 'only')
        RETURNING l.id, l.pr_number`,
      [ids, country],
    );
    for (const r of rows) {
      await rrsmPool.query(
        `INSERT INTO rrsm_activity_log (cycle_line_id, actor, action, note) VALUES ($1, $2, 'pr_confirmed', $3)`,
        [Number(r.id), actor.email, `PR ${r.pr_number} confirmed`],
      );
    }
    return { success: true, linked: rows.length };
  } catch (err) {
    log.error('confirmLinePr.failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/** Close every validated line on a cycle at once — the design's "Send all ready". */
export async function closeValidatedLines(
  cycleId: number,
): Promise<RrsmResult & { moved?: number }> {
  try {
    const country = await countryOfCycle(Number(cycleId));
    const actor = await requireCountry(country);
    if (!rolesIn(actor, country).canBuy) {
      return { success: false, error: 'Only a buyer or an admin closes lines.' };
    }

    /* Only lines that already carry a PO number. Closing a validated line with nothing recorded
       against it loses the one fact the buyer's half of the cycle exists to capture. */
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `UPDATE rrsm_cycle_lines
          SET stage = 'closed', updated_at = NOW()
        WHERE cycle_id = $1 AND stage = 'validated'
          AND COALESCE(po_number, '') <> ''
      RETURNING id`,
      [Number(cycleId)],
    );

    for (const r of rows) {
      await rrsmPool.query(
        `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, from_stage, to_stage)
         VALUES ($1, $2, $3, 'closed', 'validated', 'closed')`,
        [Number(r.id), Number(cycleId), actor.email],
      );
    }

    return { success: true, moved: rows.length };
  } catch (err) {
    log.error('closeValidatedLines.failed', err, { cycleId });
    return { success: false, error: (err as Error).message };
  }
}
