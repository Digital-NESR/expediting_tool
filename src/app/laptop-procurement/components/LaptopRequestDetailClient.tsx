'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEVICE_AGE_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  WORKFLOW_STEPS,
  fmtDateTime,
  getStatusBadge,
  getWorkflowStepIndex,
  isActiveApprovalStatus,
} from '@/lib/laptopProcurement-utils';
import type { LaptopDeviceOption, LaptopRequestDetailData, LaptopRequestStatus, LaptopStageAssignee } from '@/types/laptopProcurement';
import type { LaptopWorkflowStep } from '@/lib/laptopProcurement-utils';
import LaptopShell, { CTA_QUIET, GLASS } from './LaptopShell';
import { rejectLaptopRequest, submitProcureNewDetails, updateLaptopExistingDevice, updateLaptopRequestStatus } from '@/app/actions/laptopProcurement';

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

// Flags device age for whoever reviews the request next — green once the device is
// old enough (5+ years) that replacing/procuring makes obvious sense, red when it's
// still relatively new, since that's worth a second look before approving.
// The assigned/inventory unit being handed OUT reads the opposite way (invert=true):
// green when it's still young (< 5 years, good to give), red when it's 5+ years old
// (too old to be handing out as a "new" assignment).
function AgeField({ label, value, invert }: { label: string; value: DetailValue; invert?: boolean }) {
  const raw = value === null || value === undefined ? '' : String(value);
  const isOldEnough = raw === '5+ years';
  const isYoung = raw === '< 1 year' || raw === '1-3 years' || raw === '4-5 years';
  const isGreen = invert ? isYoung : isOldEnough;
  const isRed = invert ? isOldEnough : isYoung;
  const boxClass = isGreen
    ? 'rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2'
    : isRed
      ? 'rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2'
      : '';
  const textClass = isGreen ? 'text-emerald-900' : isRed ? 'text-red-900' : 'text-slate-900';
  return (
    <div className={boxClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-semibold ${textClass}`}>{textValue(value)}</p>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

// Highlights exactly who a request is waiting on right now (green) vs. who has
// already signed off (grey) vs. a stage that hasn't been reached yet (plain) — so a
// stuck request makes it obvious who to go poke.
function AssigneeField({ item }: { item: LaptopStageAssignee }) {
  const boxClass = item.state === 'pending'
    ? 'rounded-lg border border-[#307c4c]/40 bg-[#307c4c]/10 px-3 py-2'
    : item.state === 'done'
      ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2'
      : 'px-3 py-2';
  return (
    <div className={boxClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
      <p className={`mt-1 break-words text-sm font-semibold ${item.state === 'done' ? 'text-slate-500' : 'text-slate-900'}`}>{item.name || '—'}</p>
      {item.state === 'pending' && <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#307c4c]">Currently with</p>}
      {item.state === 'done' && <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Approved</p>}
    </div>
  );
}

// What a given stage actually decided, alongside their comment — separate from
// AssigneeField above, which is about who's currently assigned, not what they did.
function DecisionCard({
  role,
  decision,
  comment,
  modelLabel,
  modelValue,
}: {
  role: string;
  decision: string | null | undefined;
  comment: string | null | undefined;
  modelLabel?: string;
  modelValue?: string | null;
}) {
  const hasDecision = Boolean(decision);
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${hasDecision ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-white'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{role}</p>
      <p className={`mt-1 text-sm font-semibold ${hasDecision ? 'text-slate-900' : 'text-slate-400'}`}>{decision || 'Not yet decided'}</p>
      {modelValue && (
        <p className="mt-1 text-xs text-slate-600"><span className="font-semibold text-slate-500">{modelLabel}:</span> {modelValue}</p>
      )}
      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-slate-600">{comment || '—'}</p>
    </div>
  );
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

type StepState = 'complete' | 'current' | 'skipped' | 'upcoming';

function WorkflowChain({ request }: { request: LaptopRequestDetailData['request'] }) {
  const status = request.status;
  const steps = WORKFLOW_STEPS;
  // Only a genuine new-device procurement ('Procure New') reaches this after the full
  // CM -> IT Director -> SC Director chain. Assigning from inventory and a plain
  // approval both now end right at Country Manager — see stepState below, which skips
  // the IT Director / SC Director cards for those two outcomes instead of marking them
  // complete.
  const terminalApproved = status === 'Procure New' || status === 'Assign from Inventory' || status === 'Approved';
  const endedAtCountryManager = !request.procure_new_requested && (status === 'Assign from Inventory' || status === 'Approved');
  const isRejected = status.startsWith('Rejected');
  const isCancelled = status === 'Cancelled';
  const altOutcome = status === 'Assign from Inventory & Closed' || status === 'Repaired & Closed';
  // The chain stopped early — it will never reach the remaining steps.
  const isStopped = isRejected || isCancelled || altOutcome;
  const currentIndex = isStopped ? -1 : getWorkflowStepIndex(status);
  // Ground truth per stage: each approval date is only stamped once that stage is actually
  // signed off, regardless of how the chain later ends — so "complete" reflects what really
  // happened, not just where the status string currently points. Keyed by status rather
  // than raw array index since 'Procure New Details' has no approval-date column of its
  // own (it's a data-entry waypoint, not a sign-off).
  const approvedDateByStatus: Partial<Record<LaptopRequestStatus, string | null | undefined>> = {
    Submitted: request.it_team_approved_date,
    'CM Approval': request.cm_approved_date,
    'IT Director Approval': request.itd_approved_date,
    'Supply Chain Director Approval': request.scd_approved_date,
  };

  function stepState(step: LaptopWorkflowStep, index: number): StepState {
    const isProcureNewOnlyStep = step.status === 'Procure New Details' || step.status === 'CM Confirm Device';
    // These two waypoints only ever apply to a request the Country Manager flagged for
    // a brand new device — a plain approval or an assigned-inventory continuation skips
    // them entirely, regardless of where the chain currently stands or ends up.
    if (isProcureNewOnlyStep && !request.procure_new_requested) return 'skipped';
    // Assign-from-inventory / plain-approved requests never reach IT Director or SC
    // Director now — they end right at Country Manager.
    if (endedAtCountryManager && (step.status === 'IT Director Approval' || step.status === 'Supply Chain Director Approval')) return 'skipped';
    if (terminalApproved) return 'complete';
    if (approvedDateByStatus[step.status]) return 'complete';
    // 'Procure New Details' and 'CM Confirm Device' have no date of their own — infer
    // completion once the chain has moved past them (IT Director has since signed off).
    if (isProcureNewOnlyStep && request.itd_approved_date) return 'complete';
    if (!isStopped && index === currentIndex) return 'current';
    if (isStopped) return 'skipped';
    return 'upcoming';
  }

  // The last workflow step is statically keyed to 'Procure New', but three different
  // terminals now reach it (plain approval, assign-from-inventory, genuine procurement)
  // — swap in copy that matches what actually happened instead of always claiming a
  // new device will be procured.
  const FINAL_OUTCOME_COPY: Partial<Record<LaptopRequestStatus, { label: string; description: string }>> = {
    'Procure New': { label: 'Procure New', description: 'Approved — a new device will be procured.' },
    'Assign from Inventory': { label: 'Assign from Inventory', description: 'Approved — an existing unit from inventory will be assigned.' },
    Approved: { label: 'Approved', description: 'Approved — the current device stays as-is, nothing to procure or assign.' },
  };

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
          const state = stepState(step, index);
          const { card, badge } = STATE_STYLES[state];
          const isFinalStep = index === steps.length - 1;
          const finalCopy = isFinalStep && terminalApproved ? FINAL_OUTCOME_COPY[status] : undefined;
          return (
            <div key={step.status} className={`rounded-2xl border p-3 ${card}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{finalCopy?.label ?? step.label}</p>
                    {state === 'skipped' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Skipped</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{step.owner}</p>
                  <p className="mt-1 text-xs text-slate-500">{finalCopy?.description ?? step.description}</p>
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
function ExistingDeviceSection({ request }: { request: LaptopRequestDetailData['request'] }) {
  return (
    <Section title="Existing Device">
      <FieldGrid>
        <Field label="Unit ID" value={request.unit_id} />
        <Field label="Brand" value={request.current_brand} />
        <Field label="Model" value={request.current_model} />
        <Field label="Serial No." value={request.serial_no} />
        <AgeField label="Age" value={request.age_years} />
        <Field label="SAP Asset ID" value={request.sap_number} />
      </FieldGrid>
    </Section>
  );
}

// The same six Existing Device fields, reused inside both the "Procure New Device"
// and "Assign existing laptop" popups so the IT Manager fills them in as part of
// making that decision, instead of a separate box that's easy to miss.
function ExistingDeviceFields({
  isUnitIdRequired,
  unitId, setUnitId,
  brand, setBrand,
  model, setModel,
  serialNo, setSerialNo,
  age, setAge,
  sap, setSap,
}: {
  isUnitIdRequired: boolean;
  unitId: string; setUnitId: (v: string) => void;
  brand: string; setBrand: (v: string) => void;
  model: string; setModel: (v: string) => void;
  serialNo: string; setSerialNo: (v: string) => void;
  age: string; setAge: (v: string) => void;
  sap: string; setSap: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{isUnitIdRequired && <span className="mr-1 text-red-500">*</span>}Unit ID</label>
        <input className={INP} value={unitId} onChange={e => setUnitId(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Brand</label>
        <input className={INP} value={brand} onChange={e => setBrand(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Model</label>
        <input className={INP} value={model} onChange={e => setModel(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Serial No.</label>
        <input className={INP} value={serialNo} onChange={e => setSerialNo(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Age</label>
        <select className={INP} value={age} onChange={e => setAge(e.target.value)}>
          <option value="">Select age</option>
          {DEVICE_AGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>SAP Asset ID</label>
        <input className={INP} value={sap} onChange={e => setSap(e.target.value)} />
      </div>
    </div>
  );
}

/**
 * Country Manager flagged this request as needing a brand new device — the IT Team
 * lands here to specify exactly what to procure (the requester never picks a model
 * upfront) before it continues to IT Director. Only shown while status is actually
 * 'Procure New Details'; only the IT Manager identity that owns the stage can submit.
 */
function ProcureNewDetailsSection({
  request,
  devices,
  canSubmit,
  onSubmitted,
}: {
  request: LaptopRequestDetailData['request'];
  devices: LaptopDeviceOption[];
  canSubmit: boolean;
  onSubmitted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [typeOfDevice, setTypeOfDevice] = useState(request.type_of_device ?? '');
  const [model, setModel] = useState(request.requested_model ?? '');

  const modelOptions = [...new Set(devices.filter(d => !typeOfDevice || d.type_of_device === typeOfDevice).map(d => d.model))];

  function submit() {
    setError('');
    if (!typeOfDevice.trim() || !model.trim()) {
      setError('Type of device and model are both required.');
      return;
    }
    startTransition(async () => {
      const result = await submitProcureNewDetails(request.id, { type_of_device: typeOfDevice, model });
      if (result.success) {
        onSubmitted();
      } else {
        setError(result.error ?? 'Failed to submit device details.');
      }
    });
  }

  return (
    <Section title="New Device Details">
      {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{error}</div>}
      {canSubmit ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Specify the new device to be procured — this goes back to the Country Manager to confirm once submitted.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Type of Device</label>
              <select className={INP} value={typeOfDevice} onChange={e => { setTypeOfDevice(e.target.value); setModel(''); }}>
                <option value="">Select device type</option>
                {DEVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Model</label>
              <select className={INP} value={model} disabled={!typeOfDevice} onChange={e => setModel(e.target.value)}>
                <option value="">{typeOfDevice ? 'Select a model' : 'Select a device type first'}</option>
                {modelOptions.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <button type="button" disabled={isPending} onClick={submit} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
            {isPending ? 'Sending...' : 'Send to Country Manager'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Waiting on the IT Team to specify the new device.</p>
      )}
    </Section>
  );
}

export default function LaptopRequestDetailClient({ data, devices }: { data: LaptopRequestDetailData; devices: LaptopDeviceOption[] }) {
  const [reviewComment, setReviewComment] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [highlightDecision, setHighlightDecision] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignType, setAssignType] = useState(data.request.type_of_device ?? '');
  const [assignSerialNo, setAssignSerialNo] = useState('');
  const [assignModel, setAssignModel] = useState('');
  const [assignAge, setAssignAge] = useState('');
  const [assignError, setAssignError] = useState('');
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairNotes, setRepairNotes] = useState('');
  const [repairError, setRepairError] = useState('');
  const [procureNewModalOpen, setProcureNewModalOpen] = useState(false);
  const [procureNewType, setProcureNewType] = useState(data.request.type_of_device ?? '');
  const [procureNewModel, setProcureNewModel] = useState('');
  const [procureNewError, setProcureNewError] = useState('');
  const [isPending, startTransition] = useTransition();
  const decisionRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { request, activity, documents, actions, actor, stageAssignees } = data;
  // Assign existing laptop picks a real unit from the device catalogue, filtered to
  // whichever device type is selected in that popup (defaults to what was requested,
  // but the IT Manager can assign a different type — e.g. a desktop instead of a
  // laptop — if that's what's actually available).
  const assignModelOptions = [...new Set(devices.filter(d => d.type_of_device === assignType).map(d => d.model))];

  // Existing Device (the OLD device being replaced) — filled in as part of whichever
  // IT Manager decision popup is used (see ExistingDeviceFields), not edited on its
  // own, so it can't be skipped by accident.
  const [existingUnitId, setExistingUnitId] = useState(request.unit_id ?? '');
  const [existingBrand, setExistingBrand] = useState(request.current_brand ?? '');
  const [existingModel, setExistingModel] = useState(request.current_model ?? '');
  const [existingSerialNo, setExistingSerialNo] = useState(request.serial_no ?? '');
  const [existingAge, setExistingAge] = useState(request.age_years ?? '');
  const [existingSap, setExistingSap] = useState(request.sap_number ?? '');
  // Unit ID only really identifies something for Unit requests (a shared/company
  // asset) — Upgrade/Replacement is a person's own device, which may not have one.
  const isUnitIdRequired = request.request_type === 'Unit';

  function existingDeviceFieldsMissing(): boolean {
    if (!appliesToExistingDevice) return false;
    return (isUnitIdRequired && !existingUnitId.trim())
      || !existingBrand.trim() || !existingModel.trim() || !existingSerialNo.trim() || !existingAge.trim() || !existingSap.trim();
  }

  const requester = request.requested_by_name || request.requested_by_email;
  const pendingCount = isActiveApprovalStatus(request.status) ? 1 : 0;
  const ownsRequest = request.requested_by_email.toLowerCase() === actor.email.toLowerCase();
  const isItManagerStage = request.status === 'Submitted' || request.status === 'IT Approval';
  const canEditRequest = isItManagerStage && (ownsRequest || actor.permissions.canManageData);
  const canCancel = ownsRequest && isItManagerStage && actor.permissions.canCreateRequests;
  const hasDecisionActions = actions.canApprove || actions.canReject || actions.canAssignInventory || actions.canMarkRepaired || actions.canProcureNew || canCancel;
  // A decision comment is mandatory before any review decision — Cancel Request is
  // exempt since it's the requester backing out before review even starts, not a
  // reviewer decision.
  const hasComment = reviewComment.trim().length > 0;
  const decisionDisabled = isPending || !hasComment;
  // Plain requesters just need Cancel + a place to leave a comment — the review
  // audit trail (who reviewed it, when, rejection reason, latest comment) is really
  // for reviewers/admins tracking the process; a rejected requester can still see why
  // via the Activity feed below.
  const isReviewerOrAdmin = actor.permissions.canViewAll || (actor.delegatedFrom ?? []).some(d => d.permissions.canViewAll);
  const editHref = `/laptop-procurement/requests/${request.id}/edit`;
  // Existing Device (the device being replaced) only applies to Upgrade/Replacement
  // and Unit requests — a New Employee has no prior device, so it never applies to
  // them, whether shown as a read-only summary or as fields inside a decision popup.
  const appliesToExistingDevice = request.request_type !== 'New Employee';
  // Only ever filled in by the IT Manager — hide it from everyone else, including
  // the requester.
  const canSeeExistingDevice = appliesToExistingDevice
    && (actor.permissions.canReviewItManager
      || (actor.delegatedFrom ?? []).some(d => d.permissions.canReviewItManager));
  const isProcureDetailsStage = request.status === 'Procure New Details';

  function jumpToDecision() {
    decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDecision(true);
    window.setTimeout(() => setHighlightDecision(false), 1800);
  }

  function submitStatus(
    nextStatus: LaptopRequestStatus,
    assignedLaptop?: { type_of_device: string; serial_no: string; model: string; age: string },
    commentOverride?: string,
    procureNew?: { type_of_device: string; model: string },
  ) {
    setNotice('');
    setError('');
    const comment = (commentOverride ?? reviewComment).trim();
    startTransition(async () => {
      const result = await updateLaptopRequestStatus(request.id, nextStatus, comment, assignedLaptop, procureNew);
      if (result.success) {
        setReviewComment('');
        setIsCancelDialogOpen(false);
        setAssignModalOpen(false);
        setAssignSerialNo('');
        setAssignModel('');
        setAssignAge('');
        setRepairModalOpen(false);
        setRepairNotes('');
        setProcureNewModalOpen(false);
        setProcureNewModel('');
        // Deliberately not reset to request.* here — that's the pre-save closure
        // value, not what was just saved, and router.refresh() won't re-run these
        // useState initializers. Leaving them as whatever was just typed keeps them
        // correct if the same popup reopens later (e.g. after another reject).
        setNotice(`Request updated to ${nextStatus}.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Status update failed.');
      }
    });
  }

  async function confirmAssign() {
    setAssignError('');
    if (!assignType.trim() || !assignSerialNo.trim() || !assignModel.trim() || !assignAge.trim()) {
      setAssignError('Type of device, serial number, model, and age are all required.');
      return;
    }
    if (existingDeviceFieldsMissing()) {
      setAssignError('All Existing Device fields are required.');
      return;
    }
    if (appliesToExistingDevice) {
      const deviceResult = await updateLaptopExistingDevice(request.id, {
        unit_id: existingUnitId,
        current_brand: existingBrand,
        current_model: existingModel,
        serial_no: existingSerialNo,
        age_years: existingAge,
        sap_number: existingSap,
      });
      if (!deviceResult.success) {
        setAssignError(deviceResult.error ?? 'Failed to save Existing Device details.');
        return;
      }
    }
    // No longer a distinct terminal move — it's IT Manager's normal approve-forward,
    // just with a specific unit attached; it still continues through the full chain.
    submitStatus(actions.nextStatus!, { type_of_device: assignType, serial_no: assignSerialNo.trim(), model: assignModel.trim(), age: assignAge });
  }

  function confirmRepair() {
    setRepairError('');
    if (!repairNotes.trim()) {
      setRepairError('Describe what was repaired or upgraded before closing this request.');
      return;
    }
    submitStatus('Repaired & Closed', undefined, repairNotes.trim());
  }

  async function confirmProcureNew() {
    setProcureNewError('');
    if (!procureNewType.trim() || !procureNewModel.trim()) {
      setProcureNewError('Type of device and model are both required.');
      return;
    }
    if (existingDeviceFieldsMissing()) {
      setProcureNewError('All Existing Device fields are required.');
      return;
    }
    if (appliesToExistingDevice) {
      const deviceResult = await updateLaptopExistingDevice(request.id, {
        unit_id: existingUnitId,
        current_brand: existingBrand,
        current_model: existingModel,
        serial_no: existingSerialNo,
        age_years: existingAge,
        sap_number: existingSap,
      });
      if (!deviceResult.success) {
        setProcureNewError(deviceResult.error ?? 'Failed to save Existing Device details.');
        return;
      }
    }
    submitStatus(actions.nextStatus!, undefined, undefined, { type_of_device: procureNewType, model: procureNewModel });
  }

  function confirmReject() {
    setNotice('');
    setError('');
    const reason = reviewComment.trim();
    if (!reason) {
      setError('A decision comment is required before rejecting this request.');
      return;
    }
    startTransition(async () => {
      const result = await rejectLaptopRequest(request.id, reason);
      if (result.success) {
        setReviewComment('');
        setNotice('Request rejected and returned to the IT Manager.');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to reject request.');
      }
    });
  }

  const approveLabel = actions.nextStatus === 'CM Approval'
    ? 'Approve & Send to Country Manager'
    : actions.nextStatus === 'IT Director Approval'
      ? 'Approve & Send to IT Director'
      : actions.nextStatus === 'Supply Chain Director Approval'
        ? 'Approve & Send to SC Director'
        : actions.nextStatus === 'Procure New' || actions.nextStatus === 'Assign from Inventory'
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

      {assignModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-8">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Assign existing laptop</h2>
              <p className="mt-1 text-sm text-slate-500">Enter the second-hand unit being assigned to {request.reference_number}.</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              {assignError && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{assignError}</div>}
              {appliesToExistingDevice && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#307c4c]">Existing Device</p>
                  <ExistingDeviceFields
                    isUnitIdRequired={isUnitIdRequired}
                    unitId={existingUnitId} setUnitId={setExistingUnitId}
                    brand={existingBrand} setBrand={setExistingBrand}
                    model={existingModel} setModel={setExistingModel}
                    serialNo={existingSerialNo} setSerialNo={setExistingSerialNo}
                    age={existingAge} setAge={setExistingAge}
                    sap={existingSap} setSap={setExistingSap}
                  />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#307c4c]">New Unit (from inventory)</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Type of Device</label>
                    <select className={INP} value={assignType} onChange={e => { setAssignType(e.target.value); setAssignModel(''); }}>
                      <option value="">Select device type</option>
                      {DEVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Serial Number</label>
                    <input className={INP} value={assignSerialNo} onChange={e => setAssignSerialNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Model</label>
                    <select className={INP} value={assignModel} disabled={!assignType} onChange={e => setAssignModel(e.target.value)}>
                      <option value="">{assignType ? 'Select model' : 'Select a device type first'}</option>
                      {assignModelOptions.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Age</label>
                    <select className={INP} value={assignAge} onChange={e => setAssignAge(e.target.value)}>
                      <option value="">Select age</option>
                      {DEVICE_AGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setAssignModalOpen(false); setAssignError(''); }} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
              <button type="button" onClick={confirmAssign} disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">{isPending ? 'Assigning...' : 'Confirm assignment'}</button>
            </div>
          </div>
        </div>
      )}

      {repairModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Repaired &amp; Closed</h2>
              <p className="mt-1 text-sm text-slate-500">Describe what was repaired or upgraded on {request.reference_number} before closing it.</p>
            </div>
            <div className="space-y-4 px-5 py-4">
              {repairError && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{repairError}</div>}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">What was repaired / upgraded?</label>
                <textarea className={`${INP} min-h-28 resize-none`} value={repairNotes} onChange={e => setRepairNotes(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setRepairModalOpen(false); setRepairError(''); }} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
              <button type="button" onClick={confirmRepair} disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">{isPending ? 'Saving...' : 'Confirm & Close'}</button>
            </div>
          </div>
        </div>
      )}

      {procureNewModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-8">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Procure New Device</h2>
              <p className="mt-1 text-sm text-slate-500">Specify the device to procure for {request.reference_number} before sending it to the Country Manager.</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              {procureNewError && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{procureNewError}</div>}
              {appliesToExistingDevice && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#307c4c]">Existing Device</p>
                  <ExistingDeviceFields
                    isUnitIdRequired={isUnitIdRequired}
                    unitId={existingUnitId} setUnitId={setExistingUnitId}
                    brand={existingBrand} setBrand={setExistingBrand}
                    model={existingModel} setModel={setExistingModel}
                    serialNo={existingSerialNo} setSerialNo={setExistingSerialNo}
                    age={existingAge} setAge={setExistingAge}
                    sap={existingSap} setSap={setExistingSap}
                  />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#307c4c]">New Device to Procure</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Type of Device</label>
                    <select className={INP} value={procureNewType} onChange={e => { setProcureNewType(e.target.value); setProcureNewModel(''); }}>
                      <option value="">Select device type</option>
                      {DEVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Model</label>
                    <select
                      className={INP}
                      value={procureNewModel}
                      disabled={!procureNewType}
                      onChange={e => setProcureNewModel(e.target.value)}
                    >
                      <option value="">{procureNewType ? 'Select model' : 'Select a device type first'}</option>
                      {[...new Set(devices.filter(d => d.type_of_device === procureNewType).map(d => d.model))].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setProcureNewModalOpen(false); setProcureNewError(''); }} disabled={isPending} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-60">Cancel</button>
              <button type="button" onClick={confirmProcureNew} disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">{isPending ? 'Sending...' : 'Send to Country Manager'}</button>
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
                <Field label="Requestor ID" value={request.employee_id} />
                <Field label="Computer For" value={request.computer_for} />
                {request.request_type === 'New Employee' && (
                  <Field label="Computer For Employee ID" value={request.computer_for_employee_id} />
                )}
                <Field label="Country" value={request.country} />
                <Field label="Department" value={request.department} />
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

            {isProcureDetailsStage && (
              <ProcureNewDetailsSection
                request={request}
                devices={devices}
                canSubmit={actions.canSubmitProcureDetails}
                onSubmitted={() => router.refresh()}
              />
            )}

            {(request.assigned_serial_no || request.assigned_model || request.assigned_age) && (
              <Section title="Assigned Unit (from inventory)">
                <FieldGrid>
                  <Field label="Serial Number" value={request.assigned_serial_no} />
                  <Field label="Model" value={request.assigned_model} />
                  <AgeField label="Age" value={request.assigned_age} invert />
                </FieldGrid>
              </Section>
            )}

            {canSeeExistingDevice && <ExistingDeviceSection request={request} />}

            <Section title="Assigned Approvers">
              <FieldGrid>
                {stageAssignees.map(item => <AssigneeField key={item.label} item={item} />)}
              </FieldGrid>
            </Section>

            <Section title="Decisions">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DecisionCard
                  role="IT Manager"
                  decision={request.itm_decision}
                  comment={request.itm_comments}
                  modelLabel={request.itm_decision === 'Assigned Existing Laptop' ? 'Assigned Model' : request.itm_decision === 'Procure New (specified by IT Manager)' ? 'Requested Model' : undefined}
                  modelValue={request.itm_decision === 'Assigned Existing Laptop' ? request.assigned_model : request.itm_decision === 'Procure New (specified by IT Manager)' ? request.requested_model : undefined}
                />
                <DecisionCard role="Country Manager" decision={request.cm_decision} comment={request.cm_comments} />
                <DecisionCard role="IT Director" decision={request.itd_decision} comment={request.itd_comments} />
                <DecisionCard role="Supply Chain Director" decision={request.scd_decision} comment={request.scd_comments} />
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
                {isReviewerOrAdmin && (
                  <>
                    <Field label="Reviewed By" value={request.reviewed_by_name || request.reviewed_by_email} />
                    <Field label="Reviewed At" value={fmtDateTime(request.reviewed_at)} />
                    <Field label="Rejection Reason" value={request.rejection_reason} />
                    <Field label="Latest Review Comment" value={request.review_comments} />
                  </>
                )}

                {hasDecisionActions ? (
                  <div ref={decisionRef} className={`rounded-2xl border p-4 transition-all duration-300 ${highlightDecision ? 'border-[#307c4c] ring-4 ring-[#307c4c]/25' : 'border-slate-200'} bg-white`}>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><span className="mr-1 text-red-500">*</span>Decision Comment</label>
                    <textarea
                      className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25"
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                    />
                    {!hasComment && <p className="mt-1.5 text-[11px] font-semibold text-slate-400">A comment is required before any decision below can be made.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actions.canApprove && actions.nextStatus && (
                        isItManagerStage ? (
                          <button disabled={decisionDisabled} onClick={() => setProcureNewModalOpen(true)} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
                            Procure New &amp; Send to Country Manager
                          </button>
                        ) : (
                          <button disabled={decisionDisabled} onClick={() => submitStatus(actions.nextStatus!)} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80 disabled:opacity-60">
                            {approveLabel}
                          </button>
                        )
                      )}
                      {actions.canAssignInventory && (
                        <button disabled={decisionDisabled} onClick={() => setAssignModalOpen(true)} className="rounded-lg border border-[#307c4c]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#307c4c] transition hover:bg-white disabled:opacity-60">Assign existing laptop</button>
                      )}
                      {actions.canMarkRepaired && (
                        <button disabled={decisionDisabled} onClick={() => setRepairModalOpen(true)} className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60">Repaired &amp; Closed</button>
                      )}
                      {actions.canProcureNew && (
                        <button disabled={decisionDisabled} onClick={() => submitStatus('Procure New Details')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-60">Procure New</button>
                      )}
                      {actions.canReject && (
                        <button disabled={decisionDisabled} onClick={confirmReject} className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-60">Reject</button>
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
