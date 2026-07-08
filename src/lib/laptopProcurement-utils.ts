import type {
  LaptopAccessView,
  LaptopPermissionProfile,
  LaptopPermissionRole,
  LaptopRequestActions,
  LaptopRequestPriority,
  LaptopRequestStatus,
} from '@/types/laptopProcurement';

export const LAPTOP_GREEN = '#307c4c';

export const PERMISSION_ROLE_OPTIONS: LaptopPermissionRole[] = [
  'Requester',
  'Analyst',
  'Read Only',
  'IT Manager',
  'Country Manager',
  'IT Director',
  'Supply Chain Director',
  'Admin',
];

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
  Analyst: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Analyst',
    label: 'Analyst',
    description: 'Can view laptop procurement analytics only.',
    accessView: 'analyst',
    canCreateRequests: false,
  },
  'Read Only': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Read Only',
    label: 'Read Only',
    description: 'Legacy analyst access. Can view laptop procurement analytics only.',
    accessView: 'analyst',
    canCreateRequests: false,
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
  return accessView === 'analyst' || accessView === 'reviewer' || accessView === 'admin';
}

export function canUseLaptopOperationalPages(accessView: LaptopAccessView): boolean {
  return accessView === 'requester' || accessView === 'reviewer' || accessView === 'admin';
}

export function canUseLaptopReviewerQueue(accessView: LaptopAccessView): boolean {
  return accessView === 'reviewer' || accessView === 'admin';
}

/* ── Approval chain ───────────────────────────────────────────── */

export const IT_MANAGER_STATUSES: LaptopRequestStatus[] = ['Submitted', 'IT Approval'];

export const APPROVAL_ACTIVE_STATUSES: LaptopRequestStatus[] = [
  'Submitted',
  'IT Approval',
  'CM Approval',
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

export const COUNTRY_OPTIONS = [
  'Saudi Arabia',
  'United Arab Emirates (UAE)',
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

export function getNextApprovalStatus(currentStatus: LaptopRequestStatus): LaptopRequestStatus | null {
  const transitions: Partial<Record<LaptopRequestStatus, LaptopRequestStatus>> = {
    Submitted: 'CM Approval',
    'IT Approval': 'CM Approval',
    'CM Approval': 'IT Director Approval',
    'IT Director Approval': 'Supply Chain Director Approval',
    'Supply Chain Director Approval': 'Procure New',
  };
  return transitions[currentStatus] ?? null;
}

export function getRejectStatusForStage(currentStatus: LaptopRequestStatus): LaptopRequestStatus | null {
  switch (currentStatus) {
    case 'Submitted':
    case 'IT Approval':
      return 'Rejected';
    case 'CM Approval':
      return 'Rejected by CM';
    case 'IT Director Approval':
      return 'Rejected by ITD';
    case 'Supply Chain Director Approval':
      return 'Rejected by SCD';
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
    case 'IT Director Approval':
      return 'canReviewItDirector';
    case 'Supply Chain Director Approval':
      return 'canReviewScmDirector';
    default:
      return null;
  }
}

export function getLaptopAvailableActions(
  permissions: LaptopPermissionProfile,
  currentStatus: LaptopRequestStatus,
): LaptopRequestActions {
  const nextStatus = getNextApprovalStatus(currentStatus);
  const requiredPermission = getRequiredPermissionForStage(currentStatus);
  const ownsCurrentStep = Boolean(requiredPermission && permissions[requiredPermission]);
  const isItManagerStage = IT_MANAGER_STATUSES.includes(currentStatus);
  return {
    nextStatus,
    canApprove: Boolean(nextStatus && ownsCurrentStep),
    canReject: Boolean(ownsCurrentStep && permissions.canReject && getRejectStatusForStage(currentStatus)),
    canAssignInventory: isItManagerStage && permissions.canReviewItManager,
    canMarkRepaired: isItManagerStage && permissions.canReviewItManager,
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
  { status: 'Submitted', label: 'IT Review', owner: 'IT Manager', description: 'IT checks the device condition and inventory, then repairs, assigns from stock, or sends for procurement approval.' },
  { status: 'CM Approval', label: 'Country Manager Approval', owner: 'Country Manager', description: 'Country Manager reviews and approves the request.' },
  { status: 'IT Director Approval', label: 'IT Director Approval', owner: 'IT Director', description: 'IT Director reviews after the Country Manager.' },
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

// Glass & Depth pill styles: translucent tinted fills with soft borders so
// pills sit naturally on frosted panels.
export function getStatusBadge(status: string): { label: string; className: string; dot: string } {
  const map: Record<string, { label: string; className: string; dot: string }> = {
    Submitted: { label: 'Submitted', className: 'bg-sky-500/10 text-sky-900 border-sky-500/30', dot: 'bg-sky-500' },
    'IT Approval': { label: 'IT Review', className: 'bg-amber-400/15 text-amber-900 border-amber-500/30', dot: 'bg-amber-500' },
    'CM Approval': { label: 'Country Manager', className: 'bg-cyan-500/10 text-cyan-900 border-cyan-500/30', dot: 'bg-cyan-500' },
    'IT Director Approval': { label: 'IT Director', className: 'bg-teal-500/10 text-teal-900 border-teal-500/30', dot: 'bg-teal-500' },
    'Supply Chain Director Approval': { label: 'SC Director', className: 'bg-indigo-500/10 text-indigo-900 border-indigo-500/30', dot: 'bg-indigo-500' },
    'Procure New': { label: 'Procure New', className: 'bg-emerald-500/10 text-emerald-900 border-emerald-500/30', dot: 'bg-emerald-500' },
    Approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-900 border-emerald-500/30', dot: 'bg-emerald-500' },
    'Assign from Inventory': { label: 'Assign from Inventory', className: 'bg-lime-500/15 text-lime-900 border-lime-600/30', dot: 'bg-lime-500' },
    'Assign from Inventory & Closed': { label: 'Assigned & Closed', className: 'bg-green-500/10 text-green-900 border-green-600/30', dot: 'bg-green-500' },
    'Repaired & Closed': { label: 'Repaired & Closed', className: 'bg-violet-500/10 text-violet-900 border-violet-500/30', dot: 'bg-violet-500' },
    Rejected: { label: 'Rejected', className: 'bg-red-500/10 text-red-900 border-red-500/30', dot: 'bg-red-500' },
    'Rejected by CM': { label: 'Rejected by CM', className: 'bg-red-500/10 text-red-900 border-red-500/30', dot: 'bg-red-500' },
    'Rejected by ITD': { label: 'Rejected by ITD', className: 'bg-red-500/10 text-red-900 border-red-500/30', dot: 'bg-red-500' },
    'Rejected by SCD': { label: 'Rejected by SCD', className: 'bg-red-500/10 text-red-900 border-red-500/30', dot: 'bg-red-500' },
    Cancelled: { label: 'Cancelled', className: 'bg-slate-500/10 text-slate-700 border-slate-500/30', dot: 'bg-slate-400' },
  };
  return map[status] ?? { label: status, className: 'bg-slate-500/10 text-slate-700 border-slate-500/30', dot: 'bg-slate-400' };
}

export function getPriorityBadge(priority: string): string {
  const map: Record<string, string> = {
    Low: 'bg-white/50 text-slate-600 border-slate-400/30',
    Normal: 'bg-blue-500/10 text-blue-900 border-blue-500/30',
    High: 'bg-orange-500/10 text-orange-900 border-orange-500/30',
    Critical: 'bg-red-500/10 text-red-900 border-red-500/30',
  };
  return map[priority] ?? map.Normal;
}

export function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
