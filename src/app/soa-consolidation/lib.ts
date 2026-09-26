import { shortDateTime, shortDateUTC } from '@/lib/format';
import { complianceCriteria } from '@/lib/soa/compliance';
import type {
  AppState,
  Country,
  CountryRowVM,
  CountryStatus,
  EmptyKind,
  EvidenceRowVM,
  EvidenceType,
  FilterTabVM,
  Handlers,
  KpiCardVM,
  NavItemVM,
  PipelineStepVM,
  Role,
  ScopeBulkVM,
  ScopeCandidate,
  ScopeCandidates,
  ScopeCoverageVM,
  ScopeRowVM,
  ScreenId,
  SoaPayload,
  Standing,
  StatusBarSegVM,
  TableControlsVM,
  Vendor,
  VendorEnrichedVM,
  VendorRowVM,
  VendorStatus,
  ViewModel,
  Viewer,
} from './types';

/** One page of a vendor table. 270 rows is the real Saudi Arabia figure; 50 keeps a page cheap. */
export const PAGE_SIZE = 50;

export function fmtM(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

/** `$250,000` — the vendor threshold and the coverage targets read better unrounded. */
export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * How a coverage figure reads against the cycle's own target.
 *
 * The target is the cycle's, not a literal 70: a quarter can be opened with a different one, and
 * a tool that judged every quarter against last quarter's number would be quietly wrong. Anything
 * under roughly two-thirds of the target is a failed control rather than a shortfall, because
 * there is no realistic path back inside the cycle from there.
 */
function coverageStanding(pct: number, target: number): Standing {
  if (pct >= target) return 'on-track';
  return pct >= target * 0.7 ? 'behind' : 'breach';
}

const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  scoped: 'Not Requested',
  received: 'Received',
  requested: 'Requested',
  reminded: 'Reminded',
  non_responder: 'Non-Responder',
};

const COUNTRY_STATUS_LABEL: Record<CountryStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  requests_sent: 'Requests Sent',
  reminders_sent: 'Reminders Sent',
  consolidating: 'Consolidating',
  handed_off: 'Handed Off',
};

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  email: 'Email',
  upload: 'Upload',
  reminder: 'Reminder',
  scope: 'Scoping',
  info: 'System',
  handoff: 'Handoff',
};

const ROLE_LABEL: Record<Role, string> = {
  admin: 'SOA Administrator',
  manager: 'Supply Chain Manager',
  champion: 'SC SOA Champion',
  viewer: 'Read-only Viewer',
};

/** The database's enum, narrowed for the badge maps; anything unrecognised reads as not started. */
function asCountryStatus(raw: string): CountryStatus {
  return raw in COUNTRY_STATUS_LABEL ? (raw as CountryStatus) : 'not_started';
}

/** "Name" the countries a grant covers, without pretending `'all'` is a list of today's twelve. */
function scopeLabel(available: { id: string; name: string }[], scope: Viewer['countries']): string {
  if (scope === 'all') return `All countries (${available.length})`;
  const names = scope.map((id) => available.find((c) => c.id === id)?.name ?? id);
  if (!names.length) return 'No countries';
  if (names.length <= 3) return names.join(', ');
  return `${names.length} countries`;
}

/** "Ahmed Al-Rashidi" → "AA". */
function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (!parts.length) return '?';
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

/** Name or vendor number, case-insensitive. The only two things a champion knows a vendor by. */
function matchesText(name: string, no: string, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return name.toLowerCase().includes(q) || no.toLowerCase().includes(q);
}

function matchesSearch(v: Vendor, needle: string): boolean {
  return matchesText(v.name, v.no, needle);
}

/** A date-only column out of the database, rendered without letting the viewer's zone shift it. */
function dateOnlyLabel(iso: string): string {
  return iso ? shortDateUTC(new Date(`${iso}T00:00:00Z`)) : '—';
}

function tableControls(
  total: number,
  matched: number,
  page: number,
  search: string,
  onSearch: (value: string) => void,
  onPage: (page: number) => void,
): TableControlsVM {
  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const from = matched === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min((safePage + 1) * PAGE_SIZE, matched);
  const isFiltered = search.trim().length > 0;
  return {
    search,
    onSearch,
    page: safePage,
    pageCount,
    from,
    to,
    matched,
    total,
    hasPrev: safePage > 0,
    hasNext: safePage < pageCount - 1,
    onPrev: () => onPage(safePage - 1),
    onNext: () => onPage(safePage + 1),
    isFiltered,
    isEmpty: matched === 0,
    showPager: pageCount > 1,
    rangeLabel:
      matched === 0
        ? isFiltered
          ? `No vendors match “${search}” of ${total}`
          : 'No vendors'
        : `${from}–${to} of ${matched}${isFiltered ? ` matching (of ${total})` : ''}`,
  };
}

/** The slice of a filtered list this page shows. */
function pageSlice<T>(rows: T[], page: number): T[] {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  return rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
}

/**
 * Which pipeline steps are finished, answered from the data rather than from a status column.
 *
 * This used to be a lookup from `country_cycles.status` through a table that mapped `in_progress`
 * to step 4, so a country with no vendors at all rendered PO Upload, Scope and Requests ticked and
 * Responses under way. A pipeline that claims work nobody did is worse than no pipeline: it is the
 * first thing on the dashboard and it is read as a summary of where the country stands.
 *
 * Exported so the rules can be tested without building a whole view model.
 */
export function pipelineStage(
  vendors: Vendor[],
  extractTaken: boolean,
  handedOff: boolean,
  consolidating: boolean,
) {
  const total = vendors.length;
  const awaitingCount = vendors.filter(
    (v) => v.status === 'requested' || v.status === 'reminded',
  ).length;
  const notYetRequested = vendors.filter((v) => v.status === 'scoped').length;
  const settledCount = vendors.filter(
    (v) => v.status === 'received' || v.status === 'non_responder',
  ).length;

  const scopeDone = total > 0;
  return {
    awaitingCount,
    notYetRequested,
    settledCount,
    extractTaken,
    scopeDone,
    /* "Requests sent" means every scoped vendor has been written to, not that the button was
       pressed once: a partial send leaves the step unfinished, which is the honest reading. */
    requestsDone: scopeDone && notYetRequested === 0,
    responsesDone: scopeDone && settledCount === total,
    consolidateDone: handedOff || consolidating,
    handoffDone: handedOff,
  };
}

/** The empty answer, so the scoping screen can render its own frame before the list arrives. */
const NO_CANDIDATES: ScopeCandidates = { thresholdUsd: 0, totalBalance: 0, candidates: [] };

export interface ScopeTotals {
  /** Ticked right now, including the locked rows that are ticked whether or not anyone said so. */
  selectedCount: number;
  selectedUsd: number;
  /** What would be written on save. Deliberately the same two rules `applySoaScopeSelection` uses:
   *  an excluded supplier is never added, and a locked one is never removed. */
  addCount: number;
  removeCount: number;
  /** Ticked and removable — what "Clear selection" would actually clear. */
  clearableCount: number;
  /** The balance reachable if every supplier that *can* be ticked were: the ceiling on coverage. */
  reachableUsd: number;
  excludedCount: number;
  lockedCount: number;
  overThresholdCount: number;
  overThresholdUnticked: number;
  /** Ticked suppliers with no address on file — selected, but impossible to chase. */
  unreachableSelected: number;
}

/**
 * Every figure the KPI cards and the save button need, in one pass over the candidates.
 *
 * Exported and pure because this is the arithmetic a champion is trusting: it decides what the
 * quarter's headline percentage says and how many rows the save button claims it will change, and
 * it has to agree exactly with what the server action will do when the button is pressed.
 */
export function scopeTotals(
  candidates: ScopeCandidate[],
  selected: ReadonlySet<string>,
): ScopeTotals {
  const t: ScopeTotals = {
    selectedCount: 0,
    selectedUsd: 0,
    addCount: 0,
    removeCount: 0,
    clearableCount: 0,
    reachableUsd: 0,
    excludedCount: 0,
    lockedCount: 0,
    overThresholdCount: 0,
    overThresholdUnticked: 0,
    unreachableSelected: 0,
  };
  for (const c of candidates) {
    const ticked = selected.has(c.vendorNo);
    if (ticked) {
      t.selectedCount += 1;
      t.selectedUsd += c.valueUsd;
      if (!c.emails.length) t.unreachableSelected += 1;
      if (!c.locked) t.clearableCount += 1;
      if (!c.selected && !c.excluded) t.addCount += 1;
    } else if (c.selected && !c.locked) {
      t.removeCount += 1;
    }
    /* An excluded supplier cannot be added, so it is not part of the ceiling — unless it is
       already in the cycle, in which case its balance is genuinely being chased. */
    if (!c.excluded || c.selected) t.reachableUsd += c.valueUsd;
    if (c.excluded) t.excludedCount += 1;
    if (c.locked) t.lockedCount += 1;
    if (c.overThreshold && !c.excluded) {
      t.overThresholdCount += 1;
      if (!ticked) t.overThresholdUnticked += 1;
    }
  }
  return t;
}

/**
 * `payload` is the database's answer for this country and cycle; `state` is only what the screens
 * themselves own. Nothing about a vendor, a country or an evidence entry is held in client state
 * any more — a mutation calls its server action and refreshes, and this function re-runs over the
 * new payload.
 */
export function deriveViewModel(
  payload: SoaPayload,
  state: AppState,
  handlers: Handlers,
  viewer: Viewer,
): ViewModel {
  const {
    screen,
    filterStatus,
    modal,
    toasts,
    expandedVendor,
    search,
    page,
    scopeSearch,
    scopePage,
    busy,
    failures,
    scopeCandidates,
    scopeLoading,
    scopeError,
    scopeSelected,
    scopeSaved,
  } = state;
  const { cycle, vendors, countries, evidence, countryId, countryName, totalBalance } = payload;
  const role = viewer.role;

  /* The corporate rollup is a manager's screen; the guard is applied twice — the nav item is not
     offered, and a screen id that somehow says 'rollup' falls back to the dashboard. */
  const canSeeRollup = role === 'admin' || role === 'manager';
  const canAct =
    !!countryId &&
    !payload.handedOff &&
    (viewer.champion === 'all' || viewer.champion.includes(countryId));

  /* Which "nothing to show, and here is why". These are all reachable on any given morning: a
     quarter nobody has opened, a grant naming no active country, a country nobody has scoped. */
  const emptyKind: EmptyKind = !cycle
    ? 'no-cycle'
    : !countryId
      ? 'no-country'
      : /* A quarter can be open without its spend snapshot having been taken, and until it is
           there is nothing to scope FROM. That is an admin's job, not the champion's, so it gets
           its own state rather than looking like a country nobody has got round to. */
        !cycle.extractedAt
        ? 'no-extract'
        : !payload.scoped
          ? 'not-scoped'
          : 'none';

  /* Vendor Scoping is where a champion fixes "not scoped", and the rollup does not depend on this
     country at all, so those two screens stay live when the country itself is empty. */
  const emptyBlocks = (id: ScreenId) =>
    emptyKind === 'no-cycle' ||
    emptyKind === 'no-country' ||
    (emptyKind === 'not-scoped' && id !== 'scoping' && id !== 'rollup');

  const activeScreen: ScreenId = screen === 'rollup' && !canSeeRollup ? 'dashboard' : screen;
  const showEmptyState = emptyBlocks(activeScreen);

  const coverageTargetPct = cycle?.coverageTargetPct ?? 0;
  const yearEndTargetPct = cycle?.yearEndTargetPct ?? 0;

  const totalCount = vendors.length;
  const receivedCount = vendors.filter((v) => v.status === 'received').length;
  const requestedCount = vendors.filter((v) => v.status === 'requested').length;
  const remindedCount = vendors.filter((v) => v.status === 'reminded').length;
  const nonResponderCount = vendors.filter((v) => v.status === 'non_responder').length;
  const unrequestedCount = vendors.filter((v) => v.status === 'scoped').length;
  const unreachableCount = vendors.filter((v) => v.contactEmails.length === 0).length;
  const pendingResponseCount = requestedCount + remindedCount;
  const receivedBalance = vendors
    .filter((v) => v.status === 'received')
    .reduce((s, v) => s + v.openPO, 0);
  const coveragePct = totalBalance > 0 ? Math.round((receivedBalance / totalBalance) * 100) : 0;
  const coverageMet = coveragePct >= coverageTargetPct && totalBalance > 0;

  const activeCountry = countries.find((c) => c.id === countryId);
  const countryStatus = asCountryStatus(activeCountry?.status ?? 'not_started');

  const cycleLabel = cycle?.label ?? 'No active cycle';
  const countryLabel = countryName ? `${countryName} (${countryId})` : 'No country in scope';
  const deadlineLabel = cycle ? dateOnlyLabel(cycle.submissionDeadline) : '—';
  const periodLabel = cycle
    ? `${cycleLabel} (${dateOnlyLabel(cycle.periodStart)} – ${dateOnlyLabel(cycle.periodEnd)})`
    : '—';
  const contextLine = `${countryLabel} · ${cycleLabel}`;

  // Workflow pipeline (6 steps, derived from the active country's status)
  /* The pipeline is derived from what has actually happened, not from the country's status
     column. It used to read a single enum through a lookup table, which mapped `in_progress` to
     stage 4 — so a country with nothing in it at all showed PO Upload, Scope and Requests ticked
     and Responses under way. A pipeline that claims work nobody did is worse than no pipeline.

     Each step answers its own question from the data, and a step only reports done when the thing
     it names is genuinely finished. */
  /* `pipelineStage` also returns the outstanding counts it used to reach these verdicts; the KPI
     row derives its own from the same vendors, so only the step flags are taken here. */
  const {
    notYetRequested,
    extractTaken,
    scopeDone,
    requestsDone,
    responsesDone,
    consolidateDone,
    handoffDone,
  } = pipelineStage(
    vendors,
    !!cycle?.extractedAt,
    payload.handedOff,
    countryStatus === 'consolidating',
  );

  const steps: { id: string; label: string; sub: string; done: boolean }[] = [
    {
      id: 'po',
      label: 'PO Upload',
      sub: extractTaken ? 'Snapshot taken' : 'Not taken',
      done: extractTaken,
    },
    {
      id: 'scope',
      label: 'Scope',
      sub: scopeDone ? `${totalCount} vendors` : 'None yet',
      done: scopeDone,
    },
    {
      id: 'req',
      label: 'Requests',
      sub: scopeDone ? `${totalCount - notYetRequested}/${totalCount} sent` : '',
      done: requestsDone,
    },
    {
      id: 'resp',
      label: 'Responses',
      sub: scopeDone ? `${receivedCount}/${totalCount}` : '',
      done: responsesDone,
    },
    { id: 'cons', label: 'Consolidate', sub: '', done: consolidateDone },
    { id: 'hand', label: 'Handoff', sub: '', done: handoffDone },
  ];

  /* Exactly one step is active: the first one not yet done. Once everything is done nothing is
     active, rather than the last step blinking forever. */
  const activeIdx = steps.findIndex((p) => !p.done);
  const pipeline: PipelineStepVM[] = steps.map((p, i) => ({
    ...p,
    step: i + 1,
    active: i === activeIdx,
    nodeIcon: p.done ? '✓' : i === activeIdx ? '●' : '○',
  }));

  const thresholdLabel = cycle ? fmtUsd(cycle.vendorThresholdUsd) : '—';

  const kpiCards: KpiCardVM[] = [
    {
      label: 'In-Scope Vendors',
      value: String(totalCount),
      sub: `POs last 18 months > ${thresholdLabel}`,
      accent: totalCount > 0 ? 'on-track' : 'neutral',
    },
    {
      label: 'SOAs Received',
      value: String(receivedCount),
      sub: `${totalCount ? Math.round((receivedCount / totalCount) * 100) : 0}% of vendors`,
      accent: receivedCount > 0 ? 'on-track' : 'neutral',
    },
    {
      label: 'Awaiting Response',
      value: String(pendingResponseCount),
      sub: `${requestedCount} requested · ${remindedCount} reminded`,
      accent: pendingResponseCount > 0 ? 'behind' : 'neutral',
    },
    {
      label: '18-Month PO Coverage',
      value: `${coveragePct}%`,
      sub: coverageMet
        ? `✓ Meets ${coverageTargetPct}% threshold`
        : `⚠ Below ${coverageTargetPct}% target`,
      accent: coverageMet ? 'on-track' : 'behind',
    },
    {
      label: 'Days Remaining',
      value: cycle ? String(cycle.daysRemaining) : '—',
      sub: `Until ${deadlineLabel}`,
      accent: cycle && cycle.daysRemaining <= 5 ? 'breach' : 'in-flight',
    },
  ];

  const coverageCheckLabel = `${coverageMet ? '✓ ' : '⚠ '}${coveragePct}% — ${
    coverageMet
      ? `Meets ${coverageTargetPct}% ${cycleLabel} threshold`
      : `Below ${coverageTargetPct}% target`
  }`;

  const statusBarSegs: StatusBarSegVM[] = (
    [
      { status: 'received', count: receivedCount, label: 'Received' },
      { status: 'requested', count: requestedCount, label: 'Requested' },
      { status: 'reminded', count: remindedCount, label: 'Reminded' },
      { status: 'non_responder', count: nonResponderCount, label: 'Non-Responder' },
      { status: 'scoped', count: unrequestedCount, label: 'Not Requested' },
    ] as StatusBarSegVM[]
  ).filter((s) => s.count > 0);

  const NAV: { id: ScreenId; label: string; badge: string | null }[] = [
    { id: 'dashboard', label: 'Dashboard', badge: null },
    {
      id: 'scoping',
      label: 'Vendor Scoping',
      badge: emptyKind === 'not-scoped' ? '!' : null,
    },
    {
      id: 'outreach',
      label: 'Outreach',
      badge: unrequestedCount > 0 ? String(unrequestedCount) : null,
    },
    {
      id: 'tracking',
      label: 'Response Tracking',
      badge: pendingResponseCount > 0 ? String(pendingResponseCount) : null,
    },
    { id: 'intake', label: 'SOA Intake', badge: null },
    { id: 'consolidation', label: 'Consolidation', badge: null },
    { id: 'evidence', label: 'Evidence Repository', badge: null },
    ...(canSeeRollup ? [{ id: 'rollup' as ScreenId, label: 'Corporate Rollup', badge: null }] : []),
  ];
  const navItems: NavItemVM[] = NAV.map((n) => ({
    ...n,
    hasBadge: !!n.badge,
    isActive: n.id === activeScreen,
    onClick: () => handlers.setScreen(n.id),
  }));

  const filterTabs: FilterTabVM[] = (
    [
      { label: 'All', status: 'all', count: totalCount },
      { label: 'Received', status: 'received', count: receivedCount },
      { label: 'Requested', status: 'requested', count: requestedCount },
      { label: 'Reminded', status: 'reminded', count: remindedCount },
      { label: 'Non-Responder', status: 'non_responder', count: nonResponderCount },
      { label: 'Not Requested', status: 'scoped', count: unrequestedCount },
    ] as Omit<FilterTabVM, 'isSelected' | 'onClick'>[]
  ).map((t) => ({
    ...t,
    isSelected: t.status === filterStatus,
    onClick: () => handlers.setFilterStatus(t.status),
  }));

  const enrichVendorRow = (v: Vendor): VendorRowVM => ({
    ...v,
    statusLabel: VENDOR_STATUS_LABEL[v.status] ?? v.status,
    fmtOpenPO: fmtM(v.openPO),
  });

  // Response Tracking — status filter, then text filter, then one page of rows.
  const trackingMatched = vendors
    .filter((v) => filterStatus === 'all' || v.status === filterStatus)
    .filter((v) => matchesSearch(v, search));
  const vendorsEnriched: VendorEnrichedVM[] = pageSlice(trackingMatched, page).map((v) => ({
    ...enrichVendorRow(v),
    isExpanded: v.id === expandedVendor,
    isReceived: v.status === 'received',
    canAccept: canAct && v.status !== 'received',
    canRemind: canAct && v.status === 'requested',
    canNR: canAct && (v.status === 'reminded' || v.status === 'requested'),
    isUnreachable: v.contactEmails.length === 0,
    contactLabel: v.contactEmails.join(', '),
    onToggle: () => handlers.toggleExpand(v.id),
    onAccept: () => handlers.openUploadModal(v.id),
    onRemind: () => handlers.sendOneReminder(v.id),
    onNR: () => handlers.markNR(v.id),
    onSaveContacts: (emails: string[]) => handlers.saveContacts(v.id, emails),
  }));
  const trackingTable = tableControls(
    vendors.length,
    trackingMatched.length,
    page,
    search,
    handlers.setSearch,
    handlers.setPage,
  );

  /* ── Vendor Scoping ───────────────────────────────────────────────────────────────────────
     A champion picks the suppliers by hand. The list is every supplier in the cycle's PO
     snapshot, not only the ones already in the cycle, so it is fetched on demand rather than
     carried in the page payload: 525 rows are needed on exactly one screen.

     Rank and cumulative % arrive from the server, computed across the WHOLE country. They are
     never recomputed here, because recomputing them after the search box has filtered the list
     would make "#1" mean "first search hit" and "covers 62%" mean nothing at all. */
  const scope = scopeCandidates ?? NO_CANDIDATES;
  const scopeLoaded = scopeCandidates !== null;
  const canTick = canAct && !!cycle;
  /* The screen asks for its list itself the first time it renders; this is the flag it asks on. */
  const scopeNeedsLoad = !!countryId && !!cycle && !scopeLoaded && !scopeLoading && !scopeError;

  /* The country's whole balance, which is the coverage denominator — excluded suppliers included,
     because excluding one does not reduce what the country owes. */
  const scopeDenominator = scope.totalBalance || totalBalance;
  const scopeThresholdLabel = fmtUsd(scope.thresholdUsd || (cycle?.vendorThresholdUsd ?? 0));
  const totals = scopeTotals(scope.candidates, scopeSelected);

  const scopePct =
    scopeDenominator > 0 ? Math.round((totals.selectedUsd / scopeDenominator) * 100) : 0;
  const reachablePct =
    scopeDenominator > 0 ? Math.round((totals.reachableUsd / scopeDenominator) * 100) : 0;
  const scopeTargetUsd = (scopeDenominator * coverageTargetPct) / 100;
  const scopeMeetsTarget = scopePct >= coverageTargetPct && scopeDenominator > 0;
  const scopeTargetUnreachable =
    scopeLoaded && scopeDenominator > 0 && !scopeMeetsTarget && reachablePct < coverageTargetPct;

  const scopeCoverage: ScopeCoverageVM = {
    pct: scopePct,
    label: `${scopePct}%`,
    standing: coverageStanding(scopePct, coverageTargetPct),
    targetPct: coverageTargetPct,
    barPct: Math.min(100, Math.max(0, scopePct)),
    markerPct: Math.min(100, Math.max(0, coverageTargetPct)),
    selectedLabel: fmtM(totals.selectedUsd),
    totalLabel: fmtM(scopeDenominator),
    targetValueLabel: fmtM(scopeTargetUsd),
    meetsTarget: scopeMeetsTarget,
    reachablePct,
    targetUnreachable: scopeTargetUnreachable,
    verdictLabel: scopeMeetsTarget
      ? `✓ Meets the ${coverageTargetPct}% ${cycleLabel} target`
      : scopeTargetUnreachable
        ? `⚠ Ticking every selectable supplier reaches only ${reachablePct}% — the ${coverageTargetPct}% target cannot be met from this snapshot`
        : `⚠ ${Math.max(0, coverageTargetPct - scopePct)} points short — another ${fmtM(Math.max(0, scopeTargetUsd - totals.selectedUsd))} needs selecting`,
  };

  const scopeCards: KpiCardVM[] = [
    {
      label: 'Suppliers Available',
      value: String(scope.candidates.length),
      sub: `${totals.overThresholdCount} above ${scopeThresholdLabel} · ${totals.excludedCount} excluded`,
      accent: 'neutral',
    },
    {
      label: 'Selected',
      value: String(totals.selectedCount),
      sub: `of ${scope.candidates.length} · ${totals.lockedCount} already contacted · ${totals.unreachableSelected} with no email`,
      accent: totals.selectedCount > 0 ? 'in-flight' : 'neutral',
    },
    {
      label: 'Selected Value',
      value: fmtM(totals.selectedUsd),
      sub: `of ${fmtM(scopeDenominator)} country balance`,
      accent: totals.selectedUsd > 0 ? 'in-flight' : 'neutral',
    },
  ];

  const scopeMatchedAll = scope.candidates.filter((c) =>
    matchesText(c.name, c.vendorNo, scopeSearch),
  );
  const scopeIsFiltered = scopeSearch.trim().length > 0;
  const matchedUnticked = scopeMatchedAll.filter(
    (c) => !c.excluded && !scopeSelected.has(c.vendorNo),
  ).length;

  /** A bulk shortcut keeps every tick it cannot legitimately change. */
  const withAdded = (rows: ScopeCandidate[]): ReadonlySet<string> => {
    const next = new Set(scopeSelected);
    for (const c of rows) if (!c.excluded) next.add(c.vendorNo);
    return next;
  };

  const scopeBulkActions: ScopeBulkVM[] = [
    {
      id: 'threshold',
      label: `Select all above ${scopeThresholdLabel}`,
      hint: `${totals.overThresholdCount} suppliers · ${totals.overThresholdUnticked} not yet ticked`,
      disabled: !canTick || busy || totals.overThresholdUnticked === 0,
      onClick: () =>
        handlers.setScopeSelection(
          withAdded(scope.candidates.filter((c) => c.overThreshold && !c.excluded)),
        ),
    },
    {
      id: 'search',
      label: scopeIsFiltered
        ? `Select all matching “${scopeSearch}”`
        : 'Select all matching the search',
      hint: scopeIsFiltered
        ? `${scopeMatchedAll.length} rows match · ${matchedUnticked} not yet ticked`
        : 'Type in the search box to use this',
      disabled: !canTick || busy || !scopeIsFiltered || matchedUnticked === 0,
      onClick: () => handlers.setScopeSelection(withAdded(scopeMatchedAll)),
    },
    {
      id: 'clear',
      label: 'Clear selection',
      hint: totals.clearableCount
        ? `Unticks ${totals.clearableCount}${totals.lockedCount ? ` · ${totals.lockedCount} already contacted stay` : ''}`
        : 'Nothing to clear',
      disabled: !canTick || busy || totals.clearableCount === 0,
      onClick: () =>
        /* Locked suppliers stay ticked: unticking one would delete correspondence already
           recorded against it, and the server would refuse the removal anyway. */
        handlers.setScopeSelection(
          new Set(scope.candidates.filter((c) => c.locked).map((c) => c.vendorNo)),
        ),
    },
  ];

  const scopeRows: ScopeRowVM[] = pageSlice(scopeMatchedAll, scopePage).map((c) => {
    const ticked = scopeSelected.has(c.vendorNo);
    const kind = c.excluded ? 'excluded' : c.locked ? 'locked' : 'free';
    return {
      vendorNo: c.vendorNo,
      name: c.name,
      rank: c.rank,
      valueLabel: fmtM(c.valueUsd),
      cumPct: c.cumulativePct,
      cumStanding: coverageStanding(c.cumulativePct, coverageTargetPct),
      kind,
      checked: ticked,
      disabled: !canTick || c.excluded || c.locked,
      noteLabel: c.excluded
        ? c.selected
          ? 'Intercompany — excluded by an administrator, but already in this cycle'
          : 'Intercompany — excluded by an administrator'
        : c.locked
          ? 'Already contacted — removing it would delete the correspondence on file'
          : '',
      isDirty: ticked !== c.selected && !c.excluded && !(c.selected && c.locked),
      overThreshold: c.overThreshold,
      isUnreachable: c.emails.length === 0,
      toggleLabel: `Select ${c.name} (${c.vendorNo})`,
      onToggle: () => handlers.toggleScopeVendor(c.vendorNo),
    };
  });

  const scopeTable = tableControls(
    scope.candidates.length,
    scopeMatchedAll.length,
    scopePage,
    scopeSearch,
    handlers.setScopeSearch,
    handlers.setScopePage,
  );

  const scopeDirty = totals.addCount > 0 || totals.removeCount > 0;
  const changeParts = [
    ...(totals.addCount ? [`${totals.addCount} to add`] : []),
    ...(totals.removeCount ? [`${totals.removeCount} to remove`] : []),
  ];
  const scopeSaveLabel = busy
    ? 'Saving…'
    : scopeDirty
      ? `Save selection — ${changeParts.join(', ')}`
      : 'Save selection — no changes';

  const scopeEmptyReason =
    !scopeLoaded || scope.candidates.length > 0
      ? ''
      : !cycle?.extractedAt
        ? `The ${cycleLabel} PO snapshot has not been taken yet, so there is nothing to select from. An administrator runs the extract.`
        : `This cycle holds no PO transactions for ${countryName ?? 'this country'}, so there is no supplier list to select from.`;

  const items = complianceCriteria(
    vendors,
    coveragePct,
    coverageMet,
    coverageTargetPct,
    yearEndTargetPct,
  );
  const allPass = items.every((c) => c.state === 'pass');
  const allPassLabel = allPass
    ? '✓ All criteria met'
    : items.some((c) => c.state === 'fail')
      ? '⚠ Some criteria not met'
      : '? Some criteria unverified';

  const consolidatedRows = vendors
    .filter((v) => v.status === 'received')
    .map((v, i) => ({ ...v, num: i + 1, fmtOpenPO: fmtM(v.openPO) }));

  const evidenceEnriched: EvidenceRowVM[] = evidence.map((e) => {
    const typeKey: EvidenceType = e.type in EVIDENCE_TYPE_LABEL ? (e.type as EvidenceType) : 'info';
    return {
      ...e,
      typeKey,
      typeLabel: EVIDENCE_TYPE_LABEL[typeKey],
      tsLabel: e.ts ? shortDateTime(new Date(e.ts)) : '—',
    };
  });

  // Corporate Rollup
  const countriesEnriched: CountryRowVM[] = countries.map((c: Country) => {
    const status = asCountryStatus(c.status);
    return {
      ...c,
      status,
      statusLabel: COUNTRY_STATUS_LABEL[status],
      fmtBalance: fmtM(c.balance),
      isAtRisk:
        c.pct < coverageTargetPct &&
        status !== 'handed_off' &&
        status !== 'not_started' &&
        c.daysLeft <= 10,
      coverageStanding: coverageStanding(c.pct, coverageTargetPct),
      isDeadlineTight: c.daysLeft <= 5 && status !== 'handed_off',
    };
  });

  const handedOffCount = countriesEnriched.filter((c) => c.status === 'handed_off').length;
  const atRiskCount = countriesEnriched.filter((c) => c.isAtRisk).length;
  const avgCoverage = countries.length
    ? Math.round(countries.reduce((s, c) => s + c.pct, 0) / countries.length)
    : 0;
  const inProgressCount = countriesEnriched.filter(
    (c) => c.status !== 'not_started' && c.status !== 'handed_off',
  ).length;
  const entityCount = countries.length;
  const corpKpiCards: KpiCardVM[] = [
    {
      label: 'Active Countries',
      value: String(inProgressCount),
      sub: `of ${entityCount} started this cycle`,
      accent: 'in-flight',
    },
    {
      label: 'Handed Off',
      value: String(handedOffCount),
      sub: 'Delivered to Finance',
      accent: handedOffCount > 0 ? 'on-track' : 'neutral',
    },
    {
      label: 'At Risk',
      value: String(atRiskCount),
      sub: `Coverage < ${coverageTargetPct}%, < 10 days`,
      accent: atRiskCount > 0 ? 'breach' : 'neutral',
    },
    {
      label: 'Avg Coverage',
      value: `${avgCoverage}%`,
      sub: entityCount ? `Across ${entityCount} started entities` : 'No country has started',
      accent: avgCoverage >= coverageTargetPct ? 'on-track' : 'behind',
    },
  ];

  const modalVendor =
    modal && modal.type === 'upload' ? vendors.find((v) => v.id === modal.vendorId) : undefined;
  const sampleVendor = vendors[0];

  const cycleSlug = cycleLabel.replace(/\s+/g, '-');
  const scopeSavedLine = scopeSaved
    ? `${scopeSaved.added} added · ${scopeSaved.removed} removed` +
      (scopeSaved.keptLocked
        ? ` · ${scopeSaved.keptLocked} kept because they have already been contacted`
        : '') +
      ` · ${scopeSaved.total} suppliers now in scope (${fmtM(scopeSaved.selectedUsd)})`
    : '';

  return {
    role,
    roleLabel: ROLE_LABEL[role] ?? role,
    roleCountry: scopeLabel(payload.available, viewer.countries),
    viewerName: viewer.name,
    viewerEmail: viewer.email,
    viewerInitials: initials(viewer.name),
    canSeeRollup,
    canAct,
    busy,

    cycleLabel,
    cycleChip: cycleLabel,
    countryLabel,
    contextLine,
    periodLabel,
    deadlineLabel,
    daysRemaining: cycle?.daysRemaining ?? 0,
    coverageTargetPct,
    yearEndTargetPct,
    thresholdLabel,
    totalBalanceLabel: fmtM(totalBalance),
    quarterTargetLabel: fmtM((totalBalance * coverageTargetPct) / 100),
    yearEndTargetLabel: fmtM((totalBalance * yearEndTargetPct) / 100),
    exportFileName: `NESR-${countryId ?? 'SOA'}-SOA-${cycleSlug}.csv`,

    countryOptions: payload.available,
    activeCountryId: countryId ?? '',
    showCountryPicker: payload.available.length > 1,
    onSelectCountry: handlers.selectCountry,

    emptyKind,
    showEmptyState,

    showDashboard: activeScreen === 'dashboard',
    showScoping: activeScreen === 'scoping',
    showOutreach: activeScreen === 'outreach',
    showTracking: activeScreen === 'tracking',
    showIntake: activeScreen === 'intake',
    showConsolidation: activeScreen === 'consolidation',
    showEvidence: activeScreen === 'evidence',
    showRollup: activeScreen === 'rollup' && canSeeRollup,

    navItems,
    kpiCards,
    pipeline,
    statusBarSegs,

    coverageCheckLabel,
    coveragePct,
    coverageMet,

    hasRemindable: canAct && requestedCount > 0,
    remindCount: String(requestedCount),
    totalCount,
    receivedCount,
    remindedCount,
    requestedCount,
    unrequestedCount,
    hasUnrequested: canAct && unrequestedCount > 0,
    unreachableCount,
    onSendReminders: handlers.sendReminders,
    onSendRequests: handlers.sendRequests,
    onGoToConsolidation: handlers.goToConsolidation,

    isScoped: payload.scoped,
    canScope: canTick,
    scopeNeedsLoad,
    scopeLoading,
    scopeLoaded,
    scopeError,
    scopeEmptyReason,
    scopeIntroLine: `${scope.candidates.length || 'No'} suppliers in the ${cycleLabel} PO snapshot · Threshold ${scopeThresholdLabel} · Country balance ${fmtM(scopeDenominator)}`,
    onLoadCandidates: handlers.loadCandidates,

    scopeCards,
    scopeCoverage,
    scopeBulkActions,
    scopeRows,
    scopeTable,

    scopeAddCount: totals.addCount,
    scopeRemoveCount: totals.removeCount,
    scopeDirty,
    scopeSaveLabel,
    scopeCanSave: canTick && scopeLoaded && scopeDirty && !busy,
    scopeDirtyLine: scopeDirty
      ? `Unsaved: ${changeParts.join(' · ')}. Nothing is written until you save.`
      : '',
    scopeSavedLine,
    onSaveScope: handlers.saveScopeSelection,
    onDiscardScope: handlers.discardScopeSelection,

    failures,
    hasFailures: !!failures?.length,
    failuresLoaded: failures !== null,
    onLoadFailures: handlers.loadFailures,

    filterTabs,
    vendorsEnriched,
    trackingTable,

    canSendReminders: canAct && requestedCount > 0,

    complianceItems: items,
    consolidatedRows,
    allPass,
    allPassLabel,
    handedOff: payload.handedOff,
    canHandoff: canAct && coverageMet,
    onGenerateExport: handlers.generateExport,
    onOpenHandoffModal: handlers.openHandoffModal,

    evidenceEnriched,
    hasEvidence: evidenceEnriched.length > 0,

    countriesEnriched,
    corpKpiCards,
    handedOffCount,
    atRiskCount,
    avgCoverage,
    hasAtRisk: atRiskCount > 0,
    noAtRisk: atRiskCount === 0,
    entityCount,

    hasModal: !!modal,
    isUploadModal: modal?.type === 'upload',
    isHandoffModal: modal?.type === 'handoff',
    modalVendorName: modalVendor?.name ?? '',
    modalVendorNo: modalVendor?.no ?? '',
    modalVendorAmt: modalVendor ? fmtM(modalVendor.openPO) : '',
    modalVendorCurrency: modalVendor?.currency ?? '',
    onCloseModal: handlers.closeModal,
    onAcceptSOA: handlers.acceptSOA,
    onConfirmHandoff: handlers.confirmHandoff,

    sampleVendorName: sampleVendor?.name ?? '—',
    sampleVendorNo: sampleVendor?.no ?? '—',
    sampleVendorCurrency: sampleVendor?.currency ?? '—',
    hasSampleVendor: !!sampleVendor,
    entityName: countryName ?? '—',
    championContact: `${viewer.name} · ${viewer.email}`,

    toasts,
    hasToasts: toasts.length > 0,
  };
}
