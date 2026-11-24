/**
 * Reads the minimal xlsx that Power BI's "Export data" produces (inline strings, no shared strings,
 * filters written as a text row in the sheet). exceljs cannot open these, so the sheet XML is read
 * directly. Used by the Health Board loaders in scripts/.
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const decode = (s) =>
  s
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Every row of the first sheet as an array of cell texts. */
export async function readMinimalXlsx(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
  if (!sheet) throw new Error(`${file}: no sheet1 in the workbook`);
  return [...sheet.matchAll(/<x:row[^>]*>(.*?)<\/x:row>|<x:row\s*\/>/gs)].map((m) =>
    [
      ...(m[1] ?? '').matchAll(
        /<x:c[^>]*>(?:<x:is><x:t[^>]*>(.*?)<\/x:t><\/x:is>|<x:v>(.*?)<\/x:v>)<\/x:c>/gs,
      ),
    ].map((c) => decode(c[1] ?? c[2] ?? '')),
  );
}

/** Throws unless the sheet's "Applied filters" text contains every needed filter. */
export function requireFilters(file, rows, needed) {
  const filters = rows.map((r) => r.join(' ')).find((t) => t.startsWith('Applied filters')) ?? '';
  const missing = needed.filter((f) => !filters.includes(f));
  if (missing.length) {
    throw new Error(
      `${file}: missing filter(s): ${missing.join('; ')}\nIts filters were:\n${filters}`,
    );
  }
  return filters;
}
