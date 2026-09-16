'use server';

/* ─── Moving a shipment through its statuses, and the activity log that records each move. ─── */

import titePool from '@/lib/db-tite';
import { forbidden } from '@/lib/require-access';
import { currentTiteUser, isTiteApproved, requireTiteUser } from '@/lib/tite-auth';
import { dbGetActivityLog, dbUpdateShipmentWithLog } from '@/lib/tite-documents';
import { getNextStatusOptions } from '@/lib/tite-stage-config';
import { alertLevelFor } from '@/lib/tite-utils';
import type { ActivityLogRow } from '@/types/tite';
import { canReadShipment, denyShipmentEdit } from '@/lib/tite/access';
import { log } from '@/lib/tite/internals';

/* ─── getShipmentActivityLog ──────────────────────────────────── */

export async function getShipmentActivityLog(shipmentId: number): Promise<ActivityLogRow[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
    return await dbGetActivityLog(shipmentId);
  } catch (err) {
    log.error('getShipmentActivityLog.failed', err);
    return [];
  }
}

/* ─── extendShipment ──────────────────────────────────────────── */

export async function extendShipment(params: {
  shipmentId: number;
  extendedDate: string;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    const newAlertLevel = alertLevelFor(undefined, params.extendedDate, 'Open - Extended');

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        extended_date: params.extendedDate,
        status: 'Open - Extended',
        alert_level: newAlertLevel,
      },
      action: 'extended',
      details: `Extended to ${params.extendedDate}${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
      performed_by_email: user.email,
    });
    return { success: true };
  } catch (err) {
    log.error('extendShipment.failed', err);
    return { success: false, error: 'Failed to extend shipment.' };
  }
}

/* ─── closeShipment ───────────────────────────────────────────── */

export async function closeShipment(params: {
  shipmentId: number;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status: 'Closed',
        alert_level: 'closed',
      },
      action: 'closed',
      details: `File closed${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
      performed_by_email: user.email,
    });
    return { success: true };
  } catch (err) {
    log.error('closeShipment.failed', err);
    return { success: false, error: 'Failed to close shipment.' };
  }
}

/* ─── markRefundReceived ──────────────────────────────────────── */

export async function markRefundReceived(params: {
  shipmentId: number;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status: 'Closed - Refund Recovered',
        alert_level: 'closed',
      },
      action: 'refund_received',
      details: `Customs refund recovered${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
      performed_by_email: user.email,
    });
    return { success: true };
  } catch (err) {
    log.error('markRefundReceived.failed', err);
    return { success: false, error: 'Failed to mark refund received.' };
  }
}

/* ─── updateShipmentStatus ────────────────────────────────────── */

export async function updateShipmentStatus(params: {
  shipmentId: number;
  newStatus: string;
  newExpiryDate?: string | null;
  extensionNotes?: string | null;
  closureNotes?: string | null;
  refundAmountUsd?: number | null;
  refundDate?: string | null;
  refundNotes?: string | null;
  depositUsd?: number | null;
  justification?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    /* The modal only offers the transitions in STATUS_TRANSITIONS; the same map is
       enforced here so a hand-crafted POST cannot skip a step (re-opening a closed
       file, or jumping straight to a refund). */
    const { rows: currentRows } = await titePool.query<{ status: string | null }>(
      `SELECT status FROM shipments WHERE id = $1`,
      [params.shipmentId],
    );
    if (!currentRows[0]) return { success: false, error: 'Shipment not found.' };
    if (!getNextStatusOptions(currentRows[0].status ?? '').includes(params.newStatus)) {
      return { success: false, error: 'Invalid status transition.' };
    }

    const fields: Record<string, unknown> = {
      status: params.newStatus,
      last_updated_by: performer,
    };

    const detailLines: string[] = [`Status → ${params.newStatus}`];

    if (params.newStatus === 'Open - Extended') {
      if (!params.newExpiryDate) {
        return { success: false, error: 'New expiry date is required.' };
      }
      fields.extended_date = params.newExpiryDate;
      fields.alert_level = alertLevelFor(undefined, params.newExpiryDate, 'Open - Extended');
      detailLines.push(`New expiry: ${params.newExpiryDate}`);
      if (params.extensionNotes) detailLines.push(`Notes: ${params.extensionNotes}`);
    } else if (params.newStatus === 'Closed') {
      fields.alert_level = 'closed';
      if (params.closureNotes) detailLines.push(`Notes: ${params.closureNotes}`);
    } else if (params.newStatus === 'Closed - Refund Recovered') {
      fields.alert_level = 'closed';
      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
      if (params.refundAmountUsd != null)
        detailLines.push(`Refund: ${fmt(params.refundAmountUsd)}`);
      if (params.depositUsd != null)
        detailLines.push(`Original deposit: ${fmt(params.depositUsd)}`);
      if (params.justification) detailLines.push(`Justification: ${params.justification}`);
      if (params.refundDate) detailLines.push(`Refund date: ${params.refundDate}`);
      if (params.refundNotes) detailLines.push(`Notes: ${params.refundNotes}`);
    } else {
      return { success: false, error: 'Invalid status transition.' };
    }

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields,
      action: 'Status Updated',
      details: detailLines.join('\n'),
      performed_by: performer,
      performed_by_email: user.email,
    });

    return { success: true };
  } catch (err) {
    log.error('updateShipmentStatus.failed', err);
    return { success: false, error: 'Failed to update status. Please try again.' };
  }
}
