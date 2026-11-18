import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { legacyViewPath, rrsmHref } from '@/lib/rrsm/nav';

/**
 * Letting a supplier prove they are entitled to submit a cycle.
 *
 * A plain module, not `'use server'`, so the public page's actions can import it without every
 * helper in it becoming a POST endpoint of its own.
 *
 * Deliberately the same mechanism as `src/lib/soa/upload-access.ts`, because it is the same
 * problem: the link in the email says which supplier is submitting, and says nothing about who is
 * holding it — the same URL reaches anyone it was forwarded to. So before a submission is
 * accepted, the holder shows they can read one of the addresses the invitation actually went to.
 * They pick one from a masked list, a code goes to it, and only that code opens the form.
 *
 * Four things make a six-digit code safe over a two-minute window, and all four are enforced
 * here rather than on the page, because a page is whatever the person holding it says it is:
 *   - a cap on guesses, since a million possibilities fall quickly to an unlimited guesser
 *   - server-side expiry, because a countdown in a browser is a decoration
 *   - single use, so a code glimpsed over a shoulder is already spent
 *   - a limit on issuing, because otherwise this is a way to mail somebody else's inbox as often
 *     as you like
 */

/** Guesses allowed against one code before it is dead. */
const MAX_ATTEMPTS = 5;
/** How long a code lives. Short on purpose; the page shows the same number as a countdown. */
export const CODE_TTL_SECONDS = 120;
/** How long a verified session lasts. Long enough to work through a month of lines. */
const SESSION_TTL_MINUTES = 45;
/** Codes one supplier may be sent in a window, and the quiet period between them. */
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MINUTES = 15;
const RESEND_QUIET_SECONDS = 30;

const hash = (code: string): string => createHash('sha256').update(code.trim()).digest('hex');

const UUID = /^[0-9a-f-]{36}$/i;

/** How much of each half of an address the masked form shows. */
const VISIBLE_CHARS = 3;

/**
 * Show the first few characters, and never the last one.
 *
 * One character is always withheld, and a one-character part shows nothing at all, so the mask
 * cannot be read back into the address.
 */
function reveal(part: string): string {
  return part.slice(0, Math.min(VISIBLE_CHARS, Math.max(part.length - 1, 0)));
}

/**
 * Mask an address enough to be recognisable to its owner and useless to anybody else.
 *
 * The list is shown to whoever holds the link, so it must not hand a stranger the supplier's
 * addresses. Three characters separate the addresses people actually have — `ahmed@` and
 * `accounts@` are distinguishable — while the length stays hidden behind a fixed run of dots
 * rather than one per character, which would print the length beside it.
 */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = String(email).split('@');
  const dot = domain.lastIndexOf('.');
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const dots = '•'.repeat(5);
  return `${reveal(user)}${dots}@${reveal(name)}${dots}${tld}`;
}

export interface SubmissionTarget {
  linkId: number;
  cycleId: number;
  supplierCode: string;
  supplierName: string;
  countryCode: string;
  countryName: string;
  currency: string;
  /** `yyyy-mm-dd`. */
  period: string;
  opensOn: string;
  closesOn: string;
  /** A closed cycle stops accepting, and so does a link already submitted. */
  accepting: boolean;
  alreadySubmitted: boolean;
  /** The addresses the invitation went to, in the order the page offers them. Masked by caller. */
  contacts: string[];
}

/** Resolve a submission link. Null for anything that is not a token we issued. */
export async function targetForToken(token: string): Promise<SubmissionTarget | null> {
  // A malformed token is a miss, not an error: UUID-casting a stray string would throw.
  if (!UUID.test(String(token ?? ''))) return null;

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT l.id, l.cycle_id, l.supplier_code, l.submitted_at,
            s.name AS supplier_name, s.contact_emails, s.active AS supplier_active,
            cy.period, cy.opens_on, cy.closes_on, cy.status AS cycle_status,
            c.code AS country_code, c.name AS country_name, c.currency, c.live
       FROM rrsm_supplier_links l
       JOIN rrsm_suppliers s  ON s.code = l.supplier_code
       JOIN rrsm_cycles cy    ON cy.id = l.cycle_id
       JOIN rrsm_countries c  ON c.code = cy.country_code
      WHERE l.token = $1::uuid`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;

  return {
    linkId: Number(r.id),
    cycleId: Number(r.cycle_id),
    supplierCode: String(r.supplier_code),
    supplierName: String(r.supplier_name),
    countryCode: String(r.country_code),
    countryName: String(r.country_name),
    currency: String(r.currency),
    period: dateOnly(r.period),
    opensOn: dateOnly(r.opens_on),
    closesOn: dateOnly(r.closes_on),
    /* A country switched off mid-cycle stops accepting too. The supplier was invited under a
       country that was live; if it has since been turned off, the people who would act on the
       submission are no longer there to act on it. */
    accepting:
      Boolean(r.live) &&
      Boolean(r.supplier_active) &&
      String(r.cycle_status) !== 'closed' &&
      r.submitted_at === null,
    alreadySubmitted: r.submitted_at !== null,
    contacts: ((r.contact_emails as string[] | null) ?? [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => e.includes('@')),
  };
}

function dateOnly(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date; email: string }
  | { ok: false; reason: string; retryAfterSeconds?: number };

/**
 * Issue a code to one of the supplier's own addresses.
 *
 * The caller picks by POSITION in the list this module produced, never by typing an address.
 * That is what keeps the page from being an oracle: a stranger holding the link cannot test
 * whether a guessed address belongs to the supplier, because the page never accepts an address
 * as input.
 */
export async function issueCode(
  linkId: number,
  contacts: string[],
  contactIndex: number,
): Promise<IssueResult> {
  const email = contacts[contactIndex];
  if (!email) return { ok: false, reason: 'Choose one of the addresses listed.' };

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT COUNT(*)::int AS issued,
            EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS since_last
       FROM rrsm_access_codes
      WHERE link_id = $1 AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [linkId, CODE_WINDOW_MINUTES],
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
    return {
      ok: false,
      reason:
        'Too many codes have been requested. Wait a few minutes, or reply to the email and ask your NESR contact to enter the figures for you.',
    };
  }

  /* randomInt is the cryptographic generator. Math.random would make the code predictable from
     one observed value, which is exactly what an attacker who asked for their own code has. */
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await rrsmPool.query(
    `INSERT INTO rrsm_access_codes (link_id, cycle_id, supplier_code, email, code_hash, expires_at)
     SELECT $1, l.cycle_id, l.supplier_code, $2, $3, $4
       FROM rrsm_supplier_links l WHERE l.id = $1`,
    [linkId, email.toLowerCase(), hash(code), expiresAt],
  );

  return { ok: true, code, expiresAt, email };
}

export type VerifyResult =
  { ok: true; sessionToken: string; email: string } | { ok: false; reason: string };

/**
 * Check a code and open a session.
 *
 * Only the newest unconsumed code counts. Letting an older one still work would multiply the
 * guesses available to somebody who had asked for several.
 */
export async function verifyCode(linkId: number, attempt: string): Promise<VerifyResult> {
  const cleaned = String(attempt ?? '').replace(/\D/g, '');
  if (cleaned.length !== 6) return { ok: false, reason: 'Enter the six-digit code.' };

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT id, email, code_hash, attempts, expires_at
       FROM rrsm_access_codes
      WHERE link_id = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [linkId],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'Request a code first.' };

  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, reason: 'That code has expired. Request another.' };
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Request a new code.' };
  }

  // Counted before the comparison, so an attempt that crashes or is abandoned still costs one.
  await rrsmPool.query(`UPDATE rrsm_access_codes SET attempts = attempts + 1 WHERE id = $1`, [
    row.id,
  ]);

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
  await rrsmPool.query(
    `UPDATE rrsm_access_codes
        SET consumed_at = NOW(), session_token = $1::uuid,
            session_expires_at = NOW() + ($2 || ' minutes')::interval
      WHERE id = $3`,
    [sessionToken, SESSION_TTL_MINUTES, row.id],
  );

  return { ok: true, sessionToken, email: String(row.email) };
}

/** The address behind a live session, or null when it is missing, expired, or for another link. */
export async function sessionEmailFor(
  linkId: number,
  sessionToken: string | undefined,
): Promise<string | null> {
  if (!sessionToken || !UUID.test(sessionToken)) return null;
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT email FROM rrsm_access_codes
      WHERE session_token = $1::uuid AND link_id = $2 AND session_expires_at > NOW()`,
    [sessionToken, linkId],
  );
  return rows.length ? String(rows[0].email) : null;
}

/**
 * Where this deployment lives, for anything that has to survive leaving the browser.
 *
 * Exported so that every RRSM link is built from the same fallback chain. A second copy of it
 * somewhere else is how one mail ends up pointing at preview and another at production.
 */
export function appBase(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  /* Relative is useless in an email, so an unconfigured base is worth knowing about at the point
     the link is built rather than when a supplier cannot open it. */
  if (!base)
    throw new Error('NEXT_PUBLIC_APP_URL is not set, so the submission link would not resolve.');
  return base;
}

/** The link's URL, as it goes into the invitation. */
export function submissionUrl(token: string): string {
  return `${appBase()}/rrsm/submit/${token}`;
}

/**
 * A staff page, opened on a given country. What a reminder email points at.
 *
 * Each view is its own route now; the `view` names are kept so callers did not have to change,
 * and `/rrsm?view=` still redirects for the emails that went out before the split.
 */
export function boardUrl(countryCode: string, view?: 'ops' | 'buyer' | 'invite' | 'renew'): string {
  return appBase() + rrsmHref(legacyViewPath(view) ?? '/rrsm', countryCode);
}
