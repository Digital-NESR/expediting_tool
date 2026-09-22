import type { DisplayStatus, SnsRole } from './types';

/**
 * Every S&S role the system recognises. These are permission levels, not
 * reference data — they are wired into the validation flow itself — so unlike
 * the taxonomy they stay in code rather than moving to the database.
 *
 * This is the full set for *validating* a stored grant. What a person may ask
 * for, or an admin hand out, is the shorter GRANTABLE_ROLES below.
 */
export const ROLES: SnsRole[] = [
  'Requestor — Sourcing / Procurement',
  'Validator L1 — Country Supply Chain Manager',
  'Validator L2 — Category Manager / SC Director',
  'Read-only — Procurement Officer / Auditor',
  'Supply Chain Leadership',
];

/**
 * What the two validation stages are called on screen and in mail.
 *
 * "Level 1" / "Level 2" is internal vocabulary — it survives in the stored
 * `base_status`, the column names and the approver gates, because that is the
 * schema. Nobody outside the team reads a record and knows what Level 2 means,
 * so every user-facing string names the role instead. One definition here, so
 * the screens, the PDF and the notification emails cannot drift apart.
 *
 * SHORT is for the status pill in the registry table, where the full phrase
 * would set the column width for every other row.
 */
export const STAGE1 = 'Country Supply Chain Manager';
export const STAGE2 = 'Supply Chain Director / Category Manager';
export const STAGE1_SHORT = 'Country SC Manager';
export const STAGE2_SHORT = 'SC Director / Category Manager';

/** Status as it is shown. The stored values keep the Level 1/2 spelling. */
export const STATUS_LABEL: Partial<Record<DisplayStatus, string>> = {
  'Pending Level 1': `Pending ${STAGE1_SHORT}`,
  'Pending Level 2': `Pending ${STAGE2_SHORT}`,
};

/**
 * The roles anyone can actually ask for, or be granted.
 *
 * The two validator roles are deliberately absent. Who validates is not a
 * matter of asking: Level 1 is whoever holds the country in
 * `sns_country_manager`, Level 2 whoever holds the category in
 * `sns_category_manager`, both maintained on the Approvers screen. Leaving
 * them in the dropdown invited requests that the approver tables would then
 * contradict. "Supply Chain Leadership" goes for the same reason — those are
 * the same people.
 *
 * Existing grants of the removed roles keep working: ROLES above is what the
 * server validates a stored grant against, and `roleKind` still reads them.
 */
export const GRANTABLE_ROLES: SnsRole[] = [
  'Requestor — Sourcing / Procurement',
  'Read-only — Procurement Officer / Auditor',
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
  Closed: ['#EDEEEE', '#4A4B4D', '#9A9C9E'],
};
