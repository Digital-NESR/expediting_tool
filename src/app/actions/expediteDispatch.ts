'use server';

import { randomUUID } from 'crypto';
import https from 'https';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';
import { authOptions } from '@/lib/auth';
import type { PurchaseOrder } from '@/types/po';

interface WebhookResult { ok: boolean; status?: number; error?: string }

/**
 * POST the payload to n8n and RESOLVE only when the request actually finishes
 * (response end / error / timeout). It is awaited by the Server Action so the
 * serverless instance stays alive until the webhook truly fires — the previous
 * fire-and-forget version returned before the request left the box, which is why
 * the webhook intermittently never ran. Never rejects; returns a result object.
 */
function httpsPostOnce(url: string, payload: unknown): Promise<WebhookResult> {
  return new Promise((resolve) => {
    let data: string;
    try {
      data = JSON.stringify(payload);
    } catch (err) {
      console.error('[Webhook] JSON.stringify failed:', err);
      resolve({ ok: false, error: 'stringify-failed' });
      return;
    }

    const payloadSizeKB = Math.round(Buffer.byteLength(data) / 1024);
    const supplierCount = Array.isArray(payload) ? payload.length : 1;

    console.log('[Webhook] ========== DISPATCH START ==========');
    console.log('[Webhook] URL:', url);
    console.log('[Webhook] Payload size:', payloadSizeKB, 'KB');
    console.log('[Webhook] Supplier count:', supplierCount);
    console.log('[Webhook] Timestamp:', new Date().toISOString());

    if (!url) {
      console.error('[Webhook] ERROR: URL is undefined or empty!');
      console.error('[Webhook] N8N_EXPEDITE_WEBHOOK_URL env var is not set');
      resolve({ ok: false, error: 'no-url' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      console.error('[Webhook] ERROR: Invalid URL:', url, err);
      resolve({ ok: false, error: 'invalid-url' });
      return;
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'NESR-SC-Agents/1.0',
      },
      rejectUnauthorized: false,
      timeout: 15000,
    };

    console.log('[Webhook] Connecting to:', options.hostname, 'port:', options.port);

    let settled = false;
    const done = (r: WebhookResult) => { if (!settled) { settled = true; resolve(r); } };

    const req = https.request(options, (res) => {
      console.log('[Webhook] Response status:', res.statusCode);
      console.log('[Webhook] Response headers:', JSON.stringify(res.headers));
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        console.log('[Webhook] Response body:', responseData.slice(0, 500));
        const ok = !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
        if (ok) console.log('[Webhook] ========== DISPATCH SUCCESS ==========');
        else console.error('[Webhook] Non-2xx response:', res.statusCode);
        done({ ok, status: res.statusCode });
      });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[Webhook] ========== DISPATCH ERROR ==========');
      console.error('[Webhook] Error message:', err.message);
      console.error('[Webhook] Error code:', err.code);
      console.error('[Webhook] Error syscall:', err.syscall);
      if (err.code === 'ECONNREFUSED') console.error('[Webhook] DIAGNOSIS: n8n server refused connection. Is n8n running?');
      else if (err.code === 'ENOTFOUND') console.error('[Webhook] DIAGNOSIS: DNS lookup failed for:', options.hostname);
      else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') console.error('[Webhook] DIAGNOSIS: SSL certificate issue');
      else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') console.error('[Webhook] DIAGNOSIS: Connection timed out after 15s');
      else if (err.code === 'ECONNRESET') console.error('[Webhook] DIAGNOSIS: Connection reset - payload may be too large');
      done({ ok: false, error: err.code || err.message });
    });

    req.on('timeout', () => {
      console.error('[Webhook] ========== TIMEOUT ==========');
      console.error('[Webhook] Request timed out after 15 seconds');
      console.error('[Webhook] Payload size was:', payloadSizeKB, 'KB');
      req.destroy(new Error('Request timeout after 15s'));
      done({ ok: false, error: 'timeout' });
    });

    try {
      req.write(data);
      req.end();
      console.log('[Webhook] Request sent successfully');
    } catch (err) {
      console.error('[Webhook] Failed to write/send request:', err);
      done({ ok: false, error: 'write-failed' });
    }
  });
}

/** Awaited retry: one immediate attempt, then a second after 3s if the first failed. */
async function httpsPostWithRetry(url: string, payload: unknown, maxAttempts = 2): Promise<WebhookResult> {
  let last: WebhookResult = { ok: false, error: 'not-attempted' };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Webhook] Attempt ${attempt} of ${maxAttempts}`);
    last = await httpsPostOnce(url, payload);
    if (last.ok) return last;
    console.error(`[Webhook] Attempt ${attempt} failed:`, last.error);
    if (attempt < maxAttempts) {
      console.log('[Webhook] Retrying in 3 seconds...');
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      console.error('[Webhook] All retry attempts exhausted');
    }
  }
  return last;
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

/** Status of the single n8n webhook call that actually sends the emails. */
export interface WebhookStatus {
  /** The webhook URL was configured and a call was attempted. */
  triggered: boolean;
  /** The webhook call completed with a 2xx response. */
  ok: boolean;
  payloadSizeKB: number;
  suppliers: number;
  message: string;
}

export interface DispatchResponse {
  results: DispatchResult[];
  webhook: WebhookStatus;
}

/* ─────────────────────────────────────────────────────────────────
 * Bulk dispatch: DB-inserts ALL supplier groups, then fires a single
 * fire-and-forget webhook to n8n with the full payload array.
 * ──────────────────────────────────────────────────────────────── */
export async function prepareAllExpediteDispatches(
  paramsList: SupplierDispatchParams[]
): Promise<DispatchResponse> {
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
              session_ref, supplier_name, supplier_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response',
                   $4, NOW(), $5, $6, $7, NOW(), NOW())
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
             supplier_name     = EXCLUDED.supplier_name,
             supplier_id       = EXCLUDED.supplier_id,
             updated_at        = NOW()`,
          [item['PO Number'], item['PO Line'] ?? '', token, userEmail, sessionRef,
           supplierName || null, supplierId || null]
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

  /* ── Phase 2: single AWAITED webhook after all DB inserts ── */
  let webhook: WebhookStatus = {
    triggered: false, ok: false, payloadSizeKB: 0, suppliers: preparedGroups.length,
    message: 'No suppliers to notify.',
  };

  if (preparedGroups.length > 0) {
    const webhookUrl = process.env.N8N_EXPEDITE_WEBHOOK_URL;

    // Payload contents left intact: n8n renders emailBody as the email and the full
    // poLines fields (description/qty/value/dates) as the PO table.
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

    const payloadSizeKB = Math.round(Buffer.byteLength(JSON.stringify(webhookPayload)) / 1024);

    console.log('[Dispatch] All DB inserts complete');
    console.log('[Dispatch] Preparing webhook payload...');
    console.log('[Dispatch] N8N_EXPEDITE_WEBHOOK_URL:', webhookUrl ? 'SET' : 'NOT SET');
    webhookPayload.forEach((supplier, i) => {
      const size = Math.round(Buffer.byteLength(JSON.stringify(supplier)) / 1024);
      console.log(`[Dispatch] Supplier ${i + 1}: ${supplier.supplierName} — ${size}KB`);
    });
    console.log('[Dispatch] Total payload:', payloadSizeKB, 'KB');
    if (payloadSizeKB > 5000) {
      console.warn('[Dispatch] WARNING: Payload exceeds 5MB — may cause issues');
    }

    if (!webhookUrl) {
      console.error('[Dispatch] N8N_EXPEDITE_WEBHOOK_URL not set — emails will NOT be sent');
      webhook = {
        triggered: false, ok: false, payloadSizeKB, suppliers: webhookPayload.length,
        message: 'DB records created but webhook URL not configured — emails not sent.',
      };
    } else {
      const res = await httpsPostWithRetry(webhookUrl, webhookPayload);
      webhook = {
        triggered: true, ok: res.ok, payloadSizeKB, suppliers: webhookPayload.length,
        message: res.ok
          ? 'Emails dispatched successfully.'
          : `Webhook call failed (${res.error ?? `status ${res.status ?? 'unknown'}`}). Emails may not have been sent.`,
      };
    }
  }

  return { results, webhook };
}
