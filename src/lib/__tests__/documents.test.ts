import { describe, expect, it } from 'vitest';

import {
  detectFileSignature,
  mimeTypeFor,
  uploadMimeTypeFor,
  validateUploadSignature,
} from '@/lib/documents';

/**
 * The magic-byte check is the only server-side defence against a mislabelled upload: the extension
 * and the browser-reported MIME type are both things the client chose. These tests are written
 * against real leading bytes rather than against the signature table, so renaming a constant does
 * not quietly make them pass.
 */

/** Minimal but genuine file headers, byte for byte. */
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from('GIF89a', 'latin1');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]); // docx/xlsx container
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .xls/.doc/.msg
const TEXT = Buffer.from('supplier,rate\nACME,12.50\n', 'utf8');

describe('detectFileSignature', () => {
  it('names each format the catalog accepts', () => {
    expect(detectFileSignature(PDF)).toBe('pdf');
    expect(detectFileSignature(PNG)).toBe('png');
    expect(detectFileSignature(JPEG)).toBe('jpeg');
    expect(detectFileSignature(GIF)).toBe('gif');
    expect(detectFileSignature(ZIP)).toBe('zip');
    expect(detectFileSignature(OLE)).toBe('ole');
  });

  it('returns null for bytes that match nothing known', () => {
    expect(detectFileSignature(TEXT)).toBeNull();
    expect(detectFileSignature(Buffer.alloc(0))).toBeNull();
  });
});

describe('validateUploadSignature', () => {
  it('accepts a real PDF named .pdf', () => {
    expect(validateUploadSignature('agreement.pdf', PDF, 'application/pdf')).toEqual({ ok: true });
  });

  it('accepts the OOXML formats, which are ZIP containers', () => {
    expect(validateUploadSignature('rates.xlsx', ZIP).ok).toBe(true);
    expect(validateUploadSignature('contract.docx', ZIP).ok).toBe(true);
  });

  it('accepts a legacy .xls that is really a renamed .xlsx', () => {
    // People do rename these, and refusing the upload would be a false positive, not a catch.
    expect(validateUploadSignature('rates.xls', ZIP).ok).toBe(true);
    expect(validateUploadSignature('rates.xls', OLE).ok).toBe(true);
  });

  it('rejects a PNG that claims to be a PDF', () => {
    const verdict = validateUploadSignature('agreement.pdf', PNG, 'application/pdf');
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/\.pdf/);
  });

  it('rejects an empty file', () => {
    const verdict = validateUploadSignature('agreement.pdf', Buffer.alloc(0), 'application/pdf');
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/empty/i);
  });

  it('rejects bytes that carry no signature at all under an extension that requires one', () => {
    expect(validateUploadSignature('agreement.pdf', TEXT).ok).toBe(false);
  });

  it('rejects an extension and a content type that describe different formats', () => {
    const verdict = validateUploadSignature('agreement.pdf', PDF, 'image/png');
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/different formats/);
  });

  it('does not falsely reject a format that has no signature to check', () => {
    // Plain text and CSV begin with arbitrary bytes; there is nothing to compare against, so the
    // check must stay out of the way rather than invent a failure.
    expect(validateUploadSignature('rates.csv', TEXT, 'text/csv')).toEqual({ ok: true });
    expect(validateUploadSignature('notes.txt', TEXT, 'text/plain')).toEqual({ ok: true });
    expect(validateUploadSignature('mail.eml', TEXT).ok).toBe(true);
    expect(validateUploadSignature('no-extension-at-all', TEXT).ok).toBe(true);
  });
});

describe('mime resolution', () => {
  it('records the extension type at upload, preferring it over the browser', () => {
    // Windows hands back '' or octet-stream for these, which is why the extension wins here.
    expect(uploadMimeTypeFor('agreement.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(uploadMimeTypeFor('agreement.pdf', '')).toBe('application/pdf');
  });

  it('trusts the stored type at download, falling back to the extension when it is generic', () => {
    expect(mimeTypeFor('agreement.pdf', 'application/pdf')).toBe('application/pdf');
    expect(mimeTypeFor('agreement.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(mimeTypeFor('agreement.pdf', null)).toBe('application/pdf');
    expect(mimeTypeFor('mystery', null)).toBe('application/octet-stream');
  });
});
