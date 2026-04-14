'use server';

import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import type { PurchaseOrder } from '@/types/po';

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
