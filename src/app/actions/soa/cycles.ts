'use server';

/**
 * Opening a cycle, taking its spend snapshot, and scoping a country.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one below starts with
 * its own guard. Opening a cycle and running an extract are admin-only; scoping a country is the
 * champion's own job for their own country.
 */

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { ensureSoaSchema, exec, sql } from '@/lib/soa/db';
import { requireSoaActor } from '@/lib/soa/access';
import { isCountryStatus } from '@/lib/soa/deadlines';
import { runExtract, windowFor, type ExtractSummary } from '@/lib/soa/extract';

const log = logger('soa-cycles');

export interface SoaCycle {
  id: number;
  label: string;
  period_start: string;
  period_end: string;
  /** Given to suppliers in the letter: when their statement is due back. */
  submission_deadline: string;
  /** Given to champions: when the country must be reconciled, closed and handed off. */
  cycle_deadline: string;
  coverage_target_pct: number;
  year_end_target_pct: number;
  vendor_threshold_usd: number;
  lookback_months: number;
  is_active: boolean;
  extract_from: string | null;
  extract_to: string | null;
  extracted_at: string | null;
}

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

const asDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : '';

function serialiseCycle(r: QueryResultRow): SoaCycle {
  return {
    id: Number(r.id),
    label: String(r.label),
    period_start: asDate(r.period_start),
    period_end: asDate(r.period_end),
    submission_deadline: asDate(r.submission_deadline),
    cycle_deadline: asDate(r.cycle_deadline),
    coverage_target_pct: Number(r.coverage_target_pct),
    year_end_target_pct: Number(r.year_end_target_pct),
    vendor_threshold_usd: Number(r.vendor_threshold_usd),
    lookback_months: Number(r.lookback_months),
    is_active: r.is_active === true,
    extract_from: r.extract_from ? asDate(r.extract_from) : null,
    extract_to: r.extract_to ? asDate(r.extract_to) : null,
    extracted_at: r.extracted_at instanceof Date ? r.extracted_at.toISOString() : null,
  };
}

/** Every cycle, newest period first. Any approved user, a champion needs to know the deadline. */
export async function getSoaCycles(): Promise<SoaCycle[]> {
  try {
    await requireSoaActor('viewer');
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM cycles ORDER BY period_start DESC`);
    return rows.map(serialiseCycle);
  } catch (err) {
    log.error('getSoaCycles.failed', err);
    return [];
  }
}

/** The cycle the tool opens on, or null when an admin has not opened one yet. */
export async function getActiveSoaCycle(): Promise<SoaCycle | null> {
  try {
    await requireSoaActor('viewer');
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM cycles WHERE is_active LIMIT 1`);
    return rows.length ? serialiseCycle(rows[0]) : null;
  } catch (err) {
    log.error('getActiveSoaCycle.failed', err);
    return null;
  }
}

export interface CycleSnapshotSummary {
  /** Supplier-country rows in the snapshot. */
  rows: number;
  totalUsd: number;
  /** Countries present in the snapshot. */
  countries: number;
  /** Countries a champion has actually scoped. */
  scopedCountries: number;
  vendorsInChase: number;
}

/**
 * What a cycle's snapshot currently holds, for the admin screen.
 *
 * Separate from `getSoaCycles` because it is three aggregates over the biggest table in this
 * database, and the cycle list is read on every admin page load while this is only wanted when
 * somebody is looking at one cycle.
 */
export async function getSoaCycleSummary(cycleId: number): Promise<CycleSnapshotSummary> {
  const empty = { rows: 0, totalUsd: 0, countries: 0, scopedCountries: 0, vendorsInChase: 0 };
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM supplier_po_extract WHERE cycle_id = ?)            AS rows,
         (SELECT COALESCE(SUM(pos_value), 0) FROM supplier_po_extract WHERE cycle_id = ?) AS total,
         (SELECT COUNT(DISTINCT po_country)::int FROM supplier_po_extract WHERE cycle_id = ?) AS countries,
         (SELECT COUNT(*)::int FROM country_cycles WHERE cycle_id = ?)                 AS scoped,
         (SELECT COUNT(*)::int FROM vendor_cycle_entries vce
            JOIN country_cycles cc ON cc.id = vce.country_cycle_id
           WHERE cc.cycle_id = ?)                                                      AS vendors`,
      [cycleId, cycleId, cycleId, cycleId, cycleId],
    );
    const r = rows[0];
    return {
      rows: Number(r.rows),
      totalUsd: Number(r.total),
      countries: Number(r.countries),
      scopedCountries: Number(r.scoped),
      vendorsInChase: Number(r.vendors),
    };
  } catch (err) {
    log.error('getSoaCycleSummary.failed', err);
    return empty;
  }
}

/**
 * Open a cycle.
 *
 * The thresholds are stored on the cycle rather than read from a constant, so changing next
 * quarter's coverage target leaves last quarter's evidence describing the rule it was actually
 * judged against.
 */
export async function createSoaCycle(input: {
  label: string;
  periodStart: string;
  periodEnd: string;
  submissionDeadline: string;
  cycleDeadline: string;
  coverageTargetPct?: number;
  yearEndTargetPct?: number;
  vendorThresholdUsd?: number;
  lookbackMonths?: number;
  makeActive?: boolean;
}): Promise<SoaResult<SoaCycle>> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();

    const label = input.label.trim();
    if (!label) return { success: false, error: 'A label is required, e.g. "Q3 2026".' };
    if (!(new Date(input.periodStart) < new Date(input.periodEnd))) {
      return { success: false, error: 'The period must start before it ends.' };
    }
    /* Closing the country means reconciling what came back, so the collection deadline has to come
       first. The other way round asks a champion to finish before the statements are due. */
    if (new Date(input.cycleDeadline) < new Date(input.submissionDeadline)) {
      return {
        success: false,
        error:
          'The cycle deadline cannot fall before the collection deadline. Statements have to be in before a country can be closed.',
      };
    }

    const rows = await sql<QueryResultRow[]>(
      `INSERT INTO cycles (label, period_start, period_end, submission_deadline, cycle_deadline,
                           coverage_target_pct, year_end_target_pct, vendor_threshold_usd,
                           lookback_months)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, 70), COALESCE(?, 95), COALESCE(?, 250000), COALESCE(?, 18))
       ON CONFLICT (label) DO UPDATE SET
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         submission_deadline = EXCLUDED.submission_deadline,
         cycle_deadline = EXCLUDED.cycle_deadline,
         coverage_target_pct = EXCLUDED.coverage_target_pct,
         year_end_target_pct = EXCLUDED.year_end_target_pct,
         vendor_threshold_usd = EXCLUDED.vendor_threshold_usd,
         lookback_months = EXCLUDED.lookback_months
       RETURNING *`,
      [
        label,
        input.periodStart,
        input.periodEnd,
        input.submissionDeadline,
        input.cycleDeadline,
        input.coverageTargetPct ?? null,
        input.yearEndTargetPct ?? null,
        input.vendorThresholdUsd ?? null,
        input.lookbackMonths ?? null,
      ],
    );

    const cycle = serialiseCycle(rows[0]);
    if (input.makeActive) await activateCycleRow(cycle.id);

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: cycle };
  } catch (err) {
    log.error('createSoaCycle.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not open the cycle.',
    };
  }
}

/* A partial unique index allows only one active cycle, so the previous one has to be stood down
   in the same statement pair. Not exported: nothing outside this module should be able to flip
   the active cycle without going through the guarded action below. */
async function activateCycleRow(cycleId: number): Promise<void> {
  await exec(`UPDATE cycles SET is_active = FALSE WHERE is_active AND id <> ?`, [cycleId]);
  await exec(`UPDATE cycles SET is_active = TRUE WHERE id = ?`, [cycleId]);
}

/** One recorded change to a cycle's dates. Newest first, as the admin screen lists them. */
export interface DeadlineChange {
  changedAt: string;
  changedBy: string;
  reason: string;
  oldSubmissionDeadline: string;
  newSubmissionDeadline: string;
  oldCycleDeadline: string;
  newCycleDeadline: string;
}

/** What has been done to this cycle's dates since it opened. */
export async function getSoaDeadlineChanges(cycleId: number): Promise<DeadlineChange[]> {
  try {
    await requireSoaActor('viewer');
    await ensureSoaSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT changed_at, changed_by, reason,
              old_submission_deadline, new_submission_deadline,
              old_cycle_deadline, new_cycle_deadline
         FROM cycle_deadline_changes
        WHERE cycle_id = ?
        ORDER BY changed_at DESC`,
      [cycleId],
    );
    const day = (v: unknown) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
    return rows.map((r) => ({
      changedAt: r.changed_at instanceof Date ? r.changed_at.toISOString() : String(r.changed_at),
      changedBy: String(r.changed_by),
      reason: String(r.reason),
      oldSubmissionDeadline: day(r.old_submission_deadline),
      newSubmissionDeadline: day(r.new_submission_deadline),
      oldCycleDeadline: day(r.old_cycle_deadline),
      newCycleDeadline: day(r.new_cycle_deadline),
    }));
  } catch (err) {
    log.error('getSoaDeadlineChanges.failed', err);
    return [];
  }
}

/**
 * Move a live cycle's deadlines.
 *
 * Both dates were given to people. The collection one went into the letter every supplier
 * received; the cycle one is what a country is judged late against. So this is not an edit, it is
 * a recorded event: the reason is required, the old and new dates are kept beside it, and the
 * countries already enrolled get an evidence row so the change reaches their packs.
 *
 * Bringing the collection deadline forward is refused once anything has been sent. Suppliers were
 * told a date in writing, and moving it closer afterwards would make a vendor late against a
 * deadline they were never given. Before the first send there is nobody to mislead, so a
 * mistyped date can still be corrected.
 */
export async function extendSoaCycleDeadlines(input: {
  cycleId: number;
  submissionDeadline: string;
  cycleDeadline: string;
  reason: string;
}): Promise<SoaResult<SoaCycle>> {
  try {
    const actor = await requireSoaActor('admin');
    await ensureSoaSchema();

    const reason = input.reason.trim().slice(0, 2000);
    if (reason.length < 3) {
      return { success: false, error: 'Say why the deadline is moving. It goes on the record.' };
    }

    const current = await sql<QueryResultRow[]>(
      `SELECT id, submission_deadline, cycle_deadline, is_active FROM cycles WHERE id = ?`,
      [input.cycleId],
    );
    if (!current.length) return { success: false, error: 'No such cycle.' };
    const row = current[0];
    if (!row.is_active) {
      return {
        success: false,
        error:
          'Only the active cycle can have its deadlines moved. Closed quarters stay as they were judged.',
      };
    }

    const oldSubmission = new Date(String(row.submission_deadline));
    const newSubmission = new Date(input.submissionDeadline);
    const newCycle = new Date(input.cycleDeadline);
    if (Number.isNaN(newSubmission.getTime()) || Number.isNaN(newCycle.getTime())) {
      return { success: false, error: 'Both dates have to be real dates.' };
    }
    if (newCycle < newSubmission) {
      return {
        success: false,
        error:
          'The cycle deadline cannot fall before the collection deadline. Statements have to be in before a country can be closed.',
      };
    }

    if (newSubmission < oldSubmission) {
      const sent = await sql<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n
           FROM outreach_dispatches d
           JOIN vendor_cycle_entries vce ON vce.id = d.vendor_cycle_entry_id
           JOIN country_cycles cc        ON cc.id = vce.country_cycle_id
          WHERE cc.cycle_id = ? AND d.succeeded = TRUE`,
        [input.cycleId],
      );
      if ((sent[0]?.n ?? 0) > 0) {
        return {
          success: false,
          error:
            'Requests have already gone out carrying the current date, so the collection deadline cannot be brought forward. It can be moved later.',
        };
      }
    }

    const updated = await sql<QueryResultRow[]>(
      `UPDATE cycles SET submission_deadline = ?, cycle_deadline = ? WHERE id = ? RETURNING *`,
      [input.submissionDeadline, input.cycleDeadline, input.cycleId],
    );

    await sql(
      `INSERT INTO cycle_deadline_changes
         (cycle_id, changed_by, reason, old_submission_deadline, new_submission_deadline,
          old_cycle_deadline, new_cycle_deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.cycleId,
        actor.email,
        reason,
        row.submission_deadline,
        input.submissionDeadline,
        row.cycle_deadline,
        input.cycleDeadline,
      ],
    );

    /* Also into each enrolled country's own trail, so the change appears in the evidence pack
       beside the chase it changed the shape of, rather than only in an admin table. */
    await sql(
      `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
       SELECT cc.id, NULL, 'info', 'Cycle deadlines changed', ?, ?
         FROM country_cycles cc
        WHERE cc.cycle_id = ?`,
      [
        actor.email,
        `Collection deadline ${String(row.submission_deadline).slice(0, 10)} to ${input.submissionDeadline}, closing deadline ${String(row.cycle_deadline).slice(0, 10)} to ${input.cycleDeadline}. Reason: ${reason}`,
        input.cycleId,
      ],
    );

    log.info('cycles.deadlinesChanged', { cycleId: input.cycleId, by: actor.email });
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: serialiseCycle(updated[0]) };
  } catch (err) {
    log.error('extendSoaCycleDeadlines.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not move the deadlines.',
    };
  }
}

/** Make one cycle the active one; the previous active cycle is stood down. */
export async function activateSoaCycle(cycleId: number): Promise<SoaResult> {
  try {
    await requireSoaActor('admin');
    await activateCycleRow(cycleId);
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('activateSoaCycle.failed', err);
    return { success: false, error: 'Could not activate the cycle.' };
  }
}

/**
 * Teach a country to recognise another spelling of itself.
 *
 * `runSoaExtract` reports `spendCountriesUnmapped` when SAP produces a country string no country
 * claims, and that country's spend is then missing from every coverage denominator, which makes
 * every percentage it should have contributed to look better than it is. Without this the warning
 * could name the problem but not fix it, and the only remedy was editing the database by hand.
 *
 * Adding an alias does not backfill: re-run the extract afterwards so the snapshot picks the
 * country's rows up.
 */
export async function addSoaSpendCountryAlias(input: {
  countryId: string;
  spelling: string;
}): Promise<SoaResult> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();
    const spelling = input.spelling.trim();
    if (!spelling) return { success: false, error: 'A spelling is required.' };

    const clash = await sql<QueryResultRow[]>(
      `SELECT id FROM countries WHERE ? = ANY (spend_names) AND id <> ?`,
      [spelling, input.countryId],
    );
    if (clash.length) {
      return {
        success: false,
        error: `"${spelling}" is already claimed by ${clash[0].id}. One spelling can only belong to one country, or its spend would be counted twice.`,
      };
    }

    const updated = await sql<QueryResultRow[]>(
      `UPDATE countries
          SET spend_names = (SELECT ARRAY(SELECT DISTINCT unnest(spend_names || ARRAY[?::text])))
        WHERE id = ?
        RETURNING id`,
      [spelling, input.countryId],
    );
    if (!updated.length) return { success: false, error: 'Unknown country.' };

    revalidatePath('/admin/soa');
    return { success: true };
  } catch (err) {
    log.error('addSoaSpendCountryAlias.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not add the spelling.',
    };
  }
}

/**
 * Take the cycle's spend snapshot from historic_spend.
 *
 * Slow by the standards of a server action. It aggregates every PO transaction in the window, so
 * it is deliberately a thing an admin triggers once per cycle rather than something that happens
 * on a page load.
 */
export async function runSoaExtract(cycleId: number): Promise<SoaResult<ExtractSummary>> {
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT id, period_end, lookback_months FROM cycles WHERE id = ?`,
      [cycleId],
    );
    if (!rows.length) return { success: false, error: 'No such cycle.' };

    const summary = await runExtract(
      windowFor({
        id: Number(rows[0].id),
        period_end: rows[0].period_end as Date,
        lookback_months: Number(rows[0].lookback_months),
      }),
    );

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: summary };
  } catch (err) {
    log.error('runSoaExtract.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'The extract failed.',
    };
  }
}

/* ═══ Per-country schedule and status ════════════════════════════════════════

   A cycle has one pair of dates and every country inherits them, which is right until one
   country needs another fortnight and the other twelve do not. Moving the cycle to suit one
   country tells the other twelve they have longer than they have, so a country can now be
   given its own dates. The cycle-wide control above is unchanged and remains the way to move
   everybody at once.

   Status is the other thing only an administrator can do. It normally advances with the work
   and never goes back; handoff is the step that cannot be undone from inside the tool, and it
   is the one that needs undoing when a country closes and then finds more suppliers worth
   chasing. Both are recorded with a reason, and both write into the country's evidence trail.
   ═══════════════════════════════════════════════════════════════════════════ */

/** One row of the per-country schedule matrix. */
export interface CountryScheduleRow {
  countryId: string;
  countryName: string;
  /** False when nobody has joined this country to the cycle yet. It can still be given dates. */
  enrolled: boolean;
  /** `country_cycles.status`, or null for a country that has not enrolled. */
  status: string | null;
  handedOffAt: string | null;
  /** What this country is actually working to: its override, or the cycle's. */
  submissionDeadline: string;
  cycleDeadline: string;
  /** Null where the country inherits. A set value is what makes the input show an override. */
  submissionOverride: string | null;
  cycleOverride: string | null;
  /**
   * Requests already sent to this country's suppliers.
   *
   * Carried so the screen can say why a date cannot be pulled earlier before the admin tries
   * it, rather than letting them type a date and read a refusal.
   */
  sentRequests: number;
  vendorsInChase: number;
}

export interface CountrySchedule {
  cycleSubmissionDeadline: string;
  cycleCycleDeadline: string;
  rows: CountryScheduleRow[];
}

/** The matrix: every active country, what it is working to, and where it stands. */
export async function getSoaCountrySchedule(cycleId: number): Promise<CountrySchedule> {
  const empty = { cycleSubmissionDeadline: '', cycleCycleDeadline: '', rows: [] };
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT c.id, c.name, cy.submission_deadline AS cycle_submission,
              cy.cycle_deadline AS cycle_close,
              ccd.submission_deadline AS override_submission,
              ccd.cycle_deadline     AS override_close,
              cc.id IS NOT NULL      AS enrolled,
              cc.status::text        AS status,
              cc.handed_off_at,
              (SELECT COUNT(*)::int FROM vendor_cycle_entries vce
                WHERE vce.country_cycle_id = cc.id)                     AS vendors,
              (SELECT COUNT(*)::int
                 FROM outreach_dispatches d
                 JOIN vendor_cycle_entries vce ON vce.id = d.vendor_cycle_entry_id
                WHERE vce.country_cycle_id = cc.id AND d.succeeded = TRUE) AS sent
         FROM countries c
         JOIN cycles cy ON cy.id = ?
         LEFT JOIN country_cycles cc
                ON cc.cycle_id = cy.id AND cc.country_id = c.id
         LEFT JOIN country_cycle_deadlines ccd
                ON ccd.cycle_id = cy.id AND ccd.country_id = c.id
        WHERE c.active
        ORDER BY c.sort_order, c.name`,
      [cycleId],
    );
    if (!rows.length) return empty;
    return {
      cycleSubmissionDeadline: asDate(rows[0].cycle_submission),
      cycleCycleDeadline: asDate(rows[0].cycle_close),
      rows: rows.map((r) => ({
        countryId: String(r.id),
        countryName: String(r.name),
        enrolled: r.enrolled === true,
        status: r.status ? String(r.status) : null,
        handedOffAt: r.handed_off_at instanceof Date ? r.handed_off_at.toISOString() : null,
        submissionDeadline: asDate(r.override_submission ?? r.cycle_submission),
        cycleDeadline: asDate(r.override_close ?? r.cycle_close),
        submissionOverride: r.override_submission ? asDate(r.override_submission) : null,
        cycleOverride: r.override_close ? asDate(r.override_close) : null,
        sentRequests: Number(r.sent ?? 0),
        vendorsInChase: Number(r.vendors ?? 0),
      })),
    };
  } catch (err) {
    log.error('getSoaCountrySchedule.failed', err);
    return empty;
  }
}

/**
 * Give one country its own deadlines, or put it back on the cycle's.
 *
 * Passing null for a date clears that override, which is a real operation and not the same as
 * leaving it alone: a country that was given an extension and then caught up should go back to
 * inheriting, so that the next cycle-wide move reaches it.
 *
 * The same two rules the cycle is held to, applied to whatever this country ends up working to
 * -- which may be one override and one inherited date, so both are resolved before checking:
 *
 *   closing on or after collection, because a country cannot be reconciled before the
 *   statements are due; and
 *
 *   no pulling the collection date earlier once letters have gone to THIS country's suppliers.
 *   They were told a date in writing. Another country's letters are irrelevant here, which is
 *   the one place this is laxer than the cycle-wide action and correctly so.
 */
export async function setSoaCountryDeadlines(input: {
  cycleId: number;
  countryId: string;
  /** ISO day, or null to inherit the cycle's. */
  submissionDeadline: string | null;
  cycleDeadline: string | null;
  reason: string;
}): Promise<SoaResult> {
  try {
    const actor = await requireSoaActor('admin');
    await ensureSoaSchema();

    const reason = input.reason.trim().slice(0, 2000);
    if (reason.length < 3) {
      return { success: false, error: 'Say why this country is moving. It goes on the record.' };
    }

    const current = await sql<QueryResultRow[]>(
      `SELECT cy.is_active, cy.submission_deadline AS cycle_submission,
              cy.cycle_deadline AS cycle_close,
              ccd.submission_deadline AS old_submission, ccd.cycle_deadline AS old_close,
              c.name AS country_name,
              (SELECT cc.id FROM country_cycles cc
                WHERE cc.cycle_id = cy.id AND cc.country_id = c.id) AS country_cycle_id
         FROM cycles cy
         JOIN countries c ON c.id = ?
         LEFT JOIN country_cycle_deadlines ccd
                ON ccd.cycle_id = cy.id AND ccd.country_id = c.id
        WHERE cy.id = ?`,
      [input.countryId, input.cycleId],
    );
    if (!current.length) return { success: false, error: 'No such cycle or country.' };
    const row = current[0];
    if (!row.is_active) {
      return {
        success: false,
        error:
          'Only the active cycle can have its deadlines moved. Closed quarters stay as they were judged.',
      };
    }

    const inheritedSubmission = asDate(row.cycle_submission);
    const inheritedClose = asDate(row.cycle_close);
    const previousSubmission = row.old_submission
      ? asDate(row.old_submission)
      : inheritedSubmission;
    const previousClose = row.old_close ? asDate(row.old_close) : inheritedClose;

    const nextSubmission = input.submissionDeadline || inheritedSubmission;
    const nextClose = input.cycleDeadline || inheritedClose;
    if (
      Number.isNaN(new Date(nextSubmission).getTime()) ||
      Number.isNaN(new Date(nextClose).getTime())
    ) {
      return { success: false, error: 'Both dates have to be real dates.' };
    }
    if (new Date(nextClose) < new Date(nextSubmission)) {
      return {
        success: false,
        error: `${String(row.country_name)} would be closing on ${nextClose}, before its statements are due on ${nextSubmission}.`,
      };
    }

    if (new Date(nextSubmission) < new Date(previousSubmission)) {
      const sent = await sql<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n
           FROM outreach_dispatches d
           JOIN vendor_cycle_entries vce ON vce.id = d.vendor_cycle_entry_id
           JOIN country_cycles cc        ON cc.id = vce.country_cycle_id
          WHERE cc.cycle_id = ? AND cc.country_id = ? AND d.succeeded = TRUE`,
        [input.cycleId, input.countryId],
      );
      if ((sent[0]?.n ?? 0) > 0) {
        return {
          success: false,
          error: `${String(row.country_name)} has suppliers who were already written to with ${previousSubmission}. That date can be moved later, not earlier.`,
        };
      }
    }

    /* A row with two NULLs is deleted rather than kept. An empty override and no override are
       the same thing to every reader, and leaving the row behind would make the matrix show a
       country as overridden when it inherits. */
    if (!input.submissionDeadline && !input.cycleDeadline) {
      await exec(`DELETE FROM country_cycle_deadlines WHERE cycle_id = ? AND country_id = ?`, [
        input.cycleId,
        input.countryId,
      ]);
    } else {
      await exec(
        `INSERT INTO country_cycle_deadlines
           (cycle_id, country_id, submission_deadline, cycle_deadline, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (cycle_id, country_id) DO UPDATE SET
           submission_deadline = EXCLUDED.submission_deadline,
           cycle_deadline = EXCLUDED.cycle_deadline,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
        [
          input.cycleId,
          input.countryId,
          input.submissionDeadline,
          input.cycleDeadline,
          actor.email,
        ],
      );
    }

    await exec(
      `INSERT INTO cycle_deadline_changes
         (cycle_id, country_id, changed_by, reason, old_submission_deadline,
          new_submission_deadline, old_cycle_deadline, new_cycle_deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.cycleId,
        input.countryId,
        actor.email,
        reason,
        previousSubmission,
        nextSubmission,
        previousClose,
        nextClose,
      ],
    );

    /* Into the country's own trail too, so the extension reaches its evidence pack beside the
       chase it changed the shape of. Only once it has enrolled; before that there is no trail. */
    if (row.country_cycle_id) {
      const backToCycle = !input.submissionDeadline && !input.cycleDeadline;
      await exec(
        `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
         VALUES (?, NULL, 'info', 'Country deadlines changed', ?, ?)`,
        [
          Number(row.country_cycle_id),
          actor.email,
          `Collection ${previousSubmission} to ${nextSubmission}, closing ${previousClose} to ${nextClose}` +
            `${backToCycle ? ' (back to the cycle dates)' : ''}. Reason: ${reason}`,
        ],
      );
    }

    log.info('cycles.countryDeadlinesChanged', {
      cycleId: input.cycleId,
      countryId: input.countryId,
      by: actor.email,
    });
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('setSoaCountryDeadlines.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not move this country.',
    };
  }
}

/** One recorded status override, newest first. */
export interface CountryStatusChange {
  countryId: string;
  changedAt: string;
  changedBy: string;
  reason: string;
  oldStatus: string;
  newStatus: string;
}

/** What has been done by hand to this cycle's country statuses. */
export async function getSoaCountryStatusChanges(cycleId: number): Promise<CountryStatusChange[]> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT country_id, changed_at, changed_by, reason, old_status, new_status
         FROM country_cycle_status_changes
        WHERE cycle_id = ?
        ORDER BY changed_at DESC`,
      [cycleId],
    );
    return rows.map((r) => ({
      countryId: String(r.country_id),
      changedAt: r.changed_at instanceof Date ? r.changed_at.toISOString() : String(r.changed_at),
      changedBy: String(r.changed_by),
      reason: String(r.reason),
      oldStatus: String(r.old_status),
      newStatus: String(r.new_status),
    }));
  } catch (err) {
    log.error('getSoaCountryStatusChanges.failed', err);
    return [];
  }
}

/**
 * Move one country's status by hand, which in practice means reopening it after handoff.
 *
 * Handoff is a one-way door from inside the tool: the screens stop offering actions, the
 * workflow endpoints refuse, and the supplier upload pages stop accepting files. That is right
 * while it holds, and wrong when a country closes and then finds more suppliers worth chasing
 * -- there is no way back, and the quarter's figures are the ones it closed with.
 *
 * Reopening clears `handed_off_at` as well as the status. Leaving the timestamp would show a
 * country as reopened and handed off at once, and the evidence pack reads that column.
 *
 * Nothing else is undone. Statements already collected stay collected, the evidence trail keeps
 * every row it had, and the earlier handoff stays in it with its own timestamp -- a country
 * that was handed off, reopened and handed off again should read as exactly that.
 */
export async function setSoaCountryStatus(input: {
  cycleId: number;
  countryId: string;
  status: string;
  reason: string;
}): Promise<SoaResult> {
  try {
    const actor = await requireSoaActor('admin');
    await ensureSoaSchema();

    if (!isCountryStatus(input.status)) {
      return { success: false, error: 'That is not a status a country can be set to.' };
    }
    const reason = input.reason.trim().slice(0, 2000);
    if (reason.length < 3) {
      return { success: false, error: 'Say why the status is changing. It goes on the record.' };
    }

    const current = await sql<QueryResultRow[]>(
      `SELECT cc.id, cc.status::text AS status, c.name AS country_name, cy.is_active
         FROM country_cycles cc
         JOIN countries c ON c.id = cc.country_id
         JOIN cycles cy   ON cy.id = cc.cycle_id
        WHERE cc.cycle_id = ? AND cc.country_id = ?`,
      [input.cycleId, input.countryId],
    );
    if (!current.length) {
      return {
        success: false,
        error: 'This country has not joined the cycle, so it has no status to change.',
      };
    }
    const row = current[0];
    if (!row.is_active) {
      return { success: false, error: 'Only the active cycle can be changed.' };
    }
    const oldStatus = String(row.status);
    if (oldStatus === input.status) {
      return { success: false, error: `${String(row.country_name)} is already there.` };
    }

    await exec(
      `UPDATE country_cycles
          SET status = ?::country_cycle_status,
              handed_off_at = CASE WHEN ? = 'handed_off' THEN COALESCE(handed_off_at, NOW()) END,
              updated_at = NOW()
        WHERE cycle_id = ? AND country_id = ?`,
      [input.status, input.status, input.cycleId, input.countryId],
    );

    await exec(
      `INSERT INTO country_cycle_status_changes
         (cycle_id, country_id, changed_by, reason, old_status, new_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.cycleId, input.countryId, actor.email, reason, oldStatus, input.status],
    );

    const reopened = oldStatus === 'handed_off';
    await exec(
      `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
       VALUES (?, NULL, ?::evidence_type, ?, ?, ?)`,
      [
        Number(row.id),
        reopened ? 'handoff' : 'info',
        reopened ? 'Country reopened after handoff' : 'Country status changed',
        actor.email,
        `${oldStatus} to ${input.status}. Reason: ${reason}`,
      ],
    );

    log.info('cycles.countryStatusChanged', {
      cycleId: input.cycleId,
      countryId: input.countryId,
      from: oldStatus,
      to: input.status,
      by: actor.email,
    });
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('setSoaCountryStatus.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not change the status.',
    };
  }
}
