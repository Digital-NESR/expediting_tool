'use server';

/**
 * ProcureGuard attachment and per-request viewer actions.
 *
 * Every export here is a public POST endpoint and resolves the actor first. Seeing a request is
 * necessary but not sufficient for any of these: the extra predicates below are the ones that came
 * out of the access incident, and they are applied verbatim.
 */
import type { QueryResultRow } from 'pg';
import { revalidatePath, revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';
import { normalizeEmail } from '@/lib/require-access';
import {
  actorCanAccessRequesterSideRequest,
  actorCanAccessRequestScope,
  canActorViewRequest,
  requesterNotificationEmailsOf,
} from '@/lib/procure-guard/access';
import { writeActivity } from '@/lib/procure-guard/activity';
import { getActor, requireProcureGuardOperationalAccess } from '@/lib/procure-guard/actor';
import {
  isValidEmail,
  MAX_PROCURE_GUARD_DOCUMENT_NAME_CHARS,
  MAX_PROCURE_GUARD_FILE_BYTES,
  PROCURE_GUARD_DOCUMENT_TYPES,
  PROCUREGUARD_DATA_TAG,
  SAP_VERIFICATION_DOCUMENT_LABEL,
  SAP_VERIFICATION_DOCUMENT_TYPE,
} from '@/lib/procure-guard/constants';
import { ensureProcureGuardSchema, exec, serialise, sql } from '@/lib/procure-guard/internals';
import {
  detectMime,
  fileBaseName,
  normalisePaymentCountry,
  requireText,
} from '@/lib/procure-guard/validation';
import type {
  ActionResult,
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardActor,
  ProcureGuardDocument,
  ProcureGuardRequestType,
} from '@/types/procureGuard';

const log = logger('procure-guard');

/**
 * Where an upload spends its time, logged on every one that takes longer than a moment.
 *
 * The SAP team reported waits over a minute on files averaging half a megabyte. The database
 * is not it -- measured against the live server, a warm round trip is 46ms, moving a 647 kB
 * blob is 171ms, and the detail page's own reads are 195ms together -- so the time is going
 * somewhere this code could not see. Rather than keep guessing from the outside, each step is
 * timed and the breakdown is logged with the reference number.
 *
 * Only above the threshold, so a normal upload logs nothing. The numbers it prints are
 * server-side only: the file crossing the network to get here is already spent by the time the
 * first line runs, and `receivedToStart` is the closest thing to a measure of it.
 */
const SLOW_UPLOAD_MS = 2_000;

export async function uploadProcureGuardDocument(
  formData: FormData,
): Promise<{ success: boolean; document?: ProcureGuardDocument; error?: string }> {
  const startedAt = Date.now();
  const marks: Record<string, number> = {};
  let last = startedAt;
  const mark = (step: string) => {
    const now = Date.now();
    marks[step] = now - last;
    last = now;
  };

  try {
    const actor = await getActor();
    mark('resolveActor');
    requireProcureGuardOperationalAccess(actor);
    const requestType = formData.get('request_type') as ProcureGuardRequestType | null;
    const requestId = Number(formData.get('request_id'));
    const file = formData.get('file') as File | null;
    const customName = (
      ((formData.get('custom_name') as string) || '').trim() ||
      (file ? fileBaseName(file.name) : 'Attachment')
    ).slice(0, MAX_PROCURE_GUARD_DOCUMENT_NAME_CHARS);
    const documentType = ((formData.get('document_type') as string) || 'request_attachment').trim();

    if (
      (requestType !== 'adhoc' && requestType !== 'advance') ||
      !Number.isFinite(requestId) ||
      requestId <= 0 ||
      !file
    ) {
      return { success: false, error: 'Missing required upload fields.' };
    }

    if (!PROCURE_GUARD_DOCUMENT_TYPES.has(documentType)) {
      return { success: false, error: 'Unsupported attachment type.' };
    }

    /* The SAP type is the one the verification step looks for, so only somebody who could
       perform that step may file under it. Without this the requirement is satisfiable by the
       requester: upload anything, tick the type, and the transition sees evidence that nobody
       with the authority to check ever produced. The rule is enforced HERE rather than at the
       transition because permissions change -- checking the uploader's authority weeks later
       would let a verified request become unverifiable when somebody leaves the team. */
    if (documentType === SAP_VERIFICATION_DOCUMENT_TYPE) {
      if (requestType !== 'adhoc') {
        return {
          success: false,
          error: `${SAP_VERIFICATION_DOCUMENT_LABEL} belongs to the adhoc SAP Team verification step, which advance requests do not have.`,
        };
      }
      if (!actor.permissions.canReviewAdhocSapTeam) {
        return {
          success: false,
          error: `Only the SAP Team can file ${SAP_VERIFICATION_DOCUMENT_LABEL.toLowerCase()}. Attach it as a normal attachment instead.`,
        };
      }
    }

    if (file.size > MAX_PROCURE_GUARD_FILE_BYTES) {
      return { success: false, error: 'File is too large. Maximum size is 10 MB.' };
    }

    const table =
      requestType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
    const requestRows = await sql<QueryResultRow[]>(
      `SELECT id, reference_number, requested_by_email, requester_notification_emails, country, segment FROM ${table} WHERE id = ? LIMIT 1`,
      [requestId],
    );
    mark('loadRequest');
    if (!requestRows[0]) return { success: false, error: 'Request not found.' };
    const request = normalisePaymentCountry(
      serialise<
        Pick<
          AdhocPaymentRequest | AdvancePaymentRequest,
          'requested_by_email' | 'requester_notification_emails' | 'country' | 'segment'
        >
      >(requestRows[0]),
    );
    // Seeing the request is necessary but NOT sufficient: the read-only Viewer role can see a
    // request it may not attach anything to. (Requester-side access always carries upload rights,
    // including for a Viewer-role user on their own request.)
    const canUpload =
      canActorViewRequest(actor, request) &&
      (actorCanAccessRequesterSideRequest(actor, request) ||
        actor.permissions.accessView !== 'viewer');
    if (!canUpload) {
      return { success: false, error: 'You do not have access to upload files to this request.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    mark('readFileIntoMemory');
    const insert = await exec(
      `INSERT INTO procure_guard_documents
         (request_type, request_id, document_name, original_name, document_type, file_type, file_size, file_content, uploaded_by_name, uploaded_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        requestType,
        requestId,
        customName,
        file.name !== customName ? file.name : null,
        documentType,
        detectMime(file),
        file.size,
        buffer,
        actor.name,
        actor.email,
      ],
    );

    mark('insertDocument');

    const docs = await sql<QueryResultRow[]>(
      `SELECT id, request_type, request_id, document_name, original_name, document_type, file_type, file_size,
              uploaded_by_name, uploaded_by_email, uploaded_at
       FROM procure_guard_documents
       WHERE id = ? LIMIT 1`,
      [insert.insertId],
    );
    mark('readBackRow');

    await writeActivity({
      requestType,
      requestId,
      referenceNumber: requestRows[0].reference_number,
      action:
        documentType === SAP_VERIFICATION_DOCUMENT_TYPE
          ? `${SAP_VERIFICATION_DOCUMENT_LABEL} uploaded`
          : 'Attachment uploaded',
      actor,
      notes: file.name,
    });
    mark('writeActivity');

    /* These are the ones to watch. `revalidatePath` on a dynamic route makes the server action's
       response carry a fresh render of the current page, so the cost of re-rendering the detail
       screen lands inside this call rather than after it. */
    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath(
      `/procure-guard/${requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${requestId}`,
    );
    mark('revalidate');

    const totalMs = Date.now() - startedAt;
    if (totalMs > SLOW_UPLOAD_MS) {
      log.warn('upload.slow', {
        reference: requestRows[0].reference_number,
        documentType,
        fileBytes: file.size,
        totalMs,
        ...marks,
      });
    }
    return { success: true, document: serialise<ProcureGuardDocument>(docs[0]) };
  } catch (err) {
    log.error('uploadProcureGuardDocument.failed', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

export async function deleteProcureGuardDocument(documentId: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    const docs = await sql<QueryResultRow[]>(
      `SELECT d.id, d.request_type, d.request_id, d.uploaded_by_email,
              COALESCE(a.reference_number, adv.reference_number) AS reference_number,
              COALESCE(a.requested_by_email, adv.requested_by_email) AS requested_by_email,
              COALESCE(a.requester_notification_emails, adv.requester_notification_emails) AS requester_notification_emails,
              COALESCE(a.country, adv.country) AS country,
              COALESCE(a.segment, adv.segment) AS segment
       FROM procure_guard_documents d
       LEFT JOIN procure_guard_adhoc_payments a ON d.request_type = 'adhoc' AND d.request_id = a.id
       LEFT JOIN procure_guard_advance_payments adv ON d.request_type = 'advance' AND d.request_id = adv.id
       WHERE d.id = ? LIMIT 1`,
      [documentId],
    );
    const doc = docs[0];
    if (!doc) return { success: false, error: 'Attachment not found.' };

    // Deleting an attachment destroys audit evidence, so it needs at least the access uploading
    // needs, plus one of: you uploaded it, you are on the requester side, or you hold delete rights.
    const request = normalisePaymentCountry(
      serialise<
        Pick<
          AdhocPaymentRequest | AdvancePaymentRequest,
          'requested_by_email' | 'requester_notification_emails' | 'country' | 'segment'
        >
      >({
        requested_by_email: doc.requested_by_email,
        requester_notification_emails: doc.requester_notification_emails,
        country: doc.country,
        segment: doc.segment,
      }),
    );
    const isUploader =
      normalizeEmail(doc.uploaded_by_email as string) === normalizeEmail(actor.email);
    const hasScopedReviewAccess =
      canActorViewRequest(actor, request) &&
      actor.permissions.accessView !== 'viewer' &&
      !actorCanAccessRequesterSideRequest(actor, request);
    const canDelete =
      isUploader ||
      actorCanAccessRequesterSideRequest(actor, request) ||
      actor.permissions.canDeleteRecords ||
      hasScopedReviewAccess;
    if (!canDelete) {
      return { success: false, error: 'You do not have access to delete this attachment.' };
    }

    await exec(`DELETE FROM procure_guard_documents WHERE id = ?`, [documentId]);
    await writeActivity({
      requestType: doc.request_type,
      requestId: doc.request_id,
      referenceNumber: doc.reference_number,
      action: 'Attachment removed',
      actor,
    });

    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath(
      `/procure-guard/${doc.request_type === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${doc.request_id}`,
    );
    return { success: true };
  } catch (err) {
    log.error('deleteProcureGuardDocument.failed', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

// ── Per-request viewers ───────────────────────────────────────────────────────
// Grant/revoke view access to a single request at any time. Backed by the request's
// requester_notification_emails list (the same list that already confers requester-side visibility
// and status updates). Read-only Viewer-role users cannot manage viewers.

async function loadRequestForViewerManagement(
  actor: ProcureGuardActor,
  requestType: ProcureGuardRequestType,
  requestId: number,
) {
  const table =
    requestType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
  await ensureProcureGuardSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, reference_number, requested_by_email, requester_notification_emails, country, segment FROM ${table} WHERE id = ? LIMIT 1`,
    [requestId],
  );
  if (!rows[0]) return { error: 'Request not found.' as const };
  const request = serialise<
    Pick<
      AdhocPaymentRequest | AdvancePaymentRequest,
      | 'id'
      | 'reference_number'
      | 'requested_by_email'
      | 'requester_notification_emails'
      | 'country'
      | 'segment'
    >
  >(rows[0]);

  // Viewers can create their own requests, so they may manage viewers on those — but a pure Viewer
  // looking at someone else's request stays hands-off. Requesters/reviewers/admins keep their reach.
  const ownsRequest =
    String(request.requested_by_email).toLowerCase() === actor.email.toLowerCase();
  const isPureViewer = actor.permissions.accessView === 'viewer';
  const canManage =
    ownsRequest ||
    (!isPureViewer &&
      (actor.permissions.canViewAll
        ? actorCanAccessRequestScope(actor, request)
        : actorCanAccessRequesterSideRequest(actor, request)));
  if (!canManage)
    return { error: 'You do not have access to manage viewers on this request.' as const };
  return { table, request };
}

export async function addProcureGuardRequestViewer(input: {
  requestType: ProcureGuardRequestType;
  requestId: number;
  email: string;
  name?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const loaded = await loadRequestForViewerManagement(actor, input.requestType, input.requestId);
    if ('error' in loaded) return { success: false, error: loaded.error };
    const { table, request } = loaded;

    const email = requireText(input.email, 'Viewer email').toLowerCase();
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    if (email === String(request.requested_by_email).toLowerCase())
      return { success: false, error: 'The requester can already view this request.' };

    const existing = requesterNotificationEmailsOf(request);
    if (existing.includes(email))
      return { success: false, error: 'That person can already view this request.' };
    const updated = [...existing, email];

    await exec(
      `UPDATE ${table} SET requester_notification_emails = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [updated, input.requestId],
    );
    await writeActivity({
      requestType: input.requestType,
      requestId: input.requestId,
      referenceNumber: request.reference_number,
      action: 'Viewer added',
      actor,
      notes: input.name?.trim() ? `${input.name.trim()} <${email}>` : email,
    });

    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath(
      `/procure-guard/${input.requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${input.requestId}`,
    );
    return { success: true };
  } catch (err) {
    log.error('addProcureGuardRequestViewer.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add viewer.' };
  }
}

export async function removeProcureGuardRequestViewer(input: {
  requestType: ProcureGuardRequestType;
  requestId: number;
  email: string;
}): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const loaded = await loadRequestForViewerManagement(actor, input.requestType, input.requestId);
    if ('error' in loaded) return { success: false, error: loaded.error };
    const { table, request } = loaded;

    const email = (input.email || '').trim().toLowerCase();
    const existing = requesterNotificationEmailsOf(request);
    if (!existing.includes(email))
      return { success: false, error: 'That viewer is not on this request.' };
    const updated = existing.filter((e) => e !== email);

    await exec(
      `UPDATE ${table} SET requester_notification_emails = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [updated, input.requestId],
    );
    await writeActivity({
      requestType: input.requestType,
      requestId: input.requestId,
      referenceNumber: request.reference_number,
      action: 'Viewer removed',
      actor,
      notes: email,
    });

    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath(
      `/procure-guard/${input.requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${input.requestId}`,
    );
    return { success: true };
  } catch (err) {
    log.error('removeProcureGuardRequestViewer.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove viewer.',
    };
  }
}
