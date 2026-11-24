import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { safesignPool } from './db';
import { reminderDue, isoDay, daysBetween, type RequestStatus, type ResponseType } from './model';
import { reminderMail, sendSafeSignMail } from './notify';
import { dateOnly, respondUrl } from './supplier-access';

/**
 * Sending reminders, by hand and on the daily schedule.
 *
 * A plain module: the cron route and the sender's "Remind" button both call in here, and
 * neither should be a public endpoint of its own. Each reminder is recorded on the request and in
 * ss_events, so the schedule never mails the same supplier twice on one day and the page can
 * show the history.
 */

const log = logger('safesign-delivery');

interface RemindRow {
  requestId: number;
  token: string;
  status: RequestStatus;
  sentTo: string[];
  sentCc: string[];
  vendorName: string;
  title: string;
  responseType: ResponseType;
  deadline: string;
  remindDaysBefore: number[];
  overdueEveryDays: number;
  lastRemindedDay: string | null;
}

const SELECT = `
  SELECT r.id, r.token, r.status, r.sent_to, r.sent_cc,
         to_char(r.last_reminded_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS last_day,
         v.name AS vendor_name,
         c.title, c.response_type, c.deadline, c.remind_days_before, c.overdue_every_days
    FROM ss_requests r
    JOIN ss_vendors v        ON v.id = r.vendor_id
    JOIN ss_communications c ON c.id = r.communication_id
   WHERE c.status = 'sent' AND r.sent_at IS NOT NULL AND v.active
     AND r.status IN ('pending', 'changes_requested')`;

function toRow(r: QueryResultRow): RemindRow {
  return {
    requestId: Number(r.id),
    token: String(r.token),
    status: String(r.status) as RequestStatus,
    sentTo: (r.sent_to as string[]) ?? [],
    sentCc: (r.sent_cc as string[]) ?? [],
    vendorName: String(r.vendor_name),
    title: String(r.title),
    responseType: String(r.response_type) as ResponseType,
    deadline: dateOnly(r.deadline),
    remindDaysBefore: ((r.remind_days_before as number[]) ?? []).map(Number),
    overdueEveryDays: Number(r.overdue_every_days ?? 0),
    lastRemindedDay: r.last_day ? String(r.last_day) : null,
  };
}

/** Today in Saudi time, which is the day Nora and the suppliers are living in. */
export function todayRiyadh(now = new Date()): string {
  return isoDay(new Date(now.getTime() + 3 * 3_600_000));
}

async function remindOne(row: RemindRow, actor: string, today: string): Promise<boolean> {
  const overdue = daysBetween(today, row.deadline) < 0;
  const sent = await sendSafeSignMail(
    reminderMail({
      to: row.sentTo,
      cc: row.sentCc,
      vendorName: row.vendorName,
      title: row.title,
      responseType: row.responseType,
      deadline: row.deadline,
      overdue,
      url: respondUrl(row.token),
    }),
  );
  if (!sent.ok) {
    await safesignPool.query(
      `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, 'reminder.failed', $2, $3)`,
      [row.requestId, actor, JSON.stringify({ error: sent.error ?? 'unknown' })],
    );
    return false;
  }
  await safesignPool.query(
    `UPDATE ss_requests SET last_reminded_at = NOW(), reminder_count = reminder_count + 1 WHERE id = $1`,
    [row.requestId],
  );
  await safesignPool.query(
    `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, 'reminder.sent', $2, $3)`,
    [row.requestId, actor, JSON.stringify({ overdue, to: row.sentTo, cc: row.sentCc })],
  );
  return true;
}

/** The sender's button. Only requests still waiting on the supplier are reminded. */
export async function remindRequests(
  communicationId: number,
  requestIds: number[],
  actor: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const ids = requestIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return { sent: 0, failed: 0, skipped: 0 };
  const { rows } = await safesignPool.query<QueryResultRow>(
    `${SELECT} AND c.id = $1 AND r.id = ANY($2::bigint[])`,
    [communicationId, ids],
  );
  const today = todayRiyadh();
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (await remindOne(toRow(r), actor, today)) sent += 1;
    else failed += 1;
  }
  return { sent, failed, skipped: ids.length - rows.length };
}

/** The daily run. */
export async function runScheduledReminders(): Promise<{ checked: number; sent: number; failed: number }> {
  const { rows } = await safesignPool.query<QueryResultRow>(SELECT);
  const today = todayRiyadh();
  let sent = 0;
  let failed = 0;
  for (const raw of rows) {
    const row = toRow(raw);
    if (
      !reminderDue({
        status: row.status,
        deadline: row.deadline,
        today,
        remindDaysBefore: row.remindDaysBefore,
        overdueEveryDays: row.overdueEveryDays,
        lastRemindedDay: row.lastRemindedDay,
      })
    ) {
      continue;
    }
    try {
      if (await remindOne(row, 'schedule', today)) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      log.error('reminder.threw', err, { requestId: row.requestId });
    }
  }
  return { checked: rows.length, sent, failed };
}
