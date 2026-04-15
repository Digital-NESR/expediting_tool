'use server';

import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import type { PurchaseOrder } from '@/types/po';

/* ─── Internal shape: a group after DB insert, holding its token ── */
interface PreparedGroup {
  supplierName: string;
  supplierId: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  /** Raw template — {Supplier Name} and {Supplier Link} substituted at webhook-build time */
  emailBody: string;
  expediteToken: string;
  poLines: Array<{
    po_number: string;
    po_line: string;
    item_description: string;
    open_qty: number;
    open_po_value_usd: number;
    delivery_date: string;
  }>;
}

export interface SupplierDispatchParams {
  supplierId: string;
  supplierName: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  /** Raw template — {Supplier Name} and {Supplier Link} will be substituted here */
  emailBodyTemplate: string;
  items: PurchaseOrder[];
}

export interface DispatchResult {
  supplierName: string;
  success: boolean;
  error?: string;
}

export async function prepareExpediteDispatch(
  params: SupplierDispatchParams
): Promise<DispatchResult> {
  const { supplierName, toEmails, ccEmails, subject, emailBodyTemplate, items } = params;

  const token = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const supplierLink = `${appUrl}/supplier-update?token=${token}`;

  const emailBody = emailBodyTemplate
    .replace(/\{Supplier Name\}/g, supplierName)
    .replace(/\{Supplier Link\}/g, supplierLink);

  try {
    /* ── DB inserts — idempotent ─────────────────────────── */
    for (const item of items) {
      const existing = await pool.query(
        `SELECT 1 FROM active_expediting
         WHERE po_number = $1 AND po_line = $2 AND workflow_state = 'Email Sent'`,
        [item['PO Number'], item['PO Line'] ?? '']
      );

      if (existing.rows.length > 0) continue;

      await pool.query(
        `INSERT INTO active_expediting
           (po_number, po_line, expedite_token, workflow_state, current_status, created_at)
         VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response', NOW())`,
        [item['PO Number'], item['PO Line'] ?? '', token]
      );
    }

    /* ── n8n webhook ─────────────────────────────────────── */
    const webhookUrl = process.env.N8N_EXPEDITE_WEBHOOK_URL;
    if (webhookUrl) {
      const payload = {
        supplierName,
        toEmails,
        ccEmails,
        subject,
        emailBody,
        supplierLink,
        poLines: items.map((i) => ({
          poNumber: i['PO Number'],
          poLine: i['PO Line'] ?? '',
          description: i['Item Description'],
          openQty: Number(i['Open QTY'] ?? 0),
          valueUsd: Number(i['Open PO Value USD'] ?? 0),
          deliveryDate: i['Delivery Date'] ?? '',
        })),
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`n8n webhook responded with ${res.status} ${res.statusText}`);
      }
    } else {
      console.warn('[prepareExpediteDispatch] N8N_EXPEDITE_WEBHOOK_URL is not set — skipping webhook.');
    }

    return { supplierName, success: true };
  } catch (err) {
    console.error('[prepareExpediteDispatch]', err);
    return {
      supplierName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ─────────────────────────────────────────────────────────────────
 * Bulk dispatch: DB-inserts ALL supplier groups, then fires a single
 * fire-and-forget webhook to n8n with the full payload array.
 * ──────────────────────────────────────────────────────────────── */
export async function prepareAllExpediteDispatches(
  paramsList: SupplierDispatchParams[]
): Promise<DispatchResult[]> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const results: DispatchResult[] = [];
  const preparedGroups: PreparedGroup[] = [];

  /* ── Phase 1: DB inserts for every supplier group ── */
  for (const params of paramsList) {
    const { supplierId, supplierName, toEmails, ccEmails, subject, emailBodyTemplate, items } = params;
    const token = randomUUID();

    try {
      for (const item of items) {
        const existing = await pool.query(
          `SELECT 1 FROM active_expediting
           WHERE po_number = $1 AND po_line = $2 AND workflow_state = 'Email Sent'`,
          [item['PO Number'], item['PO Line'] ?? '']
        );

        if (existing.rows.length > 0) continue;

        await pool.query(
          `INSERT INTO active_expediting
             (po_number, po_line, expedite_token, workflow_state, current_status, created_at)
           VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response', NOW())`,
          [item['PO Number'], item['PO Line'] ?? '', token]
        );
      }

      preparedGroups.push({
        supplierName,
        supplierId,
        toEmails,
        ccEmails,
        subject,
        emailBody: emailBodyTemplate,
        expediteToken: token,
        poLines: items.map((i) => ({
          po_number: i['PO Number'],
          po_line: i['PO Line'] ?? '',
          item_description: i['Item Description'],
          open_qty: Number(i['Open QTY'] ?? 0),
          open_po_value_usd: Number(i['Open PO Value USD'] ?? 0),
          delivery_date: i['Delivery Date'] ?? '',
        })),
      });

      results.push({ supplierName, success: true });
    } catch (err) {
      console.error('[prepareAllExpediteDispatches] DB error for', supplierName, err);
      results.push({
        supplierName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /* ── Phase 2: single fire-and-forget webhook after all DB inserts ── */
  if (preparedGroups.length > 0) {
    const webhookUrl = process.env.N8N_EXPEDITE_WEBHOOK_URL;
    if (webhookUrl) {
      const webhookPayload = preparedGroups.map((group) => ({
        supplierName: group.supplierName,
        supplierId: group.supplierId,
        toEmails: group.toEmails,
        ccEmails: group.ccEmails,
        subject: group.subject,
        emailBody: group.emailBody
          .replace('{Supplier Name}', group.supplierName)
          .replace('{Supplier Link}', `${appUrl}/supplier-update?token=${group.expediteToken}`),
        supplierLink: `${appUrl}/supplier-update?token=${group.expediteToken}`,
        poLines: group.poLines.map((line) => ({
          poNumber: line.po_number,
          poLine: line.po_line,
          description: line.item_description,
          openQty: line.open_qty,
          valueUsd: line.open_po_value_usd,
          deliveryDate: line.delivery_date,
        })),
      }));

      fetch(process.env.N8N_EXPEDITE_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      }).catch((err) => {
        console.error('n8n webhook call failed:', err);
      });
    } else {
      console.warn('[prepareAllExpediteDispatches] N8N_EXPEDITE_WEBHOOK_URL is not set — skipping webhook.');
    }
  }

  return results;
}
