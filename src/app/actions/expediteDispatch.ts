'use server';

import { randomUUID } from 'crypto';
import https from 'https';
import { getServerSession } from 'next-auth';
import pool from '@/lib/db';
import { withTransaction, lockForTransaction } from '@/lib/db/tx';
import { authOptions } from '@/lib/auth';
import { normalizeEmail } from '@/lib/require-access';
import { ensureActiveExpeditingColumns } from '@/lib/po-expediting-schema';
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

/* ─── Server-side input limits ────────────────────────────────── */
const MAX_RECIPIENTS_PER_FIELD = 50;
const MAX_SUBJECT_LEN = 300;
const MAX_BODY_LEN = 20000;
/** Deliberately conservative: no display names, no commas/semicolons/angle brackets. */
const EMAIL_RE = /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]{2,}$/;

/**
 * Drop anything that is not a plain, syntactically valid address, de-duplicate
 * case-insensitively and cap the count. The dispatch UI lets a buyer type an
 * arbitrary To/CC address (and CC always carries buyer + employee-search
 * addresses), so recipients are validated for syntax rather than restricted to
 * a fixed allow-list.
 */
function sanitizeRecipients(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = String(raw ?? '').trim();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
    if (out.length >= MAX_RECIPIENTS_PER_FIELD) break;
  }
  return out;
}

/** Row shape re-read from sap_open_po_master — the only trusted source of line data. */
interface MasterLine {
  po_number: string;
  po_line: string | null;
  item_description: string | null;
  open_qty: string | number | null;
  open_po_value_usd: string | number | null;
  delivery_date: Date | string | null;
  po_release_date: Date | string | null;
  supplier_name: string | null;
  supplier_id: string | null;
  country: string | null;
  p_group: string | null;
}

function lineKey(poNumber: unknown, poLine: unknown): string {
  return `${String(poNumber ?? '')}\u0000${String(poLine ?? '')}`;
}

/** Match the ISO form the client previously sent (JSON-serialised Date). */
function isoDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function deniedResponse(
  paramsList: SupplierDispatchParams[],
  message: string
): DispatchResponse {
  const groups = Array.isArray(paramsList) ? paramsList : [];
  return {
    results: groups.map((p) => ({
      supplierName: p?.supplierName ?? 'Unknown Supplier',
      success: false,
      error: message,
    })),
    webhook: {
      triggered: false, ok: false, payloadSizeKB: 0, suppliers: 0, message,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────
 * Bulk dispatch: DB-inserts ALL supplier groups, then fires a single
 * fire-and-forget webhook to n8n with the full payload array.
 *
 * This is a public POST endpoint that sends email, so nothing the client
 * supplies is trusted: the caller must have approved PO Expediting access,
 * every PO line is re-read from sap_open_po_master under the caller's own
 * country scope (mirroring /api/pos), and recipients/subject/body are
 * validated and capped server-side.
 * ──────────────────────────────────────────────────────────────── */
export async function prepareAllExpediteDispatches(
  paramsList: SupplierDispatchParams[]
): Promise<DispatchResponse> {
  /* ── Access gate: identity and country scope come from the session only ── */
  const session = await getServerSession(authOptions);
  const sessionEmail = normalizeEmail(session?.user?.email);
  const isAdmin = session?.user?.isAdmin === true;
  const poAccess = session?.user?.toolAccess?.po_expediting;
  const approvedCountries = poAccess?.approvedCountries ?? [];

  if (!sessionEmail) return deniedResponse(paramsList, 'Sign in required.');
  if (!isAdmin && !(poAccess?.status === 'approved' && approvedCountries.length > 0)) {
    return deniedResponse(paramsList, 'Access denied.');
  }

  const groupsIn = Array.isArray(paramsList) ? paramsList : [];
  if (groupsIn.length === 0) return deniedResponse(groupsIn, 'No suppliers to notify.');

  /* Snapshot columns must exist before the inserts below write them. Runs its DDL
     at most once per process and deliberately OUTSIDE the transaction — an ALTER
     TABLE on a second connection would block on the transaction's own locks. */
  await ensureActiveExpeditingColumns();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const results: DispatchResult[] = [];
  const preparedGroups: PreparedGroup[] = [];

  /* ── Session / user identity ── */
  const userEmail = sessionEmail;
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

  /* ── Re-read every requested PO line from the master, under the caller's
        country scope. Client-supplied line data is used only to name the
        (po_number, po_line) pairs; everything written or emailed comes from
        these rows, so a caller cannot email lines outside their countries or
        forge descriptions, quantities and values. ── */
  const requestedPoNumbers: string[] = [];
  const requestedPoLines: string[] = [];
  for (const params of groupsIn) {
    for (const item of Array.isArray(params?.items) ? params.items : []) {
      requestedPoNumbers.push(String(item?.['PO Number'] ?? ''));
      requestedPoLines.push(String(item?.['PO Line'] ?? ''));
    }
  }

  const masterByKey = new Map<string, MasterLine>();
  if (requestedPoNumbers.length > 0) {
    const masterRows = await pool.query<MasterLine>(
      `SELECT s.po_number, s.po_line, s.item_description, s.open_qty,
              s.open_po_value_usd, s.delivery_date, s.po_release_date,
              s.supplier_name, s.supplier_id, s.country, s.p_group
         FROM sap_open_po_master s
         JOIN unnest($1::text[], $2::text[]) AS req(po_number, po_line)
           ON s.po_number = req.po_number
          AND COALESCE(s.po_line, '') = req.po_line
        ${isAdmin ? '' : 'WHERE s.country = ANY($3)'}`,
      isAdmin
        ? [requestedPoNumbers, requestedPoLines]
        : [requestedPoNumbers, requestedPoLines, approvedCountries]
    );
    for (const row of masterRows.rows) {
      masterByKey.set(lineKey(row.po_number, row.po_line ?? ''), row);
    }
  }

  /* The (po_number, po_line) pairs the caller is actually allowed to write —
     used below to find which earlier sessions currently own these lines. */
  const verifiedPoNumbers: string[] = [];
  const verifiedPoLines: string[] = [];
  for (const row of masterByKey.values()) {
    verifiedPoNumbers.push(row.po_number);
    verifiedPoLines.push(row.po_line ?? '');
  }

  /* ── Phase 1: every DB write for this dispatch, in ONE transaction ──
     The line rows and the expediting_sessions row that counts them must commit
     together: previously the session row was inserted on the pool after the
     lines, so a failure in between left lines with no session (or, if the line
     inserts partly failed, a session whose counters described rows that were
     never written). Per-supplier failures still degrade to a per-supplier error
     via SAVEPOINT, exactly as the per-group try/catch did before. ── */
  await withTransaction(pool, async (client) => {
    /* Read-then-write: we record which sessions own these lines, move the lines
       to the new session, then recompute the old sessions' counters. Two
       dispatches racing over the same line would each miss the other's session
       and re-orphan its counters, so serialise dispatches for the transaction. */
    await lockForTransaction(client, 'po-expediting:dispatch');

    /* Sessions that currently own any of these lines. Once the lines move to
       sessionRef these sessions' stored counters no longer describe the lines
       they still own, so they are recomputed after the inserts. */
    const priorRefs = verifiedPoNumbers.length === 0
      ? []
      : (await client.query<{ session_ref: string }>(
          `SELECT DISTINCT ae.session_ref
             FROM active_expediting ae
             JOIN unnest($1::text[], $2::text[]) AS req(po_number, po_line)
               ON ae.po_number = req.po_number
              AND COALESCE(ae.po_line, '') = req.po_line
            WHERE ae.session_ref IS NOT NULL`,
          [verifiedPoNumbers, verifiedPoLines]
        )).rows.map((r) => r.session_ref);

    for (const params of groupsIn) {
      const { supplierId, supplierName } = params;
      const token = randomUUID();

      /* Recipients / template: validated and capped, never used raw. */
      const toEmails = sanitizeRecipients(params?.toEmails);
      const ccEmails = sanitizeRecipients(params?.ccEmails);
      const subject = String(params?.subject ?? '').slice(0, MAX_SUBJECT_LEN);
      const emailBodyTemplate = String(params?.emailBodyTemplate ?? '').slice(0, MAX_BODY_LEN);

      /* Only lines the caller is actually allowed to see, de-duplicated. */
      const serverLines = new Map<string, MasterLine>();
      for (const item of Array.isArray(params?.items) ? params.items : []) {
        const row = masterByKey.get(lineKey(item?.['PO Number'], item?.['PO Line'] ?? ''));
        if (row) serverLines.set(lineKey(row.po_number, row.po_line ?? ''), row);
      }
      const items = [...serverLines.values()];

      if (toEmails.length === 0) {
        results.push({ supplierName, success: false, error: 'No valid recipient email address.' });
        continue;
      }
      if (items.length === 0) {
        results.push({
          supplierName,
          success: false,
          error: 'No PO lines available for this supplier within your approved countries.',
        });
        continue;
      }

      /* One supplier's inserts fail on their own without aborting the batch —
         a plain try/catch cannot do that inside a transaction, because the
         first error poisons every later statement until a rollback. */
      await client.query('SAVEPOINT dispatch_group');
      try {
        for (const item of items) {
          await client.query(
            /* The master fields are SNAPSHOTTED here, not just referenced: n8n
               truncates and reloads sap_open_po_master nightly with only the POs
               still open, so a line's country/segment/description/quantity/value/
               date are gone from the master the moment the PO closes. Analytics
               reads these columns so completed work keeps counting. */
            `INSERT INTO active_expediting
               (po_number, po_line, expedite_token, workflow_state,
                current_status, dispatched_by, dispatched_at,
                session_ref, supplier_name, supplier_id,
                country, p_group, item_description, open_qty,
                open_po_value_usd, delivery_date, responded_at,
                created_at, updated_at)
             VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response',
                     $4, NOW(), $5, $6, $7,
                     $8, $9, $10, $11, $12, $13, NULL,
                     NOW(), NOW())
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
               country           = EXCLUDED.country,
               p_group           = EXCLUDED.p_group,
               item_description  = EXCLUDED.item_description,
               open_qty          = EXCLUDED.open_qty,
               open_po_value_usd = EXCLUDED.open_po_value_usd,
               delivery_date     = EXCLUDED.delivery_date,
               /* Re-expediting resets the line to "awaiting a response", so the
                  previous supplier response time must not carry over. */
               responded_at      = NULL,
               updated_at        = NOW()`,
            [item.po_number, item.po_line ?? '', token, userEmail, sessionRef,
             item.supplier_name ?? (supplierName || null),
             item.supplier_id ?? (supplierId || null),
             item.country, item.p_group, item.item_description,
             item.open_qty, item.open_po_value_usd, item.delivery_date]
          );
        }
        await client.query('RELEASE SAVEPOINT dispatch_group');

        preparedGroups.push({
          supplierName,
          supplierId,
          toEmails,
          ccEmails,
          subject,
          emailBody: emailBodyTemplate,
          expediteToken: token,
          poLines: items.map((i) => ({
            po_number: i.po_number,
            po_line: i.po_line ?? '',
            item_description: i.item_description ?? '',
            open_qty: Number(i.open_qty ?? 0),
            open_po_value_usd: Number(i.open_po_value_usd ?? 0),
            delivery_date: isoDate(i.delivery_date),
            po_release_date: i.po_release_date == null ? null : isoDate(i.po_release_date),
          })),
        });

        results.push({ supplierName, success: true });
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT dispatch_group');
        await client.query('RELEASE SAVEPOINT dispatch_group');
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
      /* Distinct lines, not the sum of group sizes: active_expediting holds one
         row per (po_number, po_line), so a line listed under two suppliers in
         the same batch produces one row. Counting it twice would give this
         session a denominator its own lines can never reach. */
      const dispatchedLines = new Set<string>();
      for (const g of preparedGroups) {
        for (const l of g.poLines) dispatchedLines.add(lineKey(l.po_number, l.po_line));
      }
      const totalPoLines = dispatchedLines.size;
      const totalEmailsSent = preparedGroups.reduce((sum, g) => sum + g.toEmails.length, 0);
      await client.query(
        `INSERT INTO expediting_sessions
           (session_ref, dispatched_by, dispatched_at,
            total_suppliers, total_po_lines, total_emails_sent)
         VALUES ($1, $2, NOW(), $3, $4, $5)`,
        [sessionRef, userEmail, preparedGroups.length, totalPoLines, totalEmailsSent]
      );
    }

    /* ── Re-point the counters of the sessions we just took lines from ──
       total_po_lines was frozen at their dispatch time, but lines_responded is
       derived from whatever active_expediting still carries their session_ref.
       Once a line is re-dispatched the old session loses it, so its response
       rate can never reach 100% and fully_closed never flips — the dashboard
       shows it as open work forever. Recompute the total from the lines it
       still owns, and re-derive the response columns with supplierPortal's own
       formula so both writers agree.

       The response columns are only re-derived once the session has a response
       recorded (or has no lines left at all): NULL there means "no response
       yet", and AVG(response_rate_pct) in the analytics pages relies on that —
       writing 0.00 into an untouched session would quietly drag those averages
       down. A session that has lost every line has no outstanding work, so it
       closes. */
    const staleRefs = priorRefs.filter((ref) => ref !== sessionRef);
    if (staleRefs.length > 0) {
      await client.query(
        `WITH refs AS (SELECT unnest($1::text[]) AS session_ref),
              stats AS (
                SELECT r.session_ref,
                       COUNT(ae.id)                                                AS total_lines,
                       COUNT(ae.id) FILTER (WHERE ae.workflow_state = 'Submitted') AS lines_responded,
                       COUNT(DISTINCT ae.expedite_token)
                         FILTER (WHERE ae.workflow_state = 'Submitted')            AS suppliers_responded
                  FROM refs r
                  LEFT JOIN active_expediting ae ON ae.session_ref = r.session_ref
                 GROUP BY r.session_ref
              ),
              recalc AS (
                SELECT s.*,
                       (s.lines_responded > 0
                        OR es.lines_responded IS NOT NULL
                        OR s.total_lines = 0) AS derive
                  FROM stats s
                  JOIN expediting_sessions es ON es.session_ref = s.session_ref
              )
         UPDATE expediting_sessions es SET
           total_po_lines      = r.total_lines,
           suppliers_responded = CASE WHEN r.derive THEN r.suppliers_responded ELSE es.suppliers_responded END,
           lines_responded     = CASE WHEN r.derive THEN r.lines_responded     ELSE es.lines_responded END,
           response_rate_pct   = CASE WHEN r.derive
             THEN ROUND(r.lines_responded * 100.0 / NULLIF(r.total_lines, 0), 2)
             ELSE es.response_rate_pct END,
           fully_closed        = CASE WHEN r.derive
             THEN r.lines_responded >= r.total_lines
             ELSE es.fully_closed END,
           closed_at           = CASE
             WHEN r.derive AND r.lines_responded >= r.total_lines THEN COALESCE(es.closed_at, NOW())
             WHEN r.derive THEN NULL
             ELSE es.closed_at END
         FROM recalc r
         WHERE es.session_ref = r.session_ref`,
        [staleRefs]
      );
    }
  });

  /* ── Phase 2: single AWAITED webhook, after the transaction has COMMITTED ──
     Deliberately outside the transaction: a sent email cannot be rolled back,
     so the rows must be durable before n8n is asked to mail anyone. ── */
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
