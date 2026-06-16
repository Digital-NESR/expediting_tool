import type { ProcureGuardAccessView, ProcureGuardPermissionProfile, ProcureGuardPermissionRole, ProcureGuardPriority, ProcureGuardRequestType, ProcureGuardStatus } from '@/types/procureGuard';

export const PROCUREMENT_GREEN = '#006B0C';
export const PERMISSION_ROLE_OPTIONS: ProcureGuardPermissionRole[] = [
  'Requester',
  'Analyst',
  'Read Only',
  'SCM Manager',
  'Country Controller',
  'Supply Chain Director',
  'Treasury Director',
  'Corporate Controller',
  'CFO',
  'Admin',
];

const BASE_PERMISSION_PROFILE: Omit<ProcureGuardPermissionProfile, 'role' | 'label' | 'description' | 'accessView'> = {
  canViewAll: false,
  canCreateRequests: true,
  canManageData: false,
  canManagePermissions: false,
  canDeleteRecords: false,
  canReject: false,
  canReviewAdhocScm: false,
  canReviewAdhocDirector: false,
  canReviewAdvanceCountryController: false,
  canReviewAdvanceSupplyChainDirector: false,
  canReviewAdvanceTreasuryDirector: false,
  canReviewAdvanceCorporateController: false,
  canReviewAdvanceCfo: false,
};

export const PERMISSION_PROFILES: Record<ProcureGuardPermissionRole, ProcureGuardPermissionProfile> = {
  Requester: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Requester',
    label: 'Requester',
    description: 'Can create requests and cancel their own submitted requests.',
    accessView: 'requester',
  },
  Analyst: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Analyst',
    label: 'Analyst',
    description: 'Can view ProcureGuard payment analytics only.',
    accessView: 'analyst',
    canCreateRequests: false,
  },
  'Read Only': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Read Only',
    label: 'Read Only',
    description: 'Legacy analyst access. Can view ProcureGuard payment analytics only.',
    accessView: 'analyst',
    canCreateRequests: false,
  },
  'SCM Manager': {
    ...BASE_PERMISSION_PROFILE,
    role: 'SCM Manager',
    label: 'SCM Manager',
    description: 'Can review and approve adhoc requests through the SCM step.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdhocScm: true,
  },
  'Country Controller': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Country Controller',
    label: 'Country Controller',
    description: 'Can review and approve advance requests through country controller approval.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdvanceCountryController: true,
  },
  'Supply Chain Director': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Supply Chain Director',
    label: 'Supply Chain Director',
    description: 'Can approve adhoc requests after SCM and advance requests after country controller approval.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdhocDirector: true,
    canReviewAdvanceSupplyChainDirector: true,
  },
  'Treasury Director': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Treasury Director',
    label: 'Treasury Director',
    description: 'Can approve advance payment requests through treasury review.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdvanceTreasuryDirector: true,
  },
  'Corporate Controller': {
    ...BASE_PERMISSION_PROFILE,
    role: 'Corporate Controller',
    label: 'Corporate Controller',
    description: 'Can approve advance requests through corporate controller review and release sub-500k USD requests.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdvanceCorporateController: true,
  },
  CFO: {
    ...BASE_PERMISSION_PROFILE,
    role: 'CFO',
    label: 'CFO',
    description: 'Can approve high-value advance requests after corporate controller review.',
    accessView: 'reviewer',
    canViewAll: true,
    canReject: true,
    canReviewAdvanceCfo: true,
  },
  Admin: {
    ...BASE_PERMISSION_PROFILE,
    role: 'Admin',
    label: 'Admin',
    description: 'Full access to data, permissions, approvals, and deletion.',
    accessView: 'admin',
    canViewAll: true,
    canCreateRequests: true,
    canManageData: true,
    canManagePermissions: true,
    canDeleteRecords: true,
    canReject: true,
    canReviewAdhocScm: true,
    canReviewAdhocDirector: true,
    canReviewAdvanceCountryController: true,
    canReviewAdvanceSupplyChainDirector: true,
    canReviewAdvanceTreasuryDirector: true,
    canReviewAdvanceCorporateController: true,
    canReviewAdvanceCfo: true,
  },
};

export type ProcureGuardPermissionKey = keyof Omit<ProcureGuardPermissionProfile, 'role' | 'label' | 'description' | 'accessView'>;

export interface ProcureGuardAvailableActions {
  nextStatus: ProcureGuardStatus | null;
  canApprove: boolean;
  canReject: boolean;
  requiredPermission: ProcureGuardPermissionKey | null;
  ownerLabel: string;
}

const PERMISSION_OWNER_LABELS: Partial<Record<ProcureGuardPermissionKey, string>> = {
  canReviewAdhocScm: 'SCM Manager',
  canReviewAdhocDirector: 'Supply Chain Director',
  canReviewAdvanceCountryController: 'Country Controller',
  canReviewAdvanceSupplyChainDirector: 'Supply Chain Director',
  canReviewAdvanceTreasuryDirector: 'Treasury Director',
  canReviewAdvanceCorporateController: 'Corporate Controller',
  canReviewAdvanceCfo: 'CFO',
};

export function getPermissionProfile(role: string | null | undefined): ProcureGuardPermissionProfile {
  return PERMISSION_PROFILES[(role || 'Requester') as ProcureGuardPermissionRole] ?? PERMISSION_PROFILES.Requester;
}

export function getProcureGuardAccessView(role: string | null | undefined): ProcureGuardAccessView {
  return getPermissionProfile(role).accessView;
}

export function canUseProcureGuardAdmin(accessView: ProcureGuardAccessView): boolean {
  return accessView === 'admin';
}

export function canUseProcureGuardAnalytics(accessView: ProcureGuardAccessView): boolean {
  return accessView === 'analyst' || accessView === 'reviewer' || accessView === 'admin';
}

export function canUseProcureGuardOperationalPages(accessView: ProcureGuardAccessView): boolean {
  return accessView === 'requester' || accessView === 'reviewer' || accessView === 'admin';
}

export function canUseProcureGuardReviewerQueue(accessView: ProcureGuardAccessView): boolean {
  return accessView === 'reviewer' || accessView === 'admin';
}

function getRequiredPermissionForApproval(
  requestType: ProcureGuardRequestType,
  currentStatus: ProcureGuardStatus,
  nextStatus: ProcureGuardStatus,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardPermissionKey | null {
  if (requestType === 'adhoc') {
    if (currentStatus === 'Submitted' && nextStatus === 'Approved by SCM') return 'canReviewAdhocScm';
    if (currentStatus === 'Under Review' && nextStatus === 'Approved by SCM') return 'canReviewAdhocScm'; // legacy Under Review records
    if (currentStatus === 'Approved by SCM' && nextStatus === 'Approved') return 'canReviewAdhocDirector';
    return null;
  }

  const spendUsd = toUsd(amount, currency || 'USD');
  if (currentStatus === 'Submitted' && nextStatus === 'Approved by Country Controller') return 'canReviewAdvanceCountryController';
  if (currentStatus === 'Under Review' && nextStatus === 'Approved by Country Controller') return 'canReviewAdvanceCountryController'; // legacy Under Review records
  if (currentStatus === 'Approved by Country Controller' && nextStatus === 'Approved by Supply Chain Director') return 'canReviewAdvanceSupplyChainDirector';
  if (currentStatus === 'Approved by Supply Chain Director' && nextStatus === 'Approved by Treasury Director') return 'canReviewAdvanceTreasuryDirector';
  if (currentStatus === 'Approved by Treasury Director' && nextStatus === 'Approved') return spendUsd < 500000 ? 'canReviewAdvanceCorporateController' : null;
  if (currentStatus === 'Approved by Treasury Director' && nextStatus === 'Approved by Corporate Controller') return 'canReviewAdvanceCorporateController';
  if (currentStatus === 'Approved by Corporate Controller' && nextStatus === 'Approved') return 'canReviewAdvanceCfo';
  return null;
}

function getCurrentStepPermission(
  requestType: ProcureGuardRequestType,
  currentStatus: ProcureGuardStatus,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardPermissionKey | null {
  const nextStatus = getNextApprovalStatus(requestType, currentStatus, amount, currency || 'USD');
  if (!nextStatus) return null;
  return getRequiredPermissionForApproval(requestType, currentStatus, nextStatus, amount, currency);
}

export function getRequiredPermissionForTransition(
  requestType: ProcureGuardRequestType,
  currentStatus: ProcureGuardStatus,
  nextStatus: ProcureGuardStatus,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardPermissionKey | null {
  if (nextStatus === 'Rejected') return getCurrentStepPermission(requestType, currentStatus, amount, currency);
  return getRequiredPermissionForApproval(requestType, currentStatus, nextStatus, amount, currency);
}

export function getProcureGuardAvailableActions(
  permissions: ProcureGuardPermissionProfile,
  requestType: ProcureGuardRequestType,
  currentStatus: ProcureGuardStatus,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardAvailableActions {
  const nextStatus = getNextApprovalStatus(requestType, currentStatus, amount, currency || 'USD');
  const requiredPermission = getCurrentStepPermission(requestType, currentStatus, amount, currency);
  const ownsCurrentApprovalStep = Boolean(requiredPermission && permissions[requiredPermission]);
  return {
    nextStatus,
    canApprove: Boolean(nextStatus && ownsCurrentApprovalStep),
    canReject: Boolean(nextStatus && ownsCurrentApprovalStep && permissions.canReject),
    requiredPermission,
    ownerLabel: requiredPermission ? PERMISSION_OWNER_LABELS[requiredPermission] ?? 'Assigned approver' : 'No active owner',
  };
}
export const STATUS_OPTIONS: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by SCM',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
  'Approved',
  'Rejected',
  'Cancelled',
];

export const ADHOC_STATUS_OPTIONS: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by SCM',
  'Approved',
  'Rejected',
  'Cancelled',
];

export const ADVANCE_STATUS_OPTIONS: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
  'Approved',
  'Rejected',
  'Cancelled',
];

export const PRIORITY_OPTIONS: ProcureGuardPriority[] = ['Low', 'Normal', 'High', 'Critical'];
export const CURRENCY_OPTIONS = ['USD', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'EUR', 'GBP'];
export const SEGMENT_OPTIONS = ['Drilling', 'Completions', 'Production', 'Corporate', 'Supply Chain', 'Operations', 'Projects'];
export const SPEND_CATEGORY_OPTIONS = [
  'Customs',
  'Freight',
  'Materials',
  'Repair',
  'Services',
  'Utilities',
  'Consumables',
  'Mobilization',
  'Other',
];

export const COUNTRY_CONTROLLER_EMAILS: Record<string, string> = {
  'Saudi Arabia (KSA)': 'ksa.controller@nesr.local',
  'United Arab Emirates (UAE)': 'uae.controller@nesr.local',
  Qatar: 'qatar.controller@nesr.local',
  Kuwait: 'kuwait.controller@nesr.local',
  Oman: 'oman.controller@nesr.local',
  Bahrain: 'bahrain.controller@nesr.local',
  Egypt: 'egypt.controller@nesr.local',
  Algeria: 'algeria.controller@nesr.local',
  Iraq: 'iraq.controller@nesr.local',
  Libya: 'libya.controller@nesr.local',
  Chad: 'chad.controller@nesr.local',
  Congo: 'congo.controller@nesr.local',
  Test: 'cmorales@nesr.com',
  Other: 'corporate.controller@nesr.local',
};

export const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  AED: 1 / 3.6725,
  SAR: 1 / 3.75,
  QAR: 1 / 3.64,
  KWD: 3.25,
  OMR: 2.6,
  BHD: 2.65,
  EUR: 1.08,
  GBP: 1.27,
};

export const COUNTRY_OPTIONS = [
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Egypt',
  'Algeria',
  'Iraq',
  'Libya',
  'Chad',
  'Congo',
  'Test',
  'Other',
];

export function normalizeProcureGuardCountry(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  const aliases: Record<string, string> = {
    ksa: 'Saudi Arabia (KSA)',
    'saudi arabia': 'Saudi Arabia (KSA)',
    uae: 'United Arab Emirates (UAE)',
    'united arab emirates': 'United Arab Emirates (UAE)',
  };
  const aliased = aliases[raw.toLowerCase()] ?? raw;
  return COUNTRY_OPTIONS.includes(aliased) ? aliased : 'Other';
}

export function usdFmt(value: number | string | null | undefined, currency = 'USD'): string {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

export function toUsd(value: number | string | null | undefined, currency = 'USD'): number {
  const rate = CURRENCY_TO_USD[currency.toUpperCase()] ?? 1;
  return safeNum(value) * rate;
}

export function usdEquivalentFmt(value: number | string | null | undefined, currency = 'USD'): string {
  return usdFmt(toUsd(value, currency), 'USD');
}

export type ProcureGuardWorkflowStep = {
  status: ProcureGuardStatus;
  label: string;
  owner: string;
  description: string;
};

export const APPROVAL_ACTIVE_STATUSES: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by SCM',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
];

export const REVIEWED_STATUSES: ProcureGuardStatus[] = [
  'Under Review',
  'Approved by SCM',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
  'Approved',
  'Rejected',
];

export function isActiveApprovalStatus(status: ProcureGuardStatus): boolean {
  return APPROVAL_ACTIVE_STATUSES.includes(status);
}

export function getWorkflowSteps(
  requestType: 'adhoc' | 'advance',
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardWorkflowStep[] {
  if (requestType === 'adhoc') {
    return [
      { status: 'Submitted', label: 'Country SCM Review', owner: 'Country Supply Chain Manager', description: 'New request submitted; awaiting country supply chain manager approval.' },
      { status: 'Under Review', label: 'Country SCM Review', owner: 'Country Supply Chain Manager', description: 'Country supply chain manager reviews the exception.' },
      { status: 'Approved by SCM', label: 'Supply Chain Director Review', owner: 'Supply Chain Director', description: 'Supply chain director reviews after SCM approval.' },
      { status: 'Approved', label: 'Approved', owner: 'Workflow Complete', description: 'Request is fully approved.' },
    ];
  }

  const steps: ProcureGuardWorkflowStep[] = [
    { status: 'Submitted', label: 'Country Finance Review', owner: 'Country Finance Controller', description: 'New request submitted; awaiting country finance controller approval.' },
    { status: 'Under Review', label: 'Country Finance Review', owner: 'Country Finance Controller', description: 'Country finance controller reviews the advance request.' },
    { status: 'Approved by Country Controller', label: 'Supply Chain Director Review', owner: 'Supply Chain Director', description: 'Supply chain director reviews after country controller approval.' },
    { status: 'Approved by Supply Chain Director', label: 'Treasury Director Review', owner: 'Treasury Director', description: 'Treasury director reviews funding and timing.' },
    { status: 'Approved by Treasury Director', label: 'Corporate Controller Review', owner: 'Corporate Controller', description: 'Corporate controller reviews and checks the CFO threshold.' },
  ];

  if (toUsd(amount, currency || 'USD') >= 500000) {
    steps.push({
      status: 'Approved by Corporate Controller',
      label: 'CFO Review',
      owner: 'CFO',
      description: 'Required when spend value is 500k USD or more.',
    });
  }

  steps.push({
    status: 'Approved',
    label: 'Approved',
    owner: 'Workflow Complete',
    description: 'Request is fully approved.',
  });

  return steps;
}

export function getNextApprovalStatus(
  requestType: 'adhoc' | 'advance',
  currentStatus: ProcureGuardStatus,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardStatus | null {
  if (currentStatus === 'Cancelled' || currentStatus === 'Rejected' || currentStatus === 'Approved') {
    return null;
  }

  if (requestType === 'adhoc') {
    const transitions: Partial<Record<ProcureGuardStatus, ProcureGuardStatus>> = {
      Submitted: 'Approved by SCM',
      'Under Review': 'Approved by SCM', // legacy Under Review records
      'Approved by SCM': 'Approved',
    };
    return transitions[currentStatus] ?? null;
  }

  const spendUsd = toUsd(amount, currency || 'USD');
  const transitions: Partial<Record<ProcureGuardStatus, ProcureGuardStatus>> = {
    Submitted: 'Approved by Country Controller',
    'Under Review': 'Approved by Country Controller', // legacy Under Review records
    'Approved by Country Controller': 'Approved by Supply Chain Director',
    'Approved by Supply Chain Director': 'Approved by Treasury Director',
    'Approved by Treasury Director': spendUsd < 500000 ? 'Approved' : 'Approved by Corporate Controller',
    'Approved by Corporate Controller': 'Approved',
  };
  return transitions[currentStatus] ?? null;
}

export function getStatusOptionsForRequestType(requestType: 'adhoc' | 'advance'): ProcureGuardStatus[] {
  return requestType === 'adhoc' ? ADHOC_STATUS_OPTIONS : ADVANCE_STATUS_OPTIONS;
}

export function getCountryControllerEmail(country: string | null | undefined): string {
  const normalizedCountry = normalizeProcureGuardCountry(country);
  return COUNTRY_CONTROLLER_EMAILS[normalizedCountry || ''] ?? COUNTRY_CONTROLLER_EMAILS.Other;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

export function formatProcureGuardStatusLabel(status: string | null | undefined): string {
  if (!status) return '-';
  return status.replace(/^Approved by\b/, 'Approval by');
}

export function getStatusBadge(status: string): { label: string; className: string; dot: string } {
  const map: Record<string, { label: string; className: string; dot: string }> = {
    Submitted: {
      label: 'Submitted',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
    },
    'Under Review': {
      label: 'Under Review',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
    },
    'Approved by SCM': {
      label: 'Approval by SCM',
      className: 'bg-lime-50 text-lime-800 border-lime-200',
      dot: 'bg-lime-500',
    },
    'Approved by Country Controller': {
      label: 'Approval by Country Controller',
      className: 'bg-cyan-50 text-cyan-800 border-cyan-200',
      dot: 'bg-cyan-500',
    },
    'Approved by Supply Chain Director': {
      label: 'Approval by Supply Chain Director',
      className: 'bg-teal-50 text-teal-800 border-teal-200',
      dot: 'bg-teal-500',
    },
    'Approved by Treasury Director': {
      label: 'Approval by Treasury Director',
      className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      dot: 'bg-indigo-500',
    },
    'Approved by Corporate Controller': {
      label: 'Approval by Corporate Controller',
      className: 'bg-violet-50 text-violet-800 border-violet-200',
      dot: 'bg-violet-500',
    },
    Approved: {
      label: 'Approved',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    },
    Rejected: {
      label: 'Rejected',
      className: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-500',
    },
    Cancelled: {
      label: 'Cancelled',
      className: 'bg-slate-50 text-slate-600 border-slate-200',
      dot: 'bg-slate-400',
    },
  };
  return map[status] ?? {
    label: formatProcureGuardStatusLabel(status),
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  };
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


