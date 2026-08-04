export type LaptopRequestStatus =
  | 'Submitted'
  | 'IT Approval'
  | 'CM Approval'
  | 'Procure New Details'
  | 'IT Director Approval'
  | 'Supply Chain Director Approval'
  | 'Procure New'
  | 'Approved'
  | 'Assign from Inventory'
  | 'Assign from Inventory & Closed'
  | 'Repaired & Closed'
  | 'Rejected'
  | 'Rejected by CM'
  | 'Rejected by ITD'
  | 'Rejected by SCD'
  | 'Cancelled';

export type LaptopRequestPriority = 'Low' | 'Normal' | 'High' | 'Critical';

export type LaptopPermissionRole =
  | 'Requester'
  | 'Analyst'
  | 'Read Only'
  | 'IT Manager'
  | 'Country Manager'
  | 'IT Director'
  | 'Supply Chain Director'
  | 'Admin';

export type LaptopAccessView = 'requester' | 'analyst' | 'reviewer' | 'admin';

export interface LaptopPermissionProfile {
  role: LaptopPermissionRole;
  label: string;
  description: string;
  accessView: LaptopAccessView;
  canViewAll: boolean;
  canCreateRequests: boolean;
  canManageData: boolean;
  canManagePermissions: boolean;
  canDeleteRecords: boolean;
  canReject: boolean;
  canReviewItManager: boolean;
  canReviewCountryManager: boolean;
  canReviewItDirector: boolean;
  canReviewScmDirector: boolean;
}

export interface LaptopPermissionRow {
  id: number;
  email: string;
  name: string | null;
  role: LaptopPermissionRole;
  country: string | null;
  segment: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateLaptopPermissionInput {
  email: string;
  name?: string;
  role: LaptopPermissionRole;
  country?: string;
  segment?: string;
}

export interface LaptopDelegationGrant {
  email: string;
  name: string;
  role: LaptopPermissionRole;
  permissions: LaptopPermissionProfile;
  country?: string | null;
  segment?: string | null;
}

export interface LaptopActor {
  email: string;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
  isAdmin: boolean;
  role: LaptopPermissionRole;
  permissions: LaptopPermissionProfile;
  country?: string | null;
  segment?: string | null;
  /** People whose approval authority this actor currently holds (active delegations). */
  delegatedFrom?: LaptopDelegationGrant[];
  /**
   * The best access tier across the actor's own role and every active delegation —
   * used to gate whole pages/nav (Admin Panel, Analytics, Reviewer Queue), so a
   * delegate of an Admin/reviewer can actually reach those pages, not just act on
   * individual requests. Data-scoped queries still use the actor's own role/scope
   * plus `delegatedFrom` directly; this field is for page-level gating only.
   */
  effectiveAccessView: LaptopAccessView;
}

export interface LaptopActivityRow {
  id: number;
  request_id: number;
  reference_number: string;
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface LaptopDeviceCatalogRow {
  id: number;
  type_of_device: string;
  model: string;
  active: boolean;
  created_at: string;
}

export interface LaptopDeviceOption {
  type_of_device: string;
  model: string;
}

export interface CreateLaptopDeviceInput {
  type_of_device: string;
  model: string;
}

export interface UpdateLaptopDeviceInput {
  type_of_device?: string;
  model?: string;
  active?: boolean;
}

export interface LaptopRequest {
  id: number;
  reference_number: string;
  employee_id: string | null;
  status: LaptopRequestStatus;
  priority: LaptopRequestPriority;
  request_type: string | null;
  indirect_request: boolean;
  requested_date: string | null;
  pending_with: string | null;

  country: string | null;
  requested_by_name: string | null;
  requested_by_email: string;
  on_behalf_of: string | null;
  computer_for: string | null;
  segment: string | null;
  department: string | null;
  position: string | null;
  company_code: string | null;
  company_name: string | null;
  cost_center: string | null;

  type_of_device: string | null;
  requested_model: string | null;
  special_requirements: string | null;

  unit_id: string | null;
  current_brand: string | null;
  current_model: string | null;
  serial_no: string | null;
  age_years: string | null;
  sap_number: string | null;

  // The specific second-hand unit assigned when a request is fulfilled from
  // inventory — distinct from current_brand/current_model/serial_no/age_years
  // above, which describe the OLD device being replaced.
  assigned_serial_no: string | null;
  assigned_model: string | null;
  assigned_age: string | null;

  it_manager: string | null;
  it_manager_2: string | null;
  country_manager: string | null;
  it_director: string | null;
  sc_director: string | null;

  itm_comments: string | null;
  cm_comments: string | null;
  itd_comments: string | null;
  scd_comments: string | null;

  it_team_approved_date: string | null;
  cm_approved_date: string | null;
  itd_approved_date: string | null;
  scd_approved_date: string | null;

  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_comments: string | null;

  legacy_status: string | null;
  legacy_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateLaptopRequestInput {
  priority: LaptopRequestPriority;
  request_type: string;
  employee_id?: string;
  country: string;
  computer_for?: string;
  segment: string;
  department?: string;
  position?: string;
  company_code?: string;
  company_name?: string;
  cost_center?: string;
  type_of_device: string;
  // Filled in later by the IT Team once a request is actually flagged for new-device
  // procurement (see SubmitProcureNewDetailsInput) — the requester no longer picks a
  // specific model upfront.
  requested_model?: string;
  special_requirements: string;
}

// Filled in by the IT Team once Country Manager flags a request as needing a brand
// new device procured, before it continues to IT Director / Supply Chain Director.
export interface SubmitProcureNewDetailsInput {
  type_of_device: string;
  model: string;
}

// Filled in by the IT Manager once the request reaches them — not collected
// from the requester at submission time.
export interface UpdateLaptopExistingDeviceInput {
  unit_id?: string;
  current_brand?: string;
  current_model?: string;
  serial_no?: string;
  age_years?: string;
  sap_number?: string;
}

// Captured when an IT Manager (or any reviewer) resolves a request by assigning
// a specific second-hand unit from inventory.
export interface AssignExistingLaptopInput {
  serial_no: string;
  model: string;
  age: string;
}

export interface AdminCreateLaptopRequestInput extends CreateLaptopRequestInput, UpdateLaptopExistingDeviceInput {
  status?: LaptopRequestStatus;
  requested_by_name?: string;
  requested_by_email?: string;
}

export interface LaptopDashboardStats {
  total: number;
  pending_review: number;
  procure_new: number;
  assigned_inventory: number;
  repaired: number;
  rejected: number;
  laptops: number;
  desktops: number;
}

export interface LaptopDashboardData {
  stats: LaptopDashboardStats;
  requests: LaptopRequest[];
  activity: LaptopActivityRow[];
  actor: LaptopActor;
}

export interface LaptopAdminData {
  actor: LaptopActor;
  requests: LaptopRequest[];
  activity: LaptopActivityRow[];
  permissions: LaptopPermissionRow[];
  delegations: LaptopDelegationRow[];
  deviceCatalog: LaptopDeviceCatalogRow[];
  stats: LaptopDashboardStats;
}

export type LaptopAccessRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Revoked';

export interface LaptopAccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  department: string | null;
  status: LaptopAccessRequestStatus;
  requested_role: LaptopPermissionRole;
  approved_role: LaptopPermissionRole | null;
  country: string | null;
  segment: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

export interface LaptopDelegationRow {
  id: number;
  delegator_email: string;
  delegator_name: string | null;
  delegate_email: string;
  delegate_name: string | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LaptopDelegationData {
  actor: LaptopActor;
  granted: LaptopDelegationRow[];
  received: LaptopDelegationRow[];
}

export interface LaptopApproverMatrixRow {
  id: number;
  country: string;
  item_type: string;
  it_manager_name: string | null;
  it_manager_email: string | null;
  it_manager_2_name: string | null;
  it_manager_2_email: string | null;
  cm_name: string | null;
  cm_email: string | null;
  itd_name: string | null;
  itd_email: string | null;
  scd_name: string | null;
  scd_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateLaptopApproverMatrixInput {
  id: number;
  it_manager_name?: string;
  it_manager_email?: string;
  it_manager_2_name?: string;
  it_manager_2_email?: string;
  cm_name?: string;
  cm_email?: string;
  itd_name?: string;
  itd_email?: string;
  scd_name?: string;
  scd_email?: string;
  is_active: boolean;
}

export interface LaptopDocument {
  id: number;
  request_id: number;
  document_name: string;
  original_name: string | null;
  document_type: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string;
}

export interface LaptopRequestActions {
  nextStatus: LaptopRequestStatus | null;
  canApprove: boolean;
  canReject: boolean;
  canAssignInventory: boolean;
  canMarkRepaired: boolean;
  // Country Manager only — flags a request as needing a brand new device procured,
  // routing it to the IT Team for device details instead of approving it outright.
  canProcureNew: boolean;
  // IT Team only, while status is 'Procure New Details' — submit the new device's
  // type/model and forward to IT Director.
  canSubmitProcureDetails: boolean;
  rejectStatus: LaptopRequestStatus | null;
  ownerLabel: string;
}

export interface LaptopWorkQueueItem {
  request: LaptopRequest;
  actions: LaptopRequestActions;
}

export interface LaptopWorkQueueData {
  actor: LaptopActor;
  items: LaptopWorkQueueItem[];
  stats: {
    total: number;
    approval: number;
    it_review: number;
  };
}

export interface LaptopRequestListData {
  actor: LaptopActor;
  requests: LaptopRequest[];
}

export interface LaptopRequestDetailData {
  actor: LaptopActor;
  request: LaptopRequest;
  activity: LaptopActivityRow[];
  documents: LaptopDocument[];
  actions: LaptopRequestActions;
}

export interface LaptopAnalyticsMetric {
  label: string;
  count: number;
}

export interface LaptopMonthlyMetric {
  month: string;
  count: number;
}

export interface LaptopAnalyticsData {
  actor: LaptopActor;
  stats: LaptopDashboardStats & {
    active_requester_count: number;
    country_count: number;
  };
  status_breakdown: LaptopAnalyticsMetric[];
  request_type_breakdown: LaptopAnalyticsMetric[];
  device_breakdown: LaptopAnalyticsMetric[];
  country_breakdown: LaptopAnalyticsMetric[];
  segment_breakdown: LaptopAnalyticsMetric[];
  top_models: LaptopAnalyticsMetric[];
  monthly_trend: LaptopMonthlyMetric[];
  generated_at: string;
}

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  reference_number?: string;
  error?: string;
}
