export interface Shipment {
  id: number;
  reference_number: string;
  segment: string | null;
  from_country: string | null;
  to_country: string | null;
  invoice_number: string | null;
  invoice_value_usd: number | null;
  bayan_number: string | null;
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
  status: string;
  alert_level: string;
  created_at?: string;
  updated_at?: string;
  created_by: string | null;
  // computed client-side
  daysToExpiry?: number;
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
