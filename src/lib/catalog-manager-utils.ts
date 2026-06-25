// Pure helpers for the NESR Catalog Manager: master-data seeds, money/date formatting,
// USD conversion, approval-tier logic, status styling, and role permissions.
// No DB or React here — safe to import from both server actions and client components.

import type { CatalogRole, CatalogStatus, SpendType } from '@/types/catalog-manager';

/* ---------------- seed master data (NESR operating countries + currencies) ---------------- */

export interface SeedCountry {
  code: string;
  name: string;
  ccy: string;
  flag: string;
}
export const SEED_COUNTRIES: SeedCountry[] = [
  { code: 'SA', name: 'Saudi Arabia', ccy: 'SAR', flag: '🇸🇦' },
  { code: 'AE', name: 'United Arab Emirates', ccy: 'AED', flag: '🇦🇪' },
  { code: 'KW', name: 'Kuwait', ccy: 'KWD', flag: '🇰🇼' },
  { code: 'OM', name: 'Oman', ccy: 'OMR', flag: '🇴🇲' },
  { code: 'QA', name: 'Qatar', ccy: 'QAR', flag: '🇶🇦' },
  { code: 'IQ', name: 'Iraq', ccy: 'USD', flag: '🇮🇶' },
  { code: 'DZ', name: 'Algeria', ccy: 'DZD', flag: '🇩🇿' },
  { code: 'EG', name: 'Egypt', ccy: 'EGP', flag: '🇪🇬' },
];

export interface SeedCurrency {
  code: string;
  decimals: number;
  usd_rate: number; // 1 unit of ccy = usd_rate USD
}
export const SEED_CURRENCIES: SeedCurrency[] = [
  { code: 'SAR', decimals: 2, usd_rate: 0.27 },
  { code: 'AED', decimals: 2, usd_rate: 0.27 },
  { code: 'KWD', decimals: 3, usd_rate: 3.25 },
  { code: 'OMR', decimals: 3, usd_rate: 2.6 },
  { code: 'QAR', decimals: 2, usd_rate: 0.27 },
  { code: 'USD', decimals: 2, usd_rate: 1.0 },
  { code: 'DZD', decimals: 2, usd_rate: 0.0074 },
  { code: 'EGP', decimals: 2, usd_rate: 0.021 },
];

export const SEED_UOMS = [
  'Hour', 'Day', 'Per Well', 'Per Job', 'Per Stage', 'Lump Sum', 'MT',
  'Per BBL', 'Per Foot', 'Month', 'Each', 'km', 'Per Person', 'Per Trip',
];

export const PROOF_TYPES = ['Signed Rate Agreement', 'Supplier Quotation', 'Master Service Agreement'];

export const ALL_STATUSES: CatalogStatus[] = ['Active', 'Pending Approval', 'Draft', 'Expired', 'Rejected'];
export const ALL_ROLES: CatalogRole[] = ['Viewer', 'Contributor', 'Approver', 'Admin'];

/** Annualized USD-equivalent threshold above which an entry needs Approver sign-off. */
export const APPROVAL_THRESHOLD_USD = 50000;

/* ---------------- money / date / usd ---------------- */

const RATE_BY_CCY: Record<string, SeedCurrency> = Object.fromEntries(SEED_CURRENCIES.map((c) => [c.code, c]));

export function currencyConfig(code: string): SeedCurrency {
  return RATE_BY_CCY[code] ?? { code, decimals: 2, usd_rate: 0.27 };
}

export function toUsd(price: number, ccy: string): number {
  return price * currencyConfig(ccy).usd_rate;
}

export function fmtMoney(price: number, ccy: string): string {
  const cfg = currencyConfig(ccy);
  return Number(price).toLocaleString('en-US', {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  });
}

export function fmtUsd(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtDateNice(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysUntil(dateStr: string | null, today: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const base = new Date(`${today.toISOString().slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - base.getTime()) / 86400000);
}

export function isExpiringSoon(status: CatalogStatus, expiry: string | null, today: Date = new Date()): boolean {
  const d = daysUntil(expiry, today);
  return status === 'Active' && d !== null && d >= 0 && d <= 30;
}

/* ---------------- approval tier ---------------- */

export function approvalTier(usdEquivalent: number, thresholdUsd: number = APPROVAL_THRESHOLD_USD): { needsApproval: boolean; label: string } {
  const needsApproval = usdEquivalent >= thresholdUsd;
  return { needsApproval, label: needsApproval ? 'Tier 2 — Approver' : 'Tier 1 — Auto' };
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
  Viewer: { role: 'Viewer', description: 'Internal Auditor / Finance — read-only', canCreate: false, canApprove: false, canAdmin: false },
  Contributor: { role: 'Contributor', description: 'Procurement Officer', canCreate: true, canApprove: false, canAdmin: false },
  Approver: { role: 'Approver', description: 'Country / SCM Manager', canCreate: true, canApprove: true, canAdmin: false },
  Admin: { role: 'Admin', description: 'System Administrator', canCreate: true, canApprove: true, canAdmin: true },
};

export function getPermissionProfile(role: CatalogRole): PermissionProfile {
  return PERMISSION_PROFILES[role] ?? PERMISSION_PROFILES.Viewer;
}

/** The three spend-type classifications, in display order. */
export const SPEND_TYPE_OPTIONS: SpendType[] = ['Materials & Assets', 'Consumables', 'Services'];

/** Chip tone for a spend type (used on chips/pills). */
export function spendTypeTone(type: string | null): 'green' | 'amber' | 'neutral' {
  if (type === 'Materials & Assets') return 'green';
  if (type === 'Consumables') return 'amber';
  return 'neutral'; // Services
}

/** Build a Sirion CLM contract URL from a contract id like "SIR-CN-204815". */
export function sirionUrlFor(id: string | null): string | null {
  if (!id) return null;
  const m = String(id).match(/(\d{4,})/);
  return m ? `https://nesr.sirion.ai/contracts/${m[1]}` : null;
}
