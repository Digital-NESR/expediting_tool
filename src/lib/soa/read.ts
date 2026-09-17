import type { QueryResultRow } from 'pg';
import { shortDayMonth } from '@/lib/format';
import { countriesFor, type SoaActor } from './access';
import { ensureSoaSchema, sql } from './db';

/**
 * Everything a page load of SOA Consolidation needs, read from the database.
 *
 * This replaces `data.ts`, which held 594 lines of invented vendors and a "today" pinned to
 * 21 July 2026. The shapes below are deliberately the ones the eight screens already consume, so
 * the screens did not have to be rewritten to stop being a prototype — only the source of truth
 * changed.
 *
 * One thing to hold on to while reading: a vendor's amount is what they are being asked to
 * confirm, and it is frozen into `vendor_cycle_entries.open_po_amount` when the country is scoped.
 * It is NOT re-read from historic_spend on each load. If it were, a vendor could confirm one
 * figure on Monday and the tool could claim a different one on Tuesday, which is exactly the
 * argument a statement of account exists to prevent.
 */

export interface ActiveCycle {
  id: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  submissionDeadline: string;
  coverageTargetPct: number;
  yearEndTargetPct: number;
  vendorThresholdUsd: number;
  daysRemaining: number;
  extractedAt: string | null;
}

export interface CountryOption {
  id: string;
  name: string;
}

/** Shapes below mirror `types.ts` in the tool, which is what the screens read. */
export interface VendorRow {
  id: string;
  name: string;
  no: string;
  openPO: number;
  status: 'scoped' | 'requested' | 'reminded' | 'received' | 'non_responder';
  reqDate: string;
  remDate: string | null;
  respDate: string | null;
  /* The same three moments as ISO timestamps. The short forms above are for display and carry no
     year, so they cannot answer the SOP's question about whether a reminder followed its request
     inside the 10-14 day window. Both are exposed rather than one, because formatting a date for
     a table and measuring an interval are different jobs and one string cannot do both. */
  requestedAt: string | null;
  remindedAt: string | null;
  respondedAt: string | null;
  currency: string;
  invCount: number;
  contactEmails: string[];
  /** Statements received from this vendor, newest first. Downloadable from /api/soa/submissions. */
  submissions: { id: string; fileName: string; uploadedAt: string }[];
}

export interface CountryRow {
  id: string;
  name: string;
  champion: string;
  balance: number;
  pct: number;
  status: string;
  responded: number;
  total: number;
  daysLeft: number;
}

export interface EvidenceRow {
  id: string;
  ts: string;
  type: string;
  action: string;
  actor: string;
  detail: string;
}

export interface SoaPayload {
  cycle: ActiveCycle | null;
  /** The country whose screens are being shown. Null when the actor has no country in scope. */
  countryId: string | null;
  countryName: string | null;
  /** Every country this actor may switch to. One entry means no picker is needed. */
  available: CountryOption[];
  /** The country's whole PO balance for the cycle — the coverage denominator. */
  totalBalance: number;
  vendors: VendorRow[];
  countries: CountryRow[];
  evidence: EvidenceRow[];
  /** True once the country's cycle has been handed to Finance. */
  handedOff: boolean;
  /** False when nobody has scoped this country yet, which is a different empty from "no vendors". */
  scoped: boolean;
}

const EMPTY: SoaPayload = {
  cycle: null,
  countryId: null,
  countryName: null,
  available: [],
  totalBalance: 0,
  vendors: [],
  countries: [],
  evidence: [],
  handedOff: false,
  scoped: false,
};

const asIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : v ? String(v) : '');

/** `null` for a timestamp that has not happened yet, so a screen can tell "not sent" from "sent". */
const asShortDate = (v: unknown): string | null => (v ? shortDayMonth(new Date(asIso(v))) : null);

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Which country's screens to show.
 *
 * A champion of one country has no choice to make. Someone with an all-countries grant, or several
 * countries, gets a picker, and `requested` is what they chose. An unrecognised or out-of-scope
 * request falls back to the first country in scope rather than erroring — a stale bookmark should
 * land somewhere sensible, not on a wall.
 */
export async function resolveCountry(
  actor: SoaActor,
  requested?: string | null,
): Promise<{ countryId: string | null; available: CountryOption[] }> {
  const scope = countriesFor(actor, 'viewer');
  const rows = await sql<QueryResultRow[]>(
    scope === 'all'
      ? `SELECT id, name FROM countries WHERE active ORDER BY sort_order, name`
      : `SELECT id, name FROM countries WHERE active AND id = ANY(?) ORDER BY sort_order, name`,
    scope === 'all' ? [] : [scope],
  );
  const available = rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  const chosen = available.find((c) => c.id === requested) ?? available[0];
  return { countryId: chosen?.id ?? null, available };
}

/** The cycle the tool opens on. Null when an admin has not opened one. */
async function activeCycle(): Promise<ActiveCycle | null> {
  const rows = await sql<QueryResultRow[]>(`SELECT * FROM cycles WHERE is_active LIMIT 1`);
  if (!rows.length) return null;
  const r = rows[0];
  const deadline = new Date(asIso(r.submission_deadline));
  return {
    id: Number(r.id),
    label: String(r.label),
    periodStart: asIso(r.period_start).slice(0, 10),
    periodEnd: asIso(r.period_end).slice(0, 10),
    submissionDeadline: asIso(r.submission_deadline).slice(0, 10),
    coverageTargetPct: Number(r.coverage_target_pct),
    yearEndTargetPct: Number(r.year_end_target_pct),
    vendorThresholdUsd: Number(r.vendor_threshold_usd),
    // Real arithmetic against the real clock. The prototype hard-coded "11".
    daysRemaining: Math.max(0, daysBetween(new Date(), deadline)),
    extractedAt: r.extracted_at ? asIso(r.extracted_at) : null,
  };
}

/**
 * The corporate rollup: every country that has started this cycle.
 *
 * Coverage is the confirmed balance over the country's whole PO balance for the cycle, which
 * is why the denominator comes from `supplier_po_extract` rather than from the vendors being
 * chased — chasing only the large vendors does not make the small ones stop being money owed.
 * A country nobody has scoped yet is absent rather than present at 0%: it has not failed, it has
 * not started, and eighteen rows of 0% would read as a wall of failure on day one.
 */
async function rollup(cycleId: number, deadline: Date): Promise<CountryRow[]> {
  const rows = await sql<QueryResultRow[]>(
    `WITH denom AS (
       SELECT c.id AS country_id, COALESCE(SUM(e.pos_value), 0) AS total_balance
         FROM countries c
         LEFT JOIN supplier_po_extract e
                ON e.cycle_id = ? AND e.po_country = ANY (c.spend_names)
        GROUP BY c.id
     ),
     progress AS (
       SELECT cc.id, cc.country_id, cc.status::text AS status,
              COUNT(vce.id)                                          AS total,
              COUNT(vce.id) FILTER (WHERE vce.status = 'received')    AS responded,
              COALESCE(SUM(vce.open_po_amount)
                       FILTER (WHERE vce.status = 'received'), 0)     AS received_balance
         FROM country_cycles cc
         LEFT JOIN vendor_cycle_entries vce ON vce.country_cycle_id = cc.id
        WHERE cc.cycle_id = ?
        GROUP BY cc.id, cc.country_id, cc.status
     )
     SELECT p.country_id, c.name, p.status, p.total, p.responded,
            p.received_balance, d.total_balance,
            COALESCE(string_agg(DISTINCT cu.name, ', '), '') AS champions
       FROM progress p
       JOIN countries c ON c.id = p.country_id
       JOIN denom d ON d.country_id = p.country_id
       LEFT JOIN country_users cu
              ON cu.role = 'champion' AND cu.country_id = p.country_id
      GROUP BY p.country_id, c.name, c.sort_order, p.status, p.total, p.responded,
               p.received_balance, d.total_balance
      ORDER BY c.sort_order`,
    [cycleId, cycleId],
  );

  const daysLeft = Math.max(0, daysBetween(new Date(), deadline));
  return rows.map((r) => {
    const total = Number(r.total_balance);
    const received = Number(r.received_balance);
    return {
      id: String(r.country_id),
      name: String(r.name),
      champion: String(r.champions) || 'Unassigned',
      balance: total,
      pct: total > 0 ? Math.round((received / total) * 100) : 0,
      status: String(r.status),
      responded: Number(r.responded),
      total: Number(r.total),
      daysLeft,
    };
  });
}

/**
 * Load one country's screens.
 *
 * Returns an empty payload rather than throwing when there is no active cycle or no country in
 * scope: those are states the UI has to render something sensible for, and an exception here would
 * turn "an admin has not opened the quarter yet" into a crash.
 */
export async function loadSoa(
  actor: SoaActor,
  requestedCountry?: string | null,
): Promise<SoaPayload> {
  await ensureSoaSchema();

  const cycle = await activeCycle();
  const { countryId, available } = await resolveCountry(actor, requestedCountry);
  if (!cycle || !countryId) return { ...EMPTY, cycle, available, countryId };

  const ccRows = await sql<QueryResultRow[]>(
    `SELECT cc.id, cc.status::text AS status, cc.handed_off_at, c.name
       FROM country_cycles cc JOIN countries c ON c.id = cc.country_id
      WHERE cc.cycle_id = ? AND cc.country_id = ?`,
    [cycle.id, countryId],
  );
  const countryName =
    available.find((c) => c.id === countryId)?.name ?? String(ccRows[0]?.name ?? countryId);

  const denomRows = await sql<QueryResultRow[]>(
    `SELECT COALESCE(SUM(e.pos_value), 0) AS total
       FROM supplier_po_extract e
       JOIN countries c ON e.po_country = ANY (c.spend_names)
      WHERE e.cycle_id = ? AND c.id = ?`,
    [cycle.id, countryId],
  );
  const totalBalance = Number(denomRows[0]?.total ?? 0);

  // Not scoped yet: there is a cycle and a country, but nobody has drawn the vendor list.
  if (!ccRows.length) {
    return {
      ...EMPTY,
      cycle,
      countryId,
      countryName,
      available,
      totalBalance,
      countries: await rollup(cycle.id, new Date(cycle.submissionDeadline)),
    };
  }

  const countryCycleId = Number(ccRows[0].id);

  const [vendorRows, submissionRows, evidenceRows, countries] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT vce.id, vce.open_po_amount, vce.currency, vce.status::text AS status,
              vce.requested_at, vce.reminded_at, vce.responded_at, vce.invoice_count,
              v.name, v.vendor_no, v.contact_emails
         FROM vendor_cycle_entries vce
         JOIN vendors v ON v.id = vce.vendor_id
        WHERE vce.country_cycle_id = ?
        ORDER BY vce.open_po_amount DESC`,
      [countryCycleId],
    ),
    /* One query for the whole country rather than one per vendor: a scoped country runs to a few
       hundred vendors, and a per-row lookup would be a few hundred round trips for a list that is
       usually almost empty. */
    sql<QueryResultRow[]>(
      `SELECT s.id, s.vendor_cycle_entry_id, s.file_name, s.uploaded_at
         FROM soa_submissions s
         JOIN vendor_cycle_entries vce ON vce.id = s.vendor_cycle_entry_id
        WHERE vce.country_cycle_id = ?
        ORDER BY s.uploaded_at DESC`,
      [countryCycleId],
    ),
    sql<QueryResultRow[]>(
      `SELECT id, occurred_at, type::text AS type, action, actor, detail
         FROM evidence_log
        WHERE country_cycle_id = ?
        ORDER BY occurred_at DESC
        LIMIT 200`,
      [countryCycleId],
    ),
    rollup(cycle.id, new Date(cycle.submissionDeadline)),
  ]);

  const submissionsByEntry = new Map<string, SoaPayload['vendors'][number]['submissions']>();
  for (const r of submissionRows) {
    const key = String(r.vendor_cycle_entry_id);
    const list = submissionsByEntry.get(key) ?? [];
    list.push({
      id: String(r.id),
      fileName: String(r.file_name),
      uploadedAt: asIso(r.uploaded_at),
    });
    submissionsByEntry.set(key, list);
  }

  return {
    cycle,
    countryId,
    countryName,
    available,
    totalBalance,
    handedOff: String(ccRows[0].status) === 'handed_off',
    scoped: true,
    vendors: vendorRows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      no: String(r.vendor_no),
      openPO: Number(r.open_po_amount),
      status: String(r.status) as VendorRow['status'],
      // The screens show a request date as a bare string; an unsent request has none.
      reqDate: asShortDate(r.requested_at) ?? '—',
      remDate: asShortDate(r.reminded_at),
      respDate: asShortDate(r.responded_at),
      requestedAt: r.requested_at ? asIso(r.requested_at) : null,
      remindedAt: r.reminded_at ? asIso(r.reminded_at) : null,
      respondedAt: r.responded_at ? asIso(r.responded_at) : null,
      currency: String(r.currency),
      invCount: Number(r.invoice_count),
      contactEmails: ((r.contact_emails ?? []) as string[]).filter(Boolean),
      submissions: submissionsByEntry.get(String(r.id)) ?? [],
    })),
    countries,
    evidence: evidenceRows.map((r) => ({
      id: String(r.id),
      ts: asIso(r.occurred_at),
      type: String(r.type),
      action: String(r.action),
      actor: String(r.actor),
      detail: String(r.detail),
    })),
  };
}
