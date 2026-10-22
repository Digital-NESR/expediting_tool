import {
  FIRST_COMPUTER_DECLARATION,
  fmtDate,
  fmtDateTime,
  laptopRequestNeedsFirstComputerDeclaration,
} from '@/lib/laptopProcurement-utils';
import type { LaptopRequest, LaptopDocument, LaptopStageAssignee } from '@/types/laptopProcurement';

/**
 * The NESR mark as a data URI, fetched from /public at call time.
 *
 * Read at runtime rather than inlined as base64, matching the S&S exporter: it
 * is ~27 KB and would otherwise be charged to everyone who opens a request, not
 * just the few who export one. A missing logo degrades to a text-only header
 * rather than failing the export.
 */
let logoCache: string | null | undefined;
async function nesrLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch('/nesr-logo-green.png');
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

type Row = [string, string];

/** A value as the PDF should print it — never a blank cell. */
function v(value: string | null | undefined): string {
  const t = (value ?? '').toString().trim();
  return t ? t : '—';
}

export interface RequestPdfInput {
  request: LaptopRequest;
  documents: LaptopDocument[];
  stageAssignees: LaptopStageAssignee[];
  ownerLabel: string;
  /** False when the viewer is not entitled to see the replaced device. */
  includeExistingDevice: boolean;
}

/**
 * A one-file copy of an approved request, for the IT hand-over and the asset
 * record.
 *
 * Offered only once the request is fully approved. Before that the document
 * would be a snapshot of a decision still being made, and the one thing it must
 * not become is something that reads like an approval while the chain is still
 * running.
 *
 * Sections mirror the request screen, and the viewer's own entitlements are
 * carried in rather than re-derived: a PDF must not show the exporter anything
 * the page would have hidden from them.
 */
export async function exportRequestPdf({
  request,
  documents,
  stageAssignees,
  ownerLabel,
  includeExistingDevice,
}: RequestPdfInput): Promise<void> {
  const [{ jsPDF }, autoTableModule, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    nesrLogo(),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const labelWidth = 150;
  let cursorY = 44;

  /* Header. The reference number is what gets read off a printout and quoted
     back, so it is set large and monospaced. */
  const logoW = 46;
  const logoH = logo ? Math.round((logoW * 270) / 353) : 0; // the mark is 353x270
  const textX = logo ? margin + logoW + 14 : margin;

  if (logo) doc.addImage(logo, 'PNG', margin, cursorY - 12, logoW, logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('NESR — LAPTOP & DESKTOP PROCUREMENT', textX, cursorY);
  cursorY += 22;

  doc.setFont('courier', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(29, 91, 57);
  doc.text(request.reference_number, textX, cursorY);
  cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(88, 89, 91);
  doc.text(
    `${v(request.request_type)} · ${v(request.type_of_device)} · ${v(request.country)} · ${request.status}`,
    textX,
    cursorY,
  );
  cursorY += 10;

  cursorY = Math.max(cursorY, logo ? 44 - 12 + logoH + 8 : cursorY);
  doc.setDrawColor(42, 126, 79);
  doc.setLineWidth(2);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 18;

  const section = (title: string, rows: Row[]) => {
    if (!rows.length) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(31, 31, 29);
    doc.text(title, margin, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY,
      margin: { top: margin, bottom: 52, left: margin, right: margin },
      rowPageBreak: 'avoid',
      body: rows,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 5,
        lineColor: [228, 230, 230],
        lineWidth: 0.4,
        textColor: [31, 31, 29],
        valign: 'top',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: {
          cellWidth: labelWidth,
          fontStyle: 'bold',
          fillColor: [247, 249, 248],
          textColor: [88, 89, 91],
        },
        1: { cellWidth: pageWidth - margin * 2 - labelWidth },
      },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  };

  section('Request', [
    ['Reference', request.reference_number],
    ['Status', request.status],
    ['Current owner', v(ownerLabel)],
    ['Country', v(request.country)],
    ['Created', v(fmtDateTime(request.created_at))],
    ['Last updated', v(fmtDateTime(request.updated_at))],
  ]);

  section('Requester & organisation', [
    ['Requester', v(request.requested_by_name || request.requested_by_email)],
    ['Requester email', v(request.requested_by_email)],
    ['Requestor ID', v(request.employee_id)],
    ['Computer for', v(request.computer_for)],
    ...(request.request_type === 'New Employee'
      ? ([['Computer for employee ID', v(request.computer_for_employee_id)]] as Row[])
      : []),
    ['Department', v(request.department)],
    ['Company code', v(request.company_code)],
    ['Company name', v(request.company_name)],
    ['Cost center', v(request.cost_center)],
    /* In the PDF too. This is the copy that gets filed and argued over later, and a first
       machine issued to an existing employee is exactly the decision somebody asks about. */
    ...(laptopRequestNeedsFirstComputerDeclaration(request.request_type)
      ? ([
          ['Declaration', FIRST_COMPUTER_DECLARATION],
          [
            'Declared',
            request.first_computer_declared_at
              ? `${request.first_computer_declared_by || request.requested_by_email} on ${fmtDateTime(request.first_computer_declared_at)}`
              : 'Not recorded',
          ],
        ] as Row[])
      : []),
  ]);

  section('Requested device', [
    ['Type of request', v(request.request_type)],
    ['Type of device', v(request.type_of_device)],
    ['Requested model', v(request.requested_model)],
    ['Special requirements / justification', v(request.special_requirements)],
  ]);

  if (request.assigned_serial_no || request.assigned_model || request.assigned_age) {
    section('Assigned unit (from inventory)', [
      ['Serial number', v(request.assigned_serial_no)],
      ['Model', v(request.assigned_model)],
      ['Age', v(request.assigned_age)],
    ]);
  }

  if (includeExistingDevice) {
    section('Existing device', [
      ['Unit ID', v(request.unit_id)],
      ['Brand', v(request.current_brand)],
      ['Model', v(request.current_model)],
      ['Serial no.', v(request.serial_no)],
      ['Age', v(request.age_years)],
      ['SAP asset ID', v(request.sap_number)],
    ]);
  }

  const named = stageAssignees.filter((s) => s.state !== 'none');
  if (named.length) {
    section(
      'Assigned approvers',
      named.map((s) => [s.label, v(s.name)] as Row),
    );
  }

  /* One row per approver rather than a four-card grid: on paper the decision
     and the comment belong on the same line as the role that gave them. */
  section('Decisions', [
    ['IT Manager', `${v(request.itm_decision)}\n${v(request.itm_comments)}`],
    ['Country Manager', `${v(request.cm_decision)}\n${v(request.cm_comments)}`],
    ['IT Director', `${v(request.itd_decision)}\n${v(request.itd_comments)}`],
    ['Supply Chain Director', `${v(request.scd_decision)}\n${v(request.scd_comments)}`],
  ]);

  section('Review', [
    ['Reviewed by', v(request.reviewed_by_name || request.reviewed_by_email)],
    ['Reviewed at', v(fmtDateTime(request.reviewed_at))],
    ['Rejection reason', v(request.rejection_reason)],
    ['Latest review comment', v(request.review_comments)],
  ]);

  /* Named, not embedded: the files themselves stay in the tool, and someone
     holding the PDF needs to know what else exists and where to ask for it. */
  section('Attachments', [
    [
      documents.length === 1 ? '1 file' : `${documents.length} files`,
      documents.length
        ? documents.map((d) => `• ${d.original_name || d.document_name}`).join('\n')
        : 'No attachments uploaded.',
    ],
  ]);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `${request.reference_number} — generated ${fmtDate(new Date().toISOString())}. ` +
        'The tool remains the system of record for this request.',
      margin,
      h - 24,
    );
    doc.text(`Page ${p} of ${pages}`, pageWidth - margin, h - 24, { align: 'right' });
  }

  const safeRef = request.reference_number.replace(/[^A-Za-z0-9._-]+/g, '_');
  doc.save(`NESR_Laptop_Request_${safeRef}.pdf`);
}
