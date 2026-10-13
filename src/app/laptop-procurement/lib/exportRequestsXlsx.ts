import { fmtDate } from '@/lib/laptopProcurement-utils';
import type { LaptopRequest } from '@/types/laptopProcurement';

/**
 * The columns, in the order they read on the sheet.
 *
 * Exported so the mapping can be tested without a workbook: the part worth
 * pinning is that every column pulls the field it claims to and that a null
 * becomes a blank cell rather than the string "null".
 */
export const REQUEST_COLUMNS: { name: string; width: number; of: (r: LaptopRequest) => string }[] =
  [
    { name: 'Reference', width: 14, of: (r) => r.reference_number },
    { name: 'Request Type', width: 18, of: (r) => r.request_type ?? '' },
    { name: 'Status', width: 22, of: (r) => r.status },
    { name: 'Pending With', width: 22, of: (r) => r.pending_with ?? '' },
    { name: 'Created', width: 14, of: (r) => fmtDate(r.created_at) },
    { name: 'Updated', width: 14, of: (r) => fmtDate(r.updated_at) },
    { name: 'Requester', width: 26, of: (r) => r.requested_by_name ?? '' },
    { name: 'Requester Email', width: 30, of: (r) => r.requested_by_email },
    { name: 'Requestor ID', width: 14, of: (r) => r.employee_id ?? '' },
    { name: 'Computer For', width: 26, of: (r) => r.computer_for ?? '' },
    { name: 'Country', width: 18, of: (r) => r.country ?? '' },
    { name: 'Department', width: 24, of: (r) => r.department ?? '' },
    { name: 'Company Code', width: 14, of: (r) => r.company_code ?? '' },
    { name: 'Company Name', width: 38, of: (r) => r.company_name ?? '' },
    { name: 'Cost Center', width: 16, of: (r) => r.cost_center ?? '' },
    { name: 'Type of Device', width: 16, of: (r) => r.type_of_device ?? '' },
    { name: 'Requested Model', width: 32, of: (r) => r.requested_model ?? '' },
    { name: 'Special Requirements', width: 50, of: (r) => r.special_requirements ?? '' },
    { name: 'Assigned Model', width: 28, of: (r) => r.assigned_model ?? '' },
    { name: 'Assigned Serial No.', width: 22, of: (r) => r.assigned_serial_no ?? '' },
    { name: 'Existing Unit ID', width: 18, of: (r) => r.unit_id ?? '' },
    { name: 'Existing Brand', width: 16, of: (r) => r.current_brand ?? '' },
    { name: 'Existing Model', width: 24, of: (r) => r.current_model ?? '' },
    { name: 'Existing Serial No.', width: 22, of: (r) => r.serial_no ?? '' },
    { name: 'Existing SAP Asset ID', width: 20, of: (r) => r.sap_number ?? '' },
    { name: 'IT Manager Decision', width: 30, of: (r) => r.itm_decision ?? '' },
    { name: 'IT Manager Comment', width: 44, of: (r) => r.itm_comments ?? '' },
    { name: 'Country Manager Decision', width: 24, of: (r) => r.cm_decision ?? '' },
    { name: 'Country Manager Comment', width: 44, of: (r) => r.cm_comments ?? '' },
    { name: 'IT Director Decision', width: 22, of: (r) => r.itd_decision ?? '' },
    { name: 'IT Director Comment', width: 44, of: (r) => r.itd_comments ?? '' },
    { name: 'Supply Chain Director Decision', width: 28, of: (r) => r.scd_decision ?? '' },
    { name: 'Supply Chain Director Comment', width: 44, of: (r) => r.scd_comments ?? '' },
    { name: 'Rejection Reason', width: 44, of: (r) => r.rejection_reason ?? '' },
  ];

/**
 * The requests currently on screen, as a spreadsheet.
 *
 * Takes the filtered list rather than re-reading the data: what gets exported
 * is exactly what the search box and the two dropdowns have narrowed the table
 * down to, which is the only behaviour that is not surprising when someone has
 * just filtered to one country and pressed Export.
 *
 * exceljs is imported dynamically, matching the PO Expediting export — it is a
 * large dependency and nobody should pay for it just by opening the list.
 */
export async function exportRequestsXlsx(
  requests: LaptopRequest[],
  filters: { search: string; status: string; requestType: string },
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Requests');

  /* What the numbers mean, above the table. A sheet that says "312 requests"
     with no note of the filter behind it gets mailed on and read as the whole
     population. */
  const applied = [
    filters.status !== 'All' ? `Status: ${filters.status}` : null,
    filters.requestType !== 'All' ? `Request type: ${filters.requestType}` : null,
    filters.search.trim() ? `Search: "${filters.search.trim()}"` : null,
  ].filter(Boolean);

  sheet.addRow(['NESR — Laptop & Desktop Procurement Requests']);
  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.addRow([
    `${requests.length} request${requests.length === 1 ? '' : 's'} · ` +
      (applied.length ? applied.join(' · ') : 'No filters applied') +
      ` · exported ${fmtDate(new Date().toISOString())}`,
  ]);
  sheet.getRow(2).font = { size: 10, color: { argb: 'FF58595B' } };
  sheet.addRow([]);

  const headerRowNumber = 4;
  sheet.addTable({
    name: 'LaptopRequests',
    ref: `A${headerRowNumber}`,
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: REQUEST_COLUMNS.map((c) => ({ name: c.name, filterButton: true })),
    /* exceljs refuses to write a table with no body rows, and an empty export
       is a legitimate thing to ask for — a filter that matched nothing is worth
       seeing on paper. One blank row keeps the headers and the filter note. */
    rows: requests.length
      ? requests.map((r) => REQUEST_COLUMNS.map((c) => c.of(r)))
      : [REQUEST_COLUMNS.map(() => '')],
  });

  REQUEST_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });
  // Freeze above the first body row so the headers stay put while scrolling.
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NESR_Laptop_Requests_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
