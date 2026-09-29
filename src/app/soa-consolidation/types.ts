import type { ApplyScopeSummary } from '@/app/actions/soa/scoping';
import type { DeliveryFailure } from '@/lib/soa/delivery';
import type { VendorCycleStatus } from '@/lib/soa/status';
import type { ScopeCandidate, ScopeCandidates } from '@/lib/soa/candidates';
import type { CountryOption, SoaPayload } from '@/lib/soa/read';

/**
 * Roles exactly as `country_users` names them.
 *
 * The role comes from a grant rather than the dropdown the prototype had in its navbar, so the
 * database's spelling wins. `admin` is here because ADMIN_EMAILS can put somebody in the tool
 * without any grant at all.
 */
export type Role = 'admin' | 'champion' | 'ap' | 'viewer';

/**
 * The signed-in person, resolved on the server from `getSoaActor()` and handed to the client.
 *
 * `countries` is the scope from `countriesFor(actor, 'viewer')`, a list of country ids, or the
 * literal `'all'`, which is not the same as listing every country today: it keeps covering a
 * country added next quarter.
 *
 * `champion` is the same question asked at champion level, and it is a different answer: someone
 * can be champion of Saudi Arabia and viewer of Oman, and on Oman every mutating button must be
 * gone. `role` alone is the highest role held ANYWHERE, so it cannot answer that on its own. The
 * server actions guard per country and the buttons have to agree with them.
 */
export interface Viewer {
  name: string;
  email: string;
  role: Role;
  countries: string[] | 'all';
  champion: string[] | 'all';
  /**
   * True when this person reads the CURRENT country only as Accounts Payable.
   *
   * AP picks a cycle up after the champion closes it, so before that there is nothing for them to
   * review. Asked per country rather than per person: being AP for Kuwait says nothing about what
   * they may see in Oman.
   */
  apOnly: boolean;
}

export type ScreenId =
  | 'dashboard'
  | 'scoping'
  | 'outreach'
  | 'tracking'
  | 'consolidation'
  | 'evidence'
  | 'rollup';

/**
 * `scoped` is a vendor drawn into the cycle that nobody has written to yet. The prototype had no
 * such state because every fixture vendor arrived already requested; a freshly scoped country is
 * 270 rows of exactly this, and it is the state the "send initial requests" action clears.
 */
export type VendorStatus = VendorCycleStatus;

export type CountryStatus =
  | 'not_started'
  | 'in_progress'
  | 'requests_sent'
  | 'reminders_sent'
  | 'consolidating'
  | 'handed_off';

export type EvidenceType = 'info' | 'upload' | 'reminder' | 'scope' | 'email' | 'handoff';

export type ToastType = 'success' | 'warning' | 'info';

/**
 * A bulk send in flight.
 *
 * Counted on the client because the sending is done there, one vendor at a time: a single action
 * that loops the whole country cannot report anything until it has finished, and for 120 suppliers
 * that is minutes of a button that looks stuck.
 */
export interface SendProgress {
  kind: 'request' | 'reminder' | 'retry';
  done: number;
  total: number;
  failed: number;
  /** The vendor being written to right now, so the count is not the only sign of life. */
  current: string;
}

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

export type ModalState =
  | { type: 'upload'; vendorId: string }
  | { type: 'resolve'; vendorId: string }
  | { type: 'handoff' }
  | null;

/** The two ways a champion can close a vendor that never sent a statement. */
export type ResolveOutcome = 'nil_balance' | 'non_responder';

/**
 * An outreach attempt n8n or the mailer refused, from `getSoaOutreachFailures`.
 *
 * The same row the query produces, including whether the vendor is still owed the send that
 * failed. Restating the shape here would put the retry test in two places.
 */
export type OutreachFailure = DeliveryFailure;

/**
 * Client state is now only what the screens themselves own. Which screen, which filter, which
 * page, which modal. Vendors, countries and evidence are NOT in here: every mutation goes to a
 * server action and then `router.refresh()`, so the payload is the single copy of the truth and
 * there is no local mirror of it to drift.
 *
 * Vendor Scoping is the one deliberate exception, and only while a champion is deciding. Its 525
 * candidates are fetched on demand rather than carried in the page payload, and the tick boxes are
 * a *draft* held in `scopeSelected` until "Save selection" writes the whole set in one call. That
 * draft is not a mirror of the database. It is the edit in progress, which is exactly the thing
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
  /** A bulk send under way, counted off vendor by vendor. Null when nothing is sending. */
  sendProgress: SendProgress | null;
  failures: OutreachFailure[] | null;
  /** The delivery log's own in-flight flag; it loads without disabling the rest of the screen. */
  failuresLoading: boolean;

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
  /** This vendor can be chased on its own, now, from its row. */
  canChase: boolean;
  /** What that press would send: the first letter for a vendor never written to, else a reminder. */
  chaseLabel: string;
  /** Asked and still silent, so a champion can close it one way or the other. */
  canResolve: boolean;
  /** Past the date suppliers were given and still silent. Derived, never written. */
  awaitingVerification: boolean;
  /** The champion's own words on why this vendor was closed without a statement. */
  resolutionNote: string;
  /** Their current statement is filed correspondence, so no invoice lines were read. */
  repliedByEmail: boolean;
  /** No address on file, so this vendor cannot be chased until someone supplies one. */
  isUnreachable: boolean;
  /** The last send to this vendor was refused and it is still owed that letter. */
  sendFailed: boolean;
  /** Why it was refused, for the row's tooltip and the opened detail. Empty when it was not. */
  sendFailedReason: string;
  contactLabel: string;
  onToggle: () => void;
  onAccept: () => void;
  onChase: () => void;
  onResolve: () => void;
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
  /** Position by value in the WHOLE country, from the server. Never the position on this page. */
  rank: number;
  valueLabel: string;
  /** Running share at this row. Null for an excluded supplier, which is out of the denominator. */
  cumPct: number | null;
  cumStanding: Standing;
  kind: ScopeRowKind;
  checked: boolean;
  /** Cannot be changed: excluded, already contacted, or the viewer cannot act on this country. */
  disabled: boolean;
  /** Why the box cannot be changed; empty for a free row. */
  noteLabel: string;
  /** Ticked or unticked since the last save. The rows this save will actually change. */
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
 * The selected share of the country's balance. The figure the quarter is judged on.
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
 * A control criterion is pass, fail, or, when the payload does not carry what the test needs, 
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
  /** The chase as a funnel, each a share of the country's whole balance: scoped, then requested,
   *  then reminded, then answered. Each is a subset of the one before it. */
  funnel: { label: string; pct: number; standing: Standing }[];
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
export type EmptyKind =
  | 'none'
  | 'no-cycle'
  | 'no-extract'
  | 'no-country'
  | 'not-enrolled'
  | 'not-scoped';

export interface ViewModel {
  role: Role;
  roleLabel: string;
  roleCountry: string;
  viewerName: string;
  /** The signed-in person's address. CC'd on every message they send. */
  viewerEmail: string;
  viewerInitials: string;
  /** An admin, or a champion granted every country. Gates the rollup: nav item and screen. */
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
  /** The collection deadline. What suppliers were given in the letter. */
  deadlineLabel: string;
  /** The cycle deadline, when this country must be reconciled, closed and handed off. */
  cycleDeadlineLabel: string;
  daysToClose: number;
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
  /** Scoped but never written to. The vendors an initial request is still owed. */
  unrequestedCount: number;
  hasUnrequested: boolean;
  unreachableCount: number;
  /** Joins this country to the open cycle. Champion-only, like scoping. */
  onEnrol: () => void;
  /** `cc` adds and `ccRemoved` drops, both chosen on the Recipients step and both this send only. */
  onSendReminders: (cc?: string[], ccRemoved?: string[]) => void;
  onSendRequests: (cc?: string[], ccRemoved?: string[]) => void;
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

  /** Rows this save would add and remove. The same arithmetic the server action will redo. */
  scopeAddCount: number;
  scopeRemoveCount: number;
  scopeDirty: boolean;
  scopeSaveLabel: string;
  scopeCanSave: boolean;
  scopeDirtyLine: string;
  scopeSavedLine: string;
  onSaveScope: () => void;
  onDiscardScope: () => void;

  /* Delivery failures, shown on Response Tracking beside the vendors they belong to. */
  failures: OutreachFailure[] | null;
  hasFailures: boolean;
  failuresLoaded: boolean;
  /** The screen reads the delivery log itself the first time it opens, as scoping does. */
  deliveryNeedsLoad: boolean;
  /** Vendors still waiting on the send that was refused. What "retry the failed ones" would do. */
  retryFailedCount: number;
  hasRetryable: boolean;
  onLoadFailures: () => void;
  onRetryFailed: () => void;

  filterTabs: FilterTabVM[];
  vendorsEnriched: VendorEnrichedVM[];
  trackingTable: TableControlsVM;
  /** The collection deadline has passed, so silence is now a finding rather than a wait. */
  /** Non-null while a bulk send runs; the send buttons become this. */
  sendProgress: SendProgress | null;
  sendProgressPct: number;
  pastCollectionDeadline: boolean;
  /** Vendors past that deadline still awaiting a champion's verdict on why they are silent. */
  awaitingVerificationCount: number;

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
  isResolveModal: boolean;
  isHandoffModal: boolean;
  modalVendorName: string;
  modalVendorNo: string;
  modalVendorAmt: string;
  modalVendorCurrency: string;
  onCloseModal: () => void;
  onAcceptSOA: (file: File) => void;
  /** Close a vendor that never sent a statement, saying which kind of silence it was. */
  onResolveVendor: (outcome: ResolveOutcome, note: string) => void;
  onConfirmHandoff: () => void;

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
  enrol: () => void;
  sendReminders: (cc?: string[], ccRemoved?: string[]) => void;
  sendRequests: (cc?: string[], ccRemoved?: string[]) => void;
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
  openResolveModal: (vendorId: string) => void;
  /** Chase one vendor from its row. The kind is decided by what that vendor is still owed. */
  sendOne: (id: string, kind: 'request' | 'reminder') => void;
  /** Send again to every vendor whose last attempt was refused, and to nobody else. */
  retryFailed: () => void;
  resolveVendor: (outcome: ResolveOutcome, note: string) => void;
  saveContacts: (id: string, emails: string[]) => void;
  generateExport: () => void;
  openHandoffModal: () => void;
  closeModal: () => void;
  acceptSOA: (file: File) => void;
  confirmHandoff: () => void;
}
