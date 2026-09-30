import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';

/**
 * Which sends were refused, and which of them are still worth trying again.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * A dispatch is recorded before the vendor's status moves, and the status only moves on success.
 * That is what makes a retry decidable here rather than by eye: a vendor still sitting at `scoped`
 * with a failed `request` on file never received its first letter, and one at `requested` with a
 * failed `reminder` never received its second. Any other combination is a failure that a later
 * attempt already made good, and re-sending on it would mail a supplier who is not owed anything.
 *
 * One row per vendor per kind, newest first. The log holds every attempt, so a country that was
 * tried five times while n8n was misconfigured listed the same vendor five times with the same
 * sentence, which reads as five problems instead of one.
 */

export type OutreachKind = 'request' | 'reminder';

export interface DeliveryFailure {
  entryId: number;
  vendorNo: string;
  vendorName: string;
  error: string;
  sentAt: string;
  kind: OutreachKind;
  /** Still waiting on the send that failed, so trying again would actually do something. */
  retryable: boolean;
}

/**
 * Is this refusal still worth acting on?
 *
 * Pure, and exported, because it is the whole of the decision to write to a supplier again. A
 * vendor still at `scoped` with a refused `request` never received its first letter; one at
 * `requested` with a refused `reminder` never received its second. Every other pairing is a
 * failure a later attempt already made good.
 */
export function isRetryable(kind: OutreachKind, status: string): boolean {
  return (
    (kind === 'request' && status === 'scoped') ||
    (kind === 'reminder' && status === 'requested')
  );
}

export async function loadDeliveryFailures(countryId: string): Promise<DeliveryFailure[]> {
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT DISTINCT ON (vce.id, d.kind)
            vce.id AS entry_id, vce.status::text AS status,
            v.vendor_no, v.name, d.error, d.sent_at, d.kind::text AS kind
       FROM outreach_dispatches d
       JOIN vendor_cycle_entries vce ON vce.id = d.vendor_cycle_entry_id
       JOIN vendors v          ON v.id = vce.vendor_id
       JOIN country_cycles cc  ON cc.id = vce.country_cycle_id
       JOIN cycles cy          ON cy.id = cc.cycle_id AND cy.is_active
      WHERE cc.country_id = ? AND d.succeeded = FALSE
      ORDER BY vce.id, d.kind, d.sent_at DESC
      LIMIT 200`,
    [countryId],
  );

  return rows
    .map((r) => {
      const kind: OutreachKind = String(r.kind) === 'request' ? 'request' : 'reminder';
      const status = String(r.status);
      return {
        entryId: Number(r.entry_id),
        vendorNo: String(r.vendor_no),
        vendorName: String(r.name),
        error: String(r.error ?? 'Unknown error'),
        sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at),
        kind,
        retryable: isRetryable(kind, status),
      };
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}
