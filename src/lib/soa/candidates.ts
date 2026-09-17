import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';

/**
 * Every supplier a country could chase this cycle, and which of them it already is.
 *
 * Scoping began as one button that swept in everything above the cycle's threshold. That is a
 * reasonable default and a poor rule: a champion knows which of their suppliers is a dormant
 * shell, which two codes are the same company, and which $180,000 vendor matters more than a
 * $300,000 one. So the list is now every supplier in the snapshot, ticked or not, and the
 * threshold marks a suggestion rather than making the decision.
 *
 * Two flags carry consequences and are computed here rather than guessed at in the UI:
 *
 *   `locked`   the vendor has been written to, so removing it would delete the correspondence
 *              recorded against it. The evidence trail is the point of this tool; a tick box must
 *              not be able to erase one.
 *   `excluded` an intercompany entity on the exclusion list. It stays visible, and stays in the
 *              coverage denominator, but cannot be selected — nobody emails a colleague for a
 *              statement of account.
 */

export interface ScopeCandidate {
  vendorNo: string;
  name: string;
  valueUsd: number;
  emails: string[];
  /** In the country's chase list right now. */
  selected: boolean;
  /** Already written to, so it cannot be taken back out. */
  locked: boolean;
  /** On the exclusion list, so it cannot be put in. */
  excluded: boolean;
  /** Above the cycle's threshold — the default suggestion, not the rule. */
  overThreshold: boolean;
  /** 1 = largest by value. */
  rank: number;
  /** Running share of the country's whole balance, at this row and above. */
  cumulativePct: number;
}

export interface ScopeCandidates {
  thresholdUsd: number;
  totalBalance: number;
  candidates: ScopeCandidate[];
  /**
   * Set only when the read itself failed.
   *
   * Without it an empty list is ambiguous: a country with no PO transactions and a database that
   * would not answer look identical, and the screen tells the champion the first thing when the
   * truth is the second. A champion who is told "no suppliers" stops; one who is told the read
   * failed retries or asks.
   */
  error?: string;
}

/**
 * The country's suppliers, largest first.
 *
 * Ranked and accumulated across the WHOLE country before any filtering, so "#1" and "covers 62%"
 * keep meaning what they say when the champion types into the search box.
 */
export async function scopeCandidates(
  cycleId: number,
  countryId: string,
): Promise<ScopeCandidates> {
  await ensureSoaSchema();

  const [cycleRows, rows] = await Promise.all([
    sql<QueryResultRow[]>(`SELECT vendor_threshold_usd FROM cycles WHERE id = ?`, [cycleId]),
    sql<QueryResultRow[]>(
      `SELECT e.supplier_id, e.supplier_name, e.pos_value, e.sap_email_ids,
              (x.vendor_no IS NOT NULL)                       AS excluded,
              (vce.id IS NOT NULL)                            AS selected,
              COALESCE(vce.status::text <> 'scoped', FALSE)   AS locked,
              v.contact_emails
         FROM supplier_po_extract e
         JOIN countries c ON e.po_country = ANY (c.spend_names)
         LEFT JOIN excluded_vendors x ON x.vendor_no = e.supplier_id
         LEFT JOIN vendors v ON v.country_id = c.id AND v.vendor_no = e.supplier_id
         LEFT JOIN country_cycles cc ON cc.cycle_id = e.cycle_id AND cc.country_id = c.id
         LEFT JOIN vendor_cycle_entries vce
                ON vce.country_cycle_id = cc.id AND vce.vendor_id = v.id
        WHERE e.cycle_id = ? AND c.id = ?
        ORDER BY e.pos_value DESC`,
      [cycleId, countryId],
    ),
  ]);

  const thresholdUsd = Number(cycleRows[0]?.vendor_threshold_usd ?? 0);
  const totalBalance = rows.reduce((sum, r) => sum + Number(r.pos_value), 0);

  let running = 0;
  const candidates = rows.map((r, i) => {
    const valueUsd = Number(r.pos_value);
    running += valueUsd;
    /* The vendor's saved contacts win over the snapshot's, because a champion may have corrected
       them since the extract ran and that correction is the better address. */
    const saved = ((r.contact_emails ?? []) as string[]).filter(Boolean);
    const fromSnapshot = String(r.sap_email_ids ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    return {
      vendorNo: String(r.supplier_id),
      name: String(r.supplier_name),
      valueUsd,
      emails: saved.length ? saved : fromSnapshot,
      selected: r.selected === true,
      locked: r.locked === true,
      excluded: r.excluded === true,
      overThreshold: valueUsd > thresholdUsd,
      rank: i + 1,
      cumulativePct: totalBalance > 0 ? Math.round((running / totalBalance) * 100) : 0,
    };
  });

  return { thresholdUsd, totalBalance, candidates };
}
