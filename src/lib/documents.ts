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

/* ---------------------------------------------------------------------------
   Magic-byte sniffing.

   A browser-reported MIME type and a filename extension are both just claims the
   client makes; either can be renamed in a file picker. These signatures read the
   first few bytes of what was actually uploaded and compare them against what the
   claim implies.

   What this proves: the file is not a mislabelled or deliberately disguised one —
   a .exe renamed to .pdf, or an image the client swore was a spreadsheet.

   What it does NOT prove, and must not be sold as proving:
     - that the file is safe. A genuine PDF or XLSX can carry a malicious payload
       and still have a perfect header. This is not a malware scanner.
     - anything at all about a format with no signature. Plain text, CSV and .eml
       begin with arbitrary bytes, so there is nothing to check and such uploads
       are accepted on their extension alone.
     - that the rest of the file is well-formed. Only the leading bytes are read.
--------------------------------------------------------------------------- */

/** Formats whose leading bytes we can recognise. `null` elsewhere means "no signature". */
export type FileSignature = 'pdf' | 'png' | 'jpeg' | 'gif' | 'zip' | 'ole';

/**
 * Leading-byte signatures, as hex. Longest-first is not needed — no prefix here is a
 * prefix of another — but the order is kept stable for readability.
 */
const FILE_SIGNATURES: ReadonlyArray<{ signature: FileSignature; hex: string }> = [
  { signature: 'pdf', hex: '25504446' }, // %PDF
  { signature: 'png', hex: '89504e470d0a1a0a' },
  { signature: 'jpeg', hex: 'ffd8ff' }, // JFIF / Exif / raw JPEG all share this
  { signature: 'gif', hex: '47494638' }, // GIF8 — covers both GIF87a and GIF89a
  // ZIP container: docx/xlsx/pptx are ZIPs. PK\x03\x04 is a normal local file header;
  // PK\x05\x06 (empty archive) and PK\x07\x08 (spanned) are the other two openers a
  // real archive can legitimately start with.
  { signature: 'zip', hex: '504b0304' },
  { signature: 'zip', hex: '504b0506' },
  { signature: 'zip', hex: '504b0708' },
  // OLE2 compound file: legacy .doc/.xls/.ppt and Outlook .msg.
  { signature: 'ole', hex: 'd0cf11e0a1b11ae1' },
];

/** The signature the leading bytes carry, or null when they match nothing known. */
export function detectFileSignature(content: Buffer): FileSignature | null {
  const head = content.subarray(0, 8).toString('hex');
  for (const { signature, hex } of FILE_SIGNATURES) {
    if (head.startsWith(hex)) return signature;
  }
  return null;
}

/**
 * Which signatures a given extension may legitimately carry. An extension that is
 * absent has no signature to check.
 *
 * The legacy Office extensions accept `zip` as well as `ole`: saving an .xlsx and
 * naming it `.xls` is something people really do, and refusing that upload would be
 * a false positive rather than a caught disguise.
 */
const SIGNATURE_BY_EXTENSION: Record<string, readonly FileSignature[]> = {
  pdf: ['pdf'],
  png: ['png'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  gif: ['gif'],
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  zip: ['zip'],
  doc: ['ole', 'zip'],
  xls: ['ole', 'zip'],
  ppt: ['ole', 'zip'],
  msg: ['ole'],
};

/** Same, keyed by the MIME type the client claims. Only types with a signature appear. */
const SIGNATURE_BY_MIME: Record<string, readonly FileSignature[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpeg'],
  'image/gif': ['gif'],
  'application/zip': ['zip'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip'],
  'application/msword': ['ole', 'zip'],
  'application/vnd.ms-excel': ['ole', 'zip'],
  'application/vnd.ms-outlook': ['ole'],
};

export type UploadSignatureVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Sanity-check an upload's real leading bytes against the extension and the MIME type
 * the client claimed for it.
 *
 * Rejects when:
 *   - the file is empty (nothing was actually uploaded);
 *   - the extension and the claimed MIME type imply different formats;
 *   - the claim implies a format with a signature and the bytes carry a different one,
 *     or carry no recognisable signature at all.
 *
 * Accepts when the claim implies no signature (txt, csv, eml, webp…), because there is
 * nothing to compare against — see the honesty note above the signature table.
 */
export function validateUploadSignature(
  fileName: string,
  content: Buffer,
  claimedType?: string | null,
): UploadSignatureVerdict {
  if (!content || content.byteLength === 0) {
    return { ok: false, reason: 'The uploaded file is empty.' };
  }

  const extension = fileExtensionOf(fileName);
  const byExtension = SIGNATURE_BY_EXTENSION[extension];
  const byMime = SIGNATURE_BY_MIME[(claimedType || '').toLowerCase()];

  // Both claims known: they have to agree with each other before either can judge the bytes.
  let expected = byExtension ?? byMime;
  if (byExtension && byMime) {
    expected = byExtension.filter((s) => byMime.includes(s));
    if (expected.length === 0) {
      return {
        ok: false,
        reason: `The file extension (.${extension}) and its content type (${claimedType}) describe different formats.`,
      };
    }
  }

  if (!expected) return { ok: true }; // no signature to check — accepted on its extension alone

  const actual = detectFileSignature(content);
  if (actual && expected.includes(actual)) return { ok: true };

  return {
    ok: false,
    reason: `This file's contents do not look like a ${extension ? `.${extension}` : claimedType || 'valid'} file. Re-save it in the format its name claims and upload it again.`,
  };
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
