'use server';

/* ─── Reading and creating shipments. Each read narrows to the caller's country scope. ─── */

import titePool from '@/lib/db-tite';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { AccessError } from '@/lib/require-access';
import {
  canEditTiteCountry,
  canViewTiteCountry,
  currentTiteUser,
  isTiteApproved,
  requireTiteUser,
  titeReadScope,
} from '@/lib/tite-auth';
import { formatTiteReference, titeCountryCode } from '@/lib/tite-constants';
import { ensureTiteSchema } from '@/lib/tite-documents';
import { alertLevelFor, shipmentAlertLevel } from '@/lib/tite-utils';
import type {
  Shipment,
  ShipmentStats,
  ShipmentStatus,
  TiteAnalyticsShipment,
  TiteListShipment,
} from '@/types/tite';
import { getCountryStakeholders } from '@/app/actions/tite/stakeholders';
import { effectiveCountryScope } from '@/lib/tite/access';
import { ANALYTICS_COLS, LIST_COLS, SELECT_COLS, log } from '@/lib/tite/internals';
import type { CreateShipmentInput } from '@/lib/tite/types';

/* ─── getAllShipments ─────────────────────────────────────────── */

export async function getAllShipments(approvedCountries?: string[]): Promise<Shipment[] | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope = effectiveCountryScope(user, approvedCountries);
    const filtered = scope !== null;
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS}
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}
       ORDER BY
         CASE alert_level
           WHEN 'overdue' THEN 1
           WHEN 'urgent'  THEN 2
           WHEN 'action'  THEN 3
           WHEN 'plan'    THEN 4
           WHEN 'info'    THEN 5
           WHEN 'ok'      THEN 6
           WHEN 'closed'  THEN 7
           ELSE 8
         END,
         COALESCE(extended_date, expiry_date) ASC NULLS LAST`,
      filtered ? [scope] : [],
    );
    // Recalculate alert_level from the effective date rather than trusting the
    // stored column, which only updates on create/extend/close and goes stale.
    const ALERT_ORDER: Record<string, number> = {
      overdue: 1,
      urgent: 2,
      action: 3,
      plan: 4,
      info: 5,
      ok: 6,
      closed: 7,
    };
    const fresh = rows.map((r) => ({ ...r, alert_level: shipmentAlertLevel(r) }));
    fresh.sort((a, b) => {
      const oa = ALERT_ORDER[a.alert_level] ?? 8;
      const ob = ALERT_ORDER[b.alert_level] ?? 8;
      if (oa !== ob) return oa - ob;
      const da = a.extended_date || a.expiry_date || '';
      const db = b.extended_date || b.expiry_date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return fresh;
  } catch (err) {
    log.error('getAllShipments.failed', err);
    return null;
  }
}

export async function getShipmentsForList(
  approvedCountries?: string[],
): Promise<TiteListShipment[] | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope = effectiveCountryScope(user, approvedCountries);
    const filtered = scope !== null;
    const { rows } = await titePool.query<TiteListShipment>(
      `SELECT ${LIST_COLS}
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}
       ORDER BY
         CASE alert_level
           WHEN 'overdue' THEN 1
           WHEN 'urgent'  THEN 2
           WHEN 'action'  THEN 3
           WHEN 'plan'    THEN 4
           WHEN 'info'    THEN 5
           WHEN 'ok'      THEN 6
           WHEN 'closed'  THEN 7
           ELSE 8
         END,
         COALESCE(extended_date, expiry_date) ASC NULLS LAST`,
      filtered ? [scope] : [],
    );
    const ALERT_ORDER: Record<string, number> = {
      overdue: 1,
      urgent: 2,
      action: 3,
      plan: 4,
      info: 5,
      ok: 6,
      closed: 7,
    };
    const fresh = rows.map((r) => ({ ...r, alert_level: shipmentAlertLevel(r) }));
    fresh.sort((a, b) => {
      const oa = ALERT_ORDER[a.alert_level] ?? 8;
      const ob = ALERT_ORDER[b.alert_level] ?? 8;
      if (oa !== ob) return oa - ob;
      const da = a.extended_date || a.expiry_date || '';
      const db = b.extended_date || b.expiry_date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return fresh;
  } catch (err) {
    log.error('getShipmentsForList.failed', err);
    return null;
  }
}

export async function getShipmentsForAnalytics(
  approvedCountries?: string[],
): Promise<TiteAnalyticsShipment[] | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope = effectiveCountryScope(user, approvedCountries);
    const filtered = scope !== null;
    const { rows } = await titePool.query<TiteAnalyticsShipment>(
      `SELECT ${ANALYTICS_COLS}
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}
       ORDER BY
         CASE alert_level
           WHEN 'overdue' THEN 1
           WHEN 'urgent'  THEN 2
           WHEN 'action'  THEN 3
           WHEN 'plan'    THEN 4
           WHEN 'info'    THEN 5
           WHEN 'ok'      THEN 6
           WHEN 'closed'  THEN 7
           ELSE 8
         END,
         COALESCE(extended_date, expiry_date) ASC NULLS LAST`,
      filtered ? [scope] : [],
    );
    const ALERT_ORDER: Record<string, number> = {
      overdue: 1,
      urgent: 2,
      action: 3,
      plan: 4,
      info: 5,
      ok: 6,
      closed: 7,
    };
    const fresh = rows.map((r) => ({ ...r, alert_level: shipmentAlertLevel(r) }));
    fresh.sort((a, b) => {
      const oa = ALERT_ORDER[a.alert_level] ?? 8;
      const ob = ALERT_ORDER[b.alert_level] ?? 8;
      if (oa !== ob) return oa - ob;
      const da = a.extended_date || a.expiry_date || '';
      const db = b.extended_date || b.expiry_date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return fresh;
  } catch (err) {
    log.error('getShipmentsForAnalytics.failed', err);
    return null;
  }
}

/* ─── getShipmentById ─────────────────────────────────────────── */

export async function getShipmentById(id: number): Promise<Shipment | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS} FROM shipments WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    // Country scope: an out-of-scope row is indistinguishable from a missing one.
    if (!canViewTiteCountry(user, r.country)) return null;
    return { ...r, alert_level: shipmentAlertLevel(r) };
  } catch (err) {
    log.error('getShipmentById.failed', err);
    return null;
  }
}

/* ─── createShipment ──────────────────────────────────────────── */

export async function createShipment(input: CreateShipmentInput): Promise<{ id: number } | null> {
  const user = await requireTiteUser();
  // The country decides who may create the row, so it is validated before any work.
  if (!canEditTiteCountry(user, input.country)) {
    throw new AccessError('You cannot create shipments for this country.');
  }
  try {
    const createdBy = user.name;

    const status: ShipmentStatus = 'Open';
    const alert_level = alertLevelFor(input.expiry_date, input.extended_date, status);

    /* Reference numbers are `<country code>-<per-country sequence>` (e.g. OMN-020).
       The advisory lock serialises concurrent creates for the same country so two
       callers cannot compute the same sequence and trip the unique index. */
    const countryCode = titeCountryCode(input.country);

    /* Read on the pool before the transaction opens: this carries its own access
       check, and nothing about a read needs to roll back. */
    const stakeholders = input.country ? await getCountryStakeholders(input.country) : [];

    /* The activity-log column is added outside the transaction: an ALTER that ran
       inside it would abort the shipment insert on the first call after deploy. */
    await ensureTiteSchema();

    /* The shipment row, its notification contacts and its creation log entry all
       commit together — a shipment with no recipients would be silently missed by
       the expiry alerts. */
    const shipmentId = await withTransaction(titePool, async (client) => {
      await lockForTransaction(client, `tite_ref_${countryCode}`);

      const { rows: seqRows } = await client.query<{ next_no: number }>(
        `SELECT COALESCE(MAX((regexp_replace(reference_number, '^[A-Z]+-', ''))::int), 0) + 1 AS next_no
           FROM shipments
          WHERE reference_number ~ ('^' || $1 || '-[0-9]+$')`,
        [countryCode],
      );
      const reference_number = formatTiteReference(countryCode, Number(seqRows[0].next_no));

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO shipments (
        reference_number, segment, from_country, to_country,
        invoice_number, invoice_value_usd, customs_reference_number, description,
        mot, awb_number, po_number, movement_type,
        import_date, expiry_date, extended_date,
        deposit_usd, comments, customs_docs_location, status, alert_level,
        country, created_by
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22
      ) RETURNING id`,
        [
          reference_number,
          input.segment ?? null,
          input.from_country ?? null,
          input.to_country ?? null,
          input.invoice_number ?? null,
          input.invoice_value_usd ?? null,
          input.customs_reference_number ?? null,
          input.description ?? null,
          input.mot ?? null,
          input.awb_number ?? null,
          input.po_number ?? null,
          input.movement_type,
          input.import_date ?? null,
          input.expiry_date ?? null,
          input.extended_date ?? null,
          input.deposit_usd ?? null,
          input.comments ?? null,
          input.customs_docs_location ?? null,
          status,
          alert_level,
          input.country ?? null,
          createdBy,
        ],
      );
      const newId = rows[0].id;

      /* ─── Insert notification contacts ─── */
      const allTrue = [true, true, true, true, true, true, true, true];
      const insertContact = (
        email: string | null,
        name: string | null,
        role: string | null,
        prefs?: boolean[],
      ) =>
        client.query(
          `INSERT INTO shipment_notification_contacts
             (shipment_id, email, name, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [newId, email, name, role, ...(prefs ?? allTrue)],
        );

      // 1. Country stakeholders
      for (const s of stakeholders) {
        await insertContact(s.email, s.name, s.role);
      }

      // 2. Creator — identity comes from the session, never from the payload.
      await insertContact(user.email, createdBy, 'Creator');

      // 3. Additional contacts (use per-contact prefs if provided, else default all true)
      for (const c of input.additionalContacts ?? []) {
        if (!c.email) continue;
        const prefs = [
          c.notify_60_days ?? true,
          c.notify_30_days ?? true,
          c.notify_14_days ?? true,
          c.notify_7_days ?? true,
          c.notify_2_days ?? true,
          c.notify_1_day ?? true,
          c.notify_0_day ?? true,
          c.notify_overdue ?? true,
        ];
        await insertContact(c.email, c.name || null, c.role || null, prefs);
      }

      await client.query(
        `INSERT INTO shipment_activity_log
           (shipment_id, action, details, performed_by, performed_by_email)
         VALUES ($1, 'created', 'Shipment created via portal', $2, $3)`,
        [newId, createdBy, user.email],
      );

      return newId;
    });

    return { id: shipmentId };
  } catch (err) {
    log.error('createShipment.failed', err);
    return null;
  }
}

/* ─── getShipmentStats ────────────────────────────────────────── */

export async function getShipmentStats(
  approvedCountries?: string[],
): Promise<ShipmentStats | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope = effectiveCountryScope(user, approvedCountries);
    const filtered = scope !== null;
    const { rows } = await titePool.query(
      `SELECT
        COUNT(*)                    FILTER (WHERE status NOT IN ('Closed', 'Closed - Refund Recovered'))                               AS active_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'overdue')                                                             AS overdue_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'urgent')                                                              AS urgent_count,
        COUNT(*)                    FILTER (WHERE alert_level IN ('action','plan'))                                                    AS action_count,
        COALESCE(SUM(deposit_usd)   FILTER (WHERE status NOT IN ('Closed', 'Closed - Refund Recovered')), 0)                          AS total_deposit_usd,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%import%' AND status NOT IN ('Closed', 'Closed - Refund Recovered')) AS import_count,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%export%' AND status NOT IN ('Closed', 'Closed - Refund Recovered')) AS export_count
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}`,
      filtered ? [scope] : [],
    );
    const r = rows[0];
    return {
      active_count: Number(r.active_count),
      overdue_count: Number(r.overdue_count),
      urgent_count: Number(r.urgent_count),
      action_count: Number(r.action_count),
      total_deposit_usd: Number(r.total_deposit_usd),
      import_count: Number(r.import_count),
      export_count: Number(r.export_count),
    };
  } catch (err) {
    log.error('getShipmentStats.failed', err);
    return null;
  }
}

/* ─── getAllTiteCountries ─────────────────────────────────────── */

export async function getAllTiteCountries(): Promise<string[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    const scope = titeReadScope(user);
    const { rows } = await titePool.query(
      `SELECT DISTINCT country FROM shipments
        WHERE country IS NOT NULL
        ${scope === null ? '' : 'AND country = ANY($1::text[])'}
        ORDER BY country`,
      scope === null ? [] : [scope],
    );
    return rows.map((r) => String(r.country));
  } catch (err) {
    log.error('getAllTiteCountries.failed', err);
    return [];
  }
}
