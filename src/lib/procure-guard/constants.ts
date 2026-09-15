/**
 * ProcureGuard constants and the shared refusal error.
 *
 * A plain module, deliberately NOT `'use server'`: none of this is an endpoint, and keeping it out
 * of the action files is what stops a constant from accidentally becoming a public POST target.
 */
import {
  ADHOC_STATUS_OPTIONS,
  ADVANCE_STATUS_OPTIONS,
  APPROVAL_ACTIVE_STATUSES,
} from '@/lib/procureGuard-utils';
import type { ProcureGuardStatus } from '@/types/procureGuard';

/**
 * One shape check for every address ProcureGuard accepts — notification lists, delegates, request
 * viewers, notification recipients and approver-matrix rows. It was eight identical inline copies
 * of the same literal, so any tightening of it reached only whichever call sites were remembered.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/**
 * A deliberate refusal: the actor is signed in but may not see this thing.
 * Distinct from a failure — callers turn this into "not found" / an empty view,
 * while anything else means the request could not be answered at all and must
 * surface as an error rather than as a 404 that claims the row does not exist.
 */
export class ProcureGuardAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcureGuardAccessError';
  }
}

/** The still-in-flight statuses of each request type, derived rather than retyped in SQL. */
export const adhocActiveStatuses = APPROVAL_ACTIVE_STATUSES.filter((status) =>
  ADHOC_STATUS_OPTIONS.includes(status),
);
export const advanceActiveStatuses = APPROVAL_ACTIVE_STATUSES.filter((status) =>
  ADVANCE_STATUS_OPTIONS.includes(status),
);

export const STATUS_SORT_ORDER: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by SCM',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
  'Approved',
  'Rejected',
  'Cancelled',
];
export const PRIORITY_SORT_ORDER = ['Critical', 'High', 'Normal', 'Low'];
export const MEANINGFUL_ACTIVITY_WHERE = "request_id > 0 AND action NOT ILIKE '%seeded%'";

export const MAX_PROCURE_GUARD_FILE_BYTES = 10 * 1024 * 1024;
// document_type lands in a column the detail page groups on, so it is a closed vocabulary, not
// free text — the request forms are the only uploaders and only ever send 'request_attachment'.
export const PROCURE_GUARD_DOCUMENT_TYPES = new Set(['request_attachment']);
export const MAX_PROCURE_GUARD_DOCUMENT_NAME_CHARS = 200;

// A delegation hands over live approval authority, so its end date is validated rather than passed
// straight to TIMESTAMPTZ (see validateDelegationExpiry in ./validation).
export const MAX_DELEGATION_WINDOW_DAYS = 90;
export const ADMIN_DELEGATION_REFUSAL =
  'An Admin profile cannot be delegated: it would grant approval rights for every step in every country. Delegate from a scoped approver role instead.';

// Short-lived per-user cache tag for the read-only dashboard queries; busted on any write.
export const PROCUREGUARD_DATA_TAG = 'procureguard-data';
