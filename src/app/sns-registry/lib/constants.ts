import type { DisplayStatus, SnsRole } from './types';

/**
 * The five S&S roles. These are permission levels, not reference data — they
 * are wired into the validation flow itself — so unlike the taxonomy they stay
 * in code rather than moving to the database.
 */
export const ROLES: SnsRole[] = [
  'Requestor — Sourcing / Procurement',
  'Validator L1 — Country Supply Chain Manager',
  'Validator L2 — Category Manager / SC Director',
  'Read-only — Procurement Officer / Auditor',
  'Supply Chain Leadership',
];

/** Short labels for the admin approvals queue, where the full role strings don't fit. */
export const ROLE_SHORT: Record<string, string> = {
  'Requestor — Sourcing / Procurement': 'Requestor',
  'Validator L1 — Country Supply Chain Manager': 'Validator L1',
  'Validator L2 — Category Manager / SC Director': 'Validator L2',
  'Read-only — Procurement Officer / Auditor': 'Read-only',
  'Supply Chain Leadership': 'Leadership',
};

// [background, foreground, accent]
export const STATUS_STYLE: Record<DisplayStatus, [string, string, string]> = {
  Draft: ['#F1F2F2', '#58595B', '#D1D3D4'],
  'Pending Level 1': ['#FEF1D6', '#8A6100', '#E8B96A'],
  'Pending Level 2': ['#FDE6C8', '#8A4B00', '#E09A4E'],
  Active: ['#C5E0D2', '#1D5B39', '#2A7E4F'],
  Extended: ['#C5E0D2', '#1D5B39', '#6AAF8E'],
  'Expiring soon': ['#FDE6C8', '#8A4B00', '#E09A4E'],
  Expired: ['#F8DCDC', '#9B1C1C', '#B34141'],
  Rejected: ['#F8DCDC', '#9B1C1C', '#B34141'],
};
