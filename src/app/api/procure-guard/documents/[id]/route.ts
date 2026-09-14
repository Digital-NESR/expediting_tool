import { NextRequest, NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import procureGuardPool from '@/lib/db-procureguard';
import { canActorViewRequest } from '@/lib/procure-guard/access';
import { resolveProcureGuardActorScope } from '@/lib/procure-guard/actor-scope';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import type { ProcureGuardActor } from '@/types/procureGuard';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

function extOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getProcureGuardUser();
  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) {
    return new NextResponse('Invalid document ID', { status: 400 });
  }

  try {
    const userEmail = user.email.toLowerCase();
    const { rows } = await procureGuardPool.query(
      `SELECT d.document_name, d.original_name, d.file_content, d.file_type, d.file_size,
              COALESCE(a.requested_by_email, adv.requested_by_email) AS requested_by_email,
              COALESCE(a.requester_notification_emails, adv.requester_notification_emails, ARRAY[]::TEXT[]) AS requester_notification_emails,
              COALESCE(a.country, adv.country) AS country,
              COALESCE(a.segment, adv.segment) AS segment
       FROM procure_guard_documents d
       LEFT JOIN procure_guard_adhoc_payments a ON d.request_type = 'adhoc' AND d.request_id = a.id
       LEFT JOIN procure_guard_advance_payments adv ON d.request_type = 'advance' AND d.request_id = adv.id
       WHERE d.id = $1`,
      [docId],
    );

    if (!rows[0]) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const doc = rows[0];

    // Resolved the same way the server actions resolve it (permission row AND active delegations),
    // then judged by the one shared view predicate. This route used to read the permission row on
    // its own and ignore delegations entirely, so a delegate who could open and approve a request
    // was refused its attachments.
    const scope = await resolveProcureGuardActorScope(userEmail, user.name ?? null);
    const actor: ProcureGuardActor = {
      email: scope.email,
      name: scope.permissionName ?? user.name ?? scope.email,
      isAdmin: scope.role === 'Admin',
      role: scope.role,
      permissions: scope.permissions,
      country: scope.country,
      segment: scope.segment,
      reviewGrants: scope.reviewGrants,
    };

    if (!canActorViewRequest(actor, {
      requested_by_email: doc.requested_by_email,
      requester_notification_emails: doc.requester_notification_emails,
      country: doc.country,
      segment: doc.segment,
    })) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const nameForExt: string = doc.original_name || doc.document_name;
    const ext = extOf(nameForExt);
    let contentType: string = doc.file_type || '';
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = MIME_MAP[ext] || 'application/octet-stream';
    }

    let fileBuffer: Buffer;
    if (Buffer.isBuffer(doc.file_content)) {
      fileBuffer = doc.file_content;
    } else {
      const str = String(doc.file_content);
      fileBuffer = str.startsWith('\\x') ? Buffer.from(str.slice(2), 'hex') : Buffer.from(str, 'binary');
    }

    const dlFilename = doc.original_name || doc.document_name;
    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': attachmentContentDisposition(dlFilename),
        'Content-Length': String(fileBuffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[ProcureGuard] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
