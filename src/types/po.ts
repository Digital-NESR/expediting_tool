export interface PurchaseOrder {
  'PO Number': string;
  'PO Line'?: string;
  'Supplier Name': string;
  'Supplier ID'?: string;
  'Item Description': string;
  'SAP MAT ID': string;
  'Open QTY': number | string;
  'Open PO Value USD': number | string;
  'Delivery Date': string;
  'Delivery Code': string;
  'Country': string;
  'Delivery Comments'?: string;
}
