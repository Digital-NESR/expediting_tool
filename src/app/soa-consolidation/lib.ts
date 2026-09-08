import type { CSSProperties } from 'react';
import { ACTIVE_COUNTRY_ID, TODAY_LABEL, TOTAL_BALANCE } from './data';
import type {
  AppState,
  ComplianceItemVM,
  CountryRowVM,
  CountryStatus,
  EvidenceRowVM,
  FilterTabVM,
  Handlers,
  KpiCardVM,
  NavItemVM,
  PipelineStepVM,
  Role,
  ScreenId,
  ScopingVendorVM,
  StatusBarSegVM,
  ToastVM,
  Vendor,
  VendorEnrichedVM,
  VendorStatus,
  ViewModel,
} from './types';

const GREEN = '#2A7E4F';
const RED = '#B71C1C';
const ORANGE = '#E65100';
const BLUE = '#1565C0';
const GRAY = '#58595B';

export function fmtM(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

/** New evidence/toast entries are timestamped against the frozen demo "today" with a live time-of-day. */
export function newTimestamp(): string {
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${TODAY_LABEL}, ${time}`;
}

const VENDOR_STATUS_STYLE: Record<VendorStatus, { color: string; bg: string; label: string }> = {
  received: { color: GREEN, bg: '#E8F5EE', label: 'Received' },
  requested: { color: BLUE, bg: '#E3F2FD', label: 'Requested' },
  reminded: { color: ORANGE, bg: '#FFF3E0', label: 'Reminded' },
  non_responder: { color: RED, bg: '#FFEBEE', label: 'Non-Responder' },
};

const COUNTRY_STATUS_STYLE: Record<CountryStatus, { color: string; bg: string; label: string }> = {
  not_started: { color: GRAY, bg: '#F5F5F5', label: 'Not Started' },
  in_progress: { color: BLUE, bg: '#E3F2FD', label: 'In Progress' },
  requests_sent: { color: BLUE, bg: '#E1F5FE', label: 'Requests Sent' },
  reminders_sent: { color: ORANGE, bg: '#FFF3E0', label: 'Reminders Sent' },
  consolidating: { color: '#6A1B9A', bg: '#F3E5F5', label: 'Consolidating' },
  handed_off: { color: GREEN, bg: '#E8F5EE', label: 'Handed Off' },
};

const EVIDENCE_TYPE_STYLE: Record<string, { color: string; label: string }> = {
  email: { color: BLUE, label: 'Email' },
  upload: { color: GREEN, label: 'Upload' },
  reminder: { color: ORANGE, label: 'Reminder' },
  scope: { color: '#6A1B9A', label: 'Scoping' },
  info: { color: GRAY, label: 'System' },
  handoff: { color: GREEN, label: 'Handoff' },
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
  champion: 'SC SOA Champion',
  manager: 'Supply Chain Manager',
  director: 'Supply Chain Director',
};

const rowBg = (index: number, alt: string) => (index % 2 === 0 ? 'white' : alt);

export function deriveViewModel(state: AppState, handlers: Handlers): ViewModel {
  const { role, screen, vendors, countries, evidence, filterStatus, modal, toasts, expandedVendor, uploadStep, handedOff } = state;

  const totalCount = vendors.length;
  const receivedCount = vendors.filter((v) => v.status === 'received').length;
  const requestedCount = vendors.filter((v) => v.status === 'requested').length;
  const remindedCount = vendors.filter((v) => v.status === 'reminded').length;
  const nonResponderCount = vendors.filter((v) => v.status === 'non_responder').length;
  const pendingResponseCount = requestedCount + remindedCount;
  const receivedBalance = vendors.filter((v) => v.status === 'received').reduce((s, v) => s + v.openPO, 0);
  const coveragePct = totalCount > 0 ? Math.round((receivedBalance / TOTAL_BALANCE) * 100) : 0;
  const coverageMet = coveragePct >= 70;
  const ksa = countries.find((c) => c.id === ACTIVE_COUNTRY_ID) ?? { status: 'in_progress' as CountryStatus, pct: 74 };

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
    return {
      ...p,
      done,
      active,
      nodeIcon: done ? '✓' : active ? '●' : '○',
      stepStyle: {
        flex: 1,
        padding: '12px 6px',
        textAlign: 'center',
        background: done ? GREEN : active ? BLUE : '#F0F0F0',
        color: p.step <= pStep ? 'white' : '#999',
        borderRight: p.step < 6 ? '1px solid rgba(255,255,255,0.15)' : 'none',
      } as CSSProperties,
    };
  });

  // KPI cards
  const kpiCards: KpiCardVM[] = [
    { label: 'In-Scope Vendors', value: String(totalCount), sub: 'POs last 18 months > $250,000', accent: GREEN },
    { label: 'SOAs Received', value: String(receivedCount), sub: `${totalCount ? Math.round((receivedCount / totalCount) * 100) : 0}% of vendors`, accent: GREEN },
    { label: 'Awaiting Response', value: String(pendingResponseCount), sub: `${requestedCount} requested · ${remindedCount} reminded`, accent: ORANGE },
    { label: '18-Month PO Coverage', value: `${coveragePct}%`, sub: coverageMet ? '✓ Meets 70% threshold' : '⚠ Below 70% target', accent: coverageMet ? GREEN : ORANGE },
    { label: 'Days Remaining', value: '11', sub: 'Until 31 Jul 2026', accent: BLUE },
  ].map((c) => ({
    ...c,
    cardStyle: { background: 'white', borderRadius: 10, padding: '14px 16px', borderTop: `4px solid ${c.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' },
    valueStyle: { fontSize: 30, fontWeight: 'bold', color: c.accent, lineHeight: 1, margin: '4px 0' },
  }));

  const coverageBarStyle: CSSProperties = { background: coverageMet ? GREEN : '#FF8F00', borderRadius: 3, height: '100%', width: `${Math.min(coveragePct, 100)}%`, transition: 'width 0.4s ease' };
  const coverageValueStyle: CSSProperties = { fontSize: 36, fontWeight: 'bold', color: coverageMet ? GREEN : ORANGE, lineHeight: 1, marginBottom: 4 };
  const coverageCheckLabelStyle: CSSProperties = { fontSize: 11, fontWeight: 'bold', color: coverageMet ? GREEN : ORANGE };
  const coverageCheckLabel = `${coverageMet ? '✓ ' : '⚠ '}${coveragePct}% — ${coverageMet ? 'Meets 70% Q3 threshold' : 'Below 70% target'}`;

  // Vendor response status bar + legend
  const statusBarSegs: StatusBarSegVM[] = (
    [
      { color: GREEN, count: receivedCount, label: 'Received' },
      { color: BLUE, count: requestedCount, label: 'Requested' },
      { color: ORANGE, count: remindedCount, label: 'Reminded' },
      { color: RED, count: nonResponderCount, label: 'Non-Responder' },
    ] as { color: string; count: number; label: string }[]
  )
    .filter((s) => s.count > 0)
    .map((s) => ({
      ...s,
      segStyle: { background: s.color, flex: s.count, height: '100%' },
      dotStyle: { width: 10, height: 10, borderRadius: '50%', background: s.color, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' },
    }));

  // Sidebar nav
  const NAV: { id: ScreenId; label: string; badge: string | null }[] = [
    { id: 'dashboard', label: 'Dashboard', badge: null },
    { id: 'scoping', label: 'Vendor Scoping', badge: null },
    { id: 'outreach', label: 'Outreach', badge: requestedCount > 0 ? String(requestedCount) : null },
    { id: 'tracking', label: 'Response Tracking', badge: pendingResponseCount > 0 ? String(pendingResponseCount) : null },
    { id: 'intake', label: 'SOA Intake', badge: null },
    { id: 'consolidation', label: 'Consolidation', badge: null },
    { id: 'evidence', label: 'Evidence Repository', badge: null },
    { id: 'rollup', label: 'Corporate Rollup', badge: null },
  ];
  const navItems: NavItemVM[] = NAV.map((n) => ({
    ...n,
    hasBadge: !!n.badge,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 11px',
      borderRadius: 6,
      marginBottom: 2,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: n.id === screen ? 'bold' : 'normal',
      background: n.id === screen ? 'rgba(42,126,79,0.3)' : 'transparent',
      color: n.id === screen ? 'white' : 'rgba(255,255,255,0.6)',
    },
    onClick: () => handlers.setScreen(n.id),
  }));

  // Filter tabs (Response Tracking)
  const filterTabs: FilterTabVM[] = (
    [
      { label: 'All', status: 'all', count: totalCount, color: null },
      { label: 'Received', status: 'received', count: receivedCount, color: GREEN },
      { label: 'Requested', status: 'requested', count: requestedCount, color: BLUE },
      { label: 'Reminded', status: 'reminded', count: remindedCount, color: ORANGE },
      { label: 'Non-Responder', status: 'non_responder', count: nonResponderCount, color: RED },
    ] as { label: string; status: 'all' | VendorStatus; count: number; color: string | null }[]
  ).map((t) => ({
    ...t,
    tabStyle: {
      padding: '6px 12px',
      borderRadius: 20,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 'bold',
      border: `2px solid ${t.status === filterStatus ? t.color ?? GREEN : 'transparent'}`,
      background: t.status === filterStatus ? `${t.color ?? GREEN}18` : '#F0F0F0',
      color: t.status === filterStatus ? t.color ?? GREEN : GRAY,
      whiteSpace: 'nowrap',
    },
    onClick: () => handlers.setFilterStatus(t.status),
  }));

  const enrichVendorRow = (v: Vendor) => ({
    ...v,
    statusLabel: VENDOR_STATUS_STYLE[v.status]?.label ?? v.status,
    badgeStyle: {
      background: VENDOR_STATUS_STYLE[v.status]?.bg ?? '#F5F5F5',
      color: VENDOR_STATUS_STYLE[v.status]?.color ?? GRAY,
      borderRadius: 12,
      padding: '2px 9px',
      fontSize: 10,
      fontWeight: 'bold',
      display: 'inline-block',
    } as CSSProperties,
    fmtOpenPO: fmtM(v.openPO),
  });

  // Response Tracking — enriched vendor rows
  const vendorsEnriched: VendorEnrichedVM[] = (filterStatus === 'all' ? vendors : vendors.filter((v) => v.status === filterStatus)).map((v) => ({
    ...enrichVendorRow(v),
    rowBg: v.id === expandedVendor ? '#F0F9F4' : 'white',
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
        cumStyle: { fontWeight: 'bold', color: cumPct >= 70 ? GREEN : cumPct >= 50 ? ORANGE : RED } as CSSProperties,
        rowBg: rowBg(i, '#F8FBF9'),
      };
    });

  // Consolidation & Handoff — compliance checklist
  const complianceItems: ComplianceItemVM[] = (
    [
      {
        label: '18-Month PO Coverage',
        icon: coverageMet ? '✓' : '✗',
        detail: `${coveragePct}% of 18-month PO balance covered by received SOAs. Threshold: 70% quarterly / 95% year-end.`,
        pass: coverageMet,
        borderColor: coverageMet ? GREEN : RED,
        iconBg: coverageMet ? GREEN : RED,
      },
      {
        label: '2-Request Evidence',
        icon: '✓',
        detail: `All ${receivedCount} responding vendors have documented initial request emails on file.`,
        pass: true,
        borderColor: GREEN,
        iconBg: GREEN,
      },
      {
        label: '10–14 Day Gap Compliance',
        icon: '✓',
        detail: 'All follow-up reminders sent within the 10–14 day SOP window from the initial request date.',
        pass: true,
        borderColor: GREEN,
        iconBg: GREEN,
      },
      {
        label: 'Non-Responder Documentation',
        icon: '✓',
        detail: `${remindedCount + nonResponderCount} non-responding vendors have time-stamped correspondence evidence retained.`,
        pass: true,
        borderColor: GREEN,
        iconBg: GREEN,
      },
    ] as Omit<ComplianceItemVM, 'rowStyle' | 'iconStyle'>[]
  ).map((c) => ({
    ...c,
    rowStyle: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 15px', background: 'white', borderRadius: 8, marginBottom: 8, borderLeft: `4px solid ${c.borderColor}` },
    iconStyle: { width: 26, height: 26, borderRadius: '50%', background: c.iconBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0, fontSize: 13, marginTop: 1 },
  }));
  const allPass = complianceItems.every((c) => c.pass);
  const allPassLabel = allPass ? '✓ All criteria met' : '⚠ Some criteria not met';
  const allPassStyle: CSSProperties = { fontSize: 12, fontWeight: 'bold', color: allPass ? GREEN : ORANGE, background: allPass ? '#E8F5EE' : '#FFF3E0', border: `1px solid ${allPass ? GREEN : ORANGE}`, borderRadius: 6, padding: '4px 12px' };

  const consolidatedRows = vendors
    .filter((v) => v.status === 'received')
    .map((v, i) => ({ ...v, num: i + 1, fmtOpenPO: fmtM(v.openPO), rowBg: rowBg(i, '#F0F7F3') }));

  // Evidence Repository
  const evidenceEnriched: EvidenceRowVM[] = evidence.map((e) => ({
    ...e,
    typeColor: EVIDENCE_TYPE_STYLE[e.type]?.color ?? GRAY,
    typeLabel: EVIDENCE_TYPE_STYLE[e.type]?.label ?? e.type,
    badgeStyle: { background: EVIDENCE_TYPE_STYLE[e.type]?.color ?? GRAY, color: 'white', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 'bold', display: 'inline-block' },
    dotStyle: { width: 10, height: 10, borderRadius: '50%', background: EVIDENCE_TYPE_STYLE[e.type]?.color ?? GRAY, flexShrink: 0, marginTop: 6 },
  }));

  // Corporate Rollup
  const countriesEnriched: CountryRowVM[] = countries.map((c, i) => {
    const isAtRisk = c.pct < 70 && c.status !== 'handed_off' && c.daysLeft <= 10 && c.status !== 'not_started';
    return {
      ...c,
      statusLabel: COUNTRY_STATUS_STYLE[c.status]?.label ?? c.status,
      fmtBalance: fmtM(c.balance),
      isAtRisk,
      badgeStyle: { background: COUNTRY_STATUS_STYLE[c.status]?.bg ?? '#F5F5F5', color: COUNTRY_STATUS_STYLE[c.status]?.color ?? GRAY, borderRadius: 12, padding: '2px 9px', fontSize: 10, fontWeight: 'bold' },
      pctBarStyle: { background: c.pct >= 70 ? GREEN : c.pct >= 50 ? ORANGE : RED, height: '100%', width: `${Math.min(c.pct, 100)}%`, borderRadius: 2 },
      rowStyle: {
        display: 'grid',
        gridTemplateColumns: '140px 130px 85px 110px 115px 70px 65px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: isAtRisk ? '#FFF8F5' : rowBg(i, '#F9FBF9'),
        borderBottom: '1px solid #F0F0F0',
        borderLeft: isAtRisk ? '3px solid #E65100' : '3px solid transparent',
      },
      daysStyle: { fontSize: 11, fontWeight: 'bold', color: c.daysLeft <= 5 && c.status !== 'handed_off' ? RED : GRAY },
    };
  });

  const handedOffCount = countries.filter((c) => c.status === 'handed_off').length;
  const atRiskCount = countriesEnriched.filter((c) => c.isAtRisk).length;
  const avgCoverage = countries.length > 0 ? Math.round(countries.reduce((s, c) => s + c.pct, 0) / countries.length) : 0;
  const inProgressCount = countries.filter((c) => !['not_started', 'handed_off'].includes(c.status)).length;
  const corpKpiCards: KpiCardVM[] = [
    { label: 'Active Countries', value: String(inProgressCount), sub: `of ${countries.length} total entities`, accent: BLUE },
    { label: 'Handed Off', value: String(handedOffCount), sub: 'Delivered to Finance', accent: GREEN },
    { label: 'At Risk', value: String(atRiskCount), sub: 'Coverage < 70%, < 10 days', accent: atRiskCount > 0 ? RED : GRAY },
    { label: 'Avg Coverage', value: `${avgCoverage}%`, sub: 'Across all 12 entities', accent: avgCoverage >= 70 ? GREEN : ORANGE },
  ].map((c) => ({
    ...c,
    cardStyle: { background: 'white', borderRadius: 10, padding: '14px 16px', borderTop: `4px solid ${c.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' },
    valueStyle: { fontSize: 28, fontWeight: 'bold', color: c.accent, lineHeight: 1, margin: '4px 0' },
  }));

  const modalVendor = modal && modal.type === 'upload' ? vendors.find((v) => v.id === modal.vendorId) : undefined;

  const toastsEnriched: ToastVM[] = toasts.map((t) => ({
    ...t,
    toastStyle: {
      background: t.type === 'success' ? GREEN : t.type === 'warning' ? '#E65100' : '#333',
      color: 'white',
      borderRadius: 8,
      padding: '12px 16px',
      minWidth: 240,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.2s ease',
    },
  }));

  return {
    role,
    roleLabel: ROLE_LABEL[role] ?? role,
    roleCountry: role === 'director' ? 'All Countries (12)' : 'Saudi Arabia (KSA)',
    onRoleChange: handlers.switchRole,

    showDashboard: screen === 'dashboard',
    showScoping: screen === 'scoping',
    showOutreach: screen === 'outreach',
    showTracking: screen === 'tracking',
    showIntake: screen === 'intake',
    showConsolidation: screen === 'consolidation',
    showEvidence: screen === 'evidence',
    showRollup: screen === 'rollup',

    navItems,
    kpiCards,
    pipeline,
    statusBarSegs,

    coverageBarStyle,
    coverageValueStyle,
    coverageCheckLabelStyle,
    coverageCheckLabel,
    coveragePct: String(coveragePct),
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
    allPassLabel,
    allPassStyle,
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
    atRiskAlertStyle: {
      background: atRiskCount > 0 ? '#FFF3E0' : '#E8F5EE',
      border: `1px solid ${atRiskCount > 0 ? '#E65100' : GREEN}`,
      borderRadius: 8,
      padding: '8px 14px',
      fontSize: 12,
      fontWeight: 'bold',
      color: atRiskCount > 0 ? '#E65100' : GREEN,
      maxWidth: 360,
    },

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

    toasts: toastsEnriched,
    hasToasts: toasts.length > 0,
  };
}
