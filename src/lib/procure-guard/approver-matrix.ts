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
}
export interface ApproverCell { name: string; email: string }
export interface ProcureGuardApproverMatrix {
  countries: string[];
  columns: ApproverMatrixColumn[];
  cells: Record<string, Record<string, ApproverCell | null>>;
}

export interface ProcureGuardViewerGrant {
  email: string;
  name: string;
  countries: string[]; // empty = all countries (global viewer)
}

export const APPROVER_MATRIX_COLUMNS: ApproverMatrixColumn[] = [
  { key: 'scm',        label: 'Country SCM',           notificationRole: 'SCM Manager',           requestType: 'adhoc' },
  { key: 'cc',         label: 'Country Controller',    notificationRole: 'Country Controller',    requestType: 'advance' },
  { key: 'sd_adhoc',   label: 'SC Director (Adhoc)',   notificationRole: 'Supply Chain Director', requestType: 'adhoc' },
  { key: 'sd_advance', label: 'SC Director (Advance)', notificationRole: 'Supply Chain Director', requestType: 'advance' },
  { key: 'treasury',   label: 'Treasury Director',     notificationRole: 'Treasury Director',     requestType: 'advance' },
  { key: 'corp',       label: 'Corporate Controller',  notificationRole: 'Corporate Controller',  requestType: 'advance' },
  { key: 'cfo',        label: 'CFO',                   notificationRole: 'CFO',                   requestType: 'advance' },
];

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
      [country, rt, role, t?.approval_status ?? null, t?.source_column ?? 'manual', displayName, email, t?.is_required ?? false],
    );
  }
}
