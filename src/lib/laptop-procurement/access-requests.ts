/* ─── Row shaping for the access-request queue. ─── */

import type {
  LaptopAccessRequestRow,
  LaptopAccessRequestStatus,
  LaptopPermissionRole,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';

export function serialiseLaptopAccessRequest(row: QueryResultRow): LaptopAccessRequestRow {
  return {
    user_email: String(row.user_email),
    display_name: row.display_name ? String(row.display_name) : null,
    job_title: row.job_title ? String(row.job_title) : null,
    department: row.department ? String(row.department) : null,
    status: row.status as LaptopAccessRequestStatus,
    requested_role: row.requested_role as LaptopPermissionRole,
    approved_role: row.approved_role ? (row.approved_role as LaptopPermissionRole) : null,
    country: row.country ? String(row.country) : null,
    segment: row.segment ? String(row.segment) : null,
    requested_at:
      row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
    reviewed_at:
      row.reviewed_at instanceof Date
        ? row.reviewed_at.toISOString()
        : row.reviewed_at
          ? String(row.reviewed_at)
          : null,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}
