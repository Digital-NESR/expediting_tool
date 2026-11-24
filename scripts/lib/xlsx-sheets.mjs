/**
 * Reads any sheet of an ordinary xlsx by name, straight from the XML (shared strings, numbers and
 * inline strings), for workbooks exceljs cannot open (e.g. tables with colour filters). Cells come
 * back as strings, numbers or null; dates stay Excel serial numbers. Used by the Health Board loaders.
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
const colNum = (ref) =>
  [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function openWorkbook(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const shared = [];
  const sst = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (sst) {
    for (const m of sst.matchAll(/<si>(.*?)<\/si>/gs)) {
      shared.push(decode([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join('')));
    }
  }
  const wbx = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relTargets = new Map(
    [...rels.matchAll(/<Relationship ([^>]*)\/>/g)].map((m) => [
      /Id="([^"]+)"/.exec(m[1])[1],
      /Target="([^"]+)"/.exec(m[1])[1],
    ]),
  );
  const sheets = [...wbx.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: decode(m[1]),
    target: relTargets.get(m[2]),
  }));

  return {
    names: sheets.map((s) => s.name),
    /** Rows of a sheet, matched by name ignoring case and surrounding spaces. */
    async rows(name) {
      const s = sheets.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!s) throw new Error(`${file}: no sheet "${name}"`);
      const xml = await zip.file('xl/' + s.target.replace(/^\/?xl\//, '')).async('string');
      const rows = [];
      for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
        const cells = [];
        for (const c of r[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
          const t = /t="(\w+)"/.exec(c[2])?.[1];
          const v = /<v>(.*?)<\/v>/s.exec(c[3] ?? '')?.[1];
          const inline = /<is>.*?<t[^>]*>(.*?)<\/t>/s.exec(c[3] ?? '')?.[1];
          cells[colNum(c[1])] =
            t === 's'
              ? shared[Number(v)]
              : t === 'inlineStr'
                ? decode(inline ?? '')
                : t === 'str'
                  ? decode(v ?? '')
                  : v === undefined
                    ? null
                    : Number(v);
        }
        rows.push(cells);
      }
      return rows;
    },
  };
}
