/**
 * Shared plumbing for stored-document upload and download.
 *
 * The extension→MIME map, the BYTEA decode and the download response headers were
 * copy-pasted across three download routes (TI-TE, ProcureGuard, Laptop Procurement)
 * and again inside three action files. Six copies of the same 17-entry map drift:
 * one gains `.eml`, another does not, and a download starts arriving as
 * `application/octet-stream` in one tool only.
 *
 * Filename headers are NOT re-implemented here: `attachmentContentDisposition` in
 * `@/lib/contentDisposition` already emits both RFC 6266 forms, and this module calls it.
 *
 * This module carries ONLY that plumbing. Every caller keeps its own authorization —
 * the three routes guard differently on purpose (TI-TE joins to shipments for country
 * scope, ProcureGuard runs `canActorViewRequest`, Laptop authorises on a metadata-only
 * query BEFORE the blob is fetched) and none of those checks belong here.
 */

import { attachmentContentDisposition } from '@/lib/contentDisposition';

/** Extension → MIME. The union of what the six former copies carried (they were identical). */
export const DOCUMENT_MIME_TYPES: Record<string, string> = {
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

/**
 * Extension of a filename, lowercased, or '' when the name carries no dot.
 *
 * The download routes used this stricter form: a dotless name such as `pdf` has no
 * extension and must not be read as one. Kept distinct from {@link uploadExtensionOf}
 * so neither side's behaviour moves.
 */
export function fileExtensionOf(fileName: string): string {
  const parts = (fileName ?? '').split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Extension as the UPLOAD paths derived it: the tail after the last dot, which for a
 * dotless name is the whole name. Deliberately preserved rather than folded into
 * {@link fileExtensionOf} — the two disagree only for a dotless filename that happens
 * to spell a map key, and this is a deduplication pass, not a bug-fix pass.
 */
function uploadExtensionOf(fileName: string): string {
  return ((fileName ?? '').split('.').pop() ?? '').toLowerCase();
}

/**
 * Content type for a DOWNLOAD: trust the type recorded at upload time, except when it
 * is missing or the generic `application/octet-stream` that a browser sends when it
 * cannot tell — then fall back to the extension.
 */
export function mimeTypeFor(fileName: string, storedType?: string | null): string {
  const stored = storedType || '';
  if (stored && stored !== 'application/octet-stream') return stored;
  return DOCUMENT_MIME_TYPES[fileExtensionOf(fileName)] || 'application/octet-stream';
}

/**
 * Content type to RECORD at upload: the extension wins over the browser-reported type,
 * which is unreliable (Windows hands back '' or octet-stream for .msg and .eml).
 * Note the precedence is the reverse of {@link mimeTypeFor}; both are intentional.
 */
export function uploadMimeTypeFor(fileName: string, browserType?: string | null): string {
  return (
    DOCUMENT_MIME_TYPES[uploadExtensionOf(fileName)] || browserType || 'application/octet-stream'
  );
}

/**
 * BYTEA → Buffer.
 *
 * `pg` may hand back a BYTEA column as a hex-escaped string (`\x<hexdigits>`) rather
 * than a Buffer. Passing that string to `Buffer.from()` with no encoding treats it as
 * UTF-8 and silently corrupts every downloaded file, so decode from hex instead.
 */
export function decodeBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  const str = String(value);
  return str.startsWith('\\x') ? Buffer.from(str.slice(2), 'hex') : Buffer.from(str, 'binary');
}

/**
 * The 200 response every document download route returns, once its own authorization
 * has already passed. Decodes the BYTEA, resolves the content type and emits the same
 * four headers all three routes emitted by hand.
 *
 * `private, no-cache` is deliberate: these bodies are access-scoped, so no shared cache
 * may hold one and the browser must re-ask (and be re-authorised) each time.
 */
export function fileDownloadResponse(
  content: unknown,
  fileName: string,
  storedType?: string | null,
): Response {
  const fileBuffer = decodeBytea(content);
  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': mimeTypeFor(fileName, storedType),
      'Content-Disposition': attachmentContentDisposition(fileName),
      'Content-Length': String(fileBuffer.byteLength),
      'Cache-Control': 'private, no-cache',
    },
  });
}
