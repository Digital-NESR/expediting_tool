import type { AppState, Country, Evidence, Vendor } from './types';

/** Total 18-month PO balance in scope for the active country (Saudi Arabia, Q3 2026). */
export const TOTAL_BALANCE = 42_500_000;

/** Quarterly SOA coverage threshold per SOP NESR-SC-01-GR2PAY. */
export const COVERAGE_TARGET_PCT = 70;

/** The active country id driving the KSA-scoped screens (Dashboard/Scoping/Outreach/Tracking/Intake/Consolidation). */
export const ACTIVE_COUNTRY_ID = 'SA';

/**
 * This is a frozen-in-time mock: "today" is pinned to 21 Jul 2026 to match the
 * seeded evidence trail. New evidence entries logged during the session reuse
 * this date label with a live time-of-day, mirroring the source prototype.
 */
export const TODAY_LABEL = '21 Jul 2026';

export const COUNTRIES: Country[] = [
  { id: 'AUH', name: 'Abu Dhabi', champion: 'Fatima Al-Mansoori', balance: 28_500_000, pct: 68, status: 'in_progress', responded: 14, total: 20, daysLeft: 8 },
  { id: 'DZ', name: 'Algeria', champion: 'Karim Benali', balance: 12_300_000, pct: 0, status: 'not_started', responded: 0, total: 10, daysLeft: 18 },
  { id: 'HQ', name: 'HQ Dubai', champion: 'Nader Al-Hamed', balance: 8_900_000, pct: 91, status: 'handed_off', responded: 8, total: 9, daysLeft: 0 },
  { id: 'IN', name: 'India', champion: 'Priya Sharma', balance: 15_400_000, pct: 55, status: 'requests_sent', responded: 7, total: 13, daysLeft: 9 },
  { id: 'IQ', name: 'Iraq', champion: 'Ali Al-Jabouri', balance: 28_900_000, pct: 48, status: 'in_progress', responded: 9, total: 20, daysLeft: 7 },
  { id: 'SA', name: 'Saudi Arabia', champion: 'Ahmed Al-Rashidi', balance: 42_500_000, pct: 74, status: 'in_progress', responded: 18, total: 24, daysLeft: 11 },
  { id: 'KW', name: 'Kuwait', champion: 'Mohammed Al-Sabah', balance: 18_700_000, pct: 82, status: 'handed_off', responded: 13, total: 15, daysLeft: 0 },
  { id: 'EG', name: 'Egypt', champion: 'Laila Mostafa', balance: 19_400_000, pct: 44, status: 'requests_sent', responded: 7, total: 16, daysLeft: 9 },
  { id: 'OM', name: 'Oman', champion: 'Nasser Al-Balushi', balance: 15_600_000, pct: 88, status: 'consolidating', responded: 11, total: 12, daysLeft: 2 },
  { id: 'ID', name: 'Indonesia', champion: 'Budi Santoso', balance: 9_200_000, pct: 33, status: 'in_progress', responded: 3, total: 9, daysLeft: 10 },
  { id: 'EOS', name: 'EOS Jafza', champion: 'Sara Hussain', balance: 6_800_000, pct: 77, status: 'consolidating', responded: 5, total: 6, daysLeft: 2 },
  { id: 'LY', name: 'Libya', champion: 'Omar Mansour', balance: 9_800_000, pct: 38, status: 'in_progress', responded: 3, total: 8, daysLeft: 10 },
];

export const VENDORS: Vendor[] = [
  { id: 'V01', name: 'Schlumberger Arabia Ltd.', no: 'SA-001234', openPO: 4_200_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '05 Jul', currency: 'SAR', invCount: 14 },
  { id: 'V02', name: 'Halliburton Energy Services', no: 'SA-002891', openPO: 3_500_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '08 Jul', currency: 'USD', invCount: 11 },
  { id: 'V03', name: 'Baker Hughes INTEQ', no: 'SA-003102', openPO: 2_800_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '06 Jul', currency: 'SAR', invCount: 9 },
  { id: 'V04', name: 'Weatherford Arabia Ltd.', no: 'SA-004567', openPO: 2_500_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '10 Jul', currency: 'SAR', invCount: 8 },
  { id: 'V05', name: 'National Oilwell Varco', no: 'SA-005234', openPO: 2_300_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '07 Jul', currency: 'USD', invCount: 7 },
  { id: 'V06', name: 'Core Laboratories', no: 'SA-006789', openPO: 2_100_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '09 Jul', currency: 'SAR', invCount: 6 },
  { id: 'V07', name: 'Expro Arabia Ltd.', no: 'SA-007432', openPO: 1_900_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '11 Jul', currency: 'USD', invCount: 5 },
  { id: 'V08', name: 'TechnipFMC Arabia', no: 'SA-008901', openPO: 1_700_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '12 Jul', currency: 'SAR', invCount: 6 },
  { id: 'V09', name: 'Wood Group Saudi Arabia', no: 'SA-009123', openPO: 1_500_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '14 Jul', currency: 'SAR', invCount: 4 },
  { id: 'V10', name: 'Al-Khafji Joint Operations', no: 'SA-010456', openPO: 1_350_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '15 Jul', currency: 'SAR', invCount: 5 },
  { id: 'V11', name: 'Petrofac Engineering Ltd.', no: 'SA-011789', openPO: 1_200_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '15 Jul', currency: 'USD', invCount: 4 },
  { id: 'V12', name: 'Gulf Industrial Services', no: 'SA-012234', openPO: 1_100_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '16 Jul', currency: 'SAR', invCount: 3 },
  { id: 'V13', name: 'Arabian Drilling Company', no: 'SA-013567', openPO: 950_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '17 Jul', currency: 'SAR', invCount: 4 },
  { id: 'V14', name: 'Parker Drilling Arabia', no: 'SA-014890', openPO: 850_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '18 Jul', currency: 'USD', invCount: 3 },
  { id: 'V15', name: 'Archrock Arabia LLC', no: 'SA-015123', openPO: 780_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '19 Jul', currency: 'SAR', invCount: 3 },
  { id: 'V16', name: 'Saudi Energy Industries', no: 'SA-016432', openPO: 720_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '20 Jul', currency: 'SAR', invCount: 2 },
  { id: 'V17', name: 'Ras Al-Khair Industrial', no: 'SA-017789', openPO: 640_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '19 Jul', currency: 'SAR', invCount: 2 },
  { id: 'V18', name: 'Al-Gosaibi Services Co.', no: 'SA-018901', openPO: 560_000, status: 'received', reqDate: '01 Jul', remDate: null, respDate: '21 Jul', currency: 'SAR', invCount: 2 },
  { id: 'V19', name: 'Bin Laden Technical Est.', no: 'SA-019234', openPO: 780_000, status: 'requested', reqDate: '15 Jul', remDate: null, respDate: null, currency: 'SAR', invCount: 0 },
  { id: 'V20', name: 'Al-Rashid Industrial', no: 'SA-020567', openPO: 670_000, status: 'requested', reqDate: '15 Jul', remDate: null, respDate: null, currency: 'SAR', invCount: 0 },
  { id: 'V21', name: 'Al-Hamad Trading Est.', no: 'SA-021890', openPO: 580_000, status: 'requested', reqDate: '15 Jul', remDate: null, respDate: null, currency: 'SAR', invCount: 0 },
  { id: 'V22', name: 'Saudi Industrial Corp.', no: 'SA-022123', openPO: 470_000, status: 'requested', reqDate: '15 Jul', remDate: null, respDate: null, currency: 'SAR', invCount: 0 },
  { id: 'V23', name: 'Al-Zamil Industrial Inv.', no: 'SA-023456', openPO: 850_000, status: 'reminded', reqDate: '01 Jul', remDate: '15 Jul', respDate: null, currency: 'SAR', invCount: 0 },
  { id: 'V24', name: 'National Factory Trading', no: 'SA-024789', openPO: 750_000, status: 'reminded', reqDate: '01 Jul', remDate: '15 Jul', respDate: null, currency: 'SAR', invCount: 0 },
];

export const EVIDENCE: Evidence[] = [
  { id: 'E003', ts: '28 Jun 2026, 09:45', type: 'info', action: 'Champion assigned', actor: 'System', detail: 'Ahmed Al-Rashidi assigned as SC SOA Champion for Saudi Arabia (KSA), Q3 2026.' },
  { id: 'E004', ts: '28 Jun 2026, 10:00', type: 'info', action: 'Q3 cycle initiated', actor: 'System', detail: 'Q3 2026 SOA consolidation cycle opened for Saudi Arabia (KSA). Deadline: 31 Jul 2026.' },
  { id: 'E005', ts: '30 Jun 2026, 16:00', type: 'scope', action: 'Vendor scope confirmed', actor: 'Ahmed Al-Rashidi', detail: '18-month PO extract uploaded. 24 vendors above $250,000 threshold. Cumulative balance SAR 42,500,000 confirmed.' },
  { id: 'E006', ts: '01 Jul 2026, 08:32', type: 'email', action: 'Initial requests sent', actor: 'Ahmed Al-Rashidi', detail: 'SOA request emails dispatched to 24 in-scope vendors (KSA, Q3 2026). Secure upload links included. Deadline: 15 Jul 2026.' },
  { id: 'E007', ts: '11 Jul 2026, 14:40', type: 'upload', action: 'SOA received', actor: 'Expro Arabia Ltd.', detail: 'Q3 2026 SOA submitted. 5 invoices, USD 1,900,000.' },
  { id: 'E008', ts: '12 Jul 2026, 10:20', type: 'upload', action: 'SOA received', actor: 'TechnipFMC Arabia', detail: 'Q3 2026 SOA submitted. 6 invoices, SAR 1,700,000.' },
  { id: 'E009', ts: '14 Jul 2026, 16:55', type: 'upload', action: 'SOA received', actor: 'Wood Group Saudi Arabia', detail: 'Q3 2026 SOA submitted. 4 invoices, SAR 1,500,000.' },
  { id: 'E010', ts: '15 Jul 2026, 09:00', type: 'upload', action: 'SOA received', actor: 'Al-Khafji Joint Operations', detail: 'Q3 2026 SOA submitted. 5 invoices, SAR 1,350,000.' },
  { id: 'E011', ts: '15 Jul 2026, 13:17', type: 'reminder', action: 'Reminders auto-sent', actor: 'System', detail: 'Second reminder dispatched to Al-Zamil Industrial Inv. and National Factory Trading (Day 14). Non-response evidence retained.' },
  { id: 'E012', ts: '16 Jul 2026, 14:03', type: 'upload', action: 'SOA received', actor: 'Gulf Industrial Services', detail: 'Q3 2026 SOA submitted. 3 invoices, SAR 1,100,000.' },
  { id: 'E013', ts: '17 Jul 2026, 10:28', type: 'upload', action: 'SOA received', actor: 'Arabian Drilling Company', detail: 'Q3 2026 SOA submitted. 4 invoices, SAR 950,000.' },
  { id: 'E014', ts: '18 Jul 2026, 15:45', type: 'upload', action: 'SOA received', actor: 'Parker Drilling Arabia', detail: 'Q3 2026 SOA submitted. 3 invoices, USD 850,000.' },
  { id: 'E015', ts: '19 Jul 2026, 11:34', type: 'upload', action: 'SOA received', actor: 'Ras Al-Khair Industrial', detail: 'Q3 2026 SOA submitted. 2 invoices, SAR 640,000.' },
  { id: 'E016', ts: '20 Jul 2026, 16:22', type: 'upload', action: 'SOA received', actor: 'Saudi Energy Industries', detail: 'Q3 2026 SOA submitted. 2 invoices, SAR 720,000.' },
  { id: 'E017', ts: '21 Jul 2026, 08:48', type: 'upload', action: 'SOA received', actor: 'Al-Gosaibi Services Co.', detail: 'Q3 2026 SOA submitted via secure link. 2 invoices, SAR 560,000 total outstanding.' },
  { id: 'E018', ts: '21 Jul 2026, 09:05', type: 'info', action: 'Compliance check run', actor: 'Ahmed Al-Rashidi', detail: 'Coverage 74% — meets Q3 70% threshold. 2-request evidence complete for all in-scope vendors.' },
];

export function createInitialState(): AppState {
  return {
    role: 'champion',
    screen: 'dashboard',
    vendors: VENDORS.map((v) => ({ ...v })),
    countries: COUNTRIES.map((c) => ({ ...c })),
    evidence: [...EVIDENCE],
    filterStatus: 'all',
    modal: null,
    toasts: [],
    expandedVendor: null,
    uploadStep: 0,
    handedOff: false,
  };
}
