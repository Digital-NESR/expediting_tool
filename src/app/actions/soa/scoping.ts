'use server';

/**
 * Choosing which suppliers a country will chase.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one below starts with
 * `requireSoaCountry` — a champion of Oman must not be able to rewrite Saudi Arabia's list.
 */

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db/tx';
import { ensureSoaSchema, soaPool, sql } from '@/lib/soa/db';
import { requireSoaCountry } from '@/lib/soa/access';
import { scopeCandidates, type ScopeCandidates } from '@/lib/soa/candidates';
import { ensureCountryCycle } from '@/lib/soa/scope';

const log = logger('soa-scoping');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

export interface ApplyScopeSummary {
  added: number;
  removed: number;
  /** Selected vendors already written to, so they were kept regardless of the tick box. */
  keptLocked: number;
  total: number;
  selectedUsd: number;
}

/** The country's full supplier list with its current selection. Viewer access is enough to look. */
export async function getSoaScopeCandidates(input: {
  cycleId: number;
  countryId: string;
}): Promise<ScopeCandidates> {
  try {
    await requireSoaCountry(input.countryId, 'viewer');
    return await scopeCandidates(input.cycleId, input.countryId);
  } catch (err) {
    log.error('getSoaScopeCandidates.failed', err);
    return {
      thresholdUsd: 0,
      totalBalance: 0,
      candidates: [],
      error:
        err instanceof AccessError
          ? err.message
          : 'The supplier list could not be read. This is a fault, not an empty country — try again, and tell an administrator if it persists.',
    };
  }
}

/**
 * Make the country's chase list match the champion's selection.
 *
 * Takes the WHOLE desired set rather than a diff, so the screen does not have to track what it has
 * already sent and cannot drift out of step with the database — the last save wins and says so.
 *
 * Two things it will not do, both because the evidence trail outranks the tick box:
 *
 *   A vendor that has been written to is kept even if it arrives unticked. Removing it would
 *   delete the request, the reminder and the correspondence recorded against it, which is the one
 *   thing this tool exists to preserve. The count comes back so the screen can say so.
 *
 *   An excluded vendor is never added, however it arrives. Exclusions are an admin decision about
 *   intercompany entities, not a per-country preference.
 */
export async function applySoaScopeSelection(input: {
  cycleId: number;
  countryId: string;
  vendorNos: string[];
}): Promise<SoaResult<ApplyScopeSummary>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');
    await ensureSoaSchema();

    const { candidates } = await scopeCandidates(input.cycleId, input.countryId);
    if (!candidates.length) {
      return {
        success: false,
        error:
          'This cycle has no PO transactions for this country, so there is nothing to select ' +
          'from. An administrator may still need to run the extract.',
      };
    }

    const wanted = new Set(input.vendorNos);
    const byNo = new Map(candidates.map((c) => [c.vendorNo, c]));

    const toAdd = candidates.filter((c) => wanted.has(c.vendorNo) && !c.selected && !c.excluded);
    const toRemove = candidates.filter((c) => !wanted.has(c.vendorNo) && c.selected && !c.locked);
    const keptLocked = candidates.filter((c) => !wanted.has(c.vendorNo) && c.selected && c.locked);
    const blocked = input.vendorNos.filter((no) => byNo.get(no)?.excluded);

    const countryCycleId = await ensureCountryCycle(input.cycleId, input.countryId);

    await withTransaction(soaPool, async (client) => {
      for (const c of toAdd) {
        const vendor = await client.query<QueryResultRow>(
          `INSERT INTO vendors (country_id, vendor_no, name, contact_emails, contact_source)
           VALUES ($1, $2, $3, $4, CASE WHEN COALESCE(array_length($4::text[], 1), 0) > 0
                                        THEN 'avl' ELSE 'none' END)
           ON CONFLICT (country_id, vendor_no) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [input.countryId, c.vendorNo, c.name.slice(0, 200), c.emails],
        );
        await client.query(
          `INSERT INTO vendor_cycle_entries (country_cycle_id, vendor_id, open_po_amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (country_cycle_id, vendor_id) DO UPDATE SET
             open_po_amount = EXCLUDED.open_po_amount, updated_at = NOW()`,
          [countryCycleId, Number(vendor.rows[0].id), c.valueUsd],
        );
      }

      if (toRemove.length) {
        /* Safe to delete only because `locked` already excluded everything with correspondence:
           these rows are `scoped` and have never been written to, so nothing is lost. The status
           check is repeated here as a second lock, since this is the one statement in the tool
           that removes a vendor from a cycle. */
        await client.query(
          `DELETE FROM vendor_cycle_entries vce
             USING vendors v
            WHERE v.id = vce.vendor_id
              AND vce.country_cycle_id = $1
              AND vce.status = 'scoped'
              AND v.vendor_no = ANY($2)`,
          [countryCycleId, toRemove.map((c) => c.vendorNo)],
        );
      }

      await client.query(
        `UPDATE country_cycles
            SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
                updated_at = NOW()
          WHERE id = $1`,
        [countryCycleId],
      );

      if (toAdd.length || toRemove.length) {
        await client.query(
          `INSERT INTO evidence_log (country_cycle_id, type, action, actor, detail)
           VALUES ($1, 'scope', 'Scope selection updated', $2, $3)`,
          [
            countryCycleId,
            actor.email,
            `${wanted.size} suppliers selected of ${candidates.length} in the cycle snapshot` +
              ` (${toAdd.length} added, ${toRemove.length} removed` +
              (keptLocked.length
                ? `, ${keptLocked.length} kept because they have already been contacted`
                : '') +
              ').',
          ],
        );
      }
    });

    const totals = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(open_po_amount), 0) AS usd
         FROM vendor_cycle_entries WHERE country_cycle_id = ?`,
      [countryCycleId],
    );

    if (blocked.length) {
      log.info('scopeSelection.excludedIgnored', { countryId: input.countryId, blocked });
    }

    revalidatePath('/soa-consolidation');
    return {
      success: true,
      data: {
        added: toAdd.length,
        removed: toRemove.length,
        keptLocked: keptLocked.length,
        total: Number(totals[0]?.n ?? 0),
        selectedUsd: Number(totals[0]?.usd ?? 0),
      },
    };
  } catch (err) {
    log.error('applySoaScopeSelection.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not save the selection.',
    };
  }
}
