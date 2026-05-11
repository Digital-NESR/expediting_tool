export type ShipmentStatus =
  | 'Open'
  | 'Open - Extended'
  | 'Closed'
  | 'Closed - Refund Recovered';

export function isClosedStatus(status: string): boolean {
  return status === 'Closed' || status === 'Closed - Refund Recovered';
}

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
  status: ShipmentStatus;
  alert_level: string;
  created_at?: string;
  updated_at?: string;
  created_by: string | null;
  // computed client-side
  daysToExpiry?: number;
}

export interface ShipmentDocument {
  id: number;
  shipment_id: number;
  document_name: string;
  document_type: string | null;
  document_stage: 'creation' | 'extension' | 'closure' | 'refund';
  file_type: string | null;
  file_size: number | null;
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
