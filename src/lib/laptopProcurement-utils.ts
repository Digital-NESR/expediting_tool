import type {
  LaptopAccessView,
  LaptopPermissionProfile,
  LaptopPermissionRole,
  LaptopRequestActions,
  LaptopRequestPriority,
  LaptopRequestStatus,
} from '@/types/laptopProcurement';

export const LAPTOP_GREEN = '#307c4c';

// IT Manager / Country Manager / IT Director / Supply Chain Director are shown here for
// convenience, but picking one doesn't write to laptop_permissions — it writes into
// laptop_approver_matrix instead (see assignApproverMatrixRole), which is the actual
// source of that approval authority and the only thing that lets one person hold
// several of those roles across different countries.
export const PERMISSION_ROLE_OPTIONS: LaptopPermissionRole[] = [
  'Requester',
  'IT Manager',
  'Country Manager',
  'IT Director',
  'Supply Chain Director',
  'Admin',
];

export const APPROVER_MATRIX_ROLES: LaptopPermissionRole[] = ['IT Manager', 'Country Manager', 'IT Director', 'Supply Chain Director'];

const BASE_PERMISSION_PROFILE: Omit<LaptopPermissionProfile, 'role' | 'label' | 'description' | 'accessView'> = {
  canViewAll: false,
  canCreateRequests: true,
  canManageData: false,
  canManagePermissions: false,
  canDeleteRecords: false,
  canReject: false,
  canReviewItManager: false,
  canReviewCountryManager: false,
  canReviewItDirector: false,
  canReviewScmDirector: false,
};

export const PERMISSION_PROFILES: Record<LaptopPermissionRole, LaptopPermissionProfile> = {
  Requester: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Requester',
    label: 'Requester',
    description: 'Can raise laptop / desktop procurement requests and cancel their own before review.',
    accessView: 'requester',
  },
  'IT Manager': {
    ...BASE_PERMISSION_PROFILE,
    role: 'IT Manager',
    label: 'IT Manager',
    description: 'Checks condition and inventory, then repairs, assigns from inventory, or sends for procurement approval.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewItManager: true,
  },
  'Country Manager': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Country Manager',
    label: 'Country Manager',
    description: 'Approves procurement requests after IT review.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewCountryManager: true,
  },
  'IT Director': {
    ...BASE_PERMISSION_PROFILE,
    role: 'IT Director',
    label: 'IT Director',
    description: 'Approves procurement requests after the Country Manager.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewItDirector: true,
  },
  'Supply Chain Director': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Supply Chain Director',
    label: 'Supply Chain Director',
    description: 'Final approval to procure new devices after the IT Director.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewScmDirector: true,
  },
  Admin: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Admin',
    label: 'Admin',
    description: 'Full access to data, permissions, every approval step, and deletion.',
    accessView: 'admin',
    canViewAll: true,
    canCreateRequests: true,
    canManageData: true,
    canManagePermissions: true,
    canDeleteRecords: true,
    canReject: true,
    canReviewItManager: true,
    canReviewCountryManager: true,
    canReviewItDirector: true,
    canReviewScmDirector: true,
  },
};

export type LaptopPermissionKey = keyof Omit<LaptopPermissionProfile, 'role' | 'label' | 'description' | 'accessView'>;

const PERMISSION_OWNER_LABELS: Partial<Record<LaptopPermissionKey, string>> = {
  canReviewItManager: 'IT Manager',
  canReviewCountryManager: 'Country Manager',
  canReviewItDirector: 'IT Director',
  canReviewScmDirector: 'Supply Chain Director',
};

export function getPermissionProfile(role: string | null | undefined): LaptopPermissionProfile {
  return PERMISSION_PROFILES[(role || 'Requester') as LaptopPermissionRole] ?? PERMISSION_PROFILES.Requester;
}

export function getLaptopAccessView(role: string | null | undefined): LaptopAccessView {
  return getPermissionProfile(role).accessView;
}

export function canUseLaptopAdmin(accessView: LaptopAccessView): boolean {
  return accessView === 'admin';
}

export function canUseLaptopAnalytics(accessView: LaptopAccessView): boolean {
  return accessView === 'reviewer' || accessView === 'admin';
}

export function canUseLaptopOperationalPages(accessView: LaptopAccessView): boolean {
  return accessView === 'requester' || accessView === 'reviewer' || accessView === 'admin';
}

export function canUseLaptopReviewerQueue(accessView: LaptopAccessView): boolean {
  return accessView === 'reviewer' || accessView === 'admin';
}

const ACCESS_VIEW_RANK: Record<LaptopAccessView, number> = {
  requester: 0,
  reviewer: 1,
  admin: 2,
};

/**
 * Highest-privilege access view across a set (e.g. an actor's own role plus every
 * role they currently hold via delegation). Used so a delegate can actually reach
 * the pages their delegated authority unlocks (Admin Panel, Analytics, Reviewer
 * Queue), not just act on individual requests.
 */
export function bestAccessView(views: LaptopAccessView[]): LaptopAccessView {
  return views.reduce((best, v) => (ACCESS_VIEW_RANK[v] > ACCESS_VIEW_RANK[best] ? v : best), 'requester' as LaptopAccessView);
}

/* ── Approval chain ───────────────────────────────────────────── */

export const IT_MANAGER_STATUSES: LaptopRequestStatus[] = ['Submitted', 'IT Approval'];

// Shared by the admin panel's requests table (server-side LIMIT/OFFSET) and its
// client-side pagination controls, so the two stay in lockstep.
export const ADMIN_REQUESTS_PAGE_SIZE = 10;

export const APPROVAL_ACTIVE_STATUSES: LaptopRequestStatus[] = [
  'Submitted',
  'IT Approval',
  'CM Approval',
  'Procure New Details',
  'CM Confirm Device',
  'IT Director Approval',
  'Supply Chain Director Approval',
];

export const TERMINAL_STATUSES: LaptopRequestStatus[] = [
  'Procure New',
  'Approved',
  'Assign from Inventory',
  'Assign from Inventory & Closed',
  'Repaired & Closed',
  'Rejected',
  'Rejected by CM',
  'Rejected by ITD',
  'Rejected by SCD',
  'Cancelled',
];

export const STATUS_OPTIONS: LaptopRequestStatus[] = [
  'Submitted',
  'IT Approval',
  'CM Approval',
  'Procure New Details',
  'CM Confirm Device',
  'IT Director Approval',
  'Supply Chain Director Approval',
  'Procure New',
  'Approved',
  'Assign from Inventory',
  'Assign from Inventory & Closed',
  'Repaired & Closed',
  'Rejected',
  'Rejected by CM',
  'Rejected by ITD',
  'Rejected by SCD',
  'Cancelled',
];

export const PRIORITY_OPTIONS: LaptopRequestPriority[] = ['Low', 'Normal', 'High', 'Critical'];

export const REQUEST_TYPE_OPTIONS = ['New Employee', 'Upgrade/Replacement', 'Unit'];

export const DEVICE_TYPE_OPTIONS = ['Laptop', 'Desktop'];

export const DEVICE_AGE_OPTIONS = ['< 1 year', '1-3 years', '4-5 years', '5+ years'];

export const COUNTRY_OPTIONS = [
  'Saudi Arabia',
  'Abu Dhabi',
  'HQ Dubai',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Egypt',
  'Algeria',
  'Iraq',
  'Libya',
  'Yemen',
  'Chad',
  'India',
  'Indonesia',
  'Other',
];

export const SEGMENT_OPTIONS = [
  'Hydraulic Fracturing',
  'Ops Support',
  'Well Testing Services',
  'Coiled Tubing Services',
  'Mgmt. (Country Overhead)',
  'Cementing Services',
  'Logging Services',
  'Slick Line Services',
  'Directional Drilling',
  'Tubular Running Services',
  'ESG Impact',
  'Drilling Services',
  'Stimulation & Pumping Services',
  'Pipelines & Industrial Services',
  'Integrated Project Management',
  'Fishing & Remedial',
  'Thru Tubing Services',
  'Artificial Lift',
  'Drilling Fluids',
  'Drilling & Workover',
  'Other',
];

export function isActiveApprovalStatus(status: LaptopRequestStatus): boolean {
  return APPROVAL_ACTIVE_STATUSES.includes(status);
}

// True once IT Manager has assigned a specific second-hand unit (via "Assign existing
// laptop") — used to tell that path apart from a genuine new-device procurement once
// both are sitting at the same 'CM Approval' / 'Supply Chain Director Approval' statuses.
export function laptopHasAssignedUnit(request: {
  assigned_serial_no?: string | null;
  assigned_model?: string | null;
  assigned_age?: string | null;
}): boolean {
  return Boolean(request.assigned_serial_no || request.assigned_model || request.assigned_age);
}

// True once the Country Manager has ever flagged this request for a brand new device
// (via "Procure New") — persists through the rest of the chain (see
// procure_new_requested) so the final sign-off at Supply Chain Director can still tell
// a genuine new-device procurement apart from a plain approval, even once both are
// funneling through the same IT Director / SC Director steps.
export function laptopIsProcureNewFlow(request: { procure_new_requested?: boolean | null }): boolean {
  return Boolean(request.procure_new_requested);
}

export function getNextApprovalStatus(currentStatus: LaptopRequestStatus, hasAssignedUnit: boolean, isProcureNewFlow: boolean): LaptopRequestStatus | null {
  const transitions: Partial<Record<LaptopRequestStatus, LaptopRequestStatus>> = {
    Submitted: 'CM Approval',
    'IT Approval': 'CM Approval',
    // Country Manager's plain "Approve" only continues on to IT Director / SC Director
    // for a genuine new-device procurement — IT Director and SC Director only need to
    // weigh in on brand-new device spend. Assigning from inventory (or, on the rare
    // legacy path, a plain approval with nothing procured or assigned at all) ends the
    // chain right here at Country Manager.
    'CM Approval': isProcureNewFlow ? 'IT Director Approval' : (hasAssignedUnit ? 'Assign from Inventory' : 'Approved'),
    // The CM confirming the exact new device IT Manager picked — always continues to
    // IT Director.
    'CM Confirm Device': 'IT Director Approval',
    'IT Director Approval': 'Supply Chain Director Approval',
    // Final sign-off: a genuine new-device procurement lands on 'Procure New' — checked
    // first since it's sticky and wins even if an earlier IT-Manager-assigned unit is
    // still on the request (kept around purely so IT Manager can see what to replace,
    // see laptopHasAssignedUnit's callers); otherwise an assigned-inventory unit lands
    // on 'Assign from Inventory'; a plain approval (nothing procured or assigned) lands
    // on 'Approved'.
    'Supply Chain Director Approval': isProcureNewFlow ? 'Procure New' : (hasAssignedUnit ? 'Assign from Inventory' : 'Approved'),
  };
  return transitions[currentStatus] ?? null;
}

// Every rejection bounces the request back to the IT Manager to fix and resend, rather
// than ending it — only the IT Manager themselves has no reject option (nothing to
// bounce it back further to).
export function getRejectStatusForStage(currentStatus: LaptopRequestStatus): LaptopRequestStatus | null {
  switch (currentStatus) {
    case 'CM Approval':
    case 'CM Confirm Device':
    case 'IT Director Approval':
    case 'Supply Chain Director Approval':
      return 'IT Approval';
    default:
      return null;
  }
}

export type LaptopApprovalStage = 'IT Manager' | 'Country Manager' | 'IT Director' | 'Supply Chain Director';

// Which human role currently owns a given status — used both to route the
// approval-chain notification email and, via the read-only status-check API, to let
// an external workflow (e.g. n8n) verify a request is still actually pending before
// escalating, instead of trusting a stale snapshot from when it first fired.
export function getLaptopApprovalStage(status: LaptopRequestStatus): LaptopApprovalStage | null {
  switch (status) {
    case 'Submitted':
    case 'IT Approval':
    case 'Procure New Details':
      return 'IT Manager';
    case 'CM Approval':
    case 'CM Confirm Device':
      return 'Country Manager';
    case 'IT Director Approval':
      return 'IT Director';
    case 'Supply Chain Director Approval':
      return 'Supply Chain Director';
    default:
      return null;
  }
}

export function getRequiredPermissionForStage(currentStatus: LaptopRequestStatus): LaptopPermissionKey | null {
  switch (currentStatus) {
    case 'Submitted':
    case 'IT Approval':
      return 'canReviewItManager';
    case 'CM Approval':
      return 'canReviewCountryManager';
    // Back with the IT Team to specify the new device before the request continues —
    // same identity that owns the initial intake stage.
    case 'Procure New Details':
      return 'canReviewItManager';
    // Same Country Manager identity confirming the device IT Manager picked, before
    // it continues to IT Director.
    case 'CM Confirm Device':
      return 'canReviewCountryManager';
    case 'IT Director Approval':
      return 'canReviewItDirector';
    case 'Supply Chain Director Approval':
      return 'canReviewScmDirector';
    default:
      return null;
  }
}

// `ownsCurrentStep` is resolved by the caller — whether the acting identity is the
// named approver (via laptop_approver_matrix, or Admin) for currentStatus's stage on
// this specific request's country. Kept out of this function so it stays a pure,
// DB-free helper; the actual matrix/admin lookup lives in the server action.
export function getLaptopAvailableActions(
  ownsCurrentStep: boolean,
  currentStatus: LaptopRequestStatus,
  hasAssignedUnit: boolean = false,
  isProcureNewFlow: boolean = false,
  requestType?: string | null,
): LaptopRequestActions {
  const nextStatus = getNextApprovalStatus(currentStatus, hasAssignedUnit, isProcureNewFlow);
  const requiredPermission = getRequiredPermissionForStage(currentStatus);
  const isItManagerStage = IT_MANAGER_STATUSES.includes(currentStatus);
  const isCmStage = currentStatus === 'CM Approval';
  const isProcureDetailsStage = currentStatus === 'Procure New Details';
  return {
    nextStatus,
    canApprove: Boolean(nextStatus && ownsCurrentStep),
    canReject: Boolean(ownsCurrentStep && getRejectStatusForStage(currentStatus)),
    // IT Manager is the only one who checks physical inventory, so only they can
    // resolve a request by assigning a second-hand unit — it then continues through
    // the normal chain (see getNextApprovalStatus) rather than ending immediately.
    canAssignInventory: isItManagerStage && ownsCurrentStep,
    // Only the Country Manager can flag a request as needing a brand new device
    // procured — everyone else just approves forward. Stays available once the
    // request is on the assigned-inventory path, so the CM can still override the IT
    // Manager's pick and send it back for a genuine new-device procurement instead.
    // Hidden once the IT Manager has already specified the device up front (see
    // updateLaptopRequestStatus's procureNew param) — nothing left for the CM to flag.
    canProcureNew: isCmStage && ownsCurrentStep && !isProcureNewFlow,
    // Repairing in place only makes sense when there's an existing physical device to
    // repair — Upgrade/Replacement and Unit requests have one; New Employee doesn't
    // (there's nothing to repair for someone who has no device yet).
    canMarkRepaired: isItManagerStage && ownsCurrentStep && requestType !== 'New Employee',
    canSubmitProcureDetails: isProcureDetailsStage && ownsCurrentStep,
    rejectStatus: getRejectStatusForStage(currentStatus),
    ownerLabel: requiredPermission ? PERMISSION_OWNER_LABELS[requiredPermission] ?? 'Assigned approver' : 'No active owner',
  };
}

export type LaptopWorkflowStep = {
  status: LaptopRequestStatus;
  label: string;
  owner: string;
  description: string;
};

export const WORKFLOW_STEPS: LaptopWorkflowStep[] = [
  { status: 'Submitted', label: 'IT Review', owner: 'IT Manager', description: 'IT checks the device condition and inventory, then repairs, assigns from stock, or sends for approval.' },
  { status: 'CM Approval', label: 'Country Manager Approval', owner: 'Country Manager', description: 'Country Manager approves the request outright, or flags it for new-device procurement.' },
  { status: 'Procure New Details', label: 'Device Details', owner: 'IT Manager', description: 'IT Team specifies the new device to be procured before the remaining approvals.' },
  { status: 'CM Confirm Device', label: 'Country Manager Confirmation', owner: 'Country Manager', description: 'Country Manager confirms the specific device before it goes to IT Director.' },
  { status: 'IT Director Approval', label: 'IT Director Approval', owner: 'IT Director', description: 'IT Director reviews the procurement request.' },
  { status: 'Supply Chain Director Approval', label: 'Supply Chain Director Approval', owner: 'Supply Chain Director', description: 'Supply Chain Director gives the final procurement approval.' },
  { status: 'Procure New', label: 'Procure New', owner: 'Workflow Complete', description: 'Approved — a new device will be procured.' },
];

export function getWorkflowStepIndex(status: LaptopRequestStatus): number {
  if (status === 'IT Approval') return 0;
  return WORKFLOW_STEPS.findIndex(step => step.status === status);
}

export function getStatusOptions(): LaptopRequestStatus[] {
  return STATUS_OPTIONS;
}

/* ── Formatting / badges ──────────────────────────────────────── */

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '-';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Flat ProcureGuard pill styles: solid tinted fills with light borders.
export function getStatusBadge(status: string): { label: string; className: string; dot: string } {
  const map: Record<string, { label: string; className: string; dot: string }> = {
    Submitted: { label: 'Submitted', className: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    'IT Approval': { label: 'IT Review', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    'CM Approval': { label: 'Country Manager', className: 'bg-cyan-50 text-cyan-800 border-cyan-200', dot: 'bg-cyan-500' },
    'Procure New Details': { label: 'New Device Details', className: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
    'CM Confirm Device': { label: 'Country Manager (Confirm Device)', className: 'bg-cyan-50 text-cyan-800 border-cyan-200', dot: 'bg-cyan-500' },
    'IT Director Approval': { label: 'IT Director', className: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-500' },
    'Supply Chain Director Approval': { label: 'SC Director', className: 'bg-indigo-50 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
    'Procure New': { label: 'Procure New', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    Approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    'Assign from Inventory': { label: 'Assign existing laptop', className: 'bg-lime-50 text-lime-800 border-lime-200', dot: 'bg-lime-500' },
    'Assign from Inventory & Closed': { label: 'Assigned & Closed', className: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
    'Repaired & Closed': { label: 'Repaired & Closed', className: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
    Rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    'Rejected by CM': { label: 'Rejected by CM', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    'Rejected by ITD': { label: 'Rejected by ITD', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    'Rejected by SCD': { label: 'Rejected by SCD', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    Cancelled: { label: 'Cancelled', className: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  };
  return map[status] ?? { label: status, className: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
}

export function getPriorityBadge(priority: string): string {
  const map: Record<string, string> = {
    Low: 'bg-slate-50 text-slate-600 border-slate-200',
    Normal: 'bg-blue-50 text-blue-700 border-blue-200',
    High: 'bg-orange-50 text-orange-700 border-orange-200',
    Critical: 'bg-red-50 text-red-700 border-red-200',
  };
  return map[priority] ?? map.Normal;
}

export function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
