import { clsLabel, displayStatus, leafOf, money, nodePath } from './helpers';
import { formatDate } from './date';
import type { RegistryRecord } from './types';

/**
 * A one-file copy of a registry record, for attaching to the SAP transaction.
 *
 * The hand-off asks the requestor to attach a PDF of the record alongside the
 * Registry ID, so this has to stand on its own: someone opening it inside SAP
 * has no access to the registry and needs the scope, the justification and the
 * validation trail in front of them.
 *
 * jspdf and jspdf-autotable are imported dynamically, matching ProcureGuard —
 * together they are a large dependency and nobody should pay for them just by
 * opening a record.
 */
export async function exportRecordPdf(rec: RegistryRecord): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const labelWidth = 150;
  let cursorY = 44;

  const idLabel = rec.id ?? 'Not yet issued';

  /* Header. The Registry ID is the whole point of the document, so it is set
     large and monospaced — it gets read off a printout and typed into SAP. */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('NESR — SINGLE & SOLE SOURCE REGISTRY', margin, cursorY);
  cursorY += 22;

  doc.setFont('courier', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(29, 91, 57);
  doc.text(idLabel, margin, cursorY);
  cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(88, 89, 91);
  doc.text(`${clsLabel(rec.cls)} · ${rec.country} · ${displayStatus(rec)}`, margin, cursorY);
  cursorY += 10;

  doc.setDrawColor(42, 126, 79);
  doc.setLineWidth(2);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 18;

  const section = (title: string, rows: [string, string][]) => {
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
    // autoTable records where it stopped on the doc it was given.
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  };

  section('Record', [
    ['Registry ID', idLabel],
    ['Classification', clsLabel(rec.cls)],
    ['Country / entity', rec.country],
    ['Status', displayStatus(rec)],
    ['Issue date', rec.issue ? formatDate(rec.issue) : 'Not issued'],
    ['Expiry date', rec.expiry ? formatDate(rec.expiry) : 'Not set'],
    ['Requestor', rec.requestor || '—'],
  ]);

  section('Supplier', [
    ['Supplier SAP ID', rec.supplierId || '—'],
    ['Supplier SAP name', rec.supplierName || '—'],
    ['Estimated annual spend', rec.spend ? money(rec.spend) : '—'],
  ]);

  section('Scope', [
    ['Scope level', rec.level],
    // One line per node, so a multi-line scope stays readable in the cell.
    ['Taxonomy', rec.nodes.map((n) => `${nodePath(n)}${leafOf(n)}`).join('\n') || '—'],
    ['Business segments', rec.segments.join(', ') || '—'],
  ]);

  section('Justification', [
    ['Reason code', rec.reason || '—'],
    ['Narrative', rec.justification || '—'],
  ]);

  if (rec.history.length) {
    section(
      'Validation & review history',
      rec.history.map(
        (h) =>
          [formatDate(h.date), [h.step, h.actor, h.note].filter(Boolean).join('\n')] as [
            string,
            string,
          ],
      ),
    );
  }

  /* Footer on every page: a printed copy detached from the registry should still
     say what it is, when it was taken, and that SAP remains the system of
     record for the approval itself. */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `${idLabel} — generated ${formatDate(new Date().toISOString().slice(0, 10))}. ` +
        'SAP remains the system of approval and execution.',
      margin,
      h - 24,
    );
    doc.text(`Page ${p} of ${pages}`, pageWidth - margin, h - 24, { align: 'right' });
  }

  const safeId = idLabel.replace(/[^A-Za-z0-9._-]+/g, '_');
  doc.save(`NESR_SS_Registry_${safeId}.pdf`);
}
