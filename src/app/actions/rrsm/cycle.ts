'use server';

import type { PoolClient, QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import {
  canAccessCountry,
  currentRrsmActor,
  resolveRrsmCountry,
  type RrsmActor,
  type RrsmCountryOption,
} from '@/lib/rrsm/access';
import { canMove, cycleWindow, isoDate, type CycleStage, type ErpStatus } from '@/lib/rrsm/cycle';

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
}

export interface BoardSupplier {
  code: string;
  name: string;
  paymentTerms: string;
  lines: BoardLine[];
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

/** Which of the two jobs this actor may do in this country. Admins may do both. */
function rolesIn(actor: RrsmActor, code: string): { canBuy: boolean; canValidate: boolean } {
  if (actor.isAdmin) return { canBuy: true, canValidate: true };
  const here = actor.grants.filter((g) => g.countryCode === code);
  return {
    canBuy: here.some((g) => g.role === 'buyer' || g.role === 'admin'),
    canValidate: here.some((g) => g.role === 'ops' || g.role === 'admin'),
  };
}

/** The country a cycle belongs to, read from the row rather than trusted from the caller. */
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
              s.cost_center, COALESCE(s.service_number, '') AS service_number, s.uom,
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
        };
        suppliers.set(code, group);
      }
      group.lines.push(toBoardLine(r));
    }

    return {
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
    const { canValidate } = rolesIn(actor, countryCode);
    if (!canValidate) return { success: false, error: 'Only Ops or an admin opens a cycle.' };

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

    /* The rate comes from the register (today's agreed rate) and the quantity from last month's
       confirmed figure, defaulting to 1 where there is no history. */
    await client.query(
      `INSERT INTO rrsm_cycle_lines (cycle_id, service_line_id, qty, rate, on_hire)
       SELECT $1, s.id, COALESCE(prev.qty, 1), s.rate, TRUE
         FROM rrsm_service_lines s
         LEFT JOIN LATERAL (
              SELECT p.qty FROM rrsm_cycle_lines p
                JOIN rrsm_cycles pc ON pc.id = p.cycle_id
               WHERE p.service_line_id = s.id AND pc.country_code = $2 AND pc.period < $3
               ORDER BY pc.period DESC LIMIT 1
         ) prev ON TRUE
        WHERE s.country_code = $2 AND s.active AND s.off_hire_date IS NULL
       ON CONFLICT (cycle_id, service_line_id) DO NOTHING`,
      [cycleId, countryCode, first],
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
      `UPDATE rrsm_cycle_lines
          SET pr_number = NULLIF($2, ''), po_number = NULLIF($3, ''),
              erp_status = $4, supplier_invoice = $5, updated_at = NOW()
        WHERE id = $1`,
      [
        Number(input.lineId),
        String(input?.prNumber ?? '').trim(),
        String(input?.poNumber ?? '').trim(),
        input?.erpStatus ?? null,
        invoice,
      ],
    );
    return { success: true };
  } catch (err) {
    log.error('saveBuyerRefs.failed', err, { lineId: input?.lineId });
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
