// Pure helpers for the NESR Catalog Repo: master-data seeds, money/date formatting,
// USD conversion, approval-tier logic, status styling, and role permissions.
// No DB or React here — safe to import from both server actions and client components.

import type { CatalogRole, CatalogStatus, SpendType } from '@/types/catalog-manager';
import { shortDate } from '@/lib/format';

/* ---------------- seed master data (NESR operating countries + currencies) ---------------- */

export interface SeedCountry {
  code: string;
  name: string;
  ccy: string;
  flag: string;
}
// Countries mirror ProcureGuard's COUNTRY_OPTIONS (names) — the catalog stays code-based,
// so each keeps a 2-letter code; the original 8 codes are preserved so existing entries stay valid.
export const SEED_COUNTRIES: SeedCountry[] = [
  { code: 'DZ', name: 'Algeria', ccy: 'USD', flag: '🇩🇿' },
  { code: 'BH', name: 'Bahrain', ccy: 'BHD', flag: '🇧🇭' },
  { code: 'TD', name: 'Chad', ccy: 'USD', flag: '🇹🇩' },
  { code: 'EG', name: 'Egypt', ccy: 'USD', flag: '🇪🇬' },
  { code: 'EO', name: 'EOS', ccy: 'USD', flag: '🌐' },
  { code: 'HQ', name: 'HQ Dubai', ccy: 'AED', flag: '🇦🇪' },
  { code: 'IN', name: 'India', ccy: 'USD', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', ccy: 'USD', flag: '🇮🇩' },
  { code: 'IQ', name: 'Iraq', ccy: 'USD', flag: '🇮🇶' },
  { code: 'JO', name: 'Jordan', ccy: 'USD', flag: '🇯🇴' },
  { code: 'KW', name: 'Kuwait', ccy: 'KWD', flag: '🇰🇼' },
  { code: 'LY', name: 'Libya', ccy: 'USD', flag: '🇱🇾' },
  { code: 'MY', name: 'Malaysia', ccy: 'USD', flag: '🇲🇾' },
  { code: 'OM', name: 'Oman', ccy: 'OMR', flag: '🇴🇲' },
  { code: 'QA', name: 'Qatar', ccy: 'QAR', flag: '🇶🇦' },
  { code: 'SA', name: 'Saudi Arabia (KSA)', ccy: 'SAR', flag: '🇸🇦' },
  { code: 'AE', name: 'United Arab Emirates (UAE)', ccy: 'AED', flag: '🇦🇪' },
  { code: 'CG', name: 'Congo', ccy: 'USD', flag: '🇨🇬' },
  { code: 'YE', name: 'Yemen', ccy: 'USD', flag: '🇾🇪' },
  { code: 'OT', name: 'Other', ccy: 'USD', flag: '🏳️' },
];

export interface SeedCurrency {
  code: string;
  decimals: number;
  usd_rate: number; // 1 unit of ccy = usd_rate USD
}
// Currencies span the ProcureGuard set + every operating country's local currency + majors.
// usd_rate = approximate value of 1 unit in USD (used only to estimate the approval tier;
// editable later — exact FX isn't required for the threshold check).
export const SEED_CURRENCIES: SeedCurrency[] = [
  { code: 'USD', decimals: 2, usd_rate: 1.0 },
  { code: 'AED', decimals: 2, usd_rate: 1 / 3.6725 },
  { code: 'SAR', decimals: 2, usd_rate: 1 / 3.75 },
  { code: 'QAR', decimals: 2, usd_rate: 1 / 3.64 },
  { code: 'KWD', decimals: 3, usd_rate: 3.25 },
  { code: 'OMR', decimals: 3, usd_rate: 2.6 },
  { code: 'BHD', decimals: 3, usd_rate: 2.65 },
  { code: 'EGP', decimals: 2, usd_rate: 0.02 },
  { code: 'DZD', decimals: 2, usd_rate: 0.0074 },
  { code: 'IQD', decimals: 3, usd_rate: 0.00076 },
  { code: 'JOD', decimals: 3, usd_rate: 1.41 },
  { code: 'LYD', decimals: 3, usd_rate: 0.205 },
  { code: 'YER', decimals: 2, usd_rate: 0.004 },
  { code: 'INR', decimals: 2, usd_rate: 0.012 },
  { code: 'IDR', decimals: 0, usd_rate: 0.000062 },
  { code: 'MYR', decimals: 2, usd_rate: 0.22 },
  { code: 'XAF', decimals: 0, usd_rate: 0.0017 },
  { code: 'EUR', decimals: 2, usd_rate: 1.08 },
  { code: 'GBP', decimals: 2, usd_rate: 1.27 },
];

export const SEED_UOMS = [
  'Hour',
  'Day',
  'Per Well',
  'Per Job',
  'Per Stage',
  'Lump Sum',
  'MT',
  'Per BBL',
  'Per Foot',
  'Month',
  'Each',
  'km',
  'Per Person',
  'Per Trip',
];

export const PROOF_TYPES = [
  'Signed Rate Agreement',
  'Supplier Quotation',
  'Master Service Agreement',
];

/** Incoterms 2020 — code + label. Used in the entry forms, bulk-import template dropdown, and detail view. */
export const INCOTERMS: { code: string; label: string }[] = [
  { code: 'EXW', label: 'EXW — Ex Works' },
  { code: 'FCA', label: 'FCA — Free Carrier' },
  { code: 'FAS', label: 'FAS — Free Alongside Ship' },
  { code: 'FOB', label: 'FOB — Free On Board' },
  { code: 'CFR', label: 'CFR — Cost and Freight' },
  { code: 'CIF', label: 'CIF — Cost, Insurance and Freight' },
  { code: 'CPT', label: 'CPT — Carriage Paid To' },
  { code: 'CIP', label: 'CIP — Carriage and Insurance Paid To' },
  { code: 'DAP', label: 'DAP — Delivered At Place' },
  { code: 'DPU', label: 'DPU — Delivered At Place Unloaded' },
  { code: 'DDP', label: 'DDP — Delivered Duty Paid' },
];
export const INCOTERM_CODES: string[] = INCOTERMS.map((i) => i.code);

/* ---------------- import failsafes (shared by the template + the importer) ---------------- */

/** Max character lengths for free-text import fields — enforced in the template and the importer. */
export const FIELD_MAX = {
  supplier: 100,
  supplier_code: 40,
  commodity: 120,
  description: 250,
  manager: 80,
  sirion_contract_id: 40,
  incoterms_location: 70,
  notes: 1000,
} as const;

/** Sanity bounds for numeric import fields. */
export const LEAD_TIME_MAX_DAYS = 3650; // ~10 years
export const UNIT_PRICE_MAX = 1_000_000_000; // 1bn — catches stray digits/typos
export const DATE_MIN = '2000-01-01';
export const DATE_MAX = '2100-12-31';

/**
 * True if a string would be interpreted as a formula when opened in Excel/Sheets
 * (CSV/formula-injection guard). Values like "=cmd", "+1", "-2", "@x" are risky.
 */
export function looksLikeFormula(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value);
}

/** Trim a text value, drop control characters, collapse whitespace. Returns null if empty. */
export function sanitizeImportText(value: string | null | undefined): string | null {
  const cleaned = (value ?? '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('');
  const t = cleaned.replace(/ +/g, ' ').trim();
  return t === '' ? null : t;
}

/** Neutralise a value for CSV/Excel export so it can never execute as a formula. */
export function csvSafe(value: unknown): string {
  const str = value == null ? '' : String(value);
  return looksLikeFormula(str) ? "'" + str : str;
}

/** Excel's day 0 is 1899-12-30 (its 1900 leap-year bug shifts every serial from 61 up by one). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
/** Serial range that lands inside DATE_MIN..DATE_MAX — safely clear of Excel's 1900 leap bug (<= 60). */
const EXCEL_SERIAL_MIN = Math.round((Date.UTC(2000, 0, 1) - EXCEL_EPOCH_UTC) / 86400000); // 36526
const EXCEL_SERIAL_MAX = Math.round((Date.UTC(2100, 11, 31) - EXCEL_EPOCH_UTC) / 86400000); // 73415

/** Build 'YYYY-MM-DD' from calendar parts, rejecting anything that is not a real date. */
function utcYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  // Date.UTC rolls 2026-02-30 forward to 2026-03-02; a round-trip check rejects that.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  // The year is zero-padded too, so the DATE_MIN/DATE_MAX string comparison below stays a real
  // date comparison — an unpadded "202-01-01" would sort between them and slip through.
  const ymd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return ymd >= DATE_MIN && ymd <= DATE_MAX ? ymd : null;
}

/**
 * Normalise an imported date cell to 'YYYY-MM-DD', or null when it is not one of the
 * formats the import template advertises.
 *
 * ACCEPTED — and nothing else:
 *   - `YYYY-MM-DD` (what `readSpreadsheet` emits for a real date cell, from UTC parts),
 *     optionally followed by a time part, which is discarded
 *   - `DD-MM-YYYY` and `DD/MM/YYYY` (the template's documented format), 1-2 digit day/month
 *   - an Excel serial number, for a date cell that arrives as a raw number
 *
 * REJECTED: free-form strings ("5 Jan 2026", "Jan 5, 2026", "2026/1/5"). `new Date(text)`
 * used to accept those, but it reads an ambiguous "03/04/2026" as MARCH 4th (US order) while
 * the template promises 3 April, and it parses in the SERVER's timezone before the result was
 * converted back through toISOString() — shifting the stored day by one either side of midnight.
 * Everything here is built with Date.UTC, so no timezone can move the day.
 *
 * Out-of-range values are rejected too: the template's data validation only allows
 * DATE_MIN..DATE_MAX, but the server never enforced it, so a typo'd year sailed through.
 */
export function normalizeImportDate(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || looksLikeFormula(text)) return null;

  // ISO, the canonical form — an optional time part is dropped, not parsed.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (iso) return utcYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Day-first, with a consistent separator: DD-MM-YYYY or DD/MM/YYYY.
  const dayFirst = text.match(/^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/);
  if (dayFirst) return utcYmd(Number(dayFirst[4]), Number(dayFirst[3]), Number(dayFirst[1]));

  // Excel serial (whole days since 1899-12-30), only within the accepted date range.
  if (/^\d+$/.test(text)) {
    const serial = Number(text);
    if (serial >= EXCEL_SERIAL_MIN && serial <= EXCEL_SERIAL_MAX) {
      const d = new Date(EXCEL_EPOCH_UTC + serial * 86400000);
      return utcYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }

  return null;
}

/** The accepted date formats, for user-facing error messages. */
export const IMPORT_DATE_FORMATS_HINT = `use YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY, between ${DATE_MIN} and ${DATE_MAX}`;

export const ALL_STATUSES: CatalogStatus[] = [
  'Active',
  'Pending Approval',
  'Draft',
  'Expired',
  'Rejected',
];
export const ALL_ROLES: CatalogRole[] = ['Viewer', 'Contributor', 'Approver', 'Admin'];

/** Annualized USD-equivalent threshold above which an entry needs Approver sign-off. */
export const APPROVAL_THRESHOLD_USD = 50000;

/* ---------------- money / date / usd ---------------- */

/**
 * Currency code → USD value of one unit, as loaded from the `currency` table
 * (the rows the admin screen shows and an admin can change). The seed list above
 * only ever populates that table on a cold start; it is NOT the live rate source,
 * because conversion drives the approval tier and must follow the edited rate.
 */
export type UsdRates = Readonly<Record<string, number>>;

/** Build a rates map from `currency` rows (or the seed list). Keys are uppercased. */
export function usdRatesFrom(rows: { code: string; usd_rate: number | string }[]): UsdRates {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const rate = Number(r.usd_rate);
    if (Number.isFinite(rate) && rate > 0) out[String(r.code).trim().toUpperCase()] = rate;
  }
  return out;
}

/** The configured rate for a currency, or null when it has none. */
export function usdRateFor(ccy: string, rates: UsdRates): number | null {
  const rate =
    rates[
      String(ccy ?? '')
        .trim()
        .toUpperCase()
    ];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Convert to USD at the configured rate.
 *
 * THROWS for a currency with no rate. This used to fall back to a magic 0.27, which
 * silently produced a plausible-looking USD figure for a code nobody had configured —
 * and that figure decided whether the entry needed Approver sign-off. A refusal is the
 * only safe answer: a wrong tier is invisible, a thrown error is not.
 */
export function toUsd(price: number, ccy: string, rates: UsdRates): number {
  const rate = usdRateFor(ccy, rates);
  if (rate === null) {
    throw new Error(
      `No USD rate is configured for currency "${ccy}". Add it to the currency master data before using it.`,
    );
  }
  return price * rate;
}

const DECIMALS_BY_CCY: Record<string, number> = Object.fromEntries(
  SEED_CURRENCIES.map((c) => [c.code, c.decimals]),
);

/** Display precision for a currency — a formatting default, never a conversion rate. */
export function currencyDecimals(code: string): number {
  return (
    DECIMALS_BY_CCY[
      String(code ?? '')
        .trim()
        .toUpperCase()
    ] ?? 2
  );
}

export function fmtMoney(price: number, ccy: string): string {
  const decimals = currencyDecimals(ccy);
  return Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtUsd(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtDateNice(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return shortDate(d);
}

export function daysUntil(dateStr: string | null, today: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  // Build the baseline from LOCAL date parts. toISOString() converts to UTC and
  // rolls the date back a day for any positive-UTC-offset zone — including every
  // NESR Gulf office — while the target above is parsed as local midnight. Mixing
  // the two made every countdown one day long between 00:00 and 04:00 local.
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - base.getTime()) / 86400000);
}

export function isExpiringSoon(
  status: CatalogStatus,
  expiry: string | null,
  today: Date = new Date(),
): boolean {
  const d = daysUntil(expiry, today);
  return status === 'Active' && d !== null && d >= 0 && d <= 30;
}

/* ---------------- approval tier ---------------- */

/**
 * The two tier labels, as one definition. `catalog_entry.tier_label` stores this text, and the UI
 * used to work out the tier by asking whether the stored label contained the substring "Tier 2" —
 * so renaming the label (to "Tier II", say, or to something with the word Approver in it) silently
 * reclassified every entry on screen. Read the tier through `isApproverTier` instead; both the
 * writer and the readers then move together when the wording changes.
 */
export const TIER_1_LABEL = 'Tier 1 — Auto';
export const TIER_2_LABEL = 'Tier 2 — Approver';

export function approvalTier(
  usdEquivalent: number,
  thresholdUsd: number = APPROVAL_THRESHOLD_USD,
): { needsApproval: boolean; label: string } {
  const needsApproval = usdEquivalent >= thresholdUsd;
  return { needsApproval, label: needsApproval ? TIER_2_LABEL : TIER_1_LABEL };
}

/** Does a stored `tier_label` mean "this needed an approver"? */
export function isApproverTier(tierLabel: string | null | undefined): boolean {
  return (tierLabel ?? '').trim() === TIER_2_LABEL;
}

/** A configurable approval-threshold rule (null country/category = "any"). */
export interface ThresholdRule {
  country_code: string | null;
  spend_category_id: number | null;
  threshold_usd: number;
}

/** Resolve the most specific threshold for a country + category from the rule set. */
export function effectiveThresholdUsd(
  rules: ThresholdRule[],
  countryCode: string | null,
  categoryId: number | null,
  fallback: number = APPROVAL_THRESHOLD_USD,
): number {
  const score = (r: ThresholdRule): number => {
    let s = 0;
    if (r.country_code) s += 2;
    if (r.spend_category_id != null) s += 1;
    return s;
  };
  let best: ThresholdRule | null = null;
  for (const r of rules) {
    const countryOk = r.country_code == null || r.country_code === countryCode;
    const catOk = r.spend_category_id == null || r.spend_category_id === categoryId;
    if (countryOk && catOk && (best == null || score(r) > score(best))) best = r;
  }
  return best ? Number(best.threshold_usd) : fallback;
}

/* ---------------- status styling (Tailwind classes, readable on white) ---------------- */

export function getStatusBadge(status: CatalogStatus): { dot: string; pill: string } {
  switch (status) {
    case 'Active':
      return { dot: 'bg-[#307c4c]', pill: 'bg-[#307c4c]/10 text-[#1d4f31]' };
    case 'Pending Approval':
      return { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' };
    case 'Draft':
      return { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' };
    case 'Expired':
      return { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-500' };
    case 'Rejected':
      return { dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' };
    default:
      return { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' };
  }
}

/* ---------------- permissions ---------------- */

export interface PermissionProfile {
  role: CatalogRole;
  description: string;
  canCreate: boolean;
  canApprove: boolean;
  canAdmin: boolean;
}

export const PERMISSION_PROFILES: Record<CatalogRole, PermissionProfile> = {
  Viewer: {
    role: 'Viewer',
    description: 'Internal Auditor / Finance — read-only',
    canCreate: false,
    canApprove: false,
    canAdmin: false,
  },
  Contributor: {
    role: 'Contributor',
    description: 'Procurement Officer',
    canCreate: true,
    canApprove: false,
    canAdmin: false,
  },
  Approver: {
    role: 'Approver',
    description: 'Country / SCM Manager',
    canCreate: true,
    canApprove: true,
    canAdmin: false,
  },
  Admin: {
    role: 'Admin',
    description: 'System Administrator',
    canCreate: true,
    canApprove: true,
    canAdmin: true,
  },
};

export function getPermissionProfile(role: CatalogRole): PermissionProfile {
  return PERMISSION_PROFILES[role] ?? PERMISSION_PROFILES.Viewer;
}

/** The spend-type classifications, in display order. */
export const SPEND_TYPE_OPTIONS: SpendType[] = ['Direct', 'Indirect'];

/** Chip tone for a spend type (used on chips/pills). */
export function spendTypeTone(type: string | null): 'green' | 'amber' | 'neutral' {
  if (type === 'Direct') return 'green';
  if (type === 'Indirect') return 'amber';
  return 'neutral';
}

/** Build a Sirion CLM contract URL from a contract id like "SIR-CN-204815". */
export function sirionUrlFor(id: string | null): string | null {
  if (!id) return null;
  const m = String(id).match(/(\d{4,})/);
  return m ? `https://nesr.sirion.ai/contracts/${m[1]}` : null;
}
