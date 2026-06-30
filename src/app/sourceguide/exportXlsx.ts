// Client-side Excel export helper. xlsx is dynamically imported so it isn't in the
// initial bundle. Call only in the browser (from a click handler).
export async function downloadXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'SourceGuide') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'No data' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
