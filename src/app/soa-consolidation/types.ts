export type Role = 'champion' | 'manager' | 'director';

export type ScreenId =
  | 'dashboard'
  | 'scoping'
  | 'outreach'
  | 'tracking'
  | 'intake'
  | 'consolidation'
  | 'evidence'
  | 'rollup';

export type VendorStatus = 'received' | 'requested' | 'reminded' | 'non_responder';

export type CountryStatus =
  | 'not_started'
  | 'in_progress'
  | 'requests_sent'
  | 'reminders_sent'
  | 'consolidating'
  | 'handed_off';

export type EvidenceType = 'info' | 'upload' | 'reminder' | 'scope' | 'email' | 'handoff';

export type ToastType = 'success' | 'warning' | 'info';

/* How a figure reads against the collection targets in SOP NESR-SC-01-GR2PAY. `on-track` clears
   the threshold it is measured against, `behind` falls short of it but is still recoverable
   inside the cycle, `breach` has failed the control, `in-flight` is work under way that nothing
   is owed on yet, and `neutral` is a count that carries no judgement either way.

   The view model says which of these a figure is; the components decide what each one looks
   like, so that changing the palette never means touching the derivation. */
export type Standing = 'on-track' | 'behind' | 'breach' | 'in-flight' | 'neutral';

export interface Vendor {
  id: string;
  name: string;
  no: string;
  openPO: number;
  status: VendorStatus;
  reqDate: string;
  remDate: string | null;
  respDate: string | null;
  currency: string;
  invCount: number;
}

export interface Country {
  id: string;
  name: string;
  champion: string;
  balance: number;
  pct: number;
  status: CountryStatus;
  responded: number;
  total: number;
  daysLeft: number;
}

export interface Evidence {
  id: string;
  ts: string;
  type: EvidenceType;
  action: string;
  actor: string;
  detail: string;
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  msg: string;
}

export type ModalState = { type: 'upload'; vendorId: string } | { type: 'handoff' } | null;

export interface AppState {
  role: Role;
  screen: ScreenId;
  vendors: Vendor[];
  countries: Country[];
  evidence: Evidence[];
  filterStatus: 'all' | VendorStatus;
  modal: ModalState;
  toasts: Toast[];
  expandedVendor: string | null;
  uploadStep: 0 | 1 | 2;
  handedOff: boolean;
}

export interface NavItemVM {
  id: ScreenId;
  label: string;
  badge: string | null;
  hasBadge: boolean;
  isActive: boolean;
  onClick: () => void;
}

export interface KpiCardVM {
  label: string;
  value: string;
  sub: string;
  accent: Standing;
}

export interface PipelineStepVM {
  id: string;
  label: string;
  step: number;
  sub: string;
  done: boolean;
  active: boolean;
  nodeIcon: string;
}

export interface StatusBarSegVM {
  status: VendorStatus;
  count: number;
  label: string;
}

export interface FilterTabVM {
  label: string;
  status: 'all' | VendorStatus;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}

export interface VendorRowVM extends Vendor {
  statusLabel: string;
  fmtOpenPO: string;
}

export interface VendorEnrichedVM extends VendorRowVM {
  isExpanded: boolean;
  isReceived: boolean;
  canAccept: boolean;
  canRemind: boolean;
  canNR: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onRemind: () => void;
  onNR: () => void;
}

export interface ScopingVendorVM extends VendorRowVM {
  rank: number;
  cumPct: number;
  cumStanding: Standing;
}

export interface ComplianceItemVM {
  label: string;
  icon: string;
  detail: string;
  pass: boolean;
}

export interface ConsolidatedRowVM extends Vendor {
  num: number;
  fmtOpenPO: string;
}

export interface EvidenceRowVM extends Evidence {
  typeLabel: string;
}

export interface CountryRowVM extends Country {
  statusLabel: string;
  fmtBalance: string;
  isAtRisk: boolean;
  coverageStanding: Standing;
  /** The deadline is close enough that an unfinished country needs chasing today. */
  isDeadlineTight: boolean;
}

export interface ViewModel {
  role: Role;
  roleLabel: string;
  roleCountry: string;
  onRoleChange: (role: Role) => void;

  showDashboard: boolean;
  showScoping: boolean;
  showOutreach: boolean;
  showTracking: boolean;
  showIntake: boolean;
  showConsolidation: boolean;
  showEvidence: boolean;
  showRollup: boolean;

  navItems: NavItemVM[];
  kpiCards: KpiCardVM[];
  pipeline: PipelineStepVM[];
  statusBarSegs: StatusBarSegVM[];

  coverageCheckLabel: string;
  coveragePct: number;
  coverageMet: boolean;

  hasRemindable: boolean;
  remindCount: string;
  totalCount: number;
  receivedCount: number;
  remindedCount: number;
  requestedCount: number;
  onSendReminders: () => void;
  onGoToConsolidation: () => void;

  scopingVendors: ScopingVendorVM[];

  filterTabs: FilterTabVM[];
  vendorsEnriched: VendorEnrichedVM[];

  canSendReminders: boolean;

  complianceItems: ComplianceItemVM[];
  consolidatedRows: ConsolidatedRowVM[];
  allPass: boolean;
  allPassLabel: string;
  handedOff: boolean;
  canHandoff: boolean;
  onGenerateExport: () => void;
  onOpenHandoffModal: () => void;
  onOpenUploadFlow: () => void;

  evidenceEnriched: EvidenceRowVM[];

  countriesEnriched: CountryRowVM[];
  corpKpiCards: KpiCardVM[];
  handedOffCount: number;
  atRiskCount: number;
  avgCoverage: number;
  hasAtRisk: boolean;
  noAtRisk: boolean;

  hasModal: boolean;
  isUploadModal: boolean;
  isHandoffModal: boolean;
  modalVendorName: string;
  modalVendorNo: string;
  modalVendorAmt: string;
  modalInvCount: string;
  uploadStep: 0 | 1 | 2;
  isUploadStep0: boolean;
  isUploadStep1: boolean;
  isUploadStep2: boolean;
  onCloseModal: () => void;
  onSimulateUpload: () => void;
  onAcceptSOA: () => void;
  onConfirmHandoff: () => void;

  toasts: Toast[];
  hasToasts: boolean;
}

export interface ScreenProps {
  vm: ViewModel;
}

/** The imperative actions `deriveViewModel` binds into the view model; owned/implemented by page.tsx. */
export interface Handlers {
  switchRole: (role: Role) => void;
  setScreen: (screen: ScreenId) => void;
  setFilterStatus: (status: 'all' | VendorStatus) => void;
  sendReminders: () => void;
  goToConsolidation: () => void;
  toggleExpand: (id: string) => void;
  openUploadModal: (vendorId: string) => void;
  sendOneReminder: (id: string) => void;
  markNR: (id: string) => void;
  generateExport: () => void;
  openHandoffModal: () => void;
  closeModal: () => void;
  simulateUpload: () => void;
  acceptSOA: () => void;
  confirmHandoff: () => void;
}
