import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Produce the signed copy of a letter: the original pages untouched, plus one signature page.
 *
 * A page appended rather than a signature stamped into the letter's own Name/Signature box,
 * because that box sits in a different place on every letter and a stamp in the wrong place is
 * worse than none. The page carries everything an auditor asks for: who signed, for which
 * supplier, from which address, when, and a reference back to the request.
 *
 * When the letter is not a PDF (or cannot be parsed), the result is the signature page alone, and
 * the original stays attached to the communication.
 */
export async function buildSignedCopy(input: {
  letter: Buffer | null;
  signaturePng: Buffer;
  vendorName: string;
  title: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  signedAt: Date;
  ip: string;
  reference: string;
}): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = input.letter ? await PDFDocument.load(input.letter, { ignoreEncryption: true }) : await PDFDocument.create();
  } catch {
    doc = await PDFDocument.create();
  }

  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.188, 0.486, 0.298);
  const grey = rgb(0.35, 0.4, 0.38);
  const dark = rgb(0.08, 0.12, 0.1);

  let y = 780;
  page.drawText('Acknowledgment and signature', { x: 56, y, size: 18, font: bold, color: green });
  y -= 30;
  page.drawText(clip(input.title, 80), { x: 56, y, size: 12, font: bold, color: dark });
  y -= 30;

  const statement =
    `On behalf of ${input.vendorName}, I confirm that I have reviewed the document(s) above, ` +
    `understand the requirements they set out, and commit to comply with them.`;
  for (const line of wrap(statement, font, 11, 483)) {
    page.drawText(line, { x: 56, y, size: 11, font, color: dark });
    y -= 16;
  }
  y -= 18;

  const rows: [string, string][] = [
    ['Supplier', input.vendorName],
    ['Name', input.signerName],
    ['Job title', input.signerTitle || '—'],
    ['Email', input.signerEmail],
    ['Signed at', input.signedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'],
    ['IP address', input.ip || '—'],
    ['Reference', input.reference],
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: 56, y, size: 10, font: bold, color: grey });
    page.drawText(clip(value, 70), { x: 160, y, size: 10, font, color: dark });
    y -= 18;
  }
  y -= 16;

  page.drawText('Signature', { x: 56, y, size: 10, font: bold, color: grey });
  y -= 10;
  const png = await doc.embedPng(input.signaturePng);
  const scale = Math.min(300 / png.width, 110 / png.height, 1);
  const w = png.width * scale;
  const h = png.height * scale;
  page.drawRectangle({
    x: 56,
    y: y - 120,
    width: 320,
    height: 120,
    borderColor: rgb(0.8, 0.84, 0.82),
    borderWidth: 1,
  });
  page.drawImage(png, { x: 66, y: y - 115 + (110 - h) / 2, width: w, height: h });

  page.drawText(
    'Signed electronically through the NESR ComplyConnect portal after email verification.',
    { x: 56, y: 60, size: 8, font, color: grey },
  );

  return Buffer.from(await doc.save());
}

function clip(text: string, max: number): string {
  const t = String(text ?? '').replace(/[^\x20-\x7E]/g, '?');
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, width: number): string[] {
  const words = text.replace(/[^\x20-\x7E]/g, '?').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
