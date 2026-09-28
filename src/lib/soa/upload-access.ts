import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';
import { resolvedContactsFor } from './recipients';

/**
 * Letting a supplier prove they are entitled to upload.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * The link in the letter says which vendor is uploading. It does not say who is holding it: the
 * same URL reaches anyone the email was forwarded to. So before a file is accepted the uploader
 * shows they can read one of the addresses the letter actually went to. They pick one from a
 * masked list, a code goes to it, and only that code opens the upload.
 *
 * Four things make a six-digit code safe over a two-minute window, and all four are enforced here
 * rather than on the page:
 *   - a cap on guesses, because a million possibilities fall quickly to an unlimited guesser
 *   - server-side expiry, because a countdown in a browser is a decoration
 *   - single use, so a code glimpsed over a shoulder is already spent
 *   - a limit on issuing, because otherwise this page is a way to mail somebody else's inbox
 *     as often as you like
 */

/** Guesses allowed against one code before it is dead. */
const MAX_ATTEMPTS = 5;
/** How long a code lives. Short on purpose; the page shows the same number as a countdown. */
export const CODE_TTL_SECONDS = 120;
/** How long a verified session lasts. Long enough to find the file and upload it. */
const SESSION_TTL_MINUTES = 30;
/** Codes one vendor may be sent in a window, and the quiet period between them. */
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MINUTES = 15;
const RESEND_QUIET_SECONDS = 30;

const hash = (code: string): string => createHash('sha256').update(code.trim()).digest('hex');

/**
 * Mask an address enough to be recognisable to its owner and useless to anybody else.
 *
 * The list is shown to whoever holds the link, so it must not hand a stranger the vendor's AP
 * addresses. Keeping the first character and the domain's shape is enough for the real recipient
 * to pick their own out of two or three.
 */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const head = user.slice(0, 1);
  const dot = domain.lastIndexOf('.');
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${head}${'•'.repeat(Math.max(user.length - 1, 2))}@${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 2))}${tld}`;
}

export interface UploadTarget {
  entryId: number;
  countryId: string;
  countryName: string;
  cycleLabel: string;
  vendorName: string;
  vendorNo: string;
  submissionDeadline: string;
  /** Closed cycles and handed-off countries stop accepting. */
  acceptingUploads: boolean;
  /** The addresses the letter went to, in the order the page offers them. */
  contacts: string[];
}

/** Resolve an upload link. Returns null for a token that is not a token we issued. */
export async function targetForToken(token: string): Promise<UploadTarget | null> {
  await ensureSoaSchema();
  // A malformed token is a miss, not an error: UUID casting a stray string would throw.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

  const rows = await sql<QueryResultRow[]>(
    `SELECT vce.id, vce.status::text AS status, v.name AS vendor_name, v.vendor_no,
            v.id AS vendor_id, cc.country_id, cc.status::text AS country_status,
            c.name AS country_name, cy.label, cy.submission_deadline, cy.is_active
       FROM vendor_cycle_entries vce
       JOIN vendors v         ON v.id = vce.vendor_id
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
       JOIN countries c       ON c.id = cc.country_id
       JOIN cycles cy         ON cy.id = cc.cycle_id
      WHERE vce.upload_token = ?::uuid`,
    [token],
  );
  if (!rows.length) return null;
  const r = rows[0];

  return {
    entryId: Number(r.id),
    countryId: String(r.country_id),
    countryName: String(r.country_name),
    cycleLabel: String(r.label),
    vendorName: String(r.vendor_name),
    vendorNo: String(r.vendor_no),
    submissionDeadline:
      r.submission_deadline instanceof Date
        ? r.submission_deadline.toISOString().slice(0, 10)
        : String(r.submission_deadline ?? '').slice(0, 10),
    // A handed-off country has already been reported to Finance; accepting a late statement then
    // would change a figure somebody has signed off.
    acceptingUploads: Boolean(r.is_active) && String(r.country_status) !== 'handed_off',
    /* Resolved rather than read from vendors.contact_emails, which no edit touches and which
       still holds the @nesr.com addresses the letter filters out. A supplier was being offered a
       colleague's address as one of their own to verify against. */
    contacts: await resolvedContactsFor(Number(r.vendor_id), String(r.vendor_no)),
  };
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date; email: string }
  | { ok: false; reason: string; retryAfterSeconds?: number };

/**
 * Issue a code to one of the vendor's own addresses.
 *
 * The caller picks by position in the list this module produced, never by typing an address. That
 * keeps the page from being an oracle: a stranger with the link cannot test whether a guessed
 * address belongs to the vendor, because the page never accepts an address as input.
 */
export async function issueUploadCode(
  entryId: number,
  contacts: string[],
  contactIndex: number,
): Promise<IssueResult> {
  await ensureSoaSchema();
  const email = contacts[contactIndex];
  if (!email) return { ok: false, reason: 'Choose one of the addresses listed.' };

  const recent = await sql<QueryResultRow[]>(
    `SELECT COUNT(*)::int AS issued,
            EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS since_last
       FROM soa_upload_codes
      WHERE entry_id = ? AND created_at > NOW() - (? || ' minutes')::interval`,
    [entryId, CODE_WINDOW_MINUTES],
  );
  const issued = Number(recent[0]?.issued ?? 0);
  const sinceLast = recent[0]?.since_last === null ? null : Number(recent[0]?.since_last);

  if (sinceLast !== null && sinceLast < RESEND_QUIET_SECONDS) {
    return {
      ok: false,
      reason: 'A code was just sent. Check the inbox, including junk mail.',
      retryAfterSeconds: RESEND_QUIET_SECONDS - sinceLast,
    };
  }
  if (issued >= MAX_CODES_PER_WINDOW) {
    return {
      ok: false,
      reason:
        'Too many codes have been requested for this vendor. Wait a few minutes, or reply to the email and ask your NESR contact to upload the statement for you.',
    };
  }

  // randomInt is the cryptographic generator; Math.random would make the code predictable from
  // one observed value.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await sql(
    `INSERT INTO soa_upload_codes (entry_id, email, code_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [entryId, email.toLowerCase(), hash(code), expiresAt],
  );

  return { ok: true, code, expiresAt, email };
}

export type VerifyResult =
  | { ok: true; sessionToken: string; email: string }
  | { ok: false; reason: string };

/**
 * Check a code and open a session.
 *
 * Only the newest unconsumed code counts. Letting an older one still work would multiply the
 * guesses available to somebody who had asked for several.
 */
export async function verifyUploadCode(entryId: number, attempt: string): Promise<VerifyResult> {
  await ensureSoaSchema();
  const cleaned = attempt.replace(/\D/g, '');
  if (cleaned.length !== 6) return { ok: false, reason: 'Enter the six-digit code.' };

  const rows = await sql<QueryResultRow[]>(
    `SELECT id, email, code_hash, attempts, expires_at
       FROM soa_upload_codes
      WHERE entry_id = ? AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [entryId],
  );
  if (!rows.length) return { ok: false, reason: 'Request a code first.' };
  const row = rows[0];

  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, reason: 'That code has expired. Request another.' };
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Request a new code.' };
  }

  // Counted before the comparison, so an attempt that crashes or is abandoned still costs one.
  await sql(`UPDATE soa_upload_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);

  const expected = Buffer.from(String(row.code_hash), 'hex');
  const actual = Buffer.from(hash(cleaned), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!matches) {
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
  await sql(
    `UPDATE soa_upload_codes
        SET consumed_at = NOW(), session_token = ?::uuid,
            session_expires_at = NOW() + (? || ' minutes')::interval
      WHERE id = ?`,
    [sessionToken, SESSION_TTL_MINUTES, row.id],
  );

  return { ok: true, sessionToken, email: String(row.email) };
}

/** The address behind a live session, or null when it is missing, expired, or for another vendor. */
export async function sessionEmailFor(
  entryId: number,
  sessionToken: string | undefined,
): Promise<string | null> {
  if (!sessionToken || !/^[0-9a-f-]{36}$/i.test(sessionToken)) return null;
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT email FROM soa_upload_codes
      WHERE session_token = ?::uuid AND entry_id = ? AND session_expires_at > NOW()`,
    [sessionToken, entryId],
  );
  return rows.length ? String(rows[0].email) : null;
}
