/**
 * A minimal ZIP writer: files are STORED (no compression), written one at a time.
 *
 * Why not a library: the files that go in here are supplier uploads (PDFs, scans, Excel), which
 * are already compressed, so deflating them again buys almost nothing; and a stored ZIP is a small
 * enough format to write directly rather than add a dependency for it. Each entry's CRC and size
 * are known before its header is written (the caller hands over the whole file), so no data
 * descriptors are needed.
 *
 * Limits, all far beyond a month's supplier documents: under 65,535 entries and under 4 GB in
 * total (no ZIP64). Names are written as UTF-8 with the language-encoding flag set, which Windows
 * Explorer, macOS and 7-Zip all honour.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time, which is what a ZIP header carries. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const UTF8_FLAG = 0x0800;

/**
 * Builds a ZIP piece by piece. `add` returns the bytes to send for one file; `finish` returns the
 * central directory that closes the archive. Nothing is held but the small directory records, so
 * a caller can stream each piece out as soon as it has it.
 */
export class StoredZip {
  private entries: CentralEntry[] = [];
  private offset = 0;
  private names = new Set<string>();

  /** Adds a file. A path already used gets " (2)", " (3)"… before its extension. */
  add(path: string, data: Uint8Array, modified = new Date()): Uint8Array {
    const unique = this.uniquePath(path);
    const name = new TextEncoder().encode(unique);
    const crc = crc32(data);
    const { time, date } = dosDateTime(modified);

    const header = new Uint8Array(30 + name.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true); // local file header signature
    v.setUint16(4, 20, true); // version needed: 2.0
    v.setUint16(6, UTF8_FLAG, true);
    v.setUint16(8, 0, true); // method: stored
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true); // compressed size
    v.setUint32(22, data.length, true); // uncompressed size
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true); // extra field length
    header.set(name, 30);

    this.entries.push({ name, crc, size: data.length, offset: this.offset, time, date });
    this.offset += header.length + data.length;

    const out = new Uint8Array(header.length + data.length);
    out.set(header, 0);
    out.set(data, header.length);
    return out;
  }

  /** The central directory and end record. Call once, after the last `add`. */
  finish(): Uint8Array {
    const parts: Uint8Array[] = [];
    let size = 0;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 0x02014b50, true); // central directory signature
      v.setUint16(4, 20, true); // version made by
      v.setUint16(6, 20, true); // version needed
      v.setUint16(8, UTF8_FLAG, true);
      v.setUint16(10, 0, true); // stored
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      // extra, comment, disk start, internal attrs, external attrs: all zero
      v.setUint32(42, e.offset, true);
      rec.set(e.name, 46);
      parts.push(rec);
      size += rec.length;
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); // end of central directory signature
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, size, true);
    v.setUint32(16, this.offset, true);
    parts.push(end);

    const out = new Uint8Array(size + end.length);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  private uniquePath(path: string): string {
    let candidate = path;
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    const [stem, ext] = dot > slash ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    for (let n = 2; this.names.has(candidate.toLowerCase()); n++)
      candidate = `${stem} (${n})${ext}`;
    this.names.add(candidate.toLowerCase());
    return candidate;
  }
}

/**
 * One folder or file name, safe on Windows and macOS: no path separators or reserved characters,
 * no trailing dots or spaces, nothing empty, and not over 100 characters.
 */
export function safeZipName(raw: string, fallback = 'file'): string {
  const cleaned = String(raw ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
    .trim();
  return cleaned || fallback;
}
