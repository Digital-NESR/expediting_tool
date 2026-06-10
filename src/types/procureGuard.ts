export type ProcureGuardStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Approved by SCM'
  | 'Approved by Country Controller'
  | 'Approved by Supply Chain Director'
  | 'Approved by Treasury Director'
  | 'Approved by Corporate Controller'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

export type ProcureGuardPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type ProcureGuardRequestType = 'adhoc' | 'advance';
export type ProcureGuardPermissionRole =
  | 'Requester'
  | 'Analyst'
  | 'Read Only'
  | 'SCM Manager'
  | 'Country Controller'
  | 'Supply Chain Director'
  | 'Treasury Director'
  | 'Corporate Controller'
  | 'CFO'
  | 'Admin';
export type ProcureGuardAccessView = 'requester' | 'analyst' | 'reviewer' | 'admin';

export interface ProcureGuardPermissionProfile {
  role: ProcureGuardPermissionRole;
  label: string;
  description: string;
  accessView: ProcureGuardAccessView;
  canViewAll: boolean;
  canCreateRequests: boolean;
  canManageData: boolean;
  canManagePermissions: boolean;
  canDeleteRecords: boolean;
  canReject: boolean;
  canReviewAdhocScm: boolean;
  canReviewAdhocDirector: boolean;
  canReviewAdvanceCountryController: boolean;
  canReviewAdvanceSupplyChainDirector: boolean;
  canReviewAdvanceTreasuryDirector: boolean;
  canReviewAdvanceCorporateController: boolean;
  canReviewAdvanceCfo: boolean;
}

export interface ProcureGuardPermissionRow {
  id: number;
  email: string;
  name: string | null;
  role: ProcureGuardPermissionRole;
  country: string | null;
  segment: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProcureGuardPermissionInput {
  email: string;
  name?: string;
  role: ProcureGuardPermissionRole;
  country?: string;
  segment?: string;
}

export interface ProcureGuardActor {
  email: string;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
  isAdmin: boolean;
  role: ProcureGuardPermissionRole;
  permissions: ProcureGuardPermissionProfile;
  country?: string | null;
  segment?: string | null;
}

export interface ProcureGuardActivityRow {
  id: number;
  request_type: ProcureGuardRequestType;
  request_id: number;
  reference_number: string;
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface AdhocPaymentRequest {
  id: number;
  reference_number: string;
  requisition_number: string | null;
  status: ProcureGuardStatus;
  priority: ProcureGuardPriority;
  vendor_name: string;
  vendor_code: string | null;
  vendor_tax_id: string | null;
  supplier_email: string | null;
  amount: number;
  currency: string;
  country: string | null;
  segment: string | null;
  department: string | null;
  business_unit: string | null;
  cost_center: string | null;
  project_code: string | null;
  po_number: string | null;
  invoice_number: string | null;
  due_date: string | null;
  expense_category: string | null;
  spend_category: string | null;
  spend_value_usd: number | null;
  payment_method: string | null;
  payment_reason: string;
  justification: string;
  notes: string | null;
  requester_comments: string | null;
  review_comments: string | null;
  attachment_link: string | null;
  cc_email: string | null;
  requester_notification_emails: string[];
  acknowledged_at: string | null;
  requested_by_name: string | null;
  requested_by_email: string;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvancePaymentRequest {
  id: number;
  reference_number: string;
  requisition_number: string | null;
  status: ProcureGuardStatus;
  priority: ProcureGuardPriority;
  vendor_name: string;
  vendor_code: string | null;
  sap_vendor_id: string | null;
  supplier_email: string | null;
  amount: number;
  currency: string;
  country: string | null;
  segment: string | null;
  department: string | null;
  business_unit: string | null;
  cost_center: string | null;
  project_code: string | null;
  contract_reference: string | null;
  po_number: string | null;
  contract_value: number | null;
  advance_percentage: number | null;
  spend_category: string | null;
  spend_value_usd: number | null;
  current_payment_terms_days: number | null;
  current_credit_limit_usd: number | null;
  expected_invoice_date: string | null;
  expected_settlement_date: string | null;
  recovery_method: string | null;
  advance_purpose: string;
  justification: string;
  notes: string | null;
  requester_comments: string | null;
  review_comments: string | null;
  attachment_link: string | null;
  cc_email: string | null;
  requester_notification_emails: string[];
  requested_by_name: string | null;
  requested_by_email: string;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdhocPaymentInput {
  priority: ProcureGuardPriority;
  requisition_number: string;
  vendor_name: string;
  vendor_code?: string;
  vendor_tax_id: string;
  supplier_email?: string;
  amount: number;
  currency: string;
  country?: string;
  segment: string;
  department?: string;
  business_unit?: string;
  cost_center?: string;
  project_code?: string;
  po_number?: string;
  invoice_number?: string;
  due_date?: string;
  expense_category?: string;
  spend_category: string;
  spend_value_usd?: number;
  payment_method?: string;
  payment_reason: string;
  justification: string;
  notes?: string;
  requester_comments?: string;
  attachment_link?: string;
  cc_email?: string;
  requester_notification_emails?: string[];
  acknowledged?: boolean;
}

export interface CreateAdvancePaymentInput {
  priority: ProcureGuardPriority;
  requisition_number: string;
  vendor_name: string;
  vendor_code?: string;
  sap_vendor_id: string;
  supplier_email?: string;
  amount: number;
  currency: string;
  country?: string;
  segment: string;
  department?: string;
  business_unit?: string;
  cost_center?: string;
  project_code?: string;
  contract_reference?: string;
  po_number?: string;
  contract_value?: number;
  advance_percentage?: number;
  spend_category: string;
  spend_value_usd?: number;
  current_payment_terms_days: number;
  current_credit_limit_usd: number;
  expected_invoice_date?: string;
  expected_settlement_date?: string;
  recovery_method?: string;
  advance_purpose: string;
  justification: string;
  notes?: string;
  requester_comments?: string;
  attachment_link?: string;
  cc_email?: string;
  requester_notification_emails?: string[];
}

export interface AdminCreateAdhocPaymentInput extends CreateAdhocPaymentInput {
  status?: ProcureGuardStatus;
  requested_by_name?: string;
  requested_by_email?: string;
}

export interface AdminCreateAdvancePaymentInput extends CreateAdvancePaymentInput {
  status?: ProcureGuardStatus;
  requested_by_name?: string;
  requested_by_email?: string;
}

export interface ProcureGuardDashboardStats {
  adhoc_total: number;
  advance_total: number;
  pending_review: number;
  approved: number;
  rejected: number;
  total_requested_amount: number;
  adhoc_requested_amount: number;
  advance_requested_amount: number;
}

export interface ProcureGuardDashboardData {
  stats: ProcureGuardDashboardStats;
  adhoc: AdhocPaymentRequest[];
  advance: AdvancePaymentRequest[];
  activity: ProcureGuardActivityRow[];
  actor: ProcureGuardActor;
}

export interface ProcureGuardAdminData extends ProcureGuardDashboardData {
  activity: ProcureGuardActivityRow[];
  permissions: ProcureGuardPermissionRow[];
  notification_recipients: ProcureGuardNotificationContact[];
}

export interface ProcureGuardDocument {
  id: number;
  request_type: ProcureGuardRequestType;
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

export interface ProcureGuardRequestActions {
  nextStatus: ProcureGuardStatus | null;
  canApprove: boolean;
  canReject: boolean;
  requiredPermission: string | null;
  ownerLabel: string;
}

export interface ProcureGuardNotificationContact {
  id: number;
  country: string;
  request_type: ProcureGuardRequestType | 'both';
  notification_role: string;
  approval_status: ProcureGuardStatus | null;
  source_column: string;
  display_name: string;
  email: string;
}

export interface ProcureGuardWorkQueueItem {
  request_type: ProcureGuardRequestType;
  request: AdhocPaymentRequest | AdvancePaymentRequest;
  actions: ProcureGuardRequestActions;
}

export interface ProcureGuardWorkQueueData {
  actor: ProcureGuardActor;
  items: ProcureGuardWorkQueueItem[];
  stats: {
    total: number;
    adhoc: number;
    advance: number;
    approval: number;
  };
}

export interface ProcureGuardRequestListData<TRequest> {
  actor: ProcureGuardActor;
  requests: TRequest[];
}

export interface ProcureGuardRequestDetailData {
  actor: ProcureGuardActor;
  request_type: ProcureGuardRequestType;
  request: AdhocPaymentRequest | AdvancePaymentRequest;
  activity: ProcureGuardActivityRow[];
  documents: ProcureGuardDocument[];
  notification_contacts: ProcureGuardNotificationContact[];
  actions: ProcureGuardRequestActions;
}

export interface ProcureGuardAnalyticsMetric {
  label: string;
  count: number;
  amount: number;
}

export interface ProcureGuardVendorMetric extends ProcureGuardAnalyticsMetric {
  adhoc_count: number;
  adhoc_amount: number;
  advance_count: number;
  advance_amount: number;
}

export interface ProcureGuardMonthlyMetric {
  month: string;
  adhoc_count: number;
  adhoc_amount: number;
  advance_count: number;
  advance_amount: number;
  total_count: number;
  total_amount: number;
}

export interface ProcureGuardReviewDurationMetric {
  request_type: ProcureGuardRequestType;
  status: ProcureGuardStatus;
  owner_label: string;
  count: number;
  average_hours: number;
  total_hours: number;
  longest_hours: number;
  oldest_request_id: number;
  oldest_reference_number: string;
  oldest_vendor_name: string;
  oldest_updated_at: string;
}

export interface ProcureGuardHighValueRequest {
  id: number;
  request_type: ProcureGuardRequestType;
  reference_number: string;
  vendor_name: string;
  status: ProcureGuardStatus;
  amount: number;
  amount_usd: number;
  currency: string;
  created_at: string;
}

export interface ProcureGuardAnalyticsData {
  actor: ProcureGuardActor;
  stats: ProcureGuardDashboardStats & {
    average_request_amount: number;
    active_vendor_count: number;
    active_requester_count: number;
  };
  top_vendors: ProcureGuardVendorMetric[];
  top_adhoc_vendors: ProcureGuardAnalyticsMetric[];
  top_advance_vendors: ProcureGuardAnalyticsMetric[];
  status_breakdown: ProcureGuardAnalyticsMetric[];
  priority_breakdown: ProcureGuardAnalyticsMetric[];
  requester_breakdown: ProcureGuardAnalyticsMetric[];
  monthly_trend: ProcureGuardMonthlyMetric[];
  review_duration_metrics: ProcureGuardReviewDurationMetric[];
  high_value_open_requests: ProcureGuardHighValueRequest[];
  generated_at: string;
}

export interface ProcureGuardUsageSummary {
  page_views: number;
  clicks: number;
  sessions: number;
  users: number;
  average_page_duration_ms: number;
  total_page_duration_ms: number;
  average_click_delay_ms: number;
}

export interface ProcureGuardUsagePageMetric {
  path: string;
  page_title: string;
  views: number;
  sessions: number;
  average_duration_ms: number;
  total_duration_ms: number;
  longest_duration_ms: number;
}

export interface ProcureGuardUsageClickMetric {
  target_label: string;
  target_tag: string;
  target_href: string | null;
  path: string;
  clicks: number;
  users: number;
  average_click_delay_ms: number;
  slowest_click_delay_ms: number;
}

export interface ProcureGuardUsageUserMetric {
  user_email: string;
  user_name: string;
  page_views: number;
  clicks: number;
  sessions: number;
  average_page_duration_ms: number;
  average_click_delay_ms: number;
  last_seen_at: string;
}

export interface ProcureGuardUsageRecentEvent {
  id: number;
  event_type: 'page_view' | 'click';
  user_email: string;
  user_name: string;
  path: string;
  page_title: string | null;
  target_text: string | null;
  target_href: string | null;
  duration_ms: number | null;
  occurred_at: string;
}

export interface ProcureGuardAdminAnalyticsData {
  actor: ProcureGuardActor;
  pending_review: number;
  summary: ProcureGuardUsageSummary;
  page_metrics: ProcureGuardUsagePageMetric[];
  click_metrics: ProcureGuardUsageClickMetric[];
  user_metrics: ProcureGuardUsageUserMetric[];
  recent_events: ProcureGuardUsageRecentEvent[];
  generated_at: string;
}

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  reference_number?: string;
  error?: string;
}






