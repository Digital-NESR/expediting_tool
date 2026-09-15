export type ShipmentStatus = 'Open' | 'Open - Extended' | 'Closed' | 'Closed - Refund Recovered';

/* `isClosedStatus` / `isOpenStatus` live in `@/lib/tite-utils`, next to the
   alert-level rule that uses them. */

export interface Shipment {
  id: number;
  reference_number: string;
  segment: string | null;
  from_country: string | null;
  to_country: string | null;
  invoice_number: string | null;
  invoice_value_usd: number | null;
  customs_reference_number: string | null;
  description: string | null;
  mot: string | null;
  awb_number: string | null;
  po_number: string | null;
  movement_type: string | null;
  import_date: string | null;
  expiry_date: string | null;
  extended_date: string | null;
  deposit_usd: number | null;
  country: string | null;
  comments: string | null;
  customs_docs_location: string | null;
  status: ShipmentStatus;
  alert_level: string;
  created_at?: string;
  updated_at?: string;
  created_by: string | null;
  // computed client-side
  daysToExpiry?: number;
}

/* The column subset the admin TI-TE analytics panel actually reads. That panel
   filters and charts entirely on the client, so every column it receives is
   serialised into the page payload — and it never touches from_country,
   to_country, invoice_number, invoice_value_usd, description, mot, awb_number,
   po_number, comments or customs_docs_location (description and comments being
   the free-text heavyweights). Narrowing the type keeps it that way: the report
   tables address columns by string key, so the compiler is the only thing that
   stops a dropped column from silently rendering as an em dash. */
/* The shipment register's own projection: everything the list renders, searches
   or filters on, and nothing else. It drops invoice_value_usd, comments,
   customs_docs_location and created_at — four columns the register never reads
   but which were serialised into the page payload for every row. Built the same
   way as TiteAnalyticsShipment below. */
export type TiteListShipment = Pick<
  Shipment,
  | 'id'
  | 'reference_number'
  | 'description'
  | 'invoice_number'
  | 'customs_reference_number'
  | 'awb_number'
  | 'po_number'
  | 'from_country'
  | 'to_country'
  | 'mot'
  | 'segment'
  | 'movement_type'
  | 'import_date'
  | 'expiry_date'
  | 'extended_date'
  | 'deposit_usd'
  | 'country'
  | 'status'
  | 'alert_level'
  | 'created_by'
>;

export type TiteAnalyticsShipment = Pick<
  Shipment,
  | 'id'
  | 'reference_number'
  | 'customs_reference_number'
  | 'segment'
  | 'movement_type'
  | 'import_date'
  | 'expiry_date'
  | 'extended_date'
  | 'deposit_usd'
  | 'country'
  | 'status'
  | 'alert_level'
  | 'created_by'
  | 'created_at'
>;

export interface ShipmentDocument {
  id: number;
  shipment_id: number;
  document_name: string;
  document_type: string | null;
  document_stage: 'creation' | 'extension' | 'closure' | 'refund';
  file_type: string | null;
  file_size: number | null;
  original_name: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ActivityLogRow {
  id: number;
  shipment_id: number;
  action: string;
  details: string | null;
  performed_by: string | null;
  performed_at: string;
}

export interface ShipmentStats {
  active_count: number;
  overdue_count: number;
  urgent_count: number;
  action_count: number;
  total_deposit_usd: number;
  import_count: number;
  export_count: number;
}

export interface NotificationContact {
  id: number;
  shipment_id: number;
  name: string | null;
  email: string;
  role: string | null;
  notify_60_days: boolean;
  notify_30_days: boolean;
  notify_14_days: boolean;
  notify_7_days: boolean;
  notify_2_days: boolean;
  notify_1_day: boolean;
  notify_0_day: boolean;
  notify_overdue: boolean;
}

export interface CountryStakeholder {
  id: number;
  role: string;
  name: string;
  email: string;
}

export interface CountryStakeholderFull extends CountryStakeholder {
  country: string;
  active: boolean;
}
