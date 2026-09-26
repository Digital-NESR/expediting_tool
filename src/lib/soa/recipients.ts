import type { QueryResultRow } from 'pg';
import expeditingPool from '@/lib/db-expediting';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import { ensureSoaSchema, sql } from './db';
import { parseAvlEmails } from './extract';

/**
 * Who a statement request actually goes to.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * Addresses are resolved fresh on every read rather than frozen onto the vendor, so a supplier who
 * updates their AP mailbox upstream is picked up without an import. Only the champion's own edits
 * persist, as rows in `vendor_contact_overrides`:
 *
 *     TO = (directory ∪ added) − suppressed − @nesr.com
 *
 * The directory is the Approved Vendor List union the SAP supplier master. Neither covers
 * everyone — of the vendors in scope for Q3 the AVL had 112 and SAP 111, but together 113 — and
 * they disagree on 25, each holding addresses the other lacks. Using both is the only reading that
 * does not silently drop a working mailbox.
 *
 * Internal addresses are dropped rather than mailed: eight in-scope vendors carry an `@nesr.com`
 * address in their contact record, which belongs to a colleague and not to the supplier. The
 * letter opens "Dear Valued Business Partner"; it should not arrive in a NESR inbox.
 */

const log = logger('soa-recipients');

const INTERNAL = /@nesr\.com$/i;

export interface RecipientAddress {
  email: string;
  /** `directory` came from the AVL or the SAP master; `added` a champion typed in and it stuck. */
  origin: 'directory' | 'added';
}

export interface VendorRecipient {
  vendorId: number;
  vendorNo: string;
  vendorName: string;
  amountUsd: number;
  currency: string;
  entryId: number;
  status: string;
  /** Resolved TO, largest-spend vendor first. */
  to: RecipientAddress[];
  /** Removed by a champion — kept visible so the removal can be undone. */
  suppressed: string[];
  /** `@nesr.com` addresses filtered out of TO; shown so the filtering is not invisible. */
  droppedInternal: string[];
}

export interface CountryRecipients {
  countryId: string;
  countryName: string;
  /** The country AP group mailbox, CC'd on every message. Null for the three countries
   *  with no row in the AP Group Emails sheet — a send is blocked until one is set. */
  apEmail: string | null;
  cycleLabel: string;
  vendors: VendorRecipient[];
}

/** Directory addresses for a batch of supplier codes: the AVL union the SAP supplier master. */
async function directoryEmails(codes: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!codes.length) return out;

  const add = (code: string, emails: string[]) => {
    const existing = out.get(code) ?? [];
    out.set(code, [...new Set([...existing, ...emails])]);
  };

  // Either source can be unavailable without the other being wrong, so they fail independently.
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT supplier_code, email FROM supplier_avl WHERE supplier_code = ANY($1)`,
      [codes],
    );
    for (const r of rows) add(String(r.supplier_code), parseAvlEmails(r.email as string | null));
  } catch (err) {
    log.warn('recipients.avlUnavailable', { error: err instanceof Error ? err.message : String(err) });
  }

  try {
    const { rows } = await expeditingPool.query<QueryResultRow>(
      `SELECT supplier_id, supplier_emails, additional_supplier_email
         FROM supplier_contacts WHERE supplier_id = ANY($1)`,
      [codes],
    );
    for (const r of rows)
      add(String(r.supplier_id), [
        ...parseAvlEmails(r.supplier_emails as string | null),
        ...parseAvlEmails(r.additional_supplier_email as string | null),
      ]);
  } catch (err) {
    log.warn('recipients.supplierMasterUnavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

/**
 * The resolution rule, kept pure so it can be tested without a database.
 *
 *     TO = (directory + added) - suppressed - @nesr.com
 *
 * Order matters in two places. A suppression beats everything, including an address the champion
 * later re-added, because the `added` row is cleared when they restore it rather than layered on
 * top. And the internal-address filter applies only to what the directory supplied: a champion who
 * deliberately typed a colleague's address is making a choice, while the supplier master merely
 * happens to be carrying one.
 */
export function resolveAddresses(
  directory: string[],
  added: string[],
  suppressed: Set<string>,
): { to: RecipientAddress[]; droppedInternal: string[] } {
  const seen = new Set<string>();
  const to: RecipientAddress[] = [];
  const droppedInternal: string[] = [];

  for (const [list, origin] of [
    [directory, 'directory'],
    [added, 'added'],
  ] as const) {
    for (const raw of list) {
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email) || suppressed.has(email)) continue;
      seen.add(email);
      if (origin === 'directory' && INTERNAL.test(email)) {
        droppedInternal.push(email);
        continue;
      }
      to.push({ email, origin });
    }
  }
  return { to, droppedInternal };
}

/**
 * Every in-scope vendor for a country in the active cycle, with its resolved recipients,
 * largest amount first — the order a champion reviews them in, because that is the order in
 * which a missing address costs the most.
 */
export async function loadCountryRecipients(countryId: string): Promise<CountryRecipients | null> {
  await ensureSoaSchema();

  const meta = await sql<QueryResultRow[]>(
    `SELECT co.id, co.name, co.ap_email, cy.label AS cycle_label, cc.id AS country_cycle_id
       FROM countries co
       JOIN cycles cy ON cy.is_active
       LEFT JOIN country_cycles cc ON cc.country_id = co.id AND cc.cycle_id = cy.id
      WHERE co.id = ?`,
    [countryId],
  );
  if (!meta.length) return null;
  const m = meta[0];

  const rows = m.country_cycle_id
    ? await sql<QueryResultRow[]>(
        `SELECT e.id AS entry_id, e.status::text AS status, e.open_po_amount, e.currency,
                v.id AS vendor_id, v.vendor_no, v.name
           FROM vendor_cycle_entries e
           JOIN vendors v ON v.id = e.vendor_id
          WHERE e.country_cycle_id = ?
          ORDER BY e.open_po_amount DESC NULLS LAST, v.name`,
        [m.country_cycle_id],
      )
    : [];

  const codes = rows.map((r) => String(r.vendor_no));
  const vendorIds = rows.map((r) => Number(r.vendor_id));
  const directory = await directoryEmails(codes);

  const overrides = vendorIds.length
    ? await sql<QueryResultRow[]>(
        `SELECT vendor_id, email, kind FROM vendor_contact_overrides WHERE vendor_id = ANY(?)`,
        [vendorIds],
      )
    : [];
  const added = new Map<number, Set<string>>();
  const suppressed = new Map<number, Set<string>>();
  for (const o of overrides) {
    const bucket = o.kind === 'added' ? added : suppressed;
    const id = Number(o.vendor_id);
    if (!bucket.has(id)) bucket.set(id, new Set());
    bucket.get(id)!.add(String(o.email).toLowerCase());
  }

  const vendors: VendorRecipient[] = rows.map((r) => {
    const vendorId = Number(r.vendor_id);
    const { to, droppedInternal } = resolveAddresses(
      directory.get(String(r.vendor_no)) ?? [],
      [...(added.get(vendorId) ?? [])],
      suppressed.get(vendorId) ?? new Set<string>(),
    );
    const gone = suppressed.get(vendorId) ?? new Set<string>();

    return {
      vendorId,
      vendorNo: String(r.vendor_no),
      vendorName: String(r.name),
      amountUsd: Number(r.open_po_amount ?? 0),
      currency: String(r.currency ?? 'USD'),
      entryId: Number(r.entry_id),
      status: String(r.status),
      to,
      suppressed: [...gone],
      droppedInternal,
    };
  });

  return {
    countryId: String(m.id),
    countryName: String(m.name),
    apEmail: (m.ap_email as string | null) ?? null,
    cycleLabel: String(m.cycle_label),
    vendors,
  };
}

/** A bare sanity check, matching `parseAvlEmails` — not RFC 5322 adjudication. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length > 3;
}

/**
 * Record a champion's edit to a vendor's recipients.
 *
 * Adding an address the directory already carries clears a suppression rather than writing an
 * `added` row — otherwise unticking and reticking a directory address would quietly promote it to
 * a manual entry and it would survive being removed upstream.
 */
export async function setVendorContact(input: {
  vendorId: number;
  email: string;
  action: 'add' | 'remove' | 'restore';
  actor: string;
}): Promise<void> {
  await ensureSoaSchema();
  const email = input.email.trim().toLowerCase();

  if (input.action === 'remove') {
    await sql(
      `INSERT INTO vendor_contact_overrides (vendor_id, email, kind, created_by)
       VALUES (?, ?, 'suppressed', ?)
       ON CONFLICT (vendor_id, email) DO UPDATE SET kind = 'suppressed', created_by = EXCLUDED.created_by`,
      [input.vendorId, email, input.actor],
    );
    return;
  }

  if (input.action === 'restore') {
    await sql(`DELETE FROM vendor_contact_overrides WHERE vendor_id = ? AND email = ? AND kind = 'suppressed'`, [
      input.vendorId,
      email,
    ]);
    return;
  }

  await sql(
    `INSERT INTO vendor_contact_overrides (vendor_id, email, kind, created_by)
     VALUES (?, ?, 'added', ?)
     ON CONFLICT (vendor_id, email) DO UPDATE SET kind = 'added', created_by = EXCLUDED.created_by`,
    [input.vendorId, email, input.actor],
  );
}
