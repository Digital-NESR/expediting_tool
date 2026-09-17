import type { QueryResultRow } from 'pg';
import expeditingPool from '@/lib/db-expediting';
import sourceGuidePool from '@/lib/db-sourceguide';
import { withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import { ensureSoaSchema, soaPool, sql } from './db';

/**
 * Where a cycle's numbers come from.
 *
 * SOA Consolidation asks vendors to confirm what NESR believes it owes them, so the figure it
 * chases has to be spend that actually happened: `historic_spend` in sourceguide_db holds GRN'd PO
 * lines — goods received. The open-PO data in nesr_expediting_db is the wrong thing entirely; a
 * vendor cannot confirm a balance for goods that have not shipped.
 *
 * The two databases cannot be joined, so this reads one and writes the other. That is not a
 * limitation worth working around: the read is an aggregate over ~413,000 lines that collapses to
 * a few thousand rows, and holding it in memory for the moment it takes to write is nothing.
 *
 * The result is a SNAPSHOT, deliberately. `supplier_po_extract` keeps what the numbers were when
 * the cycle was scoped, so a coverage percentage can still be explained a year later when
 * historic_spend has moved on. Re-running an extract for a cycle replaces its snapshot; it does
 * not touch vendor entries that already exist, because a champion may already have chased them.
 */

const log = logger('soa-extract');

export interface CycleWindow {
  cycleId: number;
  /** Inclusive. */
  from: Date;
  /** Exclusive upper bound, so a line released on the boundary day is counted once. */
  to: Date;
}

export interface ExtractedSupplier {
  supplierCode: string;
  supplierName: string;
  /** The country as `historic_spend` spells it. */
  spendCountry: string;
  valueUsd: number;
  emails: string[];
}

export interface ExtractSummary {
  cycleId: number;
  from: string;
  to: string;
  rows: number;
  countriesMatched: number;
  spendCountriesUnmapped: string[];
  totalUsd: number;
}

/**
 * Split a free-text email column into real addresses.
 *
 * Both sources store these as free text, and the Approved Vendor List frequently repeats one
 * address behind commas ('a@b.com,a@b.com,a@b.com' is a real value). Splitting and de-duplicating
 * here means a champion sees one address rather than three, and a send goes out once.
 */
export function parseAvlEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;]/)) {
    const email = part.trim().toLowerCase();
    // A bare sanity check, not validation: the point is to drop 'n/a' and blanks, not to
    // adjudicate RFC 5322.
    if (email.includes('@') && email.length > 3) seen.add(email);
  }
  return [...seen];
}

/**
 * Aggregate receipted spend per supplier per country over the cycle's window.
 *
 * `historic_spend` labels two of its columns the wrong way round at source: `supplier` holds the
 * SAP supplier CODE and `supplier_id` holds the NAME. That is not a typo in this query. The names
 * are taken as MAX over the group because one code occasionally carries slightly different name
 * spellings across lines, and any one of them is a fine display name; the Approved Vendor List's
 * name wins where it has one, because that is the maintained copy.
 */
export async function readSpend(window: CycleWindow): Promise<ExtractedSupplier[]> {
  const { rows } = await sourceGuidePool.query<QueryResultRow>(
    `SELECT h.country                             AS spend_country,
            h.supplier                            AS supplier_code,
            COALESCE(MAX(a.name), MAX(h.supplier_id)) AS supplier_name,
            SUM(h.order_value_usd)                AS value_usd,
            MAX(a.email)                          AS emails
       FROM historic_spend h
       LEFT JOIN supplier_avl a ON a.supplier_code = h.supplier
      WHERE h.po_release_date >= $1
        AND h.po_release_date <  $2
        AND h.country IS NOT NULL
        AND h.supplier IS NOT NULL
        AND h.order_value_usd IS NOT NULL
      GROUP BY h.country, h.supplier
     HAVING SUM(h.order_value_usd) > 0
      ORDER BY SUM(h.order_value_usd) DESC`,
    [window.from, window.to],
  );

  return rows.map((r) => ({
    supplierCode: String(r.supplier_code),
    supplierName: String(r.supplier_name ?? r.supplier_code),
    spendCountry: String(r.spend_country),
    valueUsd: Number(r.value_usd),
    emails: parseAvlEmails(r.emails as string | null),
  }));
}

/**
 * Vendor email addresses, from the SAP supplier master.
 *
 * NOT from SourceGuide's Approved Vendor List, which was the obvious source and is the wrong one:
 * the AVL holds 4,383 suppliers and had an address for only 49 of Saudi Arabia's 265 in-scope
 * vendors. `supplier_contacts` in nesr_expediting_db holds 8,469, covers all 265, and has an
 * address for 259 of them. It is also the list PO Expediting already emails suppliers from, so
 * these addresses are ones that demonstrably reach somebody.
 *
 * Keyed on the SAP supplier code, which both sides store as the same zero-padded ten digits.
 * Failure is swallowed: a missing email makes a vendor unreachable, which the tool shows and a
 * champion can fix by typing one in — losing the whole snapshot because a third database was
 * briefly unavailable would be the worse outcome.
 */
async function readSupplierEmails(codes: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!codes.length) return map;
  try {
    const { rows } = await expeditingPool.query<QueryResultRow>(
      `SELECT supplier_id, supplier_emails, additional_supplier_email
         FROM supplier_contacts
        WHERE supplier_id = ANY($1)`,
      [codes],
    );
    for (const r of rows) {
      const emails = [
        ...parseAvlEmails(r.supplier_emails as string | null),
        ...parseAvlEmails(r.additional_supplier_email as string | null),
      ];
      if (emails.length) map.set(String(r.supplier_id), [...new Set(emails)]);
    }
  } catch (err) {
    log.warn('extract.supplierContactsUnavailable', {
      note: 'falling back to the Approved Vendor List, which covers far fewer vendors',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return map;
}

/** country spelling in historic_spend → this tool's country id. */
export async function spendCountryMap(): Promise<Map<string, string>> {
  const rows = await sql<QueryResultRow[]>(`SELECT id, spend_names FROM countries WHERE active`);
  const map = new Map<string, string>();
  for (const r of rows) {
    for (const name of (r.spend_names ?? []) as string[]) map.set(name, String(r.id));
  }
  return map;
}

/**
 * Take the snapshot for a cycle.
 *
 * Every supplier is recorded, not only those above the scope threshold, because the threshold
 * decides who gets chased while the full total is the denominator every coverage percentage is
 * measured against. Dropping the small suppliers here would make coverage look better than it is.
 *
 * A spend country with no mapping is reported rather than dropped silently — its money would
 * otherwise vanish from the denominator and flatter every number that country contributes to.
 */
export async function runExtract(window: CycleWindow): Promise<ExtractSummary> {
  await ensureSoaSchema();
  const [suppliers, countryMap] = await Promise.all([readSpend(window), spendCountryMap()]);

  /* The SAP supplier master is the primary address source; the AVL address that `readSpend`
     already collected stays as the fallback for the handful it does not carry. */
  const sapEmails = await readSupplierEmails([...new Set(suppliers.map((s) => s.supplierCode))]);
  for (const supplier of suppliers) {
    const fromSap = sapEmails.get(supplier.supplierCode);
    if (fromSap?.length) supplier.emails = fromSap;
  }

  const unmapped = new Set<string>();
  const mapped = suppliers.filter((s) => {
    const known = countryMap.has(s.spendCountry);
    if (!known) unmapped.add(s.spendCountry);
    return known;
  });

  await withTransaction(soaPool, async (client) => {
    // Replace, not merge: a re-run means "these are the numbers now", and leaving behind rows for
    // a supplier that has since dropped out of the window would overstate the denominator.
    await client.query(`DELETE FROM supplier_po_extract WHERE cycle_id = $1`, [window.cycleId]);

    for (const s of mapped) {
      await client.query(
        `INSERT INTO supplier_po_extract
           (cycle_id, supplier_id, supplier_name, po_country, pos_value, sap_email_ids)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cycle_id, supplier_id, po_country) DO UPDATE SET
           supplier_name = EXCLUDED.supplier_name,
           pos_value     = EXCLUDED.pos_value,
           sap_email_ids = EXCLUDED.sap_email_ids,
           extracted_at  = NOW()`,
        [
          window.cycleId,
          s.supplierCode,
          s.supplierName.slice(0, 200),
          s.spendCountry.slice(0, 100),
          s.valueUsd,
          s.emails.join(',') || null,
        ],
      );
    }

    await client.query(
      `UPDATE cycles SET extract_from = $2, extract_to = $3, extracted_at = NOW() WHERE id = $1`,
      [window.cycleId, window.from, window.to],
    );
  });

  const summary: ExtractSummary = {
    cycleId: window.cycleId,
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
    rows: mapped.length,
    countriesMatched: new Set(mapped.map((s) => countryMap.get(s.spendCountry))).size,
    spendCountriesUnmapped: [...unmapped],
    totalUsd: mapped.reduce((sum, s) => sum + s.valueUsd, 0),
  };

  if (unmapped.size) {
    log.warn('extract.unmappedCountries', {
      cycleId: window.cycleId,
      countries: [...unmapped],
      note: 'their spend is excluded from every coverage denominator until they are mapped',
    });
  }
  log.info('extract.done', { ...summary });
  return summary;
}

/**
 * Work out a cycle's window from its own settings.
 *
 * The lookback runs back from the period end rather than from today, so re-running an extract
 * after the quarter closes reproduces the same window instead of quietly sliding forward.
 */
export function windowFor(cycle: {
  id: number | string;
  period_end: Date | string;
  lookback_months: number;
}): CycleWindow {
  /*
   * A DATE column arrives from `pg` as a Date at LOCAL midnight, not UTC midnight — so on a
   * machine east of Greenwich, reading its UTC parts lands on the previous day and the window
   * silently loses its last few hours. Take the calendar date the column actually holds (its
   * local parts, which are the date SAP meant) and rebuild it in UTC.
   */
  const end =
    typeof cycle.period_end === 'string'
      ? new Date(`${cycle.period_end.slice(0, 10)}T00:00:00Z`)
      : new Date(
          Date.UTC(
            cycle.period_end.getFullYear(),
            cycle.period_end.getMonth(),
            cycle.period_end.getDate(),
          ),
        );

  // Exclusive upper bound: one day past the period end, so the period's last day is included.
  const to = new Date(end);
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - cycle.lookback_months);
  return { cycleId: Number(cycle.id), from, to };
}
