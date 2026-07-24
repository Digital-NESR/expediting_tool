'use server';

import { randomUUID } from 'crypto';
import https from 'https';
import { getServerSession } from '@/lib/auth';
import pool from '@/lib/db';
import { authOptions } from '@/lib/auth';
import type { PurchaseOrder } from '@/types/po';

function httpsPost(url: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  const parsedUrl = new URL(url);

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 443,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    rejectUnauthorized: false,
  };

  const req = https.request(options, (res) => {
    console.log('n8n webhook response status:', res.statusCode);
  });

  req.on('error', (err) => {
    console.error('n8n webhook failed:', err.message);
  });

  req.write(data);
  req.end();
}

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
    po_release_date: string | null;
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

  /* ── Session / user identity ── */
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? 'unknown';
  const userName = session?.user?.name ?? 'Unknown';
  const userJobTitle = session?.user?.jobTitle ?? null;
  const userDepartment = session?.user?.department ?? null;
  const userCountry = session?.user?.country ?? null;

  await pool.query(
    `INSERT INTO user_profiles
       (email, display_name, job_title, department, country, last_active_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email) DO UPDATE SET
       display_name   = EXCLUDED.display_name,
       job_title      = EXCLUDED.job_title,
       department     = EXCLUDED.department,
       country        = EXCLUDED.country,
       last_active_at = NOW()`,
    [userEmail, userName, userJobTitle, userDepartment, userCountry]
  );

  /* ── Single UUID that ties every row in this batch together ── */
  const sessionRef = randomUUID();

  /* ── Phase 1: DB inserts for every supplier group ── */
  for (const params of paramsList) {
    const { supplierId, supplierName, toEmails, ccEmails, subject, emailBodyTemplate, items } = params;
    const token = randomUUID();

    try {
      for (const item of items) {
        await pool.query(
          `INSERT INTO active_expediting
             (po_number, po_line, expedite_token, workflow_state,
              current_status, dispatched_by, dispatched_at,
              session_ref, created_at, updated_at)
           VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response',
                   $4, NOW(), $5, NOW(), NOW())
           ON CONFLICT (po_number, po_line)
           DO UPDATE SET
             expedite_token    = EXCLUDED.expedite_token,
             workflow_state    = 'Email Sent',
             current_status    = 'Pending Supplier Response',
             new_delivery_date = NULL,
             supplier_comments = NULL,
             buyer_comments    = NULL,
             dispatched_by     = EXCLUDED.dispatched_by,
             dispatched_at     = NOW(),
             session_ref       = EXCLUDED.session_ref,
             updated_at        = NOW()`,
          [item['PO Number'], item['PO Line'] ?? '', token, userEmail, sessionRef]
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
          po_release_date: i['PO Release Date'] ?? null,
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

  /* ── Record the dispatch session ── */
  if (preparedGroups.length > 0) {
    const totalPoLines = preparedGroups.reduce((sum, g) => sum + g.poLines.length, 0);
    const totalEmailsSent = preparedGroups.reduce((sum, g) => sum + g.toEmails.length, 0);
    await pool.query(
      `INSERT INTO expediting_sessions
         (session_ref, dispatched_by, dispatched_at,
          total_suppliers, total_po_lines, total_emails_sent)
       VALUES ($1, $2, NOW(), $3, $4, $5)`,
      [sessionRef, userEmail, preparedGroups.length, totalPoLines, totalEmailsSent]
    );
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
          .replace('{Supplier Name}', group.supplierName),
        supplierLink: `${appUrl}/supplier-update?token=${group.expediteToken}`,
        poLines: group.poLines.map((line) => ({
          poNumber: line.po_number,
          poLine: line.po_line,
          description: line.item_description
            ? line.item_description.slice(0, 50)
            : '',
          openQty: line.open_qty,
          valueUsd: line.open_po_value_usd,
          deliveryDate: line.delivery_date,
          releaseDate: line.po_release_date ?? null,
        })),
      }));

      console.log('Firing n8n webhook to:', process.env.N8N_EXPEDITE_WEBHOOK_URL);
      console.log('Payload supplier count:', webhookPayload.length);
      httpsPost(process.env.N8N_EXPEDITE_WEBHOOK_URL!, webhookPayload);
    } else {
      console.warn('[prepareAllExpediteDispatches] N8N_EXPEDITE_WEBHOOK_URL is not set — skipping webhook.');
    }
  }

  return results;
}
