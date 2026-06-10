'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatProcureGuardStatusLabel,
  fmtDateTime,
  getWorkflowSteps,
  getPriorityBadge,
  getStatusBadge,
  isActiveApprovalStatus,
  usdEquivalentFmt,
  usdFmt,
} from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardRequestDetailData,
} from '@/types/procureGuard';
import ProcureGuardSidebar from './ProcureGuardSidebar';
import ProcureGuardNotificationContactsPanel from './ProcureGuardNotificationContactsPanel';
import ProcureGuardLogo from './ProcureGuardLogo';
import { updateAdhocPaymentStatus, updateAdvancePaymentStatus } from '@/app/actions/procureGuard';

type DetailValue = string | number | null | undefined;
type PdfSectionKey = 'summary' | 'vendor' | 'details' | 'review' | 'attachments' | 'activity';

const PDF_SECTION_OPTIONS: Array<{ key: PdfSectionKey; label: string; description: string }> = [
  { key: 'summary', label: 'Request summary', description: 'Reference, status, amount, and dates.' },
  { key: 'vendor', label: 'Vendor and requester', description: 'Vendor, requester, country, segment, and additional request notifications.' },
  { key: 'details', label: 'Request details', description: 'Spend category, justification, and request comments.' },
  { key: 'review', label: 'Review', description: 'Reviewer, rejection, and review comments.' },
  { key: 'attachments', label: 'Attachments', description: 'Uploaded file names and upload details.' },
  { key: 'activity', label: 'Activity log', description: 'Timeline of meaningful request activity.' },
];

const DEFAULT_PDF_SECTIONS: Record<PdfSectionKey, boolean> = {
  summary: true,
  vendor: true,
  details: true,
  review: true,
  attachments: true,
  activity: true,
};

function isAdvanceRequest(request: AdhocPaymentRequest | AdvancePaymentRequest): request is AdvancePaymentRequest {
  return 'advance_purpose' in request;
}

function textValue(value: DetailValue) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function pdfValue(value: DetailValue) {
  return textValue(value).replace(/\s+/g, ' ').trim();
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'procureguard-request';
}

function Field({ label, value }: { label: string; value: DetailValue }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{textValue(value)}</p>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityBadge(priority)}`}>
      {priority}
    </span>
  );
}

function WorkflowChain({
  requestType,
  status,
  amount,
  currency,
}: {
  requestType: 'adhoc' | 'advance';
  status: AdhocPaymentRequest['status'];
  amount: number;
  currency: string;
}) {
  const steps = getWorkflowSteps(requestType, amount, currency);
  const currentIndex = steps.findIndex(step => step.status === status);
  const completedIndex = status === 'Approved'
    ? steps.length - 1
    : Math.max(0, currentIndex - 1);

  return (
    <Section title="Approval Chain">
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex && status !== 'Approved';
          const isComplete = index <= completedIndex || status === 'Approved';
          return (
            <div key={step.status} className={`rounded-md border p-3 ${isCurrent ? 'border-[#307c4c]/30 bg-[#307c4c]/10' : isComplete ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCurrent ? 'bg-[#307c4c] text-white' : isComplete ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{step.label}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{step.owner}</p>
                  <p className="mt-1 text-xs text-slate-500">{step.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}


function fmtBytes(n: number | null): string {
  if (!n) return 'Unknown size';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function fileBadgeLabel(mime: string | null) {
  if (!mime) return 'FILE';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('msword')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  if (mime.includes('image')) return 'IMG';
  if (mime.includes('zip') || mime.includes('rar')) return 'ZIP';
  return 'FILE';
}

function reviewActionLabel(action: string) {
  const decision = action.replace(/^Status updated to\s+/i, '').trim();
  return decision ? formatProcureGuardStatusLabel(decision) : action;
}

function activityActionLabel(action: string) {
  return action.replace(/^Status updated to\s+(.+)$/i, (_, status: string) => `Status updated to ${formatProcureGuardStatusLabel(status)}`);
}

function emailListLabel(emails: string[] | null | undefined) {
  return emails?.length ? emails.join(', ') : null;
}

function emailOverrideLabel(overrides: Record<string, string[]> | null | undefined) {
  const rows = Object.entries(overrides ?? {}).filter(([, emails]) => emails.length > 0);
  return rows.length ? rows.map(([role, emails]) => `${role}: ${emails.join(', ')}`).join(' | ') : null;
}

export default function ProcureGuardRequestDetailClient({ data }: { data: ProcureGuardRequestDetailData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [highlightDecision, setHighlightDecision] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [pdfSections, setPdfSections] = useState(DEFAULT_PDF_SECTIONS);
  const [isPending, startTransition] = useTransition();
  const decisionRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { request, request_type: requestType, activity, documents, notification_contacts: notificationContacts, actions, actor } = data;
  const isAdvance = isAdvanceRequest(request);
  const listHref = isAdvance ? '/procure-guard/advance-payments' : '/procure-guard/adhoc-payments';
  const requestLabel = isAdvance ? 'Advance Payment' : 'Adhoc Payment';
  const workflowAmount = request.spend_value_usd ?? request.amount;
  const workflowCurrency = request.spend_value_usd === null || request.spend_value_usd === undefined ? request.currency : 'USD';
  const requester = request.requested_by_name || request.requested_by_email;
  const pendingCount = isActiveApprovalStatus(request.status) ? 1 : 0;
  const ownsRequest = request.requested_by_email.toLowerCase() === actor.email.toLowerCase();
  const canEditRequest = request.status === 'Submitted' && (ownsRequest || actor.permissions.canManageData);
  const canCancel = ownsRequest && request.status === 'Submitted' && actor.permissions.canCreateRequests;
  const hasDecisionActions = actions.canApprove || actions.canReject || canCancel;
  const editHref = `/procure-guard/${isAdvance ? 'advance-payments' : 'adhoc-payments'}/${request.id}/edit`;
  const selectedPdfSectionCount = PDF_SECTION_OPTIONS.filter(option => pdfSections[option.key]).length;
  const reviewDecisionSection = (
    <Section title="Review And Decision">
      <div className="space-y-4">
        {notice && <div className="rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-3 py-2 text-sm font-semibold text-[#307c4c]">{notice}</div>}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Current Owner" value={actions.nextStatus ? actions.ownerLabel : 'Workflow complete'} />
          <Field label="Next Action" value={actions.nextStatus ? formatProcureGuardStatusLabel(actions.nextStatus) : 'No active decision'} />
          <Field label="Reviewed By" value={request.reviewed_by_name || request.reviewed_by_email} />
          <Field label="Reviewed At" value={fmtDateTime(request.reviewed_at)} />
          <Field label="Rejection Reason" value={request.rejection_reason} />
          <Field label="Latest Review Comment" value={request.review_comments} />
        </div>

        {hasDecisionActions && (
          <div
            ref={decisionRef}
            className={`rounded-lg border bg-slate-50 p-4 transition-all duration-300 ${highlightDecision ? 'border-[#307c4c] ring-4 ring-[#307c4c]/20' : 'border-slate-200'}`}
          >
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Comment <span className="font-normal text-slate-400">(required for rejection only)</span></label>
            <textarea
              className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20"
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.canApprove && actions.nextStatus && (
                <button disabled={isPending} onClick={() => submitStatus(actions.nextStatus!)} className="rounded-md bg-[#307c4c] px-3 py-2 text-xs font-bold text-white hover:bg-[#307c4c]/80 disabled:opacity-60">
                  {actions.nextStatus === 'Under Review' ? 'Start Review' : 'Approve'}
                </button>
              )}
              {actions.canReject && (
                <button disabled={isPending} onClick={() => submitStatus('Rejected')} className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">Reject</button>
              )}
              {canCancel && (
                <button disabled={isPending} onClick={() => setIsCancelDialogOpen(true)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60">Cancel Request</button>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
  const activitySection = (
    <Section title="Activity">
      {activity.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">No activity has been recorded yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {activity.map(item => (
            <div key={item.id} className="py-3">
              <p className="text-sm font-bold text-slate-900">{activityActionLabel(item.action)}</p>
              <p className="mt-1 text-xs text-slate-500">{item.actor_name || item.actor_email || 'System'}</p>
              {item.notes && <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{item.notes}</p>}
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{fmtDateTime(item.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  function jumpToDecision() {
    decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDecision(true);
    window.setTimeout(() => setHighlightDecision(false), 1800);
  }

  function submitStatus(nextStatus: AdhocPaymentRequest['status']) {
    setNotice('');
    setError('');
    const comment = reviewComment.trim();
    if (nextStatus === 'Rejected' && !comment) {
      setError('Add a comment before rejecting this request.');
      return;
    }

    startTransition(async () => {
      const result = requestType === 'adhoc'
        ? await updateAdhocPaymentStatus(request.id, nextStatus, comment)
        : await updateAdvancePaymentStatus(request.id, nextStatus, comment);

      if (result.success) {
        setReviewComment('');
        setIsCancelDialogOpen(false);
        setNotice(`Request updated to ${formatProcureGuardStatusLabel(nextStatus)}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Status update failed.');
      }
    });
  }

  function setAllPdfSections(value: boolean) {
    setPdfSections({
      summary: value,
      vendor: value,
      details: value,
      review: value,
      attachments: value,
      activity: value,
    });
  }

  async function exportRequestPdf() {
    setError('');
    if (selectedPdfSectionCount === 0) {
      setError('Choose at least one section to export.');
      return;
    }
    setIsExportingPdf(true);

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = autoTableModule.default;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = 40;

      const addFooter = () => {
        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page += 1) {
          doc.setPage(page);
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`ProcureGuard export | ${request.reference_number} | Page ${page} of ${pageCount}`, margin, doc.internal.pageSize.getHeight() - 24);
        }
      };

      const addTable = (title: string, rows: Array<[string, DetailValue]>) => {
        const visibleRows = rows.map(([label, value]) => [label, pdfValue(value)]);
        if (visibleRows.length === 0) return;

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, cursorY);
        cursorY += 8;

        autoTable(doc, {
          startY: cursorY,
          margin: { left: margin, right: margin },
          body: visibleRows,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 8.5,
            cellPadding: 5,
            lineColor: [226, 232, 240],
            lineWidth: 0.4,
            textColor: [15, 23, 42],
            valign: 'top',
          },
          columnStyles: {
            0: { cellWidth: 145, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105] },
            1: { cellWidth: pageWidth - margin * 2 - 145 },
          },
          alternateRowStyles: { fillColor: [255, 255, 255] },
        });

        cursorY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY) + 20;
      };

      const addReviewHistoryTable = () => {
        const reviewRows = activity
          .filter(item => item.action.startsWith('Status updated to '))
          .slice()
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map(item => [
            fmtDateTime(item.created_at),
            reviewActionLabel(item.action),
            item.actor_name || item.actor_email || 'System',
            item.notes || '-',
          ]);

        if (reviewRows.length === 0) {
          addTable('Review History', [
            ['Review History', request.reviewed_at
              ? `${fmtDateTime(request.reviewed_at)} | ${request.reviewed_by_name || request.reviewed_by_email || 'Reviewer'} | ${formatProcureGuardStatusLabel(request.status)}${request.review_comments ? ` | ${request.review_comments}` : ''}`
              : 'No review actions have been recorded yet.'],
          ]);
          return;
        }

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text('Review History', margin, cursorY);
        cursorY += 8;

        autoTable(doc, {
          startY: cursorY,
          margin: { left: margin, right: margin },
          head: [['Date', 'Decision', 'Reviewer', 'Comment']],
          body: reviewRows,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 5,
            lineColor: [226, 232, 240],
            lineWidth: 0.4,
            textColor: [15, 23, 42],
            valign: 'top',
          },
          headStyles: {
            fillColor: [48, 124, 76],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          columnStyles: {
            0: { cellWidth: 105 },
            1: { cellWidth: 128 },
            2: { cellWidth: 132 },
            3: { cellWidth: pageWidth - margin * 2 - 365 },
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        cursorY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY) + 20;
      };

      doc.setFillColor(48, 124, 76);
      doc.rect(0, 0, pageWidth, 78, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('NESR ProcureGuard', margin, 34);
      doc.setFontSize(12);
      doc.text(`${requestLabel} Log Export`, margin, 56);
      doc.setFontSize(9);
      doc.text(`Generated ${fmtDateTime(new Date().toISOString())}`, pageWidth - margin, 34, { align: 'right' });

      cursorY = 104;
      if (pdfSections.summary) {
        addTable('Request Summary', [
          ['Reference Number', request.reference_number],
          ['Request Type', requestLabel],
          ['Status', formatProcureGuardStatusLabel(request.status)],
          ['Priority', request.priority],
          ['Original Amount', usdFmt(request.amount, request.currency)],
          ['USD Equivalent', usdEquivalentFmt(request.amount, request.currency)],
          ['Created', fmtDateTime(request.created_at)],
          ['Updated', fmtDateTime(request.updated_at)],
        ]);
      }

      if (pdfSections.vendor) {
        addTable('Vendor And Requester', [
          ['Requisition Number', request.requisition_number],
          ['Vendor', request.vendor_name],
          [isAdvance ? 'SAP Vendor ID' : 'Vendor Tax ID', isAdvance ? request.sap_vendor_id || request.vendor_code : request.vendor_tax_id || request.vendor_code],
          ['Requester', requester],
          ['Requester Email', request.requested_by_email],
          ['Country', request.country],
          ['Segment', request.segment],
          ['Additional Request Notifications', emailListLabel(request.requester_notification_emails)],
          ['Email Test Mode', request.email_test_mode ? 'Enabled' : 'Disabled'],
          ...(request.email_test_mode ? [['Test Email Recipients', emailListLabel(request.email_test_recipients)] satisfies [string, DetailValue]] : []),
          ...(request.email_test_mode ? [['Role Test Recipients', emailOverrideLabel(request.email_test_recipient_overrides)] satisfies [string, DetailValue]] : []),
        ]);
      }

      if (pdfSections.details) {
        addTable('Request Details', [
          ['Spend Category', request.spend_category || (isAdvance ? null : request.expense_category)],
          ['Spend Value USD', request.spend_value_usd === null ? usdFmt(request.amount, 'USD') : usdFmt(request.spend_value_usd)],
          ...(isAdvance
            ? [
                ['Payment Terms Days', request.current_payment_terms_days],
                ['Credit Limit USD', request.current_credit_limit_usd === null ? null : usdFmt(request.current_credit_limit_usd)],
                ['Reason / Justification', request.advance_purpose || request.justification],
                ['Requester Comments', request.requester_comments || request.notes],
              ] satisfies Array<[string, DetailValue]>
            : [
                ['Reason / Justification', request.payment_reason || request.justification],
                ['Requester Comments', request.requester_comments || request.notes],
                ['Acknowledged At', fmtDateTime(request.acknowledged_at)],
              ] satisfies Array<[string, DetailValue]>),
        ]);
      }

      if (pdfSections.review) {
        addTable('Review', [
          ['Latest Reviewed By', request.reviewed_by_name || request.reviewed_by_email],
          ['Latest Reviewed At', fmtDateTime(request.reviewed_at)],
          ['Rejection Reason', request.rejection_reason],
          ['Latest Review Comment', request.review_comments],
        ]);
        addReviewHistoryTable();
      }

      if (pdfSections.attachments) {
        addTable('Attachments', documents.length
          ? documents.map(docRow => [docRow.original_name || docRow.document_name, `${fileBadgeLabel(docRow.file_type)} | ${fmtBytes(docRow.file_size)} | Uploaded by ${docRow.uploaded_by_name || docRow.uploaded_by_email || 'Unknown'}`])
          : [['Attachments', 'No attachments uploaded.']]);
      }

      if (pdfSections.activity) {
        addTable('Activity Log', activity.length
          ? activity.map(item => [fmtDateTime(item.created_at), `${activityActionLabel(item.action)}${item.actor_name || item.actor_email ? ` by ${item.actor_name || item.actor_email}` : ''}${item.notes ? ` | ${item.notes}` : ''}`])
          : [['Activity', 'No activity has been recorded yet.']]);
      }

      addFooter();
      doc.save(`${safeFileName(request.reference_number)}-${requestType}-log.pdf`);
      setIsPdfDialogOpen(false);
    } catch (err) {
      console.error('[ProcureGuard PDF export]', err);
      setError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={pendingCount} accessView={data.actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">{requestLabel} Detail</span>
        <button
          type="button"
          onClick={() => setIsPdfDialogOpen(true)}
          disabled={isExportingPdf}
          className="ml-auto rounded-md border border-[#307c4c]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#307c4c] shadow-sm hover:bg-[#307c4c]/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Export PDF
        </button>
        <Link href={listHref} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
          Back to list
        </Link>
      </header>

      {isPdfDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="pdf-export-title" className="text-base font-bold text-slate-950">Export PDF</h2>
                  <p className="mt-1 text-sm text-slate-500">Choose which sections to include for this log export.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfDialogOpen(false)}
                  disabled={isExportingPdf}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{selectedPdfSectionCount} of {PDF_SECTION_OPTIONS.length} selected</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllPdfSections(true)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Select all</button>
                  <button type="button" onClick={() => setAllPdfSections(false)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear</button>
                </div>
              </div>

              <div className="space-y-2">
                {PDF_SECTION_OPTIONS.map(option => (
                  <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 transition hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5">
                    <input
                      type="checkbox"
                      checked={pdfSections[option.key]}
                      onChange={e => setPdfSections(prev => ({ ...prev, [option.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {selectedPdfSectionCount === 0 && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Choose at least one section before exporting.</p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPdfDialogOpen(false)}
                disabled={isExportingPdf}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={exportRequestPdf}
                disabled={isExportingPdf || selectedPdfSectionCount === 0}
                className="rounded-md bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#307c4c]/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExportingPdf ? 'Exporting...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-request-title" className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="cancel-request-title" className="text-base font-bold text-slate-950">Are you sure?</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cancel {request.reference_number}? This will stop the request before review starts.
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                This cannot be approved after cancellation unless a new request is submitted.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsCancelDialogOpen(false)}
                disabled={isPending}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Keep Request
              </button>
              <button
                type="button"
                onClick={() => submitStatus('Cancelled')}
                disabled={isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? 'Cancelling...' : 'Yes, cancel request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1220px] space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#307c4c]">{requestLabel}</p>
              <h1 className="mt-2 break-words text-2xl font-bold text-slate-950 sm:text-3xl">{request.reference_number}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {request.vendor_name} requested by {requester}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEditRequest && (
                <Link
                  href={editHref}
                  className="rounded-md border border-[#307c4c]/30 bg-white px-3 py-2 text-xs font-bold text-[#307c4c] shadow-sm hover:bg-[#307c4c]/5"
                >
                  Edit request
                </Link>
              )}
              {hasDecisionActions && (
                <button
                  type="button"
                  onClick={jumpToDecision}
                  className="rounded-md bg-[#307c4c] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#307c4c]/85"
                >
                  Go to decision
                </button>
              )}
              <StatusPill status={request.status} />
              <PriorityPill priority={request.priority} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Original Amount</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{usdFmt(request.amount, request.currency)}</p>
              <p className="mt-1 text-xs text-slate-500">{request.currency}</p>
            </div>
            <div className="rounded-md border border-[#307c4c]/10 bg-[#307c4c]/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#307c4c]">USD Equivalent</p>
              <p className="mt-2 text-xl font-bold text-[#1f1f1d]">{usdEquivalentFmt(request.amount, request.currency)}</p>
              <p className="mt-1 text-xs text-[#307c4c]">Normalized using local FX table</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{fmtDateTime(request.created_at)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Updated</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{fmtDateTime(request.updated_at)}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-5">
            {reviewDecisionSection}
            <ProcureGuardNotificationContactsPanel
              contacts={notificationContacts}
              currentStatus={request.status}
              emptyText="No notification recipients are configured for this request country."
            />
          </div>
          <WorkflowChain requestType={requestType} status={request.status} amount={workflowAmount} currency={workflowCurrency} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-5">
            <Section title="Vendor And Requester">
              <FieldGrid>
                <Field label="Requisition Number" value={request.requisition_number} />
                <Field label="Vendor" value={request.vendor_name} />
                <Field label={isAdvance ? 'SAP Vendor ID' : 'Vendor Tax ID'} value={isAdvance ? request.sap_vendor_id || request.vendor_code : request.vendor_tax_id || request.vendor_code} />
                <Field label="Requester" value={requester} />
                <Field label="Requester Email" value={request.requested_by_email} />
                <Field label="Country" value={request.country} />
                <Field label="Segment" value={request.segment} />
                <Field label="Additional Request Notifications" value={emailListLabel(request.requester_notification_emails)} />
                <Field label="Email Test Mode" value={request.email_test_mode ? 'Enabled' : 'Disabled'} />
                {request.email_test_mode && <Field label="Test Email Recipients" value={emailListLabel(request.email_test_recipients)} />}
                {request.email_test_mode && <Field label="Role Test Recipients" value={emailOverrideLabel(request.email_test_recipient_overrides)} />}
              </FieldGrid>
            </Section>

            <Section title="Accounting">
              <FieldGrid>
                <Field label="Spend Category" value={request.spend_category || (isAdvance ? null : request.expense_category)} />
                <Field label="Spend Value USD" value={request.spend_value_usd === null ? usdFmt(request.amount, 'USD') : usdFmt(request.spend_value_usd)} />
                {isAdvance ? (
                  <>
                    <Field label="Payment Terms Days" value={request.current_payment_terms_days} />
                    <Field label="Credit Limit USD" value={request.current_credit_limit_usd === null ? null : usdFmt(request.current_credit_limit_usd)} />
                  </>
                ) : null}
              </FieldGrid>
            </Section>

            <Section title={isAdvance ? 'Advance Details' : 'Payment Details'}>
              {isAdvance ? (
                <FieldGrid>
                  <Field label="Reason / Justification" value={request.advance_purpose || request.justification} />
                  <Field label="Requester Comments" value={request.requester_comments || request.notes} />
                </FieldGrid>
              ) : (
                <FieldGrid>
                  <Field label="Reason / Justification" value={request.payment_reason || request.justification} />
                  <Field label="Requester Comments" value={request.requester_comments || request.notes} />
                  <Field label="Acknowledged At" value={fmtDateTime(request.acknowledged_at)} />
                </FieldGrid>
              )}
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attachments</p>
                {documents.length === 0 && !request.attachment_link ? (
                  <p className="mt-2 text-sm text-slate-500">No attachments uploaded.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {documents.map(doc => (
                      <Link
                        key={doc.id}
                        href={`/api/procure-guard/documents/${doc.id}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-[#307c4c]/5"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#307c4c] text-[9px] font-bold text-white">{fileBadgeLabel(doc.file_type)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">{doc.original_name || doc.document_name}</span>
                            <span className="text-xs text-slate-500">{fmtBytes(doc.file_size)} | Uploaded by {doc.uploaded_by_name || doc.uploaded_by_email || 'Unknown'}</span>
                          </span>
                        </span>
                        <span className="text-xs font-bold text-[#307c4c]">Download</span>
                      </Link>
                    ))}
                    {request.attachment_link && (
                      <Link href={request.attachment_link} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-3 py-2 text-xs font-bold text-[#307c4c] hover:bg-green-100">
                        Open linked attachment
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </Section>
          </div>

          <div className="space-y-5">
            {activitySection}
          </div>
        </div>
      </main>
    </div>
  );
}



