'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
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
import { updateAdhocPaymentStatus, updateAdvancePaymentStatus } from '@/app/actions/procureGuard';

type DetailValue = string | number | null | undefined;

function isAdvanceRequest(request: AdhocPaymentRequest | AdvancePaymentRequest): request is AdvancePaymentRequest {
  return 'advance_purpose' in request;
}

function textValue(value: DetailValue) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
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
  const currentIndex = status === 'Paid'
    ? steps.length - 1
    : steps.findIndex(step => step.status === status);
  const completedIndex = status === 'Approved' || status === 'Paid'
    ? steps.length - 1
    : Math.max(0, currentIndex - 1);

  return (
    <Section title="Approval Chain">
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex && status !== 'Approved' && status !== 'Paid';
          const isComplete = index <= completedIndex || status === 'Approved' || status === 'Paid';
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

export default function ProcureGuardRequestDetailClient({ data }: { data: ProcureGuardRequestDetailData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [highlightDecision, setHighlightDecision] = useState(false);
  const [isPending, startTransition] = useTransition();
  const decisionRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { request, request_type: requestType, activity, documents, notification_contacts: notificationContacts, actions, actor } = data;
  const isAdvance = isAdvanceRequest(request);
  const listHref = isAdvance ? '/procure-guard/advance-payments' : '/procure-guard/adhoc-payments';
  const requestLabel = isAdvance ? 'Advance Payment' : 'Adhoc Payment';
  const requester = request.requested_by_name || request.requested_by_email;
  const pendingCount = isActiveApprovalStatus(request.status) ? 1 : 0;
  const canCancel = request.requested_by_email === actor.email && isActiveApprovalStatus(request.status);
  const hasDecisionActions = actions.canApprove || actions.canReject || actions.canMarkPaid || canCancel;

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
        setNotice(`Request updated to ${nextStatus}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Status update failed.');
      }
    });
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: '#307c4c' }}>
          <span className="text-[10px] font-extrabold tracking-tight text-white">PG</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">{requestLabel} Detail</span>
        <Link href={listHref} className="ml-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
          Back to list
        </Link>
      </header>

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
                <Field label="CC Email" value={request.cc_email} />
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
            <WorkflowChain requestType={requestType} status={request.status} amount={request.amount} currency={request.currency} />

            <ProcureGuardNotificationContactsPanel
              contacts={notificationContacts}
              currentStatus={request.status}
              emptyText="No notification recipients are configured for this request country."
            />

            <Section title="Review And Payment">
              <div className="space-y-4">
                {notice && <div className="rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-3 py-2 text-sm font-semibold text-[#307c4c]">{notice}</div>}
                {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
                <Field label="Reviewed By" value={request.reviewed_by_name || request.reviewed_by_email} />
                <Field label="Reviewed At" value={fmtDateTime(request.reviewed_at)} />
                <Field label="Paid At" value={fmtDateTime(request.paid_at)} />
                <Field label="Rejection Reason" value={request.rejection_reason} />
                <Field label="Latest Review Comment" value={request.review_comments} />

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
                      {actions.canMarkPaid && (
                        <button disabled={isPending} onClick={() => submitStatus('Paid')} className="rounded-md border border-[#307c4c]/20 bg-white px-3 py-2 text-xs font-bold text-[#307c4c] hover:bg-[#307c4c]/5 disabled:opacity-60">Mark Paid</button>
                      )}
                      {canCancel && (
                        <button disabled={isPending} onClick={() => submitStatus('Cancelled')} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60">Cancel Request</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Activity">
              {activity.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No activity has been recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activity.map(item => (
                    <div key={item.id} className="py-3">
                      <p className="text-sm font-bold text-slate-900">{item.action}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.actor_name || item.actor_email || 'System'}</p>
                      {item.notes && <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{item.notes}</p>}
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{fmtDateTime(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Access">
              <p className="text-sm text-slate-600">
                Full local access is enabled for this detail view. The data fetch is ready to receive stricter permissions later.
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-400">Type: {requestType}</p>
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}



