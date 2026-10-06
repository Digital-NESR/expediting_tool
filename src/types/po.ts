export interface PurchaseOrder {
  'PO Number': string;
  'PO Line'?: string;
  'Supplier Name': string;
  'Supplier ID'?: string;
  'Buyer Name'?: string;
  'Item Description': string;
  'SAP MAT ID': string;
  'Open QTY': number | string;
  'Open PO Value USD': number | string;
  'Delivery Date': string;
  'Delivery Code': string;
  Country: string;
  'PO Release Date'?: string;
  'Delivery Comments'?: string;
  'Buyer Email'?: string | null;
  'P Group'?: string;
  Segment?: string;
  'Account Classification Description'?: string | null;
  /** Newest dispatch for this exact line, or null if it has never been expedited. */
  'Last Expedited'?: string | null;
  /** How many times this line has been in a dispatch. Zero for a line nobody has chased. */
  'Times Expedited'?: number | string | null;
}
