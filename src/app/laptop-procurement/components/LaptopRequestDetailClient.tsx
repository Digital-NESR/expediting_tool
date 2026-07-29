'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  WORKFLOW_STEPS,
  fmtDateTime,
  getPriorityBadge,
  getStatusBadge,
  getWorkflowStepIndex,
  isActiveApprovalStatus,
} from '@/lib/laptopProcurement-utils';
import type { LaptopRequestDetailData, LaptopRequestStatus } from '@/types/laptopProcurement';
import LaptopShell, { CTA_QUIET, GLASS } from './LaptopShell';
import { updateLaptopRequestStatus } from '@/app/actions/laptopProcurement';

type DetailValue = string | number | null | undefined;

function textValue(value: DetailValue) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function Field({ label, value }: { label: string; value: DetailValue }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#182a1f]">{textValue(value)}</p>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${GLASS} p-5`}>
      <h2 className="text-sm font-bold text-[#182a1f]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur ${getPriorityBadge(priority)}`}>{priority}</span>;
}

type StepState = 'complete' | 'current' | 'skipped' | 'upcoming';

function WorkflowChain({ request }: { request: LaptopRequestDetailData['request'] }) {
  const status = request.status;
  const steps = WORKFLOW_STEPS;
  const terminalApproved = status === 'Procure New' || status === 'Approved';
  const isRejected = status.startsWith('Rejected');
  const isCancelled = status === 'Cancelled';
  const altOutcome = status === 'Assign from Inventory' || status === 'Assign from Inventory & Closed' || status === 'Repaired & Closed';
  // The chain stopped early — it will never reach the remaining steps.
  const isStopped = isRejected || isCancelled || altOutcome;
  const currentIndex = isStopped ? -1 : getWorkflowStepIndex(status);
  // Ground truth per stage: each approval date is only stamped once that stage is actually
  // signed off, regardless of how the chain later ends — so "complete" reflects what really
  // happened, not just where the status string currently points.
  const approvedDates: Array<string | null | undefined> = [
    request.it_team_approved_date,
    request.cm_approved_date,
    request.itd_approved_date,
    request.scd_approved_date,
  ];

  function stepState(index: number): StepState {
    if (terminalApproved) return 'complete';
    if (index < 4 && approvedDates[index]) return 'complete';
    if (!isStopped && index === currentIndex) return 'current';
    if (isStopped) return 'skipped';
    return 'upcoming';
  }

  const STATE_STYLES: Record<StepState, { card: string; badge: string }> = {
    complete: { card: 'border-white/80 bg-white/55', badge: 'bg-[#182a1f]/75 text-white' },
    current: { card: 'border-[#307c4c]/35 bg-gradient-to-br from-[#3a9a5f]/15 to-[#24603f]/5', badge: 'bg-gradient-to-br from-[#3a9a5f] to-[#24603f] text-white shadow-[0_4px_12px_rgba(36,96,63,0.4)]' },
    skipped: { card: 'border-white/50 bg-white/20 opacity-60', badge: 'bg-white/70 text-[#5f7266]' },
    upcoming: { card: 'border-white/60 bg-white/30', badge: 'bg-white/70 text-[#5f7266]' },
  };

  return (
    <Section title="Approval Chain">
      {isStopped && (
        <div className={`mb-4 rounded-xl border px-3 py-2 text-xs font-semibold backdrop-blur ${isRejected || isCancelled ? 'border-red-400/40 bg-red-100/50 text-red-900' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900'}`}>
          Outcome: {getStatusBadge(status).label}
        </div>
      )}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const state = stepState(index);
          const { card, badge } = STATE_STYLES[state];
          return (
            <div key={step.status} className={`rounded-2xl border p-3 backdrop-blur ${card}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#182a1f]">{step.label}</p>
                    {state === 'skipped' && (
                      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Skipped</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-[#5f7266]">{step.owner}</p>
                  <p className="mt-1 text-xs text-[#5f7266]/90">{step.description}</p>
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

export default function LaptopRequestDetailClient({ data }: { data: LaptopRequestDetailData }) {
  const [reviewComment, setReviewComment] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [highlightDecision, setHighlightDecision] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const decisionRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { request, activity, documents, actions, actor } = data;

  const requester = request.requested_by_name || request.requested_by_email;
  const pendingCount = isActiveApprovalStatus(request.status) ? 1 : 0;
  const ownsRequest = request.requested_by_email.toLowerCase() === actor.email.toLowerCase();
  const isItManagerStage = request.status === 'Submitted' || request.status === 'IT Approval';
  const canEditRequest = isItManagerStage && (ownsRequest || actor.permissions.canManageData);
  const canCancel = ownsRequest && isItManagerStage && actor.permissions.canCreateRequests;
  const hasDecisionActions = actions.canApprove || actions.canReject || actions.canAssignInventory || actions.canMarkRepaired || actions.canProcureNew || canCancel;
  const editHref = `/laptop-procurement/requests/${request.id}/edit`;

  function jumpToDecision() {
    decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDecision(true);
    window.setTimeout(() => setHighlightDecision(false), 1800);
  }

  function submitStatus(nextStatus: LaptopRequestStatus) {
    setNotice('');
    setError('');
    const comment = reviewComment.trim();
    if (nextStatus.startsWith('Rejected') && !comment) {
      setError('Add a comment before rejecting this request.');
      return;
    }
    startTransition(async () => {
      const result = await updateLaptopRequestStatus(request.id, nextStatus, comment);
      if (result.success) {
        setReviewComment('');
        setIsCancelDialogOpen(false);
        setNotice(`Request updated to ${nextStatus}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Status update failed.');
      }
    });
  }

  const approveLabel = actions.nextStatus === 'CM Approval'
    ? 'Approve & Send to Country Manager'
    : actions.nextStatus === 'IT Director Approval'
      ? 'Approve & Send to IT Director'
      : actions.nextStatus === 'Supply Chain Director Approval'
        ? 'Approve & Send to SC Director'
        : actions.nextStatus === 'Procure New'
          ? 'Approve & Send an IT Ticket'
          : 'Approve';

  return (
    <LaptopShell
      title={request.reference_number}
      subtitle={`${request.type_of_device || 'Device'} · ${request.requested_model || '—'} · ${requester}`}
      pendingCount={pendingCount}
      accessView={actor.effectiveAccessView}
      actions={
        <Link href="/laptop-procurement/requests" className={CTA_QUIET}>
          ← Back to list
        </Link>
      }
    >
      {isCancelDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#182a1f]/35 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 shadow-[0_24px_70px_rgba(24,58,38,0.35)] backdrop-blur-2xl">
            <div className="border-b border-[#182a1f]/[0.08] px-5 py-4">
              <h2 className="text-base font-bold text-[#182a1f]">Are you sure?</h2>
              <p className="mt-1 text-sm text-[#5f7266]">Cancel {request.reference_number}? This stops the request before approvals begin.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsCancelDialogOpen(false)} disabled={isPending} className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-bold text-[#4c5f53] backdrop-blur transition hover:bg-white disabled:opacity-60">Keep Request</button>
              <button type="button" onClick={() => submitStatus('Cancelled')} disabled={isPending} className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(220,38,38,0.4)] transition hover:bg-red-700 disabled:opacity-60">{isPending ? 'Cancelling...' : 'Yes, cancel request'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <section className={`${GLASS} p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#28714a]">{request.request_type || 'Procurement Request'}</p>
              <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-[#182a1f] sm:text-3xl">{request.reference_number}</h1>
              <p className="mt-2 text-sm text-[#5f7266]">{request.type_of_device || 'Device'} · {request.requested_model || '—'} · requested by {requester}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEditRequest && (
                <Link href={editHref} className="rounded-full border border-[#307c4c]/30 bg-white/70 px-3.5 py-2 text-xs font-bold text-[#28714a] shadow-sm backdrop-blur transition hover:bg-white">Edit request</Link>
              )}
              {hasDecisionActions && (
                <button type="button" onClick={jumpToDecision} className="rounded-full bg-gradient-to-br from-[#3a9a5f] to-[#24603f] px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(36,96,63,0.4)] transition hover:-translate-y-px">Go to decision</button>
              )}
              <StatusPill status={request.status} />
              <PriorityPill priority={request.priority} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">Country</p>
              <p className="mt-2 text-sm font-bold text-[#182a1f]">{request.country || '—'}</p>
            </div>
            <div className="rounded-2xl border border-[#307c4c]/25 bg-gradient-to-br from-[#3a9a5f]/15 to-[#24603f]/5 p-4 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#28714a]">Current Owner</p>
              <p className="mt-2 text-sm font-bold text-[#1f4a30]">{actions.ownerLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">Created</p>
              <p className="mt-2 text-sm font-bold text-[#182a1f]">{fmtDateTime(request.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">Updated</p>
              <p className="mt-2 text-sm font-bold text-[#182a1f]">{fmtDateTime(request.updated_at)}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-5">
            <Section title="Requester & Organisation">
              <FieldGrid>
                <Field label="Requester" value={requester} />
                <Field label="Requester Email" value={request.requested_by_email} />
                <Field label="On Behalf Of" value={request.on_behalf_of} />
                <Field label="Employee ID" value={request.employee_id} />
                <Field label="Computer For" value={request.computer_for} />
                <Field label="Pending With" value={request.pending_with} />
                <Field label="Country" value={request.country} />
                <Field label="Segment" value={request.segment} />
                <Field label="Department" value={request.department} />
                <Field label="Position" value={request.position} />
                <Field label="Company Code" value={request.company_code} />
                <Field label="Company Name" value={request.company_name} />
                <Field label="Cost Center" value={request.cost_center} />
              </FieldGrid>
            </Section>

            <Section title="Requested Device">
              <FieldGrid>
                <Field label="Type of Request" value={request.request_type} />
                <Field label="Type of Device" value={request.type_of_device} />
                <Field label="Requested Model" value={request.requested_model} />
              </FieldGrid>
              <div className="mt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">Special Requirements / Justification</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#4c5f53]">{textValue(request.special_requirements)}</p>
              </div>
            </Section>

            <Section title="Existing Device">
              <FieldGrid>
                <Field label="Unit ID" value={request.unit_id} />
                <Field label="Brand" value={request.current_brand} />
                <Field label="Model" value={request.current_model} />
                <Field label="Serial No." value={request.serial_no} />
                <Field label="Age (Years)" value={request.age_years} />
              </FieldGrid>
            </Section>

            <Section title="Assigned Approvers & Stage Comments">
              <FieldGrid>
                <Field label="IT Manager" value={request.it_manager} />
                <Field label="IT Manager 2" value={request.it_manager_2} />
                <Field label="Country Manager" value={request.country_manager} />
                <Field label="IT Director" value={request.it_director} />
                <Field label="SC Director" value={request.sc_director} />
              </FieldGrid>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="IT Manager Comments" value={request.itm_comments} />
                <Field label="Country Manager Comments" value={request.cm_comments} />
                <Field label="IT Director Comments" value={request.itd_comments} />
                <Field label="SC Director Comments" value={request.scd_comments} />
              </div>
            </Section>

            <Section title="Attachments">
              {documents.length === 0 ? (
                <p className="text-sm text-[#5f7266]">No attachments uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <Link key={doc.id} href={`/api/laptop-procurement/documents/${doc.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/50 px-3 py-2.5 text-sm backdrop-blur transition hover:bg-white/80">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3a9a5f] to-[#24603f] text-[9px] font-bold text-white shadow-sm">{fileBadgeLabel(doc.file_type)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#182a1f]">{doc.original_name || doc.document_name}</span>
                          <span className="text-xs text-[#5f7266]">{fmtBytes(doc.file_size)} | Uploaded by {doc.uploaded_by_name || doc.uploaded_by_email || 'Unknown'}</span>
                        </span>
                      </span>
                      <span className="text-xs font-bold text-[#28714a]">Download</span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Review & Decision">
              <div className="space-y-4">
                {notice && <div className="rounded-xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-3 py-2 text-sm font-semibold text-[#1f5c3a] backdrop-blur">{notice}</div>}
                {error && <div className="rounded-xl border border-red-400/40 bg-red-100/50 px-3 py-2 text-sm font-semibold text-red-900 backdrop-blur">{error}</div>}
                <Field label="Reviewed By" value={request.reviewed_by_name || request.reviewed_by_email} />
                <Field label="Reviewed At" value={fmtDateTime(request.reviewed_at)} />
                <Field label="Rejection Reason" value={request.rejection_reason} />
                <Field label="Latest Review Comment" value={request.review_comments} />

                {hasDecisionActions ? (
                  <div ref={decisionRef} className={`rounded-2xl border p-4 backdrop-blur transition-all duration-300 ${highlightDecision ? 'border-[#307c4c] ring-4 ring-[#307c4c]/25' : 'border-white/80'} bg-white/50`}>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f7266]">Decision Comment <span className="font-normal normal-case tracking-normal text-[#8a978d]">(required for rejection)</span></label>
                    <textarea
                      className="mt-2 min-h-28 w-full resize-none rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-sm text-[#182a1f] shadow-sm outline-none backdrop-blur transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25"
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actions.canApprove && actions.nextStatus && (
                        <button disabled={isPending} onClick={() => submitStatus(actions.nextStatus!)} className="rounded-full bg-gradient-to-br from-[#3a9a5f] to-[#24603f] px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(36,96,63,0.4)] transition hover:-translate-y-px disabled:opacity-60">
                          {approveLabel}
                        </button>
                      )}
                      {actions.canAssignInventory && (
                        <>
                          <button disabled={isPending} onClick={() => submitStatus('Assign from Inventory')} className="rounded-full border border-[#307c4c]/30 bg-white/70 px-3.5 py-2 text-xs font-bold text-[#28714a] backdrop-blur transition hover:bg-white disabled:opacity-60">Assign from Inventory</button>
                          <button disabled={isPending} onClick={() => submitStatus('Assign from Inventory & Closed')} className="rounded-full border border-[#307c4c]/30 bg-white/70 px-3.5 py-2 text-xs font-bold text-[#28714a] backdrop-blur transition hover:bg-white disabled:opacity-60">Assign &amp; Close</button>
                        </>
                      )}
                      {actions.canMarkRepaired && (
                        <button disabled={isPending} onClick={() => submitStatus('Repaired & Closed')} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-bold text-violet-900 backdrop-blur transition hover:bg-violet-500/20 disabled:opacity-60">Repaired &amp; Closed</button>
                      )}
                      {actions.canProcureNew && (
                        <button disabled={isPending} onClick={() => submitStatus('Procure New')} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-900 backdrop-blur transition hover:bg-emerald-500/20 disabled:opacity-60">Procure New</button>
                      )}
                      {actions.canReject && actions.rejectStatus && (
                        <button disabled={isPending} onClick={() => submitStatus(actions.rejectStatus!)} className="rounded-full border border-red-400/40 bg-red-100/40 px-3.5 py-2 text-xs font-bold text-red-800 backdrop-blur transition hover:bg-red-100/90 disabled:opacity-60">Reject</button>
                      )}
                      {canCancel && (
                        <button disabled={isPending} onClick={() => setIsCancelDialogOpen(true)} className="rounded-full border border-white/80 bg-white/60 px-3.5 py-2 text-xs font-bold text-[#4c5f53] backdrop-blur transition hover:bg-white disabled:opacity-60">Cancel Request</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-white/80 bg-white/45 px-3 py-3 text-sm text-[#5f7266] backdrop-blur">No actions are available to you at this stage.</p>
                )}
              </div>
            </Section>

            <WorkflowChain request={request} />

            <Section title="Activity">
              {activity.length === 0 ? (
                <p className="py-4 text-sm text-[#5f7266]">No activity has been recorded yet.</p>
              ) : (
                <div className="divide-y divide-[#182a1f]/[0.07]">
                  {activity.map(item => (
                    <div key={item.id} className="py-3">
                      <p className="text-sm font-bold text-[#182a1f]">{item.action}</p>
                      <p className="mt-1 text-xs text-[#5f7266]">{item.actor_name || item.actor_email || 'System'}</p>
                      {item.notes && <p className="mt-2 rounded-xl bg-white/50 p-2 text-xs text-[#4c5f53] backdrop-blur">{item.notes}</p>}
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#5f7266]/70">{fmtDateTime(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </LaptopShell>
  );
}
