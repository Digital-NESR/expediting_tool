/**
 * The approver matrix shape (country x role/request-type -> the notified approver) and the
 * recipient-row upsert its two admin actions share.
 *
 * A plain module, deliberately NOT `'use server'`: upsertProcureGuardRecipientRow writes the
 * directory that decides who can approve, so it stays behind the admin actions' guards. The
 * interfaces live here too because a `'use server'` file may only export async functions.
 */
import type { QueryResultRow } from 'pg';
import { exec, sql } from './internals';

export interface ApproverMatrixColumn {
  key: string;
  label: string;
  notificationRole: string;
  requestType: 'adhoc' | 'advance';
  /**
   * This step is owned by a team, not a person, so the cell holds a list.
   *
   * Every other column answers "who approves here", and replacing that person is the only edit
   * it needs. SAP Team verification is done by whoever on the team picks it up, so its cell
   * adds and removes people instead of swapping one out. The cells for these columns come
   * through `teamCells`; `cells` still carries the first of them, so anything reading the
   * matrix the old way shows a name rather than a blank.
   */
  multi?: boolean;
  /**
   * The request status at which this column's occupant is notified, written onto the recipient
   * row. Declared rather than copied from whatever row happens to exist, because the copy is
   * what put NULL on the first SAP Team row: there was no row of that role to copy from.
   */
  approvalStatus: string;
}
export interface ApproverCell {
  name: string;
  email: string;
}
export interface ProcureGuardApproverMatrix {
  countries: string[];
  columns: ApproverMatrixColumn[];
  cells: Record<string, Record<string, ApproverCell | null>>;
  /** Every approver per cell, populated only for `multi` columns. */
  teamCells: Record<string, Record<string, ApproverCell[]>>;
}

export interface ProcureGuardViewerGrant {
  email: string;
  name: string;
  countries: string[]; // empty = all countries (global viewer)
}

export const APPROVER_MATRIX_COLUMNS: ApproverMatrixColumn[] = [
  {
    key: 'scm',
    label: 'Country SCM',
    notificationRole: 'SCM Manager',
    requestType: 'adhoc',
    approvalStatus: 'Under Review',
  },
  {
    key: 'cc',
    label: 'Country Controller',
    notificationRole: 'Country Controller',
    requestType: 'advance',
    approvalStatus: 'Under Review',
  },
  {
    /* Between the country SCM and the Supply Chain Director on adhoc requests. Not country
       scoped in the permission model - the team covers every country - but it sits in the
       matrix per country like every other column, so a country can be given its own SAP
       contact if that ever becomes the arrangement. */
    key: 'sap',
    label: 'SAP Team',
    notificationRole: 'SAP Team',
    requestType: 'adhoc',
    multi: true,
    approvalStatus: 'Approved by SCM',
  },
  {
    key: 'sd_adhoc',
    label: 'SC Director (Adhoc)',
    notificationRole: 'Supply Chain Director',
    requestType: 'adhoc',
    /* Was 'Approved by SCM' until SAP Team verification was inserted in front of it. That is
       now the SAP team's step, and leaving the Director filed against it had them emailed for
       a verification that is not theirs. */
    approvalStatus: 'Verified by SAP Team',
  },
  {
    key: 'sd_advance',
    label: 'SC Director (Advance)',
    notificationRole: 'Supply Chain Director',
    requestType: 'advance',
    approvalStatus: 'Approved by Country Controller',
  },
  {
    key: 'treasury',
    label: 'Treasury Director',
    notificationRole: 'Treasury Director',
    requestType: 'advance',
    approvalStatus: 'Approved by Supply Chain Director',
  },
  {
    key: 'corp',
    label: 'Corporate Controller',
    notificationRole: 'Corporate Controller',
    requestType: 'advance',
    approvalStatus: 'Approved by Treasury Director',
  },
  {
    key: 'cfo',
    label: 'CFO',
    notificationRole: 'CFO',
    requestType: 'advance',
    approvalStatus: 'Approved by Corporate Controller',
  },
];

/**
 * The status a recipient row for this (role, request type) should carry.
 *
 * The inserts below used to take it from any existing row of the same role, which works for
 * every column that already had one and produced NULL for the first person ever added to a new
 * step — so the row matched no status and the step's email found nobody. The declared value is
 * the answer; the existing row is only a fallback for a role the matrix does not describe.
 */
function declaredApprovalStatus(role: string, rt: 'adhoc' | 'advance'): string | null {
  const col = APPROVER_MATRIX_COLUMNS.find(
    (c) => c.notificationRole.toLowerCase() === role.toLowerCase() && c.requestType === rt,
  );
  return col?.approvalStatus ?? null;
}

/**
 * Add one more person to a (country, role, request_type) that may already have others.
 *
 * `upsertProcureGuardRecipientRow` UPDATEs every matching row, which is right for a column
 * where one person holds the step and wrong for a team: used there, the second person added
 * would overwrite the first. This inserts, and does nothing if that address is already on the
 * cell, so adding somebody twice is harmless rather than a duplicate notification.
 */
export async function addProcureGuardRecipientRow(
  country: string,
  role: string,
  rt: 'adhoc' | 'advance',
  email: string,
  displayName: string,
): Promise<void> {
  const existing = await sql<QueryResultRow[]>(
    `SELECT id FROM procure_guard_notification_recipients
      WHERE country = ? AND notification_role = ? AND request_type = ?
        AND LOWER(email) = LOWER(?) AND is_active = TRUE
      LIMIT 1`,
    [country, role, rt, email],
  );
  if (existing.length) return;

  const tmpl = await sql<QueryResultRow[]>(
    `SELECT approval_status, source_column, is_required FROM procure_guard_notification_recipients
      WHERE notification_role = ? AND request_type = ? AND is_active = TRUE LIMIT 1`,
    [role, rt],
  );
  const t = tmpl[0];
  await exec(
    `INSERT INTO procure_guard_notification_recipients
       (country, request_type, notification_role, approval_status, source_column, display_name, email, is_required, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      country,
      rt,
      role,
      declaredApprovalStatus(role, rt) ?? t?.approval_status ?? null,
      t?.source_column ?? 'manual',
      displayName,
      email,
      t?.is_required ?? false,
    ],
  );
}

/** Take one person off a cell. Deactivated rather than deleted, like every other recipient. */
export async function removeProcureGuardRecipientRow(
  country: string,
  role: string,
  rt: 'adhoc' | 'advance',
  email: string,
): Promise<number> {
  const res = await exec(
    `UPDATE procure_guard_notification_recipients
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE country = ? AND notification_role = ? AND request_type = ?
        AND LOWER(email) = LOWER(?) AND is_active = TRUE`,
    [country, role, rt, email],
  );
  return res.rowCount ?? 0;
}

// Update the recipient for one (country, role, request_type), or insert one cloning that role's
// existing defaults when the country has no row yet. Callers run the recipients->access sync afterwards.
export async function upsertProcureGuardRecipientRow(
  country: string,
  role: string,
  rt: 'adhoc' | 'advance',
  email: string,
  displayName: string,
): Promise<void> {
  const upd = await exec(
    `UPDATE procure_guard_notification_recipients
     SET display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
     WHERE country = ? AND notification_role = ? AND request_type = ? AND is_active = TRUE`,
    [displayName, email, country, role, rt],
  );
  if (upd.rowCount === 0) {
    const tmpl = await sql<QueryResultRow[]>(
      `SELECT approval_status, source_column, is_required FROM procure_guard_notification_recipients
       WHERE notification_role = ? AND request_type = ? AND is_active = TRUE LIMIT 1`,
      [role, rt],
    );
    const t = tmpl[0];
    await exec(
      `INSERT INTO procure_guard_notification_recipients
         (country, request_type, notification_role, approval_status, source_column, display_name, email, is_required, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        country,
        rt,
        role,
        declaredApprovalStatus(role, rt) ?? t?.approval_status ?? null,
        t?.source_column ?? 'manual',
        displayName,
        email,
        t?.is_required ?? false,
      ],
    );
  }
}
