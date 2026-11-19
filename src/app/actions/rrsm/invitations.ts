'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { canAccessCountry, currentRrsmActor, rolesIn, type RrsmActor } from '@/lib/rrsm/access';
import type { DocKind } from '@/lib/rrsm/submission';
import { sendRrsmMail, supplierInvitationMail, supplierReminderMail } from '@/lib/rrsm/notify';
import { DOC_LABEL } from '@/lib/rrsm/submission';
import { submissionUrl } from '@/lib/rrsm/supplier-access';

/**
 * Asking suppliers to confirm their month.
 *
 * The step between opening a cycle and anyone being able to submit: a link per supplier per
 * cycle, and an email carrying it. Buyers send them, and choose per invitation which documents
 * (Delivery Note, Timesheet) the supplier must upload before they can submit. Ops see the same
 * list, since their validation waits on the submissions.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT, so each one resolves the actor and re-checks the
 * country the cycle belongs to, read from the row rather than taken from the caller.
 */

const log = logger('rrsm-invitations');

export interface InvitationRow {
  supplierCode: string;
  supplierName: string;
  /** Real addresses, shown in full: this screen is for staff, not for whoever holds a link. */
  contacts: string[];
  /** Lines on this cycle for this supplier, and how many still need them. */
  lines: number;
  awaiting: number;
  /** The link, once one exists. Ops can copy it for a supplier with no address on file. */
  url: string | null;
  sentAt: string | null;
  sentTo: string[];
  submittedAt: string | null;
  /** What this invitation asked for, and what has been uploaded against it. */
  requires: { deliveryNote: boolean; timesheet: boolean };
  documents: { id: number; kind: DocKind; fileName: string }[];
  /** The last reminder a buyer sent, and how many so far. */
  remindedAt: string | null;
  reminders: number;
}

export interface InvitationBoard {
  cycleId: number | null;
  period: string;
  closesOn: string;
  countryName: string;
  canSend: boolean;
  /** Set when links cannot be built at all, which is a configuration fault worth saying once. */
  configError: string | null;
  rows: InvitationRow[];
}

export type InviteResult = {
  success: boolean;
  error?: string;
  sent?: number;
  failed?: { supplier: string; reason: string }[];
};

const EMPTY: InvitationBoard = {
  cycleId: null,
  period: '',
  closesOn: '',
  countryName: '',
  canSend: false,
  configError: null,
  rows: [],
};

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

/** A buyer or an admin (user decision, 19 Nov 2026: buyers send invitations, Ops do not). */
function canSendIn(actor: RrsmActor, code: string): boolean {
  return rolesIn(actor, code).canBuy;
}

/** The country a cycle belongs to, read from the row. A cycle id from a browser proves nothing. */
async function countryOfCycle(cycleId: number): Promise<string> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT country_code FROM rrsm_cycles WHERE id = $1`,
    [cycleId],
  );
  if (!rows[0]) throw new Error('No such cycle.');
  return String(rows[0].country_code);
}

/**
 * Every supplier on the latest cycle for a country, with where their invitation has got to.
 *
 * Driven from the cycle's lines rather than from the supplier table: a supplier with nothing on
 * hire this month has nothing to confirm, and listing them would be asking for a reply to a
 * question nobody asked.
 */
export async function getRrsmInvitations(countryCode: string): Promise<InvitationBoard> {
  try {
    const actor = await actorOrThrow();
    const code = String(countryCode ?? '').trim();
    if (!code || !canAccessCountry(actor, code, 'buyer')) return EMPTY;

    const { rows: cycles } = await rrsmPool.query<QueryResultRow>(
      `SELECT cy.id, cy.period, cy.closes_on, c.name AS country_name
         FROM rrsm_cycles cy JOIN rrsm_countries c ON c.code = cy.country_code
        WHERE cy.country_code = $1 ORDER BY cy.period DESC LIMIT 1`,
      [code],
    );
    const cycle = cycles[0];
    if (!cycle) return { ...EMPTY, canSend: canSendIn(actor, code) };

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT s.supplier_code,
              sup.name AS supplier_name,
              sup.contact_emails,
              COUNT(l.id)::int AS lines,
              COUNT(l.id) FILTER (WHERE l.stage IN ('awaiting_supplier', 'returned'))::int AS awaiting,
              lk.token, lk.sent_at, lk.sent_to, lk.submitted_at,
              lk.reminded_at, COALESCE(lk.reminder_count, 0) AS reminder_count,
              /* A link carries what this cycle asks for; before there is one, the supplier's own
                 default (remembered from the last time a buyer changed it) is what will be asked. */
              CASE WHEN lk.id IS NULL THEN sup.requires_delivery_note
                   ELSE lk.requires_delivery_note END AS requires_dn,
              CASE WHEN lk.id IS NULL THEN sup.requires_timesheet
                   ELSE lk.requires_timesheet END AS requires_ts,
              (SELECT COALESCE(json_agg(json_build_object('id', d.id, 'kind', d.kind, 'fileName', d.file_name)
                                ORDER BY d.kind), '[]'::json)
                 FROM rrsm_submission_documents d WHERE d.link_id = lk.id) AS documents
         FROM rrsm_cycle_lines l
         JOIN rrsm_service_lines s ON s.id = l.service_line_id
         JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
         LEFT JOIN rrsm_supplier_links lk
                ON lk.cycle_id = l.cycle_id AND lk.supplier_code = s.supplier_code
        WHERE l.cycle_id = $1
        GROUP BY s.supplier_code, sup.name, sup.contact_emails,
                 sup.requires_delivery_note, sup.requires_timesheet,
                 lk.id, lk.token, lk.sent_at, lk.sent_to, lk.submitted_at,
                 lk.reminded_at, lk.reminder_count,
                 lk.requires_delivery_note, lk.requires_timesheet
        ORDER BY sup.name`,
      [Number(cycle.id)],
    );

    /* Built once rather than per row, so an unset NEXT_PUBLIC_APP_URL is reported as the one
       configuration fault it is instead of thirty identical broken links. */
    let configError: string | null = null;
    const urlFor = (token: unknown): string | null => {
      if (!token) return null;
      try {
        return submissionUrl(String(token));
      } catch (err) {
        configError = (err as Error).message;
        return null;
      }
    };

    return {
      cycleId: Number(cycle.id),
      period: dateOnly(cycle.period),
      closesOn: dateOnly(cycle.closes_on),
      countryName: String(cycle.country_name),
      canSend: canSendIn(actor, code),
      configError,
      rows: rows.map((r) => ({
        supplierCode: String(r.supplier_code),
        supplierName: String(r.supplier_name),
        contacts: ((r.contact_emails as string[] | null) ?? []).filter((e) =>
          String(e).includes('@'),
        ),
        lines: Number(r.lines ?? 0),
        awaiting: Number(r.awaiting ?? 0),
        url: urlFor(r.token),
        sentAt: r.sent_at ? dateOnly(r.sent_at) : null,
        sentTo: (r.sent_to as string[] | null) ?? [],
        submittedAt: r.submitted_at ? dateOnly(r.submitted_at) : null,
        remindedAt: r.reminded_at ? dateOnly(r.reminded_at) : null,
        reminders: Number(r.reminder_count ?? 0),
        requires: { deliveryNote: Boolean(r.requires_dn), timesheet: Boolean(r.requires_ts) },
        documents: ((r.documents as { id: number; kind: DocKind; fileName: string }[]) ?? []).map(
          (d) => ({ id: Number(d.id), kind: d.kind, fileName: String(d.fileName) }),
        ),
      })),
    };
  } catch (err) {
    log.error('getRrsmInvitations.failed', err, { countryCode });
    return EMPTY;
  }
}

/**
 * Create the links that are missing and email them.
 *
 * The link is created whether or not the mail goes out, and `sent_at` is stamped only when it
 * does. That split is the point: a supplier with no address on file still gets a link Ops can
 * pass on by hand, and the screen can still tell the difference between "nobody has been asked"
 * and "asked and ignoring us", which is the question a chase turns on.
 *
 * One supplier failing does not stop the rest. The failures come back named, because "3 of 11
 * sent" with no list is not something anybody can act on.
 */
export async function sendRrsmInvitations(
  cycleId: number,
  supplierCodes: string[],
): Promise<InviteResult> {
  try {
    const id = Number(cycleId);
    const country = await countryOfCycle(id);
    const actor = await actorOrThrow();
    if (!canAccessCountry(actor, country, 'buyer') || !canSendIn(actor, country)) {
      return { success: false, error: 'Only a buyer or an admin sends invitations.' };
    }

    const wanted = (supplierCodes ?? []).map((c) => String(c).trim()).filter(Boolean);
    if (!wanted.length) return { success: false, error: 'Nobody was selected.' };

    const { rows: cycles } = await rrsmPool.query<QueryResultRow>(
      `SELECT cy.period, cy.closes_on, c.name AS country_name
         FROM rrsm_cycles cy JOIN rrsm_countries c ON c.code = cy.country_code
        WHERE cy.id = $1`,
      [id],
    );
    const cycle = cycles[0];
    if (!cycle) return { success: false, error: 'No such cycle.' };

    /* The supplier must actually be on this cycle. Without this, a code typed into the payload
       would mint a link for somebody who has nothing to confirm. */
    const { rows: eligible } = await rrsmPool.query<QueryResultRow>(
      `SELECT DISTINCT s.supplier_code, sup.name, sup.contact_emails,
              sup.requires_delivery_note, sup.requires_timesheet
         FROM rrsm_cycle_lines l
         JOIN rrsm_service_lines s ON s.id = l.service_line_id
         JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
        WHERE l.cycle_id = $1 AND s.supplier_code = ANY($2)`,
      [id, wanted],
    );

    const failed: { supplier: string; reason: string }[] = [];
    let sent = 0;

    for (const s of eligible) {
      const code = String(s.supplier_code);
      const name = String(s.name);
      const contacts = ((s.contact_emails as string[] | null) ?? [])
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => e.includes('@'));

      // The link exists either way; only the mail depends on there being somewhere to send it.
      const { rows: linkRows } = await rrsmPool.query<QueryResultRow>(
        /* The documents asked for are the supplier's defaults, set on every send, so a re-send
           picks up a change (until the supplier has submitted). */
        `INSERT INTO rrsm_supplier_links (cycle_id, supplier_code, requires_delivery_note, requires_timesheet)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cycle_id, supplier_code) DO UPDATE
           SET requires_delivery_note = CASE WHEN rrsm_supplier_links.submitted_at IS NULL
                 THEN EXCLUDED.requires_delivery_note ELSE rrsm_supplier_links.requires_delivery_note END,
               requires_timesheet = CASE WHEN rrsm_supplier_links.submitted_at IS NULL
                 THEN EXCLUDED.requires_timesheet ELSE rrsm_supplier_links.requires_timesheet END
         RETURNING id, token`,
        [id, code, Boolean(s.requires_delivery_note), Boolean(s.requires_timesheet)],
      );
      const link = linkRows[0];

      if (!contacts.length) {
        failed.push({ supplier: name, reason: 'No email address on file. Copy the link instead.' });
        continue;
      }

      let url: string;
      try {
        url = submissionUrl(String(link.token));
      } catch (err) {
        failed.push({ supplier: name, reason: (err as Error).message });
        continue;
      }

      const mail = await sendRrsmMail(
        supplierInvitationMail({
          to: contacts,
          supplierName: name,
          countryName: String(cycle.country_name),
          period: dateOnly(cycle.period),
          closesOn: dateOnly(cycle.closes_on),
          url,
        }),
      );

      if (!mail.ok) {
        failed.push({ supplier: name, reason: mail.error ?? 'The mail workflow refused it.' });
        continue;
      }

      await rrsmPool.query(
        `UPDATE rrsm_supplier_links SET sent_at = NOW(), sent_to = $2 WHERE id = $1`,
        [Number(link.id), contacts],
      );
      sent += 1;
    }

    const missing = wanted.filter((c) => !eligible.some((e) => String(e.supplier_code) === c));
    for (const c of missing) {
      failed.push({ supplier: c, reason: 'Not on this cycle.' });
    }

    log.info('invitations.sent', { cycleId: id, sent, failed: failed.length, by: actor.email });
    return { success: true, sent, failed };
  } catch (err) {
    log.error('sendRrsmInvitations.failed', err, { cycleId });
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Remind suppliers who were invited and have not submitted: one, or every one ticked.
 *
 * Only a supplier whose invitation actually went out and who has not submitted is reminded; any
 * other code in the list is reported back by name rather than mailed. Manual only, by decision:
 * nothing calls this on a schedule.
 */
export async function sendRrsmReminders(
  cycleId: number,
  supplierCodes: string[],
): Promise<InviteResult> {
  try {
    const id = Number(cycleId);
    const country = await countryOfCycle(id);
    const actor = await actorOrThrow();
    if (!canAccessCountry(actor, country, 'buyer') || !canSendIn(actor, country)) {
      return { success: false, error: 'Only a buyer or an admin sends reminders.' };
    }
    const wanted = (supplierCodes ?? []).map((c) => String(c).trim()).filter(Boolean);
    if (!wanted.length) return { success: false, error: 'Nobody was selected.' };

    const { rows: cycles } = await rrsmPool.query<QueryResultRow>(
      `SELECT cy.period, cy.closes_on, c.name AS country_name
         FROM rrsm_cycles cy JOIN rrsm_countries c ON c.code = cy.country_code
        WHERE cy.id = $1`,
      [id],
    );
    const cycle = cycles[0];
    if (!cycle) return { success: false, error: 'No such cycle.' };

    const { rows: links } = await rrsmPool.query<QueryResultRow>(
      `SELECT lk.id, lk.token, lk.supplier_code, lk.sent_to, lk.requires_delivery_note,
              lk.requires_timesheet, sup.name, sup.contact_emails,
              ARRAY(SELECT d.kind FROM rrsm_submission_documents d WHERE d.link_id = lk.id) AS uploaded
         FROM rrsm_supplier_links lk JOIN rrsm_suppliers sup ON sup.code = lk.supplier_code
        WHERE lk.cycle_id = $1 AND lk.supplier_code = ANY($2)
          AND lk.sent_at IS NOT NULL AND lk.submitted_at IS NULL`,
      [id, wanted],
    );

    const failed: { supplier: string; reason: string }[] = [];
    let sent = 0;
    for (const lk of links) {
      const name = String(lk.name);
      const sentTo = ((lk.sent_to as string[] | null) ?? []).filter((e) => String(e).includes('@'));
      const to = sentTo.length
        ? sentTo
        : ((lk.contact_emails as string[] | null) ?? [])
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => e.includes('@'));
      if (!to.length) {
        failed.push({ supplier: name, reason: 'No email address on file. Copy the link instead.' });
        continue;
      }
      let url: string;
      try {
        url = submissionUrl(String(lk.token));
      } catch (err) {
        failed.push({ supplier: name, reason: (err as Error).message });
        continue;
      }
      const uploaded = ((lk.uploaded as string[] | null) ?? []).map(String);
      const owed: string[] = [];
      if (lk.requires_delivery_note && !uploaded.includes('delivery_note'))
        owed.push(DOC_LABEL.delivery_note);
      if (lk.requires_timesheet && !uploaded.includes('timesheet')) owed.push(DOC_LABEL.timesheet);

      const mail = await sendRrsmMail(
        supplierReminderMail({
          to,
          supplierName: name,
          countryName: String(cycle.country_name),
          period: dateOnly(cycle.period),
          closesOn: dateOnly(cycle.closes_on),
          url,
          documents: owed,
        }),
      );
      if (!mail.ok) {
        failed.push({ supplier: name, reason: mail.error ?? 'The mail workflow refused it.' });
        continue;
      }
      await rrsmPool.query(
        `UPDATE rrsm_supplier_links
            SET reminded_at = NOW(), reminder_count = reminder_count + 1
          WHERE id = $1`,
        [Number(lk.id)],
      );
      await rrsmPool.query(
        `INSERT INTO rrsm_activity_log (cycle_id, actor, action, note)
         VALUES ($1, $2, 'supplier_reminded', $3)`,
        [id, actor.email, `Reminder sent to ${name} (${lk.supplier_code})`],
      );
      sent += 1;
    }

    for (const c of wanted) {
      if (!links.some((l) => String(l.supplier_code) === c)) {
        failed.push({
          supplier: c,
          reason: 'Not waiting on a reply (not invited yet, or already submitted).',
        });
      }
    }

    log.info('reminders.sent', { cycleId: id, sent, failed: failed.length, by: actor.email });
    return { success: true, sent, failed };
  } catch (err) {
    log.error('sendRrsmReminders.failed', err, { cycleId });
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Set which documents one or more suppliers must upload: the Supplier validation page's per-row
 * ticks, and the common ticks that apply to every supplier listed.
 *
 * Written to the supplier, so it is remembered for the next cycle, and to this cycle's link where
 * one exists and the supplier has not submitted, so a supplier already invited sees the change
 * on their page straight away. Only suppliers with lines on the cycle are touched.
 */
export async function setRrsmDocRequirements(
  cycleId: number,
  supplierCodes: string[],
  change: { deliveryNote?: boolean; timesheet?: boolean },
): Promise<{ success: boolean; error?: string; updated?: number }> {
  try {
    const id = Number(cycleId);
    const country = await countryOfCycle(id);
    const actor = await actorOrThrow();
    if (!canAccessCountry(actor, country, 'buyer') || !canSendIn(actor, country)) {
      return { success: false, error: 'Only a buyer or an admin sets what suppliers upload.' };
    }
    const wanted = (supplierCodes ?? []).map((c) => String(c).trim()).filter(Boolean);
    const dn = typeof change?.deliveryNote === 'boolean' ? change.deliveryNote : null;
    const ts = typeof change?.timesheet === 'boolean' ? change.timesheet : null;
    if (!wanted.length || (dn === null && ts === null)) return { success: true, updated: 0 };

    const client = await rrsmPool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<QueryResultRow>(
        `UPDATE rrsm_suppliers sup
            SET requires_delivery_note = COALESCE($3, sup.requires_delivery_note),
                requires_timesheet     = COALESCE($4, sup.requires_timesheet)
          WHERE sup.code = ANY($2)
            AND EXISTS (SELECT 1 FROM rrsm_cycle_lines l
                          JOIN rrsm_service_lines s ON s.id = l.service_line_id
                         WHERE l.cycle_id = $1 AND s.supplier_code = sup.code)
          RETURNING sup.code`,
        [id, wanted, dn, ts],
      );
      await client.query(
        `UPDATE rrsm_supplier_links
            SET requires_delivery_note = COALESCE($3, requires_delivery_note),
                requires_timesheet     = COALESCE($4, requires_timesheet)
          WHERE cycle_id = $1 AND supplier_code = ANY($2) AND submitted_at IS NULL`,
        [id, rows.map((r) => String(r.code)), dn, ts],
      );
      await client.query('COMMIT');
      return { success: true, updated: rows.length };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    log.error('setRrsmDocRequirements.failed', err, { cycleId });
    return { success: false, error: (err as Error).message };
  }
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}
