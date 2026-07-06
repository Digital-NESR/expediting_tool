import { NextRequest, NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import procureGuardPool from '@/lib/db-procureguard';
import { getPermissionProfile, getProcureGuardCountryScopeCountries, normalizeProcureGuardCountry, roleRequiresProcureGuardCountryScope } from '@/lib/procureGuard-utils';
import type { ProcureGuardPermissionRole } from '@/types/procureGuard';

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

function adminEmails(): string[] {
  return (`${process.env.ADMIN_EMAILS ?? ''},${process.env.PROCURE_GUARD_ADMIN_EMAILS ?? ''}`)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

function normaliseScopeValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    ksa: 'saudi arabia (ksa)',
    'saudi arabia': 'saudi arabia (ksa)',
    uae: 'united arab emirates (uae)',
    'united arab emirates': 'united arab emirates (uae)',
  };
  return aliases[trimmed] ?? trimmed;
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
    const permissionRows = await procureGuardPool.query(
      'SELECT role, country, segment FROM procure_guard_permissions WHERE LOWER(email) = $1 LIMIT 1',
      [userEmail],
    );
    const permission = permissionRows.rows[0];
    const role = (permission?.role ?? (adminEmails().includes(userEmail) ? 'Admin' : 'Requester')) as ProcureGuardPermissionRole;
    const profile = getPermissionProfile(role);
    const requesterEmails = Array.isArray(doc.requester_notification_emails)
      ? doc.requester_notification_emails.map((email: string) => email.trim().toLowerCase()).filter(Boolean)
      : [];
    const requesterSideAccess = String(doc.requested_by_email ?? '').toLowerCase() === userEmail || requesterEmails.includes(userEmail);
    const scopedCountries = getProcureGuardCountryScopeCountries(permission?.country);
    const docCountry = normalizeProcureGuardCountry(doc.country);
    const countryOk = scopedCountries.length === 0
      ? !roleRequiresProcureGuardCountryScope(role)
      : Boolean(docCountry && scopedCountries.includes(docCountry));
    const segmentOk = !permission?.segment || normaliseScopeValue(permission.segment) === normaliseScopeValue(doc.segment);

    if (!requesterSideAccess && !(profile.canViewAll && countryOk && segmentOk)) {
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

    const dlFilename = (doc.original_name || doc.document_name).replace(/"/g, '_');
    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="' + dlFilename + '"',
        'Content-Length': String(fileBuffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[ProcureGuard] document download error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
