import { describe, expect, it } from 'vitest';
import { StoredZip, crc32, safeZipName } from '../zip-store';

const enc = (s: string) => new TextEncoder().encode(s);

/** Reads a stored ZIP back through its central directory: the names and contents it holds. */
function readZip(bytes: Uint8Array): Record<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const offset = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(offset, true)).toBe(0x04034b50);
    const localNameLen = v.getUint16(offset + 26, true);
    const data = bytes.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size);
    expect(v.getUint32(offset + 14, true)).toBe(crc32(data));
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

function build(files: [string, string][]): Uint8Array {
  const zip = new StoredZip();
  const parts = files.map(([p, s]) => zip.add(p, enc(s), new Date(2026, 10, 24, 13, 5, 0)));
  parts.push(zip.finish());
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(enc(''))).toBe(0);
  });
});

describe('StoredZip', () => {
  it('writes folders of files that read back intact', () => {
    const zip = readZip(
      build([
        ['Automak (1101066)/Delivery Note - DN.pdf', 'dn bytes'],
        ['Automak (1101066)/Invoice - INV 4471.pdf', 'invoice'],
        ['Palisade (1103542)/Timesheet - Nov.xlsx', 'ts'],
      ]),
    );
    expect(zip).toEqual({
      'Automak (1101066)/Delivery Note - DN.pdf': 'dn bytes',
      'Automak (1101066)/Invoice - INV 4471.pdf': 'invoice',
      'Palisade (1103542)/Timesheet - Nov.xlsx': 'ts',
    });
  });
  it('keeps Arabic and other non-ASCII names', () => {
    expect(Object.keys(readZip(build([['مورد (1)/Invoice - فاتورة.pdf', 'x']])))).toEqual([
      'مورد (1)/Invoice - فاتورة.pdf',
    ]);
  });
  it('never lets two files share a path', () => {
    expect(
      Object.keys(
        readZip(
          build([
            ['A/x.pdf', '1'],
            ['A/X.pdf', '2'],
            ['A/x.pdf', '3'],
          ]),
        ),
      ),
    ).toEqual(['A/x.pdf', 'A/X (2).pdf', 'A/x (3).pdf']);
  });
  it('is a valid empty archive with no files', () => {
    expect(readZip(build([]))).toEqual({});
  });
});

describe('safeZipName', () => {
  it('removes path separators and characters Windows refuses', () => {
    expect(safeZipName('..\\..\\evil/name:*?.pdf')).toBe('.._.._evil_name___.pdf');
    expect(safeZipName('Al Futtaim Co. L.L.C. ')).toBe('Al Futtaim Co. L.L.C');
    expect(safeZipName('   ', 'Supplier')).toBe('Supplier');
  });
});
