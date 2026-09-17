import type { QueryResultRow } from 'pg';
import { withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import { ensureSoaSchema, soaPool, sql } from './db';

/**
 * Turning a cycle's spend snapshot into one country's chase list.
 *
 * Scoping is the step where policy meets data: the cycle's `vendor_threshold_usd` decides which
 * suppliers are worth a statement request, and everything above it becomes a row a champion has to
 * work. Below it stays in the snapshot and still counts towards the denominator — a vendor too
 * small to chase does not stop being money owed.
 *
 * Re-scoping is additive. A vendor already in the list keeps its row, its correspondence history
 * and its status; only genuinely new vendors are added, and existing amounts are refreshed. The
 * alternative — rebuilding the list — would delete evidence of a chase that already happened,
 * which is the one thing this tool exists to preserve.
 */

const log = logger('soa-scope');

/** Thrown when a country cannot be scoped yet, as distinct from a country that scopes to nothing. */
export class ScopeNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeNotReadyError';
  }
}

export interface CountryScopeSummary {
  countryCycleId: number;
  countryId: string;
  thresholdUsd: number;
  /** Every supplier in the snapshot for this country, whatever the size. */
  suppliersTotal: number;
  totalUsd: number;
  /** Suppliers above the threshold — the ones that get chased. */
  inScope: number;
  inScopeUsd: number;
  added: number;
  refreshed: number;
  /** In-scope vendors with no usable email. These cannot be chased until someone supplies one. */
  unreachable: number;
  /** Above the threshold but on the exclusion list — intercompany entities, mostly. */
  excluded: number;
}

/**
 * Ensure the country has a row for this cycle, and return its id.
 *
 * A country's participation in a cycle is created lazily, on first scope, rather than seeded for
 * all 18 countries when a cycle opens: most countries are worked by one champion who starts when
 * they start, and eighteen `not_started` rows would make the rollup look like a wall of failure
 * from day one.
 */
export async function ensureCountryCycle(cycleId: number, countryId: string): Promise<number> {
  const rows = await sql<QueryResultRow[]>(
    `INSERT INTO country_cycles (cycle_id, country_id, status)
     VALUES (?, ?, 'not_started')
     ON CONFLICT (cycle_id, country_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [cycleId, countryId],
  );
  return Number(rows[0].id);
}

/**
 * Scope one country for one cycle.
 *
 * New entries land as `scoped` — in scope, nobody has written to them yet. The Outreach screen
 * moves them to `requested` when a request actually goes out and stamps `requested_at` with it,
 * so the status says where the correspondence has got to and the timestamps say when. The SOP's
 * two-request evidence test reads the timestamps, never the status.
 *
 * Excluded vendors are skipped. They stay in the snapshot, and therefore in every coverage
 * denominator, because they are real money owed — they are simply not somebody to email.
 */
export async function scopeCountry(
  cycleId: number,
  countryId: string,
  actorEmail: string,
): Promise<CountryScopeSummary> {
  await ensureSoaSchema();

  const cycleRows = await sql<QueryResultRow[]>(
    `SELECT vendor_threshold_usd, extracted_at FROM cycles WHERE id = ?`,
    [cycleId],
  );
  if (!cycleRows.length) throw new Error(`No cycle ${cycleId}`);
  const thresholdUsd = Number(cycleRows[0].vendor_threshold_usd);

  /* Refuse rather than scope nothing.
     Opening a cycle and taking its spend snapshot are two separate admin steps, and a champion who
     scopes between them used to get a silent success: a country_cycles row appeared, its status
     advanced to in_progress, the evidence log gained a "0 vendors scoped" entry, and the dashboard
     reported the country under way with nothing in it. Three clicks produced three such entries.
     An empty scope is never what somebody meant to do. */
  if (!cycleRows[0].extracted_at) {
    throw new ScopeNotReadyError(
      'The spend snapshot for this cycle has not been taken yet, so there is nothing to scope ' +
        'from. An administrator needs to run the extract on /admin/soa first.',
    );
  }

  // The snapshot stores the country as historic_spend spells it, so the join goes through the
  // country's list of accepted spellings rather than its id.
  const snapshot = await sql<QueryResultRow[]>(
    `SELECT e.supplier_id, e.supplier_name, e.pos_value, e.sap_email_ids
       FROM supplier_po_extract e
       JOIN countries c ON e.po_country = ANY (c.spend_names)
      WHERE e.cycle_id = ? AND c.id = ?
      ORDER BY e.pos_value DESC`,
    [cycleId, countryId],
  );

  const excludedRows = await sql<QueryResultRow[]>(`SELECT vendor_no FROM excluded_vendors`);
  const excluded = new Set(excludedRows.map((r) => String(r.vendor_no)));

  const overThreshold = snapshot.filter((r) => Number(r.pos_value) > thresholdUsd);
  const inScope = overThreshold.filter((r) => !excluded.has(String(r.supplier_id)));
  const excludedCount = overThreshold.length - inScope.length;

  /* The snapshot exists but holds nothing for this country — usually a country whose spend
     spelling is not mapped, which the extract reports separately. Still a refusal rather than an
     empty success: a champion told "scoped, 0 vendors" has no idea anything is wrong. */
  if (!snapshot.length) {
    throw new ScopeNotReadyError(
      `The cycle's spend snapshot contains no suppliers for this country. Either it has no ` +
        `receipted spend in the window, or its spelling in the source data is not mapped to it.`,
    );
  }
  const countryCycleId = await ensureCountryCycle(cycleId, countryId);

  let added = 0;
  let refreshed = 0;
  let unreachable = 0;

  await withTransaction(soaPool, async (client) => {
    for (const row of inScope) {
      const code = String(row.supplier_id);
      const name = String(row.supplier_name).slice(0, 200);
      const value = Number(row.pos_value);
      const emails = String(row.sap_email_ids ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      if (!emails.length) unreachable += 1;

      /* The vendor record is shared across cycles, so its name is refreshed but its contacts are
         not overwritten once a champion has corrected them — that correction is the more reliable
         of the two, and re-importing the AVL over it every quarter would undo the work. */
      const vendorRows = await client.query<QueryResultRow>(
        `INSERT INTO vendors (country_id, vendor_no, name, contact_emails, contact_source)
         VALUES ($1, $2, $3, $4, CASE WHEN COALESCE(array_length($4::text[], 1), 0) > 0
                                      THEN 'avl' ELSE 'none' END)
         ON CONFLICT (country_id, vendor_no) DO UPDATE SET
           name = EXCLUDED.name,
           contact_emails = CASE WHEN vendors.contact_source = 'manual'
                                 THEN vendors.contact_emails ELSE EXCLUDED.contact_emails END,
           contact_source = CASE WHEN vendors.contact_source = 'manual'
                                 THEN 'manual' ELSE EXCLUDED.contact_source END
         RETURNING id`,
        [countryId, code, name, emails],
      );
      const vendorId = Number(vendorRows.rows[0].id);

      const entry = await client.query<QueryResultRow>(
        `INSERT INTO vendor_cycle_entries (country_cycle_id, vendor_id, open_po_amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (country_cycle_id, vendor_id) DO UPDATE SET
           open_po_amount = EXCLUDED.open_po_amount,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [countryCycleId, vendorId, value],
      );
      if (entry.rows[0].inserted) added += 1;
      else refreshed += 1;
    }

    await client.query(
      `UPDATE country_cycles
          SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
              updated_at = NOW()
        WHERE id = $1`,
      [countryCycleId],
    );

    /* Only record a scope that changed something. A re-scope that finds nothing new is a real
       thing to do — a champion checking whether the list moved — and logging it would pad the
       evidence trail with entries describing no event. */
    if (added || refreshed) {
      await client.query(
        `INSERT INTO evidence_log (country_cycle_id, type, action, actor, detail)
       VALUES ($1, 'scope', 'Vendors scoped', $2, $3)`,
        [
          countryCycleId,
          actorEmail,
          `${inScope.length} vendors above $${thresholdUsd.toLocaleString('en-US')} of receipted ` +
            `spend (${added} new, ${refreshed} refreshed) from ${snapshot.length} suppliers` +
            (excludedCount ? `, ${excludedCount} excluded as intercompany` : '') +
            '.',
        ],
      );
    }
  });

  const summary: CountryScopeSummary = {
    countryCycleId,
    countryId,
    thresholdUsd,
    suppliersTotal: snapshot.length,
    totalUsd: snapshot.reduce((s, r) => s + Number(r.pos_value), 0),
    inScope: inScope.length,
    inScopeUsd: inScope.reduce((s, r) => s + Number(r.pos_value), 0),
    added,
    refreshed,
    unreachable,
    excluded: excludedCount,
  };
  log.info('scope.done', { ...summary });
  return summary;
}
