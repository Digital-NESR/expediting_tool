// Client-side Excel export helper. exceljs is dynamically imported so it isn't in the
// initial bundle. Call only in the browser (from a click handler).

/** exceljs rejects these characters in a sheet name; xlsx silently allowed some of them. */
function safeSheetName(name: string): string {
  const cleaned = name
    .replace(/[[\]*?/\\:]/g, '_')
    .replace(/^'+|'+$/g, '')
    .slice(0, 31);
  return cleaned || 'Sheet1';
}

/** Anything exceljs can't store natively is written as its string form. */
function toCellValue(v: unknown): string | number | boolean | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v as string | number | boolean;
  return String(v);
}

export async function downloadXlsx(
  filename: string,
  rows: Record<string, unknown>[],
  sheetName = 'SourceGuide',
) {
  const ExcelJS = await import('exceljs');
  const data = rows.length ? rows : [{ '': 'No data' }];

  // Column order = first-seen key order across all rows (what XLSX.utils.json_to_sheet did).
  const headers: string[] = [];
  for (const row of data) {
    for (const key of Object.keys(row)) if (!headers.includes(key)) headers.push(key);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeSheetName(sheetName));
  ws.addRow(headers);
  for (const row of data) ws.addRow(headers.map((h) => toCellValue(row[h])));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
