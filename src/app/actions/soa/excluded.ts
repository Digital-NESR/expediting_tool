'use server';

/**
 * The vendors that are never chased.
 *
 * NESR's own entities turn up in the PO transactions like any supplier — EOS JAFZA is the largest
 * "vendor" in Saudi Arabia at $127M — and nobody sends a colleague a statement-of-account request.
 * Excluding them keeps champions off internal balances.
 *
 * They stay in the coverage DENOMINATOR. An excluded vendor is still money that moved; removing it
 * from the total as well would inflate every percentage and make the SOP's threshold easier to hit
 * than it is meant to be.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one starts with an
 * admin guard.
 */

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { exec, ensureSoaSchema, sql } from '@/lib/soa/db';
import { requireSoaActor } from '@/lib/soa/access';

const log = logger('soa-excluded');

export interface ExcludedVendorRow {
  vendorNo: string;
  name: string;
  reason: string;
  excludedBy: string;
  excludedAt: string;
  /** PO transactions in the active cycle, so an admin can see what the exclusion is worth. */
  cycleSpendUsd: number;
  /** Chase lists already drawn that still contain this vendor. */
  liveEntries: number;
}

export interface SupplierCandidate {
  vendorNo: string;
  name: string;
  spendUsd: number;
  countries: number;
  excluded: boolean;
}

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

/** The exclusion list, with what each exclusion is worth in the active cycle. */
export async function getSoaExcludedVendors(): Promise<ExcludedVendorRow[]> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT x.vendor_no, x.name, x.reason, x.excluded_by, x.excluded_at,
              COALESCE(s.spend, 0) AS spend,
              COALESCE(e.live, 0)  AS live
         FROM excluded_vendors x
         LEFT JOIN (
           SELECT spe.supplier_id, SUM(spe.pos_value) AS spend
             FROM supplier_po_extract spe
             JOIN cycles cy ON cy.id = spe.cycle_id AND cy.is_active
            GROUP BY spe.supplier_id
         ) s ON s.supplier_id = x.vendor_no
         LEFT JOIN (
           SELECT v.vendor_no, COUNT(*) AS live
             FROM vendor_cycle_entries vce
             JOIN vendors v ON v.id = vce.vendor_id
             JOIN country_cycles cc ON cc.id = vce.country_cycle_id
             JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
            GROUP BY v.vendor_no
         ) e ON e.vendor_no = x.vendor_no
        ORDER BY COALESCE(s.spend, 0) DESC, x.name`,
    );
    return rows.map((r) => ({
      vendorNo: String(r.vendor_no),
      name: String(r.name),
      reason: String(r.reason),
      excludedBy: String(r.excluded_by),
      excludedAt:
        r.excluded_at instanceof Date ? r.excluded_at.toISOString() : String(r.excluded_at),
      cycleSpendUsd: Number(r.spend),
      liveEntries: Number(r.live),
    }));
  } catch (err) {
    log.error('getSoaExcludedVendors.failed', err);
    return [];
  }
}

/**
 * Find suppliers to exclude, from the active cycle's spend snapshot.
 *
 * Searches the snapshot rather than the `vendors` table because most candidates have never been
 * scoped into a chase list — the point is to catch them before they are. Matching on the code as
 * well as the name matters: NESR's group entities share the `00013` code block, and searching that
 * prefix is the fastest way to review them together.
 */
export async function searchSoaSupplierCandidates(query: string): Promise<SupplierCandidate[]> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();
    const term = query.trim();
    if (term.length < 2) return [];
    const like = `%${term.toLowerCase()}%`;
    const rows = await sql<QueryResultRow[]>(
      `SELECT spe.supplier_id, MAX(spe.supplier_name) AS name,
              SUM(spe.pos_value) AS spend, COUNT(DISTINCT spe.po_country) AS countries,
              (x.vendor_no IS NOT NULL) AS excluded
         FROM supplier_po_extract spe
         JOIN cycles cy ON cy.id = spe.cycle_id AND cy.is_active
         LEFT JOIN excluded_vendors x ON x.vendor_no = spe.supplier_id
        WHERE LOWER(spe.supplier_name) LIKE ? OR spe.supplier_id LIKE ?
        GROUP BY spe.supplier_id, x.vendor_no
        ORDER BY SUM(spe.pos_value) DESC
        LIMIT 40`,
      [like, `${term}%`],
    );
    return rows.map((r) => ({
      vendorNo: String(r.supplier_id),
      name: String(r.name),
      spendUsd: Number(r.spend),
      countries: Number(r.countries),
      excluded: r.excluded === true,
    }));
  } catch (err) {
    log.error('searchSoaSupplierCandidates.failed', err);
    return [];
  }
}

/**
 * Exclude a vendor from future scoping.
 *
 * Deliberately does NOT touch chase lists that have already been drawn. Removing a vendor from a
 * country's live list would delete the correspondence recorded against it, and the evidence trail
 * is the one thing in this tool that must not be rewritten after the fact. The result reports how
 * many live entries remain so an admin knows the exclusion is not retrospective.
 */
export async function addSoaExcludedVendor(input: {
  vendorNo: string;
  name: string;
  reason: string;
}): Promise<SoaResult<{ liveEntries: number }>> {
  try {
    const admin = await requireSoaActor('admin');
    const vendorNo = input.vendorNo.trim();
    const name = input.name.trim();
    const reason = input.reason.trim();
    if (!vendorNo) return { success: false, error: 'A supplier code is required.' };
    if (!name) return { success: false, error: 'A name is required.' };
    if (!reason) {
      return {
        success: false,
        error: 'Give a reason — it is what explains the gap to whoever audits this later.',
      };
    }

    await exec(
      `INSERT INTO excluded_vendors (vendor_no, name, reason, excluded_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (vendor_no) DO UPDATE SET
         name = EXCLUDED.name, reason = EXCLUDED.reason,
         excluded_by = EXCLUDED.excluded_by, excluded_at = NOW()`,
      [vendorNo, name.slice(0, 200), reason, admin.email],
    );

    const live = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS n
         FROM vendor_cycle_entries vce
         JOIN vendors v ON v.id = vce.vendor_id
         JOIN country_cycles cc ON cc.id = vce.country_cycle_id
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
        WHERE v.vendor_no = ?`,
      [vendorNo],
    );

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: { liveEntries: Number(live[0]?.n ?? 0) } };
  } catch (err) {
    log.error('addSoaExcludedVendor.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not exclude the vendor.',
    };
  }
}

/** Put a vendor back in scope. It will reappear the next time a country is scoped. */
export async function removeSoaExcludedVendor(vendorNo: string): Promise<SoaResult> {
  try {
    await requireSoaActor('admin');
    await exec(`DELETE FROM excluded_vendors WHERE vendor_no = ?`, [vendorNo.trim()]);
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('removeSoaExcludedVendor.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not remove the exclusion.',
    };
  }
}
