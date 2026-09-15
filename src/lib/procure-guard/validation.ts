/**
 * ProcureGuard input validation and normalisation.
 *
 * A plain module, deliberately NOT `'use server'`: these are pure(-ish) checks, not endpoints.
 * Every rule here is load-bearing for authorization — in particular validateCurrency, which decides
 * the USD conversion rate and therefore which approval gates a request has to clear.
 */
import { uploadMimeTypeFor } from '@/lib/documents';
import { isToolAdminEmail } from '@/lib/require-access';
import {
  CURRENCY_OPTIONS,
  normalizeProcureGuardCountry,
  normalizeProcureGuardCountryScope,
  PERMISSION_ROLE_OPTIONS,
  roleRequiresProcureGuardCountryScope,
} from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardPermissionRole,
  ProcureGuardStatus,
} from '@/types/procureGuard';
import { isValidEmail, MAX_DELEGATION_WINDOW_DAYS } from './constants';

export function fileBaseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').trim() || 'Attachment';
}

export function detectMime(file: File): string {
  return uploadMimeTypeFor(file.name, file.type);
}

export function normalisePermissionCountryForRole(
  role: ProcureGuardPermissionRole,
  country: string | null | undefined,
): string | null {
  const normalizedCountry = normalizeProcureGuardCountryScope(country);
  if (roleRequiresProcureGuardCountryScope(role) && !normalizedCountry) {
    throw new Error(
      `${role} access must be limited to at least one country. Choose a country scope before saving.`,
    );
  }
  return normalizedCountry;
}

export function normalisePaymentCountry<T extends { country?: string | null }>(row: T): T {
  return { ...row, country: normalizeProcureGuardCountry(row.country) };
}

export function normalisePaymentCountries<T extends { country?: string | null }>(rows: T[]): T[] {
  return rows.map((row) => normalisePaymentCountry(row));
}

export function requireCountryOption(value: string | null | undefined, label = 'Country'): string {
  const country = normalizeProcureGuardCountry(requireText(value, label));
  if (!country) throw new Error(`${label} is required.`);
  return country;
}

// Platform ADMIN_EMAILS merged with PROCURE_GUARD_ADMIN_EMAILS — the same combined list
// `procureGuardAdminEmails()` in lib/procure-guard/actor-scope.ts resolves, now via the one
// shared parser instead of a third hand-rolled copy of it.
export function isProcureGuardAdminEmail(email: string | null | undefined): boolean {
  return isToolAdminEmail(email, process.env.PROCURE_GUARD_ADMIN_EMAILS);
}

// A delegation hands over live approval authority, so its end date is validated rather than passed
// straight to TIMESTAMPTZ: a garbage or past date used to be accepted (and the "granted" email still
// went out). Blank stays "until revoked"; anything else must parse, be in the future and stay inside
// the window below. A date-only value (the picker's format) means the end of that day.
export function validateDelegationExpiry(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid delegation end date.');
  const now = Date.now();
  if (parsed.getTime() <= now) throw new Error('The delegation end date must be in the future.');
  if (parsed.getTime() > now + MAX_DELEGATION_WINDOW_DAYS * 86_400_000) {
    throw new Error(`A delegation can run for at most ${MAX_DELEGATION_WINDOW_DAYS} days.`);
  }
  return parsed.toISOString();
}

export function blankToNull(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value as string | number;
}

export function validateMoney(amount: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be greater than zero.');
  return n;
}

// The currency decides the USD conversion rate, which decides which approvers are required.
// An unknown currency used to fall back to rate 1 (understating the amount and skipping the
// Supply Chain Director / Treasury / Corporate Controller / CFO gates), so reject it outright.
export function validateCurrency(value: unknown): string {
  const currency = (typeof value === 'string' ? value : '').trim().toUpperCase() || 'USD';
  if (!CURRENCY_OPTIONS.includes(currency)) throw new Error('Choose a supported currency.');
  return currency;
}

export function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function validateNonNegativeNumber(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or greater.`);
  return n;
}

export function normalizeRequesterNotificationEmails(
  value: unknown,
  requesterEmail?: string | null,
): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;]+/)
      : [];
  const requester = requesterEmail?.trim().toLowerCase();
  const emails = new Set<string>();

  for (const raw of rawValues) {
    const email = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (!isValidEmail(email)) throw new Error(`Invalid notification email: ${email}`);
    if (email !== requester) emails.add(email);
  }

  return [...emails];
}

export function normalizeEmailTestRecipients(value: unknown): string[] {
  return normalizeRequesterNotificationEmails(value);
}

export function normalizeEmailTestRecipientOverrides(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([role, emails]) => [role.trim(), normalizeEmailTestRecipients(emails)] as const)
      .filter(([role, emails]) => role && emails.length > 0),
  );
}

export function validateEmailTestRouting(
  enabled: boolean | undefined,
  fallbackValue: unknown,
  overrideValue: unknown,
) {
  if (!enabled) return { recipients: [] as string[], overrides: {} as Record<string, string[]> };
  const recipients = normalizeEmailTestRecipients(fallbackValue);
  const overrides = normalizeEmailTestRecipientOverrides(overrideValue);
  const hasRoleRecipients = Object.values(overrides).some((emails) => emails.length > 0);
  if (recipients.length === 0 && !hasRoleRecipients) {
    throw new Error('Email test mode needs at least one fallback or role-specific test recipient.');
  }
  return { recipients, overrides };
}

export function emailTestRecipientOverridesOf(
  request: Pick<AdhocPaymentRequest | AdvancePaymentRequest, 'email_test_recipient_overrides'>,
): Record<string, string[]> {
  return normalizeEmailTestRecipientOverrides(request.email_test_recipient_overrides);
}

export function emailTestRecipientsOf(
  request: Pick<
    AdhocPaymentRequest | AdvancePaymentRequest,
    'email_test_mode' | 'email_test_recipients' | 'email_test_recipient_overrides'
  >,
  fallbackEmail?: string | null,
  roleLabel?: string | null,
) {
  if (!request.email_test_mode) return [];
  const overrides = emailTestRecipientOverridesOf(request);
  const normalizedRole = roleLabel?.trim().toLowerCase();
  const roleEmails = normalizedRole
    ? (Object.entries(overrides).find(([role]) => role.toLowerCase() === normalizedRole)?.[1] ?? [])
    : [];
  const fallbackEmails = Array.isArray(request.email_test_recipients)
    ? request.email_test_recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)
    : [];
  const routedEmails =
    roleEmails.length > 0
      ? roleEmails
      : fallbackEmails.length > 0
        ? fallbackEmails
        : fallbackEmail
          ? [fallbackEmail.trim().toLowerCase()]
          : [];
  return [...new Set(routedEmails)].map((email) => ({
    name: email,
    email,
    role: roleLabel ? `Email test recipient: ${roleLabel}` : 'Email test recipient',
    approval_status: null as ProcureGuardStatus | null,
    country: null as string | null,
    source_column: roleLabel
      ? `email_test_recipient_overrides.${roleLabel}`
      : 'email_test_recipients',
  }));
}

export function normaliseProcureGuardRole(role: unknown): ProcureGuardPermissionRole {
  return PERMISSION_ROLE_OPTIONS.includes(role as ProcureGuardPermissionRole)
    ? (role as ProcureGuardPermissionRole)
    : 'Requester';
}

export function normalisePersonName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
