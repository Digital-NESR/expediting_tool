'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { validateUploadSignature, uploadMimeTypeFor } from '@/lib/documents';
import { canAccessCountry, getSoaActor } from '@/lib/soa/access';
import { verificationCodeEmail } from '@/lib/soa/email-template';
import { sendMail } from '@/lib/soa/mail';
import { MAX_SOA_BYTES, StatementRejected, storeStatement } from '@/lib/soa/submission-store';
import {
  CODE_TTL_SECONDS,
  issueUploadCode,
  maskEmail,
  sessionEmailFor,
  targetForToken,
  verifyUploadCode,
  type UploadTarget,
} from '@/lib/soa/upload-access';

/**
 * The supplier-facing upload flow.
 *
 * This is the only part of SOA Consolidation reachable without signing in, so every export here
 * resolves the link token itself and derives everything else from it. Nothing the browser sends, 
 * no vendor id, no country, no email address. Is trusted; the token is the only input, and a
 * caller who has one can act on exactly the vendor it names and no other.
 *
 * Addresses are chosen by position in the list this produced, never typed. Accepting a typed
 * address would turn the page into an oracle: a stranger holding a forwarded link could test
 * guesses against the vendor's real contacts and learn them one at a time.
 */

const log = logger('soa-upload');

export type UploadResult<T = undefined> = { success: boolean; error?: string; data?: T };

/**
 * The session lives in the TAB, not in the browser.
 *
 * It used to be a cookie, which meant a supplier who verified once was still verified half an hour
 * later in any tab, including one opened by somebody the link had since been forwarded to. The
 * token now goes back to the page, which keeps it in `sessionStorage` and hands it to the two
 * calls that need it, so closing the tab ends the session and opening the link again asks for a
 * new code.
 *
 * The trade is that the token is readable by script on the page where a cookie could be httpOnly.
 * It is worth it here: there is no user-supplied HTML on this page, and the token is good for one
 * vendor, for thirty minutes, for uploading a statement and nothing else.
 */

export interface UploadPageState {
  vendorName: string;
  vendorNo: string;
  countryName: string;
  cycleLabel: string;
  submissionDeadline: string;
  acceptingUploads: boolean;
  /** Masked, in the order `requestSoaUploadCode` indexes them. */
  maskedContacts: string[];
  /** The address already verified in THIS TAB, masked. Null until the tab verifies one. */
  verifiedAs: string | null;
  /** A signed-in champion for this country skips verification entirely. */
  signedInAs: string | null;
  codeTtlSeconds: number;
}

/**
 * Is this caller a champion for the country that owns the link?
 *
 * The code proves someone can read the vendor's mailbox. A champion signed in through the
 * company's own SSO has already proved more than that, and uploading on a supplier's behalf is a
 * normal part of their job, a supplier who replies with the file attached still has to get it
 * into the system somehow.
 */
async function championFor(target: UploadTarget): Promise<string | null> {
  try {
    const actor = await getSoaActor();
    if (!actor) return null;
    return canAccessCountry(actor, target.countryId, 'champion') ? actor.email : null;
  } catch {
    return null;
  }
}

/**
 * Everything the upload page renders, resolved from the link alone.
 *
 * `sessionToken` is whatever the tab has kept from an earlier verification in this same tab. It is
 * checked rather than believed: it may be expired, spent, or for another vendor entirely.
 */
export async function getSoaUploadState(
  token: string,
  sessionToken?: string,
): Promise<UploadResult<UploadPageState>> {
  try {
    const target = await targetForToken(token);
    if (!target) return { success: false, error: 'not-found' };

    const verifiedEmail = await sessionEmailFor(target.entryId, sessionToken);

    return {
      success: true,
      data: {
        vendorName: target.vendorName,
        vendorNo: target.vendorNo,
        countryName: target.countryName,
        cycleLabel: target.cycleLabel,
        submissionDeadline: target.submissionDeadline,
        acceptingUploads: target.acceptingUploads,
        maskedContacts: target.contacts.map(maskEmail),
        verifiedAs: verifiedEmail ? maskEmail(verifiedEmail) : null,
        signedInAs: await championFor(target),
        codeTtlSeconds: CODE_TTL_SECONDS,
      },
    };
  } catch (err) {
    log.error('getSoaUploadState.failed', err);
    return { success: false, error: 'Something went wrong loading this page.' };
  }
}

/** Send a one-time code to one of the vendor's own addresses. */
export async function requestSoaUploadCode(
  token: string,
  contactIndex: number,
): Promise<UploadResult<{ sentTo: string; expiresInSeconds: number }>> {
  try {
    const target = await targetForToken(token);
    if (!target) return { success: false, error: 'This link is no longer valid.' };
    if (!target.acceptingUploads) {
      return { success: false, error: 'This cycle has closed and is no longer accepting statements.' };
    }

    const issued = await issueUploadCode(target.entryId, target.contacts, contactIndex);
    if (!issued.ok) return { success: false, error: issued.reason };

    try {
      await sendMail({
        kind: 'soa.otp',
        to: [issued.email],
        subject: `Your NESR verification code: ${issued.code}`,
        bodyHtml: verificationCodeEmail({
          code: issued.code,
          vendorName: target.vendorName,
          cycleLabel: target.cycleLabel,
          minutes: Math.round(CODE_TTL_SECONDS / 60),
        }),
        bodyText: `Your NESR verification code is ${issued.code}. It expires in ${Math.round(CODE_TTL_SECONDS / 60)} minutes.`,
        attachments: [],
        meta: { vendorNo: target.vendorNo, countryName: target.countryName },
      });
    } catch (err) {
      /* The code is already issued and counted against the rate limit. Saying it was sent when it
         was not would leave the supplier waiting for an email that is not coming. */
      log.warn('upload.codeNotSent', {
        vendorNo: target.vendorNo,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error:
          'The code could not be emailed just now. Try again shortly, or reply to the request email and ask your NESR contact to upload the statement for you.',
      };
    }

    return {
      success: true,
      data: { sentTo: maskEmail(issued.email), expiresInSeconds: CODE_TTL_SECONDS },
    };
  } catch (err) {
    log.error('requestSoaUploadCode.failed', err);
    return { success: false, error: 'Could not send a code.' };
  }
}

/** Check a code and, on success, open a short session in the tab that asked for it. */
export async function verifySoaUploadCode(
  token: string,
  code: string,
): Promise<UploadResult<{ verifiedAs: string; sessionToken: string }>> {
  try {
    const target = await targetForToken(token);
    if (!target) return { success: false, error: 'This link is no longer valid.' };

    const result = await verifyUploadCode(target.entryId, code);
    if (!result.ok) return { success: false, error: result.reason };

    log.info('upload.verified', { vendorNo: target.vendorNo, countryId: target.countryId });
    return {
      success: true,
      data: { verifiedAs: maskEmail(result.email), sessionToken: result.sessionToken },
    };
  } catch (err) {
    log.error('verifySoaUploadCode.failed', err);
    return { success: false, error: 'Could not check that code.' };
  }
}

/**
 * Accept the statement.
 *
 * Re-checks entitlement rather than trusting that the page only shows the form to a verified
 * visitor: this is a public POST endpoint, and the form being hidden is not a control.
 */
export async function submitSoaUploadFile(
  token: string,
  formData: FormData,
  sessionToken?: string,
): Promise<UploadResult<{ lines: number; needingReview: number }>> {
  try {
    const target = await targetForToken(token);
    if (!target) return { success: false, error: 'This link is no longer valid.' };
    if (!target.acceptingUploads) {
      return { success: false, error: 'This cycle has closed and is no longer accepting statements.' };
    }

    const verifiedEmail = await sessionEmailFor(target.entryId, sessionToken);
    const champion = verifiedEmail ? null : await championFor(target);
    if (!verifiedEmail && !champion) {
      return { success: false, error: 'Verify your email address before uploading.' };
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: 'Choose the completed Excel file to upload.' };
    }
    if (file.size > MAX_SOA_BYTES) return { success: false, error: 'That file is larger than 10 MB.' };

    const content = Buffer.from(await file.arrayBuffer());
    if (content.byteLength > MAX_SOA_BYTES) {
      return { success: false, error: 'That file is larger than 10 MB.' };
    }

    // The extension and the browser's MIME claim are both claims; check the real leading bytes.
    const verdict = validateUploadSignature(file.name, content, file.type);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const stored = await storeStatement({
      entryId: target.entryId,
      countryCycleId: await countryCycleIdFor(target.entryId),
      vendorNo: target.vendorNo,
      vendorName: target.vendorName,
      countryId: target.countryId,
      cycleLabel: target.cycleLabel,
      fileName: file.name,
      contentType: uploadMimeTypeFor(file.name, file.type),
      content,
      uploadedBy: verifiedEmail ?? champion ?? 'unknown',
      actorLabel: verifiedEmail ?? champion ?? 'unknown',
      selfService: Boolean(verifiedEmail),
    });

    log.info('upload.stored', {
      vendorNo: target.vendorNo,
      lines: stored.lines,
      selfService: Boolean(verifiedEmail),
    });
    revalidatePath('/soa-consolidation');
    return { success: true, data: { lines: stored.lines, needingReview: stored.needingReview } };
  } catch (err) {
    if (err instanceof StatementRejected) return { success: false, error: err.message };
    log.error('submitSoaUploadFile.failed', err);
    return { success: false, error: 'Could not accept that file.' };
  }
}

/** The country_cycle the entry belongs to, needed for the evidence entry. */
async function countryCycleIdFor(entryId: number): Promise<number> {
  const { sql } = await import('@/lib/soa/db');
  const rows = await sql<{ country_cycle_id: number }[]>(
    `SELECT country_cycle_id FROM vendor_cycle_entries WHERE id = ?`,
    [entryId],
  );
  return Number(rows[0].country_cycle_id);
}
