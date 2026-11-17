/**
 * RRSM's daily clock: the renewal reminders nobody is on screen to trigger.
 *
 * DELIBERATELY A PLAIN MODULE, NOT A SERVER ACTION. Every export of a `'use server'` file is a
 * public POST endpoint, so exporting a mass send from `src/app/actions/rrsm/renewals.ts` would
 * let any signed-in user fire every renewal email in the estate, bypassing the CRON_SECRET on
 * the route. Only `src/app/api/rrsm/reminders/route.ts`, which enforces that secret, calls this.
 * ProcureGuard carries the same note for the same reason.
 *
 * Nothing here talks to a mailbox. The app decides who is owed a nudge and writes the message;
 * the existing RRSM n8n webhook sends it — the same division of labour as every other RRSM mail,
 * which is why this needed no new workflow and no database credential in n8n.
 */

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { renewalReminderMail, sendRrsmMail } from '@/lib/rrsm/notify';
import { WINDOW_DAYS, daysUntil, dueReminder, reachedSteps } from '@/lib/rrsm/renewals';
import { boardUrl } from '@/lib/rrsm/supplier-access';

const log = logger('rrsm-reminders');

export interface ReminderRunSummary {
  /** Pending renewals considered. */
  checked: number;
  /** Of those, how many had a reminder step falling due today. */
  due: number;
  /** Renewals that reached at least one person and were marked. */
  reminded: number;
  /** People who received one email each. */
  recipients: number;
  /** Due, but with nobody to tell: no requester, no owner, no buyer assigned. */
  orphaned: number;
  errors: number;
  /** Set when the run did nothing because the mail webhook is not configured. */
  skipped?: string;
}

interface DueRenewal {
  id: number;
  countryCode: string;
  countryName: string;
  description: string;
  assetRef: string;
  segment: string;
  supplierName: string;
  dueOn: string;
  daysLeft: number;
  monthsUsed: number;
  step: number;
  /** The union of what was already sent and every step the clock has now reached. */
  nextSent: number[];
  recipients: string[];
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

function asDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

/** Lowercased, de-duplicated, and only things that could plausibly be delivered. */
function cleanEmails(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const e = String(v ?? '')
      .trim()
      .toLowerCase();
    if (e.includes('@')) seen.add(e);
  }
  return [...seen];
}

/**
 * Open a renewal row for anything that has come inside the window, in every live country.
 *
 * The same INSERT the renewals screen runs, but not waiting for somebody to open that screen.
 * That is the whole point of this job: a renewal that only exists once a human looks is a
 * renewal nobody is reminded about.
 *
 * Countries that are not live are left alone. Switching a country on is the act that says the
 * register there is real, and emailing people about data nobody has signed off is worse than
 * sending nothing.
 */
async function openDueRenewals(): Promise<void> {
  await rrsmPool.query(
    `INSERT INTO rrsm_renewals (service_line_id, due_on)
     SELECT s.id, s.contract_ends_on
       FROM rrsm_service_lines s
       JOIN rrsm_countries c ON c.code = s.country_code
      WHERE c.live AND s.active
        AND s.off_hire_date IS NULL
        AND s.contract_ends_on IS NOT NULL
        AND s.contract_ends_on <= CURRENT_DATE + ($1 || ' days')::interval
     ON CONFLICT (service_line_id, due_on) DO NOTHING`,
    [WINDOW_DAYS],
  );
}

/** Active buyers and admins, by country. They are the only people who can actually decide. */
async function decidersByCountry(): Promise<Map<string, string[]>> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT country_code, lower(email) AS email
       FROM rrsm_users
      WHERE active AND role IN ('buyer', 'admin')`,
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const code = String(r.country_code);
    const list = map.get(code) ?? [];
    list.push(String(r.email));
    map.set(code, list);
  }
  return map;
}

/**
 * Send today's renewal reminders.
 *
 * Idempotent per step via `rrsm_renewals.reminders_sent`, so running it twice in a day sends
 * nothing the second time and it is safe to retry a failed run by hand.
 *
 * `today` is injectable so the behaviour can be exercised against a chosen date rather than
 * against whatever day the test happens to run on.
 */
export async function sendRrsmRenewalReminders(options?: {
  today?: Date;
}): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    checked: 0,
    due: 0,
    reminded: 0,
    recipients: 0,
    orphaned: 0,
    errors: 0,
  };

  /* Checked before anything is read or written. A run that cannot send must not stamp
     `reminders_sent`, or the day the webhook is configured every renewal will already believe
     it has been chased. */
  if (!String(process.env.N8N_RRSM_WEBHOOK_URL ?? '').trim()) {
    log.warn('reminders.unconfigured', { reason: 'N8N_RRSM_WEBHOOK_URL is not set' });
    return { ...summary, skipped: 'No mail webhook is configured.' };
  }

  const today = options?.today ?? new Date();

  await openDueRenewals();
  const deciders = await decidersByCountry();

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT r.id, r.due_on, r.reminders_sent,
            s.country_code, s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.segment,
            COALESCE(s.requester_email, '') AS requester_email,
            COALESCE(s.owner_email, '')     AS owner_email,
            c.name AS country_name,
            sup.name AS supplier_name,
            COALESCE(u.months_used, 0) AS months_used
       FROM rrsm_renewals r
       JOIN rrsm_service_lines s ON s.id = r.service_line_id
       JOIN rrsm_countries c     ON c.code = s.country_code
       JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
       LEFT JOIN LATERAL (
            SELECT count(*) FILTER (WHERE l.qty > 0)::int AS months_used
              FROM rrsm_cycle_lines l
              JOIN rrsm_cycles cy ON cy.id = l.cycle_id
             WHERE l.service_line_id = s.id
               AND cy.period > (r.due_on - INTERVAL '12 months')
       ) u ON TRUE
      WHERE r.status = 'pending'
        AND c.live AND s.active AND s.off_hire_date IS NULL
      ORDER BY r.due_on`,
  );

  /* Collected before anything is sent, because one person's mail spans countries and suppliers
     and is only knowable once every row has been read. */
  const byRecipient = new Map<string, DueRenewal[]>();
  const due: DueRenewal[] = [];

  for (const row of rows) {
    summary.checked += 1;

    const dueOn = dateOnly(row.due_on);
    const sent = ((row.reminders_sent as number[] | null) ?? []).map(Number);
    const step = dueReminder(asDate(dueOn), today, sent);
    if (step === null) continue;
    summary.due += 1;

    const countryCode = String(row.country_code);
    const recipients = cleanEmails([
      ...(deciders.get(countryCode) ?? []),
      row.requester_email as string,
      row.owner_email as string,
    ]);

    if (!recipients.length) {
      /* Named rather than counted: "4 renewals had nobody to tell" is only actionable if
         somebody can see which four. This is the symptom of a country with no buyer assigned,
         which is the one configuration fault that silently disables the whole feature. */
      summary.orphaned += 1;
      log.warn('reminders.noRecipient', {
        renewalId: Number(row.id),
        country: countryCode,
        description: String(row.description),
        dueOn,
      });
      continue;
    }

    const item: DueRenewal = {
      id: Number(row.id),
      countryCode,
      countryName: String(row.country_name),
      description: String(row.description),
      assetRef: String(row.asset_ref ?? ''),
      segment: String(row.segment),
      supplierName: String(row.supplier_name),
      dueOn,
      daysLeft: daysUntil(asDate(dueOn), today),
      monthsUsed: Number(row.months_used ?? 0),
      step,
      /* Every step the clock has reached, not just the one being sent. See `reachedSteps`:
         without this a renewal nobody looked at for two months would send the 90-day notice
         today, the 60-day tomorrow and the 30-day the day after. */
      nextSent: [...new Set([...sent, ...reachedSteps(asDate(dueOn), today)])].sort(
        (a, b) => b - a,
      ),
      recipients,
    };
    due.push(item);

    for (const email of recipients) {
      const list = byRecipient.get(email) ?? [];
      list.push(item);
      byRecipient.set(email, list);
    }
  }

  /* One email per person, covering everything of theirs. A buyer holding a country with thirty
     expiring hires gets one mail with thirty rows, not thirty mails. */
  const delivered = new Set<number>();

  for (const [email, items] of byRecipient) {
    let url: string;
    try {
      /* Linked to one country rather than a neutral landing page, because the board opens on a
         country and a reader who has to pick one has already been given work to do. Where a
         digest spans countries, the most urgent line decides which. */
      const soonest = [...items].sort((a, b) => a.daysLeft - b.daysLeft)[0];
      url = boardUrl(soonest.countryCode, 'renew');
    } catch (err) {
      /* An unset NEXT_PUBLIC_APP_URL is one fault, not one per recipient, and it makes every
         mail useless rather than wrong. Stop instead of sending links that go nowhere. */
      log.error('reminders.noBaseUrl', err, {});
      summary.errors += 1;
      break;
    }

    const result = await sendRrsmMail(
      renewalReminderMail({
        to: [email],
        items: items.map((i) => ({
          description: i.description,
          assetRef: i.assetRef,
          segment: i.segment,
          supplierName: i.supplierName,
          countryName: i.countryName,
          dueOn: i.dueOn,
          daysLeft: i.daysLeft,
          monthsUsed: i.monthsUsed,
        })),
        url,
      }),
    );

    if (!result.ok) {
      log.error('reminders.mailFailed', null, {
        recipient: email,
        renewals: items.length,
        status: result.status,
        reason: result.error,
      });
      summary.errors += 1;
      continue;
    }

    summary.recipients += 1;
    /* A renewal reaches several people. It counts as chased if ANY of them got it: the nudge is
       out. If every recipient failed it stays unmarked and tomorrow's run tries again. */
    for (const i of items) delivered.add(i.id);
  }

  for (const item of due) {
    if (!delivered.has(item.id)) continue;
    try {
      await rrsmPool.query(
        `UPDATE rrsm_renewals
            SET reminders_sent = $2::int[], last_reminder_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [item.id, item.nextSent],
      );
      summary.reminded += 1;
    } catch (err) {
      /* Worth shouting about: a renewal that was emailed but not stamped will be emailed again
         tomorrow, which is the duplicate-mail failure this whole design is trying to avoid. */
      log.error('reminders.markFailed', err, { renewalId: item.id });
      summary.errors += 1;
    }
  }

  log.info('reminders.run', { ...summary });
  return summary;
}
