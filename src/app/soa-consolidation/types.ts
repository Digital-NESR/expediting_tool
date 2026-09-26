import type { ApplyScopeSummary } from '@/app/actions/soa/scoping';
import type { ScopeCandidate, ScopeCandidates } from '@/lib/soa/candidates';
import type { CountryOption, SoaPayload } from '@/lib/soa/read';

/**
 * Roles exactly as `country_users` names them.
 *
 * The prototype's third role was called "director" and was picked from a dropdown in the navbar.
 * The grant table calls the same thing `manager`, and the role now comes from a grant rather than
 * a picker, so the database's spelling wins. `admin` is here because ADMIN_EMAILS can put someone
 * in the tool without any grant at all.
 */
export type Role = 'admin' | 'manager' | 'champion' | 'viewer';

/**
 * The signed-in person, resolved on the server from `getSoaActor()` and handed to the client.
 *
 * `countries` is the scope from `countriesFor(actor, 'viewer')` — a list of country ids, or the
 * literal `'all'`, which is not the same as listing every country today: it keeps covering a
 * country added next quarter.
 *
 * `champion` is the same question asked at champion level, and it is a different answer: someone
 * can be champion of Saudi Arabia and viewer of Oman, and on Oman every mutating button must be
 * gone. `role` alone is the highest role held ANYWHERE, so it cannot answer that on its own — the
 * server actions guard per country and the buttons have to agree with them.
 */
export interface Viewer {
  name: string;
  email: string;
  role: Role;
  countries: string[] | 'all';
  champion: string[] | 'all';
}

export type ScreenId =
  | 'dashboard'
  | 'scoping'
  | 'outreach'
  | 'tracking'
  | 'intake'
  | 'consolidation'
  | 'evidence'
  | 'rollup';

/**
 * `scoped` is a vendor drawn into the cycle that nobody has written to yet. The prototype had no
 * such state because every fixture vendor arrived already requested; a freshly scoped country is
 * 270 rows of exactly this, and it is the state the "send initial requests" action clears.
 */
export type VendorStatus = 'scoped' | 'received' | 'requested' | 'reminded' | 'non_responder';

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

/* Vendors, countries and evidence are the database's rows, not the tool's own shapes: `read.ts`
   returns exactly what the screens consume, so re-declaring them here would only create two
   definitions to keep in step. */
export type Vendor = SoaPayload['vendors'][number];
export type Country = SoaPayload['countries'][number];
export type Evidence = SoaPayload['evidence'][number];
export type { ApplyScopeSummary, CountryOption, ScopeCandidate, ScopeCandidates, SoaPayload };

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  msg: string;
}

export type ModalState = { type: 'upload'; vendorId: string } | { type: 'handoff' } | null;

/** An outreach attempt n8n or the mailer refused, from `getSoaOutreachFailures`. */
export interface OutreachFailure {
  vendorNo: string;
  vendorName: string;
  error: string;
  sentAt: string;
}

/**
 * Client state is now only what the screens themselves own — which screen, which filter, which
 * page, which modal. Vendors, countries and evidence are NOT in here: every mutation goes to a
 * server action and then `router.refresh()`, so the payload is the single copy of the truth and
 * there is no local mirror of it to drift.
 *
 * Vendor Scoping is the one deliberate exception, and only while a champion is deciding. Its 525
 * candidates are fetched on demand rather than carried in the page payload, and the tick boxes are
 * a *draft* held in `scopeSelected` until "Save selection" writes the whole set in one call. That
 * draft is not a mirror of the database — it is the edit in progress, which is exactly the thing
 * that must not be written on every click.
 */
export interface AppState {
  screen: ScreenId;
  filterStatus: 'all' | VendorStatus;
  modal: ModalState;
  toasts: Toast[];
  expandedVendor: string | null;
  /** Response Tracking: free-text filter on vendor name or number, and the page shown. */
  search: string;
  page: number;
  /** Vendor Scoping has its own pair, so switching screens does not carry a filter across. */
  scopeSearch: string;
  scopePage: number;
  /** True while a server action is in flight; every mutating button is disabled on it. */
  busy: boolean;
  failures: OutreachFailure[] | null;

  /* Vendor Scoping, all fetched on demand when the screen first opens. */
  /** Null until the list has been read; an empty `candidates` array is a real, different answer. */
  scopeCandidates: ScopeCandidates | null;
  scopeLoading: boolean;
  /** Set only when the fetch itself threw; a country with no PO rows is not an error. */
  scopeError: string | null;
  /**
   * The champion's working tick boxes, by vendor number. Seeded from what is already in the cycle
   * and edited freely until saved; a `Set` because 525 rows are looked up on every render.
   */
  scopeSelected: ReadonlySet<string>;
  /** What the last successful save did, so the screen can say so rather than only toasting it. */
  scopeSaved: ApplyScopeSummary | null;
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
  /** No address on file, so this vendor cannot be chased until someone supplies one. */
  isUnreachable: boolean;
  contactLabel: string;
  onToggle: () => void;
  onAccept: () => void;
  onRemind: () => void;
  onNR: () => void;
  onSaveContacts: (emails: string[]) => void;
}

/**
 * One supplier in the Vendor Scoping list.
 *
 * `kind` is the whole of the row's behaviour, because two of the three states are not free
 * choices: an `excluded` row can never be ticked and a `locked` row can never be unticked. The
 * view model decides which one a row is and why; the component only decides what each looks like.
 */
export type ScopeRowKind = 'free' | 'locked' | 'excluded';

export interface ScopeRowVM {
  vendorNo: string;
  name: string;
  /** Position by value in the WHOLE country, from the server — never the position on this page. */
  rank: number;
  valueLabel: string;
  /** Running share of the country's balance at this row, also computed across the whole country. */
  cumPct: number;
  cumStanding: Standing;
  kind: ScopeRowKind;
  checked: boolean;
  /** Cannot be changed: excluded, already contacted, or the viewer cannot act on this country. */
  disabled: boolean;
  /** Why the box cannot be changed; empty for a free row. */
  noteLabel: string;
  /** Ticked or unticked since the last save — the rows this save will actually change. */
  isDirty: boolean;
  /** Above the cycle's threshold, which is now a suggestion rather than the rule. */
  overThreshold: boolean;
  /** No address on file, so a request to this supplier cannot be sent until one is supplied. */
  isUnreachable: boolean;
  /** The label a screen reader reads for the tick box. */
  toggleLabel: string;
  onToggle: () => void;
}

/**
 * The selected share of the country's balance — the figure the quarter is judged on.
 *
 * `reachablePct` is the same figure if every supplier that *could* be ticked were, so the screen
 * can say "the target cannot be met from this snapshot" rather than letting a champion tick their
 * way towards a number that was never available.
 */
export interface ScopeCoverageVM {
  pct: number;
  label: string;
  standing: Standing;
  targetPct: number;
  /** Width of the filled bar and the position of the target marker, both clamped to 0–100. */
  barPct: number;
  markerPct: number;
  selectedLabel: string;
  totalLabel: string;
  targetValueLabel: string;
  meetsTarget: boolean;
  reachablePct: number;
  /** True when ticking every selectable supplier still would not reach the cycle's target. */
  targetUnreachable: boolean;
  verdictLabel: string;
}

/** One "tick these for me" shortcut, which always says how many rows it would change. */
export interface ScopeBulkVM {
  id: string;
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A control criterion is pass, fail, or — when the payload does not carry what the test needs —
 * `unknown`. The prototype hard-coded three of the four to pass, which is the one outcome a
 * control check must never be able to produce without measuring something.
 */
export type CriterionState = 'pass' | 'fail' | 'unknown';

export interface ComplianceItemVM {
  label: string;
  icon: string;
  detail: string;
  state: CriterionState;
}

export interface ConsolidatedRowVM extends Vendor {
  num: number;
  fmtOpenPO: string;
}

export interface EvidenceRowVM extends Evidence {
  /** The database's `evidence_type` narrowed to the union the colour maps are keyed on. */
  typeKey: EvidenceType;
  typeLabel: string;
  tsLabel: string;
}

export interface CountryRowVM extends Country {
  status: CountryStatus;
  statusLabel: string;
  fmtBalance: string;
  isAtRisk: boolean;
  coverageStanding: Standing;
  /** The deadline is close enough that an unfinished country needs chasing today. */
  isDeadlineTight: boolean;
}

/**
 * Search box + pager for a table that now holds hundreds of rows rather than two dozen.
 *
 * Both tables render one page at a time; `matched` counts what the filter kept and `total` what
 * exists, so the footer can say "51–100 of 214 (of 270)" rather than leaving a champion guessing
 * whether a vendor is missing or merely on another page.
 */
export interface TableControlsVM {
  search: string;
  onSearch: (value: string) => void;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  matched: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isFiltered: boolean;
  isEmpty: boolean;
  showPager: boolean;
  rangeLabel: string;
}

/** Which "there is nothing to show yet, and here is why" the tool is in. */
export type EmptyKind = 'none' | 'no-cycle' | 'no-extract' | 'no-country' | 'not-scoped';

export interface ViewModel {
  role: Role;
  roleLabel: string;
  roleCountry: string;
  viewerName: string;
  /** The signed-in person's address — CC'd on every message they send. */
  viewerEmail: string;
  viewerInitials: string;
  /** Manager or admin. Gates the corporate rollup — both the nav item and the screen. */
  canSeeRollup: boolean;
  /** Champion or better on the country on screen. Gates every mutating button. */
  canAct: boolean;
  busy: boolean;

  /* Cycle facts that used to be literals in the markup. */
  cycleLabel: string;
  cycleChip: string;
  countryLabel: string;
  contextLine: string;
  periodLabel: string;
  deadlineLabel: string;
  daysRemaining: number;
  coverageTargetPct: number;
  yearEndTargetPct: number;
  thresholdLabel: string;
  totalBalanceLabel: string;
  quarterTargetLabel: string;
  yearEndTargetLabel: string;
  exportFileName: string;

  /* The country picker in the sidebar's Active Scope block. */
  countryOptions: CountryOption[];
  activeCountryId: string;
  showCountryPicker: boolean;
  onSelectCountry: (countryId: string) => void;

  emptyKind: EmptyKind;
  showEmptyState: boolean;

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
  /** Scoped but never written to — the vendors an initial request is still owed. */
  unrequestedCount: number;
  hasUnrequested: boolean;
  unreachableCount: number;
  /** `cc` is the extra NESR addresses chosen on the Recipients step; this send only. */
  onSendReminders: (cc?: string[]) => void;
  onSendRequests: (cc?: string[]) => void;
  onGoToConsolidation: () => void;

  /* Vendor Scoping */
  isScoped: boolean;
  canScope: boolean;
  /** The screen asks for its own data the first time it is opened; true until that has started. */
  scopeNeedsLoad: boolean;
  scopeLoading: boolean;
  scopeLoaded: boolean;
  scopeError: string | null;
  /** Why the list came back empty, when it did. Empty string when there are rows. */
  scopeEmptyReason: string;
  scopeIntroLine: string;
  onLoadCandidates: () => void;

  scopeCards: KpiCardVM[];
  scopeCoverage: ScopeCoverageVM;
  scopeBulkActions: ScopeBulkVM[];
  scopeRows: ScopeRowVM[];
  scopeTable: TableControlsVM;

  /** Rows this save would add and remove — the same arithmetic the server action will redo. */
  scopeAddCount: number;
  scopeRemoveCount: number;
  scopeDirty: boolean;
  scopeSaveLabel: string;
  scopeCanSave: boolean;
  scopeDirtyLine: string;
  scopeSavedLine: string;
  onSaveScope: () => void;
  onDiscardScope: () => void;

  /* Outreach delivery failures */
  failures: OutreachFailure[] | null;
  hasFailures: boolean;
  failuresLoaded: boolean;
  onLoadFailures: () => void;

  filterTabs: FilterTabVM[];
  vendorsEnriched: VendorEnrichedVM[];
  trackingTable: TableControlsVM;

  canSendReminders: boolean;

  complianceItems: ComplianceItemVM[];
  consolidatedRows: ConsolidatedRowVM[];
  allPass: boolean;
  allPassLabel: string;
  handedOff: boolean;
  canHandoff: boolean;
  onGenerateExport: () => void;
  onOpenHandoffModal: () => void;

  evidenceEnriched: EvidenceRowVM[];
  hasEvidence: boolean;

  countriesEnriched: CountryRowVM[];
  corpKpiCards: KpiCardVM[];
  handedOffCount: number;
  atRiskCount: number;
  avgCoverage: number;
  hasAtRisk: boolean;
  noAtRisk: boolean;
  entityCount: number;

  hasModal: boolean;
  isUploadModal: boolean;
  isHandoffModal: boolean;
  modalVendorName: string;
  modalVendorNo: string;
  modalVendorAmt: string;
  modalVendorCurrency: string;
  onCloseModal: () => void;
  onAcceptSOA: (file: File, invoiceCount: number) => void;
  onConfirmHandoff: () => void;

  /* SOA Intake is a preview of the vendor-facing form; it shows a real vendor from this cycle. */
  sampleVendorName: string;
  sampleVendorNo: string;
  sampleVendorCurrency: string;
  hasSampleVendor: boolean;
  entityName: string;
  championContact: string;

  toasts: Toast[];
  hasToasts: boolean;
}

export interface ScreenProps {
  vm: ViewModel;
}

/** The imperative actions `deriveViewModel` binds into the view model; implemented by the client. */
export interface Handlers {
  setScreen: (screen: ScreenId) => void;
  setFilterStatus: (status: 'all' | VendorStatus) => void;
  setSearch: (value: string) => void;
  setPage: (page: number) => void;
  setScopeSearch: (value: string) => void;
  setScopePage: (page: number) => void;
  selectCountry: (countryId: string) => void;
  sendReminders: (cc?: string[]) => void;
  sendRequests: (cc?: string[]) => void;
  /** Read the country's candidate list. Called by the scoping screen when it first renders. */
  loadCandidates: () => void;
  /** Tick or untick one supplier in the draft. Refused for locked and excluded rows. */
  toggleScopeVendor: (vendorNo: string) => void;
  /** Replace the whole draft, which is how the bulk shortcuts apply themselves. */
  setScopeSelection: (vendorNos: ReadonlySet<string>) => void;
  /** Throw the draft away and go back to what the database holds. */
  discardScopeSelection: () => void;
  /** Write the draft, once, for every supplier at the same time. */
  saveScopeSelection: () => void;
  loadFailures: () => void;
  goToConsolidation: () => void;
  toggleExpand: (id: string) => void;
  openUploadModal: (vendorId: string) => void;
  sendOneReminder: (id: string) => void;
  markNR: (id: string) => void;
  saveContacts: (id: string, emails: string[]) => void;
  generateExport: () => void;
  openHandoffModal: () => void;
  closeModal: () => void;
  acceptSOA: (file: File, invoiceCount: number) => void;
  confirmHandoff: () => void;
}
