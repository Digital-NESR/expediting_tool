/* ─── Shapes the TI-TE screens read and post. Declared here rather than in the actions file so a
   client can import a type without importing an endpoint module to get it. ─── */

import type { ShipmentStatus } from '@/types/tite';

/* ─── CreateShipmentInput ─────────────────────────────────────── */

export interface CreateShipmentInput {
  movement_type: 'Temporary Import' | 'Temporary Export';
  segment?: string;
  description?: string;
  from_country?: string;
  to_country?: string;
  country?: string;
  mot?: string;
  invoice_number?: string;
  invoice_value_usd?: number;
  customs_reference_number?: string;
  awb_number?: string;
  po_number?: string;
  import_date?: string;
  expiry_date?: string;
  extended_date?: string;
  deposit_usd?: number;
  comments?: string;
  customs_docs_location?: string;
  status?: ShipmentStatus;
  additionalContacts?: Array<{
    name: string;
    email: string;
    role: string;
    notify_60_days?: boolean;
    notify_30_days?: boolean;
    notify_14_days?: boolean;
    notify_7_days?: boolean;
    notify_2_days?: boolean;
    notify_1_day?: boolean;
    notify_0_day?: boolean;
    notify_overdue?: boolean;
  }>;
}

/* ─── Access request types ────────────────────────────────────── */

export interface TiteAccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked';
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

/* ─── getShipmentNotificationStatus ─────────────────────────── */

export interface NotificationLogRow {
  id: number;
  shipment_id: number;
  days_before_expiry: number;
  status: string;
  sent_at: string | null;
}

/* ─── getRecentActivity ───────────────────────────────────────── */

export interface RecentActivityRow {
  id: number;
  shipment_id: number;
  action: string;
  details: string | null;
  performed_by: string | null;
  performed_at: string;
  reference_number: string | null;
  description: string | null;
  country: string | null;
}
