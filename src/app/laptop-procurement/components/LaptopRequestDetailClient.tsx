'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEVICE_AGE_OPTIONS,
  WORKFLOW_STEPS,
  fmtDateTime,
  getPriorityBadge,
  getStatusBadge,
  getWorkflowStepIndex,
  isActiveApprovalStatus,
} from '@/lib/laptopProcurement-utils';
import type { LaptopRequestDetailData, LaptopRequestStatus } from '@/types/laptopProcurement';
import LaptopShell, { CTA_QUIET, GLASS } from './LaptopShell';
import { updateLaptopExistingDevice, updateLaptopRequestStatus } from '@/app/actions/laptopProcurement';

const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

type DetailValue = string | number | null | undefined;

function textValue(value: DetailValue) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function Field({ label, value }: { label: string; value: DetailValue }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{textValue(value)}</p>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${GLASS} p-5`}>
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
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityBadge(priority)}`}>{priority}</span>;
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
    complete: { card: 'border-slate-200 bg-slate-50', badge: 'bg-slate-700 text-white' },
    current: { card: 'border-[#307c4c]/35 bg-[#307c4c]/10', badge: 'bg-[#307c4c] text-white shadow-sm' },
    skipped: { card: 'border-slate-200 bg-white opacity-60', badge: 'bg-white text-slate-400' },
    upcoming: { card: 'border-slate-200 bg-white', badge: 'bg-white text-slate-500' },
  };

  return (
    <Section title="Approval Chain">
      {isStopped && (
        <div className={`mb-4 rounded-xl border px-3 py-2 text-xs font-semibold ${isRejected || isCancelled ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          Outcome: {getStatusBadge(status).label}
        </div>
      )}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const state = stepState(index);
          const { card, badge } = STATE_STYLES[state];
          return (
            <div key={step.status} className={`rounded-2xl border p-3 ${card}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{step.label}</p>
                    {state === 'skipped' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Skipped</span>
                    )}
                  </div>
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

/**
 * Existing Device (the device being replaced/upgraded) is filled in by the IT
 * Manager once the request reaches them — the requester never enters it. Only
 * shown to viewers with IT Manager review authority (own role or delegated),
 * and only editable while the request is actually at the IT Manager stage.
 */
function ExistingDeviceSection({
  request,
  canEdit,
  isItManagerStage,
  onSaved,
}: {
  request: LaptopRequestDetailData['request'];
  canEdit: boolean;
  isItManagerStage: boolean;
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [unitId, setUnitId] = useState(request.unit_id ?? '');
  const [currentBrand, setCurrentBrand] = useState(request.current_brand ?? '');
  const [currentModel, setCurrentModel] = useState(request.current_model ?? '');
  const [serialNo, setSerialNo] = useState(request.serial_no ?? '');
  const [ageYears, setAgeYears] = useState(request.age_years ?? '');
  const [sapNumber, setSapNumber] = useState(request.sap_number ?? '');

  const canShowEditToggle = canEdit && isItManagerStage;

  function save() {
    setError('');
    startTransition(async () => {
      const result = await updateLaptopExistingDevice(request.id, {
        unit_id: unitId,
        current_brand: currentBrand,
        current_model: currentModel,
        serial_no: serialNo,
        age_years: ageYears,
        sap_number: sapNumber,
      });
      if (result.success) {
        setIsEditing(false);
        onSaved();
      } else {
        setError(result.error ?? 'Failed to save Existing Device details.');
      }
    });
  }

  return (
    <Section title="Existing Device">
      {canShowEditToggle && !isEditing && (
        <button type="button" onClick={() => setIsEditing(true)} className="mb-4 rounded-lg border border-[#307c4c]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#307c4c] transition hover:bg-white">Edit</button>
      )}
      {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{error}</div>}
      {isEditing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Unit ID</label>
              <input className={INP} value={unitId} onChange={e => setUnitId(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Brand</label>
              <input className={INP} value={currentBrand} onChange={e => setCurrentBrand(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model</label>
              <input className={INP} value={currentModel} onChange={e => setCurrentModel(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Serial No.</label>
              <input className={INP} value={serialNo} onChange={e => setSerialNo(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Age</label>
              <select className={INP} value={ageYears} onChange={e => setAgeYears(e.target.value)}>
                <option value="">Select age</option>
                {DEVICE_AGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">SAP Number</label>
              <input className={INP} value={sapNumber} onChange={e => setSapNumber(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={save} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
              {isPending ? 'Saving...' : 'Save'}
            </button>
            <button type="button" disabled={isPending} onClick={() => setIsEditing(false)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
          </div>
        </div>
      ) : (
        <FieldGrid>
          <Field label="Unit ID" value={request.unit_id} />
          <Field label="Brand" value={request.current_brand} />
          <Field label="Model" value={request.current_model} />
          <Field label="Serial No." value={request.serial_no} />
          <Field label="Age" value={request.age_years} />
          <Field label="SAP Number" value={request.sap_number} />
        </FieldGrid>
      )}
    </Section>
  );
}

export default function LaptopRequestDetailClient({ data }: { data: LaptopRequestDetailData }) {
  const [reviewComment, setReviewComment] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [highlightDecision, setHighlightDecision] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [assignModalStatus, setAssignModalStatus] = useState<'Assign from Inventory' | 'Assign from Inventory & Closed' | null>(null);
  const [assignSerialNo, setAssignSerialNo] = useState('');
  const [assignModel, setAssignModel] = useState('');
  const [assignAge, setAssignAge] = useState('');
  const [assignError, setAssignError] = useState('');
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
  // Existing Device (the device being replaced) is only ever filled in by the IT
  // Manager — hide it from everyone else, including the requester.
  const canSeeExistingDevice = actor.permissions.canReviewItManager
    || (actor.delegatedFrom ?? []).some(d => d.permissions.canReviewItManager);

  function jumpToDecision() {
    decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDecision(true);
    window.setTimeout(() => setHighlightDecision(false), 1800);
  }

  function submitStatus(nextStatus: LaptopRequestStatus, assignedLaptop?: { serial_no: string; model: string; age: string }) {
    setNotice('');
    setError('');
    const comment = reviewComment.trim();
    if (nextStatus.startsWith('Rejected') && !comment) {
      setError('Add a comment before rejecting this request.');
      return;
    }
    startTransition(async () => {
      const result = await updateLaptopRequestStatus(request.id, nextStatus, comment, assignedLaptop);
      if (result.success) {
        setReviewComment('');
        setIsCancelDialogOpen(false);
        setAssignModalStatus(null);
        setAssignSerialNo('');
        setAssignModel('');
        setAssignAge('');
        setNotice(`Request updated to ${nextStatus}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Status update failed.');
      }
    });
  }

  function confirmAssign() {
    setAssignError('');
    if (!assignSerialNo.trim() || !assignModel.trim() || !assignAge.trim()) {
      setAssignError('Serial number, model, and age are all required.');
      return;
    }
    submitStatus(assignModalStatus!, { serial_no: assignSerialNo.trim(), model: assignModel.trim(), age: assignAge });
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Are you sure?</h2>
              <p className="mt-1 text-sm text-slate-500">Cancel {request.reference_number}? This stops the request before approvals begin.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsCancelDialogOpen(false)} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Keep Request</button>
              <button type="button" onClick={() => submitStatus('Cancelled')} disabled={isPending} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60">{isPending ? 'Cancelling...' : 'Yes, cancel request'}</button>
            </div>
          </div>
        </div>
      )}

      {assignModalStatus && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Assign existing laptop</h2>
              <p className="mt-1 text-sm text-slate-500">Enter the second-hand unit being assigned to {request.reference_number}.</p>
            </div>
            <div className="space-y-4 px-5 py-4">
              {assignError && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{assignError}</div>}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Serial Number</label>
                <input className={INP} value={assignSerialNo} onChange={e => setAssignSerialNo(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model</label>
                <input className={INP} value={assignModel} onChange={e => setAssignModel(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Age</label>
                <select className={INP} value={assignAge} onChange={e => setAssignAge(e.target.value)}>
                  <option value="">Select age</option>
                  {DEVICE_AGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setAssignModalStatus(null); setAssignError(''); }} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
              <button type="button" onClick={confirmAssign} disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">{isPending ? 'Assigning...' : 'Confirm assignment'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <section className={`${GLASS} p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#307c4c]">{request.request_type || 'Procurement Request'}</p>
              <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{request.reference_number}</h1>
              <p className="mt-2 text-sm text-slate-500">{request.type_of_device || 'Device'} · {request.requested_model || '—'} · requested by {requester}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEditRequest && (
                <Link href={editHref} className="rounded-lg border border-[#307c4c]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#307c4c] shadow-sm transition hover:bg-white">Edit request</Link>
              )}
              {hasDecisionActions && (
                <button type="button" onClick={jumpToDecision} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80">Go to decision</button>
              )}
              <StatusPill status={request.status} />
              <PriorityPill priority={request.priority} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Country</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{request.country || '—'}</p>
            </div>
            <div className="rounded-2xl border border-[#307c4c]/25 bg-[#307c4c]/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#307c4c]">Current Owner</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{actions.ownerLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Created</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{fmtDateTime(request.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Updated</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{fmtDateTime(request.updated_at)}</p>
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Special Requirements / Justification</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{textValue(request.special_requirements)}</p>
              </div>
            </Section>

            {(request.assigned_serial_no || request.assigned_model || request.assigned_age) && (
              <Section title="Assigned Unit (from inventory)">
                <FieldGrid>
                  <Field label="Serial Number" value={request.assigned_serial_no} />
                  <Field label="Model" value={request.assigned_model} />
                  <Field label="Age" value={request.assigned_age} />
                </FieldGrid>
              </Section>
            )}

            {canSeeExistingDevice && (
              <ExistingDeviceSection
                request={request}
                canEdit={canSeeExistingDevice}
                isItManagerStage={isItManagerStage}
                onSaved={() => router.refresh()}
              />
            )}

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
                <p className="text-sm text-slate-500">No attachments uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <Link key={doc.id} href={`/api/laptop-procurement/documents/${doc.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:bg-white">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#307c4c] text-[9px] font-bold text-white shadow-sm">{fileBadgeLabel(doc.file_type)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{doc.original_name || doc.document_name}</span>
                          <span className="text-xs text-slate-500">{fmtBytes(doc.file_size)} | Uploaded by {doc.uploaded_by_name || doc.uploaded_by_email || 'Unknown'}</span>
                        </span>
                      </span>
                      <span className="text-xs font-bold text-[#307c4c]">Download</span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Review & Decision">
              <div className="space-y-4">
                {notice && <div className="rounded-xl border border-[#307c4c]/25 bg-[#307c4c]/10 px-3 py-2 text-sm font-semibold text-[#307c4c]">{notice}</div>}
                {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{error}</div>}
                <Field label="Reviewed By" value={request.reviewed_by_name || request.reviewed_by_email} />
                <Field label="Reviewed At" value={fmtDateTime(request.reviewed_at)} />
                <Field label="Rejection Reason" value={request.rejection_reason} />
                <Field label="Latest Review Comment" value={request.review_comments} />

                {hasDecisionActions ? (
                  <div ref={decisionRef} className={`rounded-2xl border p-4 transition-all duration-300 ${highlightDecision ? 'border-[#307c4c] ring-4 ring-[#307c4c]/25' : 'border-slate-200'} bg-white`}>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Decision Comment <span className="font-normal normal-case tracking-normal text-slate-400">(required for rejection)</span></label>
                    <textarea
                      className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25"
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actions.canApprove && actions.nextStatus && (
                        <button disabled={isPending} onClick={() => submitStatus(actions.nextStatus!)} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
                          {approveLabel}
                        </button>
                      )}
                      {actions.canAssignInventory && (
                        <>
                          <button disabled={isPending} onClick={() => setAssignModalStatus('Assign from Inventory')} className="rounded-lg border border-[#307c4c]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#307c4c] transition hover:bg-white disabled:opacity-60">Assign existing laptop</button>
                          <button disabled={isPending} onClick={() => setAssignModalStatus('Assign from Inventory & Closed')} className="rounded-lg border border-[#307c4c]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#307c4c] transition hover:bg-white disabled:opacity-60">Assign &amp; Close</button>
                        </>
                      )}
                      {actions.canMarkRepaired && (
                        <button disabled={isPending} onClick={() => submitStatus('Repaired & Closed')} className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60">Repaired &amp; Closed</button>
                      )}
                      {actions.canProcureNew && (
                        <button disabled={isPending} onClick={() => submitStatus('Procure New')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-60">Procure New</button>
                      )}
                      {actions.canReject && actions.rejectStatus && (
                        <button disabled={isPending} onClick={() => submitStatus(actions.rejectStatus!)} className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60">Reject</button>
                      )}
                      {canCancel && (
                        <button disabled={isPending} onClick={() => setIsCancelDialogOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel Request</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">No actions are available to you at this stage.</p>
                )}
              </div>
            </Section>

            <WorkflowChain request={request} />

            <Section title="Activity">
              {activity.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No activity has been recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activity.map(item => (
                    <div key={item.id} className="py-3">
                      <p className="text-sm font-bold text-slate-900">{item.action}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.actor_name || item.actor_email || 'System'}</p>
                      {item.notes && <p className="mt-2 rounded-xl bg-white p-2 text-xs text-slate-600">{item.notes}</p>}
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fmtDateTime(item.created_at)}</p>
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
