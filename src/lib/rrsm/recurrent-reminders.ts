/**
 * Recurrent services' daily reminders: 90, 60, 30, 14, 7 and 0 days before a contract expires.
 *
 * A PLAIN MODULE, NOT A SERVER ACTION, for the reason `reminders.ts` gives: a mass send exported
 * from a `'use server'` file would be a public endpoint. Only the CRON_SECRET-guarded
 * /api/rrsm/reminders route calls this.
 *
 * Who: the service's requester-validator, copied to its buyer (or the buyer alone where no
 * requester is recorded). One mail per service. Each step is sent once: the run sends the
 * earliest step it missed and marks every step the clock has reached as spent, so a service
 * loaded already overdue gets one "expired" mail, not six in a row. Once the requester has
 * decided, the reminders stop: the renewal is the buyer's to finish.
 *
 * Only in countries that are live, run the module AND have reminders switched on: the module can
 * be visible while buyers correct the register, without mailing anybody about stale dates.
 */

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { rrsmHref } from '@/lib/rrsm/nav';
import { recurrentReminderMail, sendRrsmMail } from '@/lib/rrsm/notify';
import { DUE_WINDOW_DAYS } from '@/lib/rrsm/recurrent';
import { daysUntil, dueReminder, reachedSteps } from '@/lib/rrsm/renewals';
import { appBase } from '@/lib/rrsm/supplier-access';

const log = logger('rrsm-recurrent-reminders');

export interface RecurrentReminderSummary {
  checked: number;
  sent: number;
  /** Due, but nobody to tell: no requester and no buyer email on the service. */
  orphaned: number;
  errors: number;
}

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

export async function sendRecurrentReminders(options?: {
  today?: Date;
}): Promise<RecurrentReminderSummary> {
  const today = options?.today ?? new Date();
  const summary: RecurrentReminderSummary = { checked: 0, sent: 0, orphaned: 0, errors: 0 };

  /* Open a renewal for every active service inside the window (or past its date), in countries
     that are live and run the recurrent module. */
  await rrsmPool.query(
    `INSERT INTO rrsm_recurrent_renewals (service_id, due_on)
     SELECT s.id, s.contract_expiry
       FROM rrsm_recurrent_services s
       JOIN rrsm_countries c ON c.code = s.country_code
      WHERE c.live AND c.recurrent_enabled AND c.recurrent_reminders AND s.status = 'active'
        AND s.contract_expiry IS NOT NULL
        AND s.contract_expiry <= $1::date + ($2 || ' days')::interval
     ON CONFLICT (service_id, due_on) DO NOTHING`,
    [day(today), DUE_WINDOW_DAYS],
  );

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT r.id AS renewal_id, r.due_on, r.reminders_sent,
            s.id, s.country_code, s.description, s.service_name, s.supplier_name,
            s.requester_email, s.buyer_email
       FROM rrsm_recurrent_renewals r
       JOIN rrsm_recurrent_services s ON s.id = r.service_id
       JOIN rrsm_countries c ON c.code = s.country_code
      WHERE NOT r.completed AND r.decision IS NULL
        AND c.live AND c.recurrent_enabled AND c.recurrent_reminders AND s.status = 'active'
        AND s.contract_expiry = r.due_on`,
  );

  let base = '';
  try {
    base = appBase();
  } catch (err) {
    log.error('recurrent.reminders.noBase', err);
  }

  for (const r of rows) {
    summary.checked++;
    const due = r.due_on instanceof Date ? r.due_on : new Date(day(r.due_on) + 'T00:00:00Z');
    const sent = ((r.reminders_sent as number[] | null) ?? []).map(Number);
    const step = dueReminder(due, today, sent);
    if (step === null) continue;

    const requester = String(r.requester_email ?? '')
      .trim()
      .toLowerCase();
    const buyer = String(r.buyer_email ?? '')
      .trim()
      .toLowerCase();
    const to = requester.includes('@') ? [requester] : buyer.includes('@') ? [buyer] : [];
    const cc = requester.includes('@') && buyer.includes('@') && buyer !== requester ? [buyer] : [];
    if (!to.length) {
      summary.orphaned++;
      continue;
    }

    try {
      const mail = await sendRrsmMail(
        recurrentReminderMail({
          to,
          cc,
          serviceName: String(r.service_name || r.description),
          description: String(r.description ?? ''),
          supplierName: String(r.supplier_name ?? ''),
          expiresOn: day(due),
          daysLeft: daysUntil(due, today),
          url: (base || '') + rrsmHref('/rrsm/recurrent', String(r.country_code)),
        }),
      );
      if (!mail.ok) {
        summary.errors++;
        continue;
      }
      const spent = [...new Set([...sent, ...reachedSteps(due, today)])].sort((a, b) => b - a);
      await rrsmPool.query(
        `UPDATE rrsm_recurrent_renewals SET reminders_sent = $2, last_reminded_at = NOW() WHERE id = $1`,
        [Number(r.renewal_id), spent],
      );
      await rrsmPool.query(
        `INSERT INTO rrsm_recurrent_log (service_id, country_code, actor, action, note)
         VALUES ($1, $2, 'system: reminders', 'reminder_sent', $3)`,
        [Number(r.id), String(r.country_code), `${step}-day reminder to ${to.join(', ')}`],
      );
      summary.sent++;
    } catch (err) {
      summary.errors++;
      log.error('recurrent.reminders.failed', err, { serviceId: r.id });
    }
  }

  log.info('recurrent.reminders.run', { ...summary });
  return summary;
}
