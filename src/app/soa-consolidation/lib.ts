import { ACTIVE_COUNTRY_ID, TODAY_LABEL, TOTAL_BALANCE } from './data';
import type {
  AppState,
  ComplianceItemVM,
  Country,
  CountryRowVM,
  CountryStatus,
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
  Standing,
  StatusBarSegVM,
  Vendor,
  VendorEnrichedVM,
  VendorRowVM,
  VendorStatus,
  ViewModel,
  Viewer,
} from './types';

export function fmtM(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

/** New evidence/toast entries are timestamped against the frozen demo "today" with a live time-of-day. */
export function newTimestamp(): string {
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${TODAY_LABEL}, ${time}`;
}

/* The SOP sets a 70% quarterly coverage threshold. Anything under half of the balance is treated
   as a failed control rather than a shortfall, because there is no realistic path back inside
   the cycle from there. */
function coverageStanding(pct: number): Standing {
  return pct >= 70 ? 'on-track' : pct >= 50 ? 'behind' : 'breach';
}

const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
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

/** "Name" the countries a grant covers, without pretending `'all'` is a list of today's twelve. */
function scopeLabel(countries: Country[], scope: Viewer['countries']): string {
  if (scope === 'all') return `All countries (${countries.length})`;
  const names = scope.map((id) => countries.find((c) => c.id === id)?.name ?? id);
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

/**
 * `viewer` carries who the signed-in person is; `state.role` carries what they are, seeded from
 * that same actor when the state is created. Nothing switches it afterwards — the role picker is
 * gone, and a role is now a grant.
 */
export function deriveViewModel(state: AppState, handlers: Handlers, viewer: Viewer): ViewModel {
  const {
    role,
    screen,
    vendors,
    countries,
    evidence,
    filterStatus,
    modal,
    toasts,
    expandedVendor,
    uploadStep,
    handedOff,
  } = state;

  /* The corporate rollup is a manager's screen. It used to be reachable by picking "director" in
     the navbar, which meant anyone could reach it; now it follows the grant, and the guard is
     applied twice — the nav item is not offered, and a screen id that somehow says 'rollup'
     falls back to the dashboard rather than rendering nothing. */
  const canSeeRollup = role === 'admin' || role === 'manager';
  const activeScreen: ScreenId = screen === 'rollup' && !canSeeRollup ? 'dashboard' : screen;

  const totalCount = vendors.length;
  const receivedCount = vendors.filter((v) => v.status === 'received').length;
  const requestedCount = vendors.filter((v) => v.status === 'requested').length;
  const remindedCount = vendors.filter((v) => v.status === 'reminded').length;
  const nonResponderCount = vendors.filter((v) => v.status === 'non_responder').length;
  const pendingResponseCount = requestedCount + remindedCount;
  const receivedBalance = vendors
    .filter((v) => v.status === 'received')
    .reduce((s, v) => s + v.openPO, 0);
  const coveragePct = totalCount > 0 ? Math.round((receivedBalance / TOTAL_BALANCE) * 100) : 0;
  const coverageMet = coveragePct >= 70;
  const ksa = countries.find((c) => c.id === ACTIVE_COUNTRY_ID) ?? {
    status: 'in_progress' as CountryStatus,
    pct: 74,
  };

  // Workflow pipeline (6 steps, derived from the active country's status)
  const pStep = COUNTRY_PIPELINE_STAGE[ksa.status] ?? 4;
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

  // KPI cards
  const kpiCards: KpiCardVM[] = [
    {
      label: 'In-Scope Vendors',
      value: String(totalCount),
      sub: 'POs last 18 months > $250,000',
      accent: 'on-track',
    },
    {
      label: 'SOAs Received',
      value: String(receivedCount),
      sub: `${totalCount ? Math.round((receivedCount / totalCount) * 100) : 0}% of vendors`,
      accent: 'on-track',
    },
    {
      label: 'Awaiting Response',
      value: String(pendingResponseCount),
      sub: `${requestedCount} requested · ${remindedCount} reminded`,
      accent: 'behind',
    },
    {
      label: '18-Month PO Coverage',
      value: `${coveragePct}%`,
      sub: coverageMet ? '✓ Meets 70% threshold' : '⚠ Below 70% target',
      accent: coverageMet ? 'on-track' : 'behind',
    },
    { label: 'Days Remaining', value: '11', sub: 'Until 31 Jul 2026', accent: 'in-flight' },
  ];

  const coverageCheckLabel = `${coverageMet ? '✓ ' : '⚠ '}${coveragePct}% — ${coverageMet ? 'Meets 70% Q3 threshold' : 'Below 70% target'}`;

  // Vendor response status bar + legend
  const statusBarSegs: StatusBarSegVM[] = (
    [
      { status: 'received', count: receivedCount, label: 'Received' },
      { status: 'requested', count: requestedCount, label: 'Requested' },
      { status: 'reminded', count: remindedCount, label: 'Reminded' },
      { status: 'non_responder', count: nonResponderCount, label: 'Non-Responder' },
    ] as StatusBarSegVM[]
  ).filter((s) => s.count > 0);

  // Sidebar nav
  const NAV: { id: ScreenId; label: string; badge: string | null }[] = [
    { id: 'dashboard', label: 'Dashboard', badge: null },
    { id: 'scoping', label: 'Vendor Scoping', badge: null },
    {
      id: 'outreach',
      label: 'Outreach',
      badge: requestedCount > 0 ? String(requestedCount) : null,
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

  // Filter tabs (Response Tracking)
  const filterTabs: FilterTabVM[] = (
    [
      { label: 'All', status: 'all', count: totalCount },
      { label: 'Received', status: 'received', count: receivedCount },
      { label: 'Requested', status: 'requested', count: requestedCount },
      { label: 'Reminded', status: 'reminded', count: remindedCount },
      { label: 'Non-Responder', status: 'non_responder', count: nonResponderCount },
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

  // Response Tracking — enriched vendor rows
  const vendorsEnriched: VendorEnrichedVM[] = (
    filterStatus === 'all' ? vendors : vendors.filter((v) => v.status === filterStatus)
  ).map((v) => ({
    ...enrichVendorRow(v),
    isExpanded: v.id === expandedVendor,
    isReceived: v.status === 'received',
    canAccept: v.status === 'requested' || v.status === 'reminded',
    canRemind: v.status === 'requested',
    canNR: v.status === 'reminded',
    onToggle: () => handlers.toggleExpand(v.id),
    onAccept: () => handlers.openUploadModal(v.id),
    onRemind: () => handlers.sendOneReminder(v.id),
    onNR: () => handlers.markNR(v.id),
  }));

  // Vendor Scoping — sorted by balance desc, cumulative %
  let cumBal = 0;
  const scopingVendors: ScopingVendorVM[] = [...vendors]
    .sort((a, b) => b.openPO - a.openPO)
    .map((v, i) => {
      cumBal += v.openPO;
      const cumPct = Math.round((cumBal / TOTAL_BALANCE) * 100);
      return {
        ...enrichVendorRow(v),
        rank: i + 1,
        cumPct,
        cumStanding: coverageStanding(cumPct),
      };
    });

  // Consolidation & Handoff — compliance checklist
  const complianceItems: ComplianceItemVM[] = [
    {
      label: '18-Month PO Coverage',
      icon: coverageMet ? '✓' : '✗',
      detail: `${coveragePct}% of 18-month PO balance covered by received SOAs. Threshold: 70% quarterly / 95% year-end.`,
      pass: coverageMet,
    },
    {
      label: '2-Request Evidence',
      icon: '✓',
      detail: `All ${receivedCount} responding vendors have documented initial request emails on file.`,
      pass: true,
    },
    {
      label: '10–14 Day Gap Compliance',
      icon: '✓',
      detail:
        'All follow-up reminders sent within the 10–14 day SOP window from the initial request date.',
      pass: true,
    },
    {
      label: 'Non-Responder Documentation',
      icon: '✓',
      detail: `${remindedCount + nonResponderCount} non-responding vendors have time-stamped correspondence evidence retained.`,
      pass: true,
    },
  ];
  const allPass = complianceItems.every((c) => c.pass);
  const allPassLabel = allPass ? '✓ All criteria met' : '⚠ Some criteria not met';

  const consolidatedRows = vendors
    .filter((v) => v.status === 'received')
    .map((v, i) => ({ ...v, num: i + 1, fmtOpenPO: fmtM(v.openPO) }));

  // Evidence Repository
  const evidenceEnriched: EvidenceRowVM[] = evidence.map((e) => ({
    ...e,
    typeLabel: EVIDENCE_TYPE_LABEL[e.type] ?? e.type,
  }));

  // Corporate Rollup
  const countriesEnriched: CountryRowVM[] = countries.map((c) => ({
    ...c,
    statusLabel: COUNTRY_STATUS_LABEL[c.status] ?? c.status,
    fmtBalance: fmtM(c.balance),
    isAtRisk:
      c.pct < 70 && c.status !== 'handed_off' && c.daysLeft <= 10 && c.status !== 'not_started',
    coverageStanding: coverageStanding(c.pct),
    isDeadlineTight: c.daysLeft <= 5 && c.status !== 'handed_off',
  }));

  const handedOffCount = countries.filter((c) => c.status === 'handed_off').length;
  const atRiskCount = countriesEnriched.filter((c) => c.isAtRisk).length;
  const avgCoverage =
    countries.length > 0
      ? Math.round(countries.reduce((s, c) => s + c.pct, 0) / countries.length)
      : 0;
  const inProgressCount = countries.filter(
    (c) => !['not_started', 'handed_off'].includes(c.status),
  ).length;
  const corpKpiCards: KpiCardVM[] = [
    {
      label: 'Active Countries',
      value: String(inProgressCount),
      sub: `of ${countries.length} total entities`,
      accent: 'in-flight',
    },
    {
      label: 'Handed Off',
      value: String(handedOffCount),
      sub: 'Delivered to Finance',
      accent: 'on-track',
    },
    {
      label: 'At Risk',
      value: String(atRiskCount),
      sub: 'Coverage < 70%, < 10 days',
      accent: atRiskCount > 0 ? 'breach' : 'neutral',
    },
    {
      label: 'Avg Coverage',
      value: `${avgCoverage}%`,
      sub: 'Across all 12 entities',
      accent: avgCoverage >= 70 ? 'on-track' : 'behind',
    },
  ];

  const modalVendor =
    modal && modal.type === 'upload' ? vendors.find((v) => v.id === modal.vendorId) : undefined;

  return {
    role,
    roleLabel: ROLE_LABEL[role] ?? role,
    roleCountry: scopeLabel(countries, viewer.countries),
    viewerName: viewer.name,
    viewerInitials: initials(viewer.name),
    canSeeRollup,

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

    hasRemindable: requestedCount > 0,
    remindCount: String(requestedCount),
    totalCount,
    receivedCount,
    remindedCount,
    requestedCount,
    onSendReminders: handlers.sendReminders,
    onGoToConsolidation: handlers.goToConsolidation,

    scopingVendors,

    filterTabs,
    vendorsEnriched,

    canSendReminders: requestedCount > 0,

    complianceItems,
    consolidatedRows,
    allPass,
    allPassLabel,
    handedOff,
    canHandoff: coverageMet && !handedOff,
    onGenerateExport: handlers.generateExport,
    onOpenHandoffModal: handlers.openHandoffModal,
    onOpenUploadFlow: handlers.simulateUpload,

    evidenceEnriched,

    countriesEnriched,
    corpKpiCards,
    handedOffCount,
    atRiskCount,
    avgCoverage,
    hasAtRisk: atRiskCount > 0,
    noAtRisk: atRiskCount === 0,

    hasModal: !!modal,
    isUploadModal: modal?.type === 'upload',
    isHandoffModal: modal?.type === 'handoff',
    modalVendorName: modalVendor?.name ?? '',
    modalVendorNo: modalVendor?.no ?? '',
    modalVendorAmt: modalVendor ? fmtM(modalVendor.openPO) : '',
    // Mirrors the source design: a freshly "detected" invoice count shown on the
    // upload-success step, independent of the vendor's stored invCount.
    modalInvCount: String(Math.floor(Math.random() * 6) + 2),
    uploadStep,
    isUploadStep0: uploadStep === 0,
    isUploadStep1: uploadStep === 1,
    isUploadStep2: uploadStep === 2,
    onCloseModal: handlers.closeModal,
    onSimulateUpload: handlers.simulateUpload,
    onAcceptSOA: handlers.acceptSOA,
    onConfirmHandoff: handlers.confirmHandoff,

    toasts,
    hasToasts: toasts.length > 0,
  };
}
