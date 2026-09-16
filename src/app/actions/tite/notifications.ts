'use server';

/* ─── Who is notified about one shipment, and what was sent. ─── */

import titePool from '@/lib/db-tite';
import { withTransaction } from '@/lib/db/tx';
import { forbidden } from '@/lib/require-access';
import { currentTiteUser, isTiteApproved, requireTiteUser } from '@/lib/tite-auth';
import { dbInsertActivityLog, ensureTiteActivityLogSchema } from '@/lib/tite-documents';
import type { NotificationContact } from '@/types/tite';
import { canReadShipment, denyShipmentEdit } from '@/lib/tite/access';
import { log } from '@/lib/tite/internals';
import type { NotificationLogRow } from '@/lib/tite/types';

export async function getShipmentNotificationStatus(
  shipmentId: number,
): Promise<NotificationLogRow[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
    const { rows } = await titePool.query<NotificationLogRow>(
      `SELECT id, shipment_id, days_before_expiry, status, sent_at
       FROM notification_log
       WHERE shipment_id = $1`,
      [shipmentId],
    );
    return rows;
  } catch (err) {
    log.error('getShipmentNotificationStatus.failed', err);
    return [];
  }
}

/* ─── getShipmentNotificationContacts ────────────────────────── */

export async function getShipmentNotificationContacts(
  shipmentId: number,
): Promise<NotificationContact[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
    const { rows } = await titePool.query<NotificationContact>(
      `SELECT id, shipment_id, name, email, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue
       FROM shipment_notification_contacts
       WHERE shipment_id = $1
       ORDER BY id`,
      [shipmentId],
    );
    return rows;
  } catch (err) {
    log.error('getShipmentNotificationContacts.failed', err);
    return [];
  }
}

/* ─── saveNotificationContacts ───────────────────────────────── */

export async function saveNotificationContacts(params: {
  shipmentId: number;
  contacts: Array<{
    email: string;
    name: string;
    role: string | null;
    notify_60_days?: boolean;
    notify_30_days?: boolean;
    notify_14_days?: boolean;
    notify_7_days?: boolean;
    notify_2_days?: boolean;
    notify_1_day?: boolean;
    notify_0_day?: boolean;
    notify_overdue?: boolean;
  }>;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await ensureTiteActivityLogSchema();

    /* Delete-then-insert: outside a transaction a failure between the two would
       leave the shipment with NO recipients, so nobody is alerted before the
       customs deadline. */
    await withTransaction(titePool, async (client) => {
      await client.query(`DELETE FROM shipment_notification_contacts WHERE shipment_id = $1`, [
        params.shipmentId,
      ]);

      for (const c of params.contacts) {
        if (!c.email) continue;
        await client.query(
          `INSERT INTO shipment_notification_contacts
             (shipment_id, email, name, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [
            params.shipmentId,
            c.email,
            c.name || null,
            c.role || null,
            c.notify_60_days ?? true,
            c.notify_30_days ?? true,
            c.notify_14_days ?? true,
            c.notify_7_days ?? true,
            c.notify_2_days ?? true,
            c.notify_1_day ?? true,
            c.notify_0_day ?? true,
            c.notify_overdue ?? true,
          ],
        );
      }

      await dbInsertActivityLog(
        {
          shipment_id: params.shipmentId,
          action: 'Notification Contacts Updated',
          details: `Updated ${params.contacts.length} recipient${params.contacts.length !== 1 ? 's' : ''}`,
          performed_by: performer,
          performed_by_email: user.email,
        },
        client,
      );
    });

    return { success: true };
  } catch (err) {
    log.error('saveNotificationContacts.failed', err);
    return { success: false, error: 'Failed to save notification contacts.' };
  }
}
