import { shortDateTime, shortDateUTC } from '@/lib/format';
import type {
  AppState,
  ComplianceItemVM,
  Country,
  CountryRowVM,
  CountryStatus,
  CriterionState,
  EmptyKind,
  EvidenceRowVM,
  EvidenceType,
  FilterTabVM,
  Handlers,
  KpiCardVM,
  NavItemVM,
  PipelineStepVM,
  Role,
  ScreenId,
  ScopingVendorVM,
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

const COUNTRY_PIPELINE_STAGE: Record<CountryStatus, number> = {
  not_started: 1,
  requests_sent: 3,
  in_progress: 4,
  reminders_sent: 4,
  consolidating: 5,
  handed_off: 6,
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
function matchesSearch(v: Vendor, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return v.name.toLowerCase().includes(q) || v.no.toLowerCase().includes(q);
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
 * The four control criteria in SOP NESR-SC-01-GR2PAY.
 *
 * Three of these were hard-coded `pass: true` in the prototype, which made the panel a picture of
 * a control rather than a control. Each one now either measures something or says it could not:
 * `unknown` exists precisely so that an unmeasurable test cannot quietly report success.
 */
function complianceItems(
  vendors: Vendor[],
  coveragePct: number,
  coverageMet: boolean,
  targetPct: number,
  yearEndPct: number,
): ComplianceItemVM[] {
  const icon = (s: CriterionState) => (s === 'pass' ? '✓' : s === 'fail' ? '✗' : '?');

  const outstanding = vendors.filter((v) => v.status !== 'received');
  const missingSecond = outstanding.filter((v) => v.reqDate === '—' || !v.remDate);
  const twoRequest: CriterionState = !vendors.length
    ? 'unknown'
    : missingSecond.length === 0
      ? 'pass'
      : 'fail';

  const nonResponders = vendors.filter((v) => v.status === 'non_responder');
  const undocumented = nonResponders.filter((v) => v.reqDate === '—' || !v.remDate);
  const nrState: CriterionState = undocumented.length === 0 ? 'pass' : 'fail';

  const coverage: CriterionState = coverageMet ? 'pass' : 'fail';

  /* The SOP wants a reminder to follow its request by 10 to 14 days: sooner and the vendor was
     not given a fair chance to answer, later and the chase stalled. Measured off the ISO
     timestamps rather than the "03 Jul" display labels, which carry no year.

     A reminder sent EARLY is as much a breach as one sent late, so the test is a window and not
     a floor. Vendors with no reminder yet are not counted here — that is the 2-Request test's
     job, and failing them twice for one omission would double-count it. */
  const reminded = vendors.filter((v) => v.requestedAt && v.remindedAt);
  const outsideWindow = reminded.filter((v) => {
    /* Whole elapsed days, not fractional ones: a person counting "has it been ten days" counts
       days that have finished, and a reminder sent at nine days and twenty-three hours has not
       waited ten. Flooring is the stricter reading, which is the right way round for a control. */
    const days = Math.floor((Date.parse(v.remindedAt!) - Date.parse(v.requestedAt!)) / 86_400_000);
    return days < 10 || days > 14;
  });
  const gapState: CriterionState = !reminded.length
    ? 'unknown'
    : outsideWindow.length
      ? 'fail'
      : 'pass';

  return [
    {
      label: '18-Month PO Coverage',
      icon: icon(coverage),
      detail: `${coveragePct}% of the 18-month PO balance is covered by received SOAs. Threshold: ${targetPct}% quarterly / ${yearEndPct}% year-end.`,
      state: coverage,
    },
    {
      label: '2-Request Evidence',
      icon: icon(twoRequest),
      detail: !vendors.length
        ? 'No vendors are in scope for this country yet, so there is nothing to test.'
        : missingSecond.length
          ? `${missingSecond.length} of ${outstanding.length} vendors without a response are missing an initial request or a reminder on file.`
          : outstanding.length
            ? `All ${outstanding.length} vendors without a response have both an initial request and a reminder recorded.`
            : 'Every in-scope vendor responded; no second request was owed.',
      state: twoRequest,
    },
    {
      label: '10–14 Day Gap Compliance',
      icon: icon(gapState),
      detail: !reminded.length
        ? 'No reminder has been sent yet, so there is no interval to measure.'
        : outsideWindow.length
          ? `${outsideWindow.length} of ${reminded.length} reminders fell outside the 10–14 day window after the initial request.`
          : `All ${reminded.length} reminders followed their initial request inside the 10–14 day window.`,
      state: gapState,
    },
    {
      label: 'Non-Responder Documentation',
      icon: icon(nrState),
      detail: !nonResponders.length
        ? 'No vendor has been flagged as a non-responder, so no correspondence evidence is owed.'
        : undocumented.length
          ? `${undocumented.length} of ${nonResponders.length} flagged non-responders have no complete request-and-reminder trail on file.`
          : `All ${nonResponders.length} flagged non-responders have time-stamped request and reminder correspondence retained.`,
      state: nrState,
    },
  ];
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
    scopeSummary,
    failures,
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
  const pStep = COUNTRY_PIPELINE_STAGE[countryStatus] ?? 1;
  const pipeline: PipelineStepVM[] = [
    { id: 'po', label: 'PO Upload', step: 1, sub: '' },
    { id: 'scope', label: 'Scope', step: 2, sub: '' },
    { id: 'req', label: 'Requests', step: 3, sub: '' },
    { id: 'resp', label: 'Responses', step: 4, sub: `${receivedCount}/${totalCount}` },
    { id: 'cons', label: 'Consolidate', step: 5, sub: '' },
    { id: 'hand', label: 'Handoff', step: 6, sub: '' },
  ].map((p) => {
    const done = p.step < pStep;
    const active = p.step === pStep;
    return { ...p, done, active, nodeIcon: done ? '✓' : active ? '●' : '○' };
  });

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

  /* Vendor Scoping — the rank and the cumulative percentage are positions in the WHOLE country,
     so they are computed over every vendor and only then filtered down to the page on screen.
     Ranking the search results instead would make "#1" mean whatever was typed in the box. */
  let cumBal = 0;
  const scopingAll: ScopingVendorVM[] = [...vendors]
    .sort((a, b) => b.openPO - a.openPO)
    .map((v, i) => {
      cumBal += v.openPO;
      const cumPct = totalBalance > 0 ? Math.round((cumBal / totalBalance) * 100) : 0;
      return {
        ...enrichVendorRow(v),
        rank: i + 1,
        cumPct,
        cumStanding: coverageStanding(cumPct, coverageTargetPct),
      };
    });
  const scopingMatched = scopingAll.filter((v) => matchesSearch(v, scopeSearch));
  const scopingVendors = pageSlice(scopingMatched, scopePage);
  const scopingTable = tableControls(
    scopingAll.length,
    scopingMatched.length,
    scopePage,
    scopeSearch,
    handlers.setScopeSearch,
    handlers.setScopePage,
  );

  const items = complianceItems(
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
  const scopeSummaryLine = scopeSummary
    ? `${scopeSummary.inScope} vendors above ${fmtUsd(scopeSummary.thresholdUsd)} · ${scopeSummary.added} added · ${scopeSummary.refreshed} refreshed · ${scopeSummary.unreachable} with no email · ${scopeSummary.excluded} excluded · ${fmtM(scopeSummary.inScopeUsd)} of ${fmtM(scopeSummary.totalUsd)} covered`
    : '';

  return {
    role,
    roleLabel: ROLE_LABEL[role] ?? role,
    roleCountry: scopeLabel(payload.available, viewer.countries),
    viewerName: viewer.name,
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
    canScope: canAct && !!cycle,
    scopingVendors,
    scopingTable,
    scopeSummary,
    scopeSummaryLine,
    onScopeCountry: handlers.scopeCountry,

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
