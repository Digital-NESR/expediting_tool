import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { safesignPool } from './db';
import type { AttachmentMode, RequestStatus, ResponseType } from './model';

/**
 * Letting a supplier prove they may answer a request.
 *
 * The same mechanism as src/lib/rrsm/supplier-access.ts, for the same reason: the link in the
 * email says which supplier and which communication, and nothing about who is holding it. So the
 * holder picks one of the addresses the request went to from a masked list, a six-digit code goes
 * to it, and only that code opens the response form. Guess cap, server-side expiry, single use and
 * an issuing limit are all enforced here, never on the page.
 *
 * A plain module, not `'use server'`, so the public page's actions can import it without each
 * helper becoming a POST endpoint of its own.
 */

const MAX_ATTEMPTS = 5;
export const CODE_TTL_SECONDS = 300;
const SESSION_TTL_MINUTES = 60;
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MINUTES = 15;
const RESEND_QUIET_SECONDS = 30;

const hash = (code: string): string => createHash('sha256').update(code.trim()).digest('hex');
const UUID = /^[0-9a-f-]{36}$/i;

function reveal(part: string): string {
  return part.slice(0, Math.min(3, Math.max(part.length - 1, 0)));
}

/** Recognisable to its owner, useless to anybody else. See maskEmail in the RRSM module. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = String(email).split('@');
  const dot = domain.lastIndexOf('.');
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const dots = '•'.repeat(5);
  return `${reveal(user)}${dots}@${reveal(name)}${dots}${tld}`;
}

export interface RequestTarget {
  requestId: number;
  communicationId: number;
  vendorId: number;
  vendorName: string;
  topicName: string;
  title: string;
  message: string;
  responseType: ResponseType;
  attachments: AttachmentMode;
  deadline: string;
  status: RequestStatus;
  /** Open communication and the supplier still has something to do. */
  accepting: boolean;
  /** Every address the request went to (TO then CC), lowercased. */
  contacts: string[];
}

/** Resolve a request link. Null for anything that is not a token we issued and sent. */
export async function targetForToken(token: string): Promise<RequestTarget | null> {
  if (!UUID.test(String(token ?? ''))) return null;

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT r.id, r.communication_id, r.vendor_id, r.status, r.sent_to, r.sent_cc, r.sent_at,
            v.name AS vendor_name, v.active AS vendor_active,
            c.title, c.message, c.response_type, c.attachments, c.deadline, c.status AS comm_status,
            t.name AS topic_name
       FROM ss_requests r
       JOIN ss_vendors v        ON v.id = r.vendor_id
       JOIN ss_communications c ON c.id = r.communication_id
       JOIN ss_topics t         ON t.id = c.topic_id
      WHERE r.token = $1::uuid`,
    [token],
  );
  const r = rows[0];
  if (!r || r.sent_at === null) return null;

  const status = String(r.status) as RequestStatus;
  const contacts = [
    ...((r.sent_to as string[] | null) ?? []),
    ...((r.sent_cc as string[] | null) ?? []),
  ]
    .map((e) => String(e).trim().toLowerCase())
    .filter((e, i, all) => e.includes('@') && all.indexOf(e) === i);

  return {
    requestId: Number(r.id),
    communicationId: Number(r.communication_id),
    vendorId: Number(r.vendor_id),
    vendorName: String(r.vendor_name),
    topicName: String(r.topic_name),
    title: String(r.title),
    message: String(r.message ?? ''),
    responseType: String(r.response_type) as ResponseType,
    attachments: String(r.attachments) as AttachmentMode,
    deadline: dateOnly(r.deadline),
    status,
    accepting:
      String(r.comm_status) === 'sent' &&
      Boolean(r.vendor_active) &&
      (status === 'pending' || status === 'changes_requested'),
    contacts,
  };
}

export function dateOnly(v: unknown): string {
  if (v instanceof Date) {
    // A DATE column comes back as local midnight; read the calendar day, not the UTC instant.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v ?? '').slice(0, 10);
}

export type IssueResult =
  | { ok: true; code: string; email: string }
  | { ok: false; reason: string; retryAfterSeconds?: number };

/** Issue a code to one of the request's own addresses, chosen by position, never typed. */
export async function issueCode(
  requestId: number,
  contacts: string[],
  contactIndex: number,
): Promise<IssueResult> {
  const email = contacts[contactIndex];
  if (!email) return { ok: false, reason: 'Choose one of the addresses listed.' };

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT COUNT(*)::int AS issued,
            EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS since_last
       FROM ss_access_codes
      WHERE request_id = $1 AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [requestId, CODE_WINDOW_MINUTES],
  );
  const issued = Number(rows[0]?.issued ?? 0);
  const sinceLast = rows[0]?.since_last === null ? null : Number(rows[0]?.since_last);

  if (sinceLast !== null && sinceLast < RESEND_QUIET_SECONDS) {
    return {
      ok: false,
      reason: 'A code was just sent. Check the inbox, including junk mail.',
      retryAfterSeconds: RESEND_QUIET_SECONDS - sinceLast,
    };
  }
  if (issued >= MAX_CODES_PER_WINDOW) {
    return { ok: false, reason: 'Too many codes have been requested. Wait a few minutes and try again.' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await safesignPool.query(
    `INSERT INTO ss_access_codes (request_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
    [requestId, email, hash(code), CODE_TTL_SECONDS],
  );
  return { ok: true, code, email };
}

export type VerifyResult =
  { ok: true; sessionToken: string; email: string } | { ok: false; reason: string };

/** Check a code and open a session. Only the newest unconsumed code counts. */
export async function verifyCode(requestId: number, attempt: string): Promise<VerifyResult> {
  const cleaned = String(attempt ?? '').replace(/\D/g, '');
  if (cleaned.length !== 6) return { ok: false, reason: 'Enter the six-digit code.' };

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT id, email, code_hash, attempts, expires_at
       FROM ss_access_codes
      WHERE request_id = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [requestId],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'Request a code first.' };
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, reason: 'That code has expired. Request another.' };
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Request a new code.' };
  }

  await safesignPool.query(`UPDATE ss_access_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);

  const expected = Buffer.from(String(row.code_hash), 'hex');
  const actual = Buffer.from(hash(cleaned), 'hex');
  if (!(expected.length === actual.length && timingSafeEqual(expected, actual))) {
    const left = MAX_ATTEMPTS - Number(row.attempts) - 1;
    return {
      ok: false,
      reason:
        left > 0
          ? `That code is not right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
          : 'Too many incorrect attempts. Request a new code.',
    };
  }

  const sessionToken = randomUUID();
  await safesignPool.query(
    `UPDATE ss_access_codes
        SET consumed_at = NOW(), session_token = $1::uuid,
            session_expires_at = NOW() + ($2 || ' minutes')::interval
      WHERE id = $3`,
    [sessionToken, SESSION_TTL_MINUTES, row.id],
  );
  return { ok: true, sessionToken, email: String(row.email) };
}

/** The address behind a live session, or null when missing, expired or for another request. */
export async function sessionEmailFor(
  requestId: number,
  sessionToken: string | undefined | null,
): Promise<string | null> {
  if (!sessionToken || !UUID.test(sessionToken)) return null;
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT email FROM ss_access_codes
      WHERE session_token = $1::uuid AND request_id = $2 AND session_expires_at > NOW()`,
    [sessionToken, requestId],
  );
  return rows.length ? String(rows[0].email) : null;
}

/** Where this deployment lives, for links that leave the browser. */
export function appBase(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) throw new Error('NEXT_PUBLIC_APP_URL is not set, so the supplier link would not resolve.');
  return base;
}

export function respondUrl(token: string): string {
  return `${appBase()}/safesign/respond/${token}`;
}
