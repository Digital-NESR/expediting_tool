// Types for the NESR Catalog Manager tool.
// The DB schema follows the ERD: country / currency / unit_of_measure / app_user /
// supplier / spend_category / spend_subcategory / catalog_entry / rate_version /
// entry_document / approval_decision / audit_log, plus country_approver (per-country approvers).

export type CatalogStatus = 'Draft' | 'Pending Approval' | 'Active' | 'Expired' | 'Rejected';
export type CatalogRole = 'Viewer' | 'Contributor' | 'Approver' | 'Admin';
export type SpendType = 'Materials & Assets' | 'Consumables' | 'Services';

/* ---------- master data ---------- */
export interface CountryRow {
  code: string;
  name: string;
  default_currency: string;
  flag: string | null;
  status: string;
}
export interface CurrencyRow {
  code: string;
  decimals: number;
  usd_rate: number;
}
export interface UomRow {
  id: number;
  name: string;
  status: string;
}
export interface SupplierRow {
  id: number;
  vendor_code: string;
  name: string;
  accountable_manager: string | null;
}
export interface SpendCategoryRow {
  id: number;
  name: string;
  type: SpendType;
  status: string;
}
export interface SpendSubcategoryRow {
  id: number;
  category_id: number;
  category_name?: string;
  name: string;
  status: string;
}
export interface AppUserRow {
  id: number;
  full_name: string;
  email: string;
  country_code: string | null;
  role: CatalogRole;
}
export interface ApprovalThresholdRule {
  id: number;
  country_code: string | null;
  country_name?: string | null;
  spend_category_id: number | null;
  spend_category_name?: string | null;
  threshold_usd: number;
}
export interface CountryApproverRow {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  country_code: string;
  country_name?: string;
  spend_category_id: number | null;
  spend_category_name?: string | null;
  tier: number;
  is_active: boolean;
}

/* ---------- version history & documents ---------- */
export interface RateVersion {
  version_no: number;
  unit_price: number;
  currency_code: string;
  effective_date: string;
  expiry_date: string | null;
  change_reason: string | null;
  modified_by: string | null;
  modified_at: string;
}
export interface EntryDocument {
  id: number;
  file_name: string;
  doc_type: string | null;
  size_label: string | null;
  has_file?: boolean;
  uploaded_by?: string | null;
}

/* ---------- analytics ---------- */
export interface SpendByCategory {
  name: string;
  type: SpendType | null;
  activeCount: number;
  totalUsd: number;
}
export interface SpendByCountry {
  code: string;
  name: string;
  flag: string | null;
  activeCount: number;
  totalUsd: number;
}
export interface RateMover {
  id: number;
  code: string;
  supplier_name: string;
  commodity: string | null;
  item_name: string;
  country_code: string;
  currency_code: string;
  firstPrice: number;
  currentPrice: number;
  changePct: number;
  versions: number;
}
export interface CatalogAnalyticsData {
  activeCount: number;
  totalActiveUsd: number;
  supplierCount: number;
  pendingCount: number;
  expiringCount: number;
  avgRateChangePct: number | null;
  byCategory: SpendByCategory[];
  byCountry: SpendByCountry[];
  topMovers: RateMover[];
  statusCounts: { status: CatalogStatus; count: number }[];
}
export interface ApprovalDecisionRow {
  id: number;
  decision: 'Approved' | 'Rejected' | 'Revision';
  tier: number;
  comment: string | null;
  decided_by: string | null;
  decided_at: string;
}

/* ---------- the catalog entry (flattened view the UI consumes) ---------- */
export interface CatalogEntry {
  id: number;
  code: string;
  country_code: string;
  country_name: string;
  country_flag: string | null;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  manager: string | null;
  spend_type: SpendType | null;
  category_id: number | null;
  category_name: string | null;
  subcategory_id: number | null;
  subcategory_name: string | null;
  family: string | null;
  commodity: string | null;
  unspsc_code: string | null;
  item_name: string;
  description: string | null;
  uom_id: number | null;
  uom_name: string | null;
  unit_price: number;
  currency_code: string;
  usd_equivalent: number;
  effective_date: string;
  expiry_date: string | null;
  status: CatalogStatus;
  tier_label: string;
  version_no: number;
  sirion_contract_id: string | null;
  sirion_url: string | null;
  notes: string | null;
  approver_name: string | null;
  approval_comment: string | null;
  created_by: string | null;
  created_at: string;
  modified_by: string | null;
  modified_at: string;
  documents: EntryDocument[];
  history: RateVersion[];
}

/* ---------- audit ---------- */
export interface AuditEvent {
  id: number;
  action: string;
  target: string;
  user_name: string;
  detail: string | null;
  occurred_at: string;
}

/* ---------- dashboard ---------- */
export interface CategoryBar {
  name: string;
  count: number;
}
export interface CatalogManagerDashboardData {
  scope: string;
  activeCount: number;
  supplierCount: number;
  categoryCount: number;
  expiringCount: number;
  pendingCount: number;
  totalActiveUsd: number;
  byCategory: CategoryBar[];
  expiringSoon: CatalogEntry[];
  recent: AuditEvent[];
}

/* ---------- session actor ---------- */
export interface CatalogDelegationGrant {
  email: string;
  name: string;
  countries: string[];
}

export interface CatalogActor {
  email: string;
  name: string;
  role: CatalogRole;
  country_code: string | null;
  canCreate: boolean;
  canApprove: boolean;
  canAdmin: boolean;
  /** Merged set: countries the actor can approve via their own role AND any active delegation. */
  approverCountries: string[];
  /** Approve capability from the actor's OWN role (excludes delegated authority). */
  canApproveOwn?: boolean;
  /** Countries from the actor's OWN role only (excludes delegated). Used for "on behalf of" attribution. */
  ownApproverCountries?: string[];
  /** People whose approval authority this actor currently holds (active delegations). */
  delegatedFrom?: CatalogDelegationGrant[];
}
