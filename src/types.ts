export interface AdminMe {
  user: { nickname: string; phone: string; avatar_url?: string }
  organization: { id?: number; name: string } | null
  role_name: string
  permissions: string[]
  data_scope: string
  city_codes: string[]
}

export type AdminPage = 'dashboard' | 'users' | 'providers' | 'provider_reviews' | 'services' | 'platform_settings' | 'provider_rules' | 'activities' | 'orders' | 'after_sales' | 'system' | 'tasks' | 'audit_logs'

export type AdminRoleDataScope = 'all' | 'organization' | 'city'

export interface AdminOrganization {
  id: number
  name: string
  code: string
  organization_type: 'platform' | 'regional_agent' | 'city_agent'
  organization_type_label: string
  city_codes: string[]
  status: 'active' | 'disabled'
  status_label: string
}

export interface AdminPermissionGroup {
  key: string
  label: string
  permissions: Array<{ code: string; label: string }>
}

export interface AdminRole {
  id: number
  organization: number | null
  organization_name: string | null
  name: string
  code: string
  permissions: string[]
  data_scope: AdminRoleDataScope
  data_scope_label: string
  is_system: boolean
  member_count: number
  created_at: string
  updated_at: string
}

export interface AdminOrganizationMember {
  id: number
  user: number
  user_public_id: string
  user_name: string
  phone: string
  account_status: string
  organization: number
  organization_name: string
  role: number
  role_name: string
  role_code: string
  data_scope: AdminRoleDataScope
  data_scope_label: string
  is_system_role: boolean
  city_codes: string[]
  is_active: boolean
  is_self: boolean
  created_at: string
  updated_at: string
}

export interface ProviderOrderingSetting { location_report_interval_seconds: number; location_timeout_minutes: number; max_location_accuracy_m: number; acceptance_timeout_minutes: number; updated_at: string }

export interface PlatformOperationSetting {
  provider_order_payment_timeout_minutes: number
  provider_order_confirmation_timeout_days: number
  activity_payment_timeout_minutes: number
  activity_minimum_advance_hours: number
  activity_maximum_advance_days: number
  activity_settlement_confirmation_hours: number
  activity_settlement_risk_freeze_days: number
  updated_at: string
}

export interface AdminAuditLog {
  id: number
  actor_name: string
  organization_name: string | null
  action: string
  target_type: string
  target_id: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export type ScheduledTaskType =
  | 'provider_order_payment_expiry'
  | 'provider_acceptance_timeout'
  | 'provider_order_confirmation_timeout'
export type ScheduledTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface AdminScheduledTask {
  public_id: string
  task_type: ScheduledTaskType
  task_type_label: string
  business_type: string
  business_key: string
  status: ScheduledTaskStatus
  status_label: string
  scheduled_at: string
  available_at: string
  attempt_count: number
  max_attempts: number
  started_at: string | null
  finished_at: string | null
  last_error: string
  payload: Record<string, unknown>
  result: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ScheduledTaskSummary {
  total: number
  pending: number
  running: number
  succeeded_today: number
  failed: number
  overdue: number
}

export type ActivityStatus = 'draft' | 'pending_review' | 'rejected' | 'recruiting' | 'formed' | 'in_progress' | 'completed' | 'cancelled' | 'failed_to_form'

export interface AdminActivityPublishOrder {
  order_no: string
  status: 'pending_payment' | 'paid' | 'cancelled' | 'partially_refunded' | 'refunded'
  status_label: string
  aa_principal_amount: number
  platform_service_fee_amount: number
  payable_amount: number
  pricing_snapshot: Record<string, unknown>
  paid_at: string | null
}

export interface AdminActivityRefundRecord {
  refund_no: string
  refund_type: 'review_rejection' | 'admin_cancellation' | 'organizer_cancellation' | 'failed_to_form'
  refund_type_label: string
  status: 'simulated_refunded'
  status_label: string
  principal_amount: number
  service_fee_amount: number
  refund_amount: number
  retained_principal_amount: number
  retained_service_fee_amount: number
  retained_principal_destination: string
  beneficiary_name: string
  reason: string
  operator_name: string | null
  refunded_at: string
}

export interface AdminActivityParticipant {
  public_id: string
  nickname: string
  phone_masked: string
  status: 'pending_payment' | 'active' | 'cancelled' | 'expired'
  status_label: string
  joined_at: string | null
  cancelled_at: string | null
  payment_expires_at?: string | null
  payable_amount?: number
  payment_orders?: Array<{
    order_no: string
    status: ActivityParticipationPaymentStatus
    status_label: string
    channel: ActivityPaymentChannel
    channel_label: string
    payable_amount: number
    expires_at: string
    paid_at: string | null
  }>
  refund_orders?: ActivityParticipationRefundSummary[]
  after_sales_cases?: Array<{
    case_no: string
    status: ActivityAfterSalesStatus
    status_label: string
    reason_label: string
  }>
}

export type ActivityPaymentChannel = 'mock_wechat' | 'mock_alipay' | 'wechat' | 'alipay'
export type ActivityParticipationPaymentStatus = 'pending_payment' | 'paid' | 'closed' | 'partially_refunded' | 'refunded'
export type ActivityParticipationRefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type ActivityAfterSalesStatus = 'pending' | 'processing' | 'approved' | 'rejected'
export type ActivitySettlementStatus = 'confirming' | 'risk_frozen' | 'dispute_frozen' | 'settled'

export interface ActivityParticipationRefundSummary {
  refund_no: string
  refund_type: string
  refund_type_label: string
  status: ActivityParticipationRefundStatus
  status_label: string
  principal_refund_amount: number
  service_fee_refund_amount: number
  refund_amount: number
  retained_principal_amount: number
  retained_service_fee_amount: number
  retained_principal_destination: 'none' | 'organizer' | 'platform'
  retained_principal_destination_label?: string
  reason: string
  requested_at: string
  refunded_at: string | null
}

export interface AdminActivityParticipationPayment {
  order_no: string
  activity_id: number
  activity_title: string
  city_code: string
  city_name: string
  payer_name: string
  payer_phone_masked: string
  aa_principal_amount: number
  platform_service_fee_amount: number
  payable_amount: number
  channel: ActivityPaymentChannel
  channel_label: string
  status: ActivityParticipationPaymentStatus
  status_label: string
  gateway_trade_no: string
  expires_at: string
  paid_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminActivityParticipationRefund extends ActivityParticipationRefundSummary {
  payment_order_no: string
  activity_id: number
  activity_title: string
  city_code: string
  city_name: string
  beneficiary_name: string
  beneficiary_phone_masked: string
  operator_name: string | null
  created_at: string
  updated_at: string
}

export interface AdminActivityAfterSales {
  case_no: string
  activity_id: number
  activity_title: string
  city_code: string
  city_name: string
  applicant_name: string
  applicant_phone_masked: string
  reason: string
  reason_label: string
  description: string
  evidence_count: number
  status: ActivityAfterSalesStatus
  status_label: string
  requested_principal_amount: number
  requested_service_fee_amount: number
  requested_amount: number
  approved_principal_amount: number | null
  approved_service_fee_amount: number | null
  approved_amount: number | null
  result_note: string
  reviewed_by_name: string | null
  reviewed_at: string | null
  refund_order: ActivityParticipationRefundSummary | null
  created_at: string
  updated_at: string
}

export interface AdminActivityFinanceSummary {
  paid_count: number
  pending_payment_count: number
  refund_count: number
  refunded_amount: number
  open_after_sales_count: number
  confirming_settlement_count: number
  frozen_settlement_count: number
  disputed_settlement_count: number
  settled_count: number
  settled_amount: number
}

export interface AdminActivitySettlement {
  settlement_no: string
  activity_id: number
  activity_title: string
  city_code: string
  city_name: string
  beneficiary_name: string
  beneficiary_phone_masked: string
  status: ActivitySettlementStatus
  status_label: string
  organizer_principal_amount: number
  participant_principal_amount: number
  retained_participant_principal_amount: number
  settlement_amount: number
  platform_service_fee_amount: number
  available_balance_amount: number
  confirmation_started_at: string
  confirmation_deadline: string
  risk_frozen_at: string | null
  freeze_until: string
  dispute_source: '' | 'after_sales' | 'admin'
  dispute_source_label: string
  dispute_reason: string
  calculation_snapshot: Record<string, unknown>
  settled_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminActivity {
  id: number
  title: string
  status: ActivityStatus
  status_label: string
  category_name: string
  category_slug: string
  organizer_public_id: string
  organizer_name: string
  organizer_phone_masked: string
  organizer_verification_status: VerificationStatus
  organizer_verification_status_label: string
  organizer_account_status: AccountStatus
  organizer_account_status_label: string
  cover_url: string | null
  city_code: string
  city_name: string
  starts_at: string
  ends_at: string
  formation_deadline: string
  meeting_place_name: string
  meeting_address: string
  source_longitude: string | number
  source_latitude: string | number
  capacity: number
  min_participants: number
  participant_count: number
  description: string
  participation_rules: string
  aa_principal_amount: number
  refund_template_version: string
  refund_rule_snapshot: Record<string, unknown>
  publish_order: AdminActivityPublishOrder | null
  published_at: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  rejection_reason: string
  cancellation_reason: string
  cancelled_by_name: string | null
  cancelled_at: string | null
  refund_records: AdminActivityRefundRecord[]
  report_count: number
  settlement?: AdminActivitySettlement | null
  participants: AdminActivityParticipant[]
  created_at: string
  updated_at: string
}

export interface AdminActivitySummary {
  total: number
  pending_review: number
  active: number
  ended: number
}

export interface AdminActivityCategory {
  id: number
  name: string
  slug: string
  icon_object_key: string
  icon_url: string | null
  city_codes: string[]
  min_capacity: number
  max_capacity: number
  min_aa_principal_amount: number
  max_aa_principal_amount: number
  content_guidance: string
  sort_order: number
  is_active: boolean
  activity_count: number
  active_activity_count: number
  created_at: string
  updated_at: string
}

export interface AdminActivityCategorySummary {
  total: number
  active: number
  inactive: number
  active_activities: number
}

export interface AdminActivityCategoryMutation {
  name: string
  slug: string
  icon_object_key: string
  city_codes: string[]
  min_capacity: number
  max_capacity: number
  min_aa_principal_amount: number
  max_aa_principal_amount: number
  content_guidance: string
  sort_order: number
  is_active: boolean
}

export type ActivityReportStatus = 'pending' | 'processing' | 'resolved' | 'rejected'

export interface AdminActivityReport {
  case_no: string
  activity_id: number
  activity_title: string
  activity_status: ActivityStatus
  city_code: string
  city_name: string
  organizer_name: string
  reporter_name: string
  reporter_phone_masked: string
  reason: string
  reason_label: string
  description: string
  status: ActivityReportStatus
  status_label: string
  result_note: string
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminActivityReportSummary {
  total: number
  pending: number
  processing: number
  resolved: number
}

export interface AdminServiceCategory {
  id: number
  name: string
  slug: string
  icon_object_key: string
  icon_url: string | null
  city_codes: string[]
  sort_order: number
  is_active: boolean
  service_count: number
  active_service_count: number
  provider_count: number
  created_at: string
  updated_at: string
}

export interface AdminServiceCategorySummary {
  total: number
  active: number
  inactive: number
  active_services: number
}

export interface AdminServiceCategoryMutation {
  name: string
  slug: string
  icon_object_key: string
  city_codes: string[]
  sort_order: number
  is_active: boolean
}

export type ProviderApplicationStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type Gender = 'unspecified' | 'male' | 'female'
export type AccountStatus = 'active' | 'restricted' | 'suspended' | 'closed'
export type UserRiskLevel = 'low' | 'medium' | 'high'

export interface AdminUserRiskFlag {
  level: UserRiskLevel
  level_label: string
  reason: string
  is_active: boolean
  marked_by_name: string
  marked_at: string
  cleared_by_name: string | null
  cleared_at: string | null
  updated_at: string
}

export interface AdminUserRecentOrder {
  order_no: string
  service_name: string
  provider_name: string
  status: ProviderOrderStatus
  status_label: string
  payable_amount: number
  created_at: string
}

export interface AdminUserRecentActivity {
  id: number
  title: string
  status: string
  status_label: string
  starts_at: string
}

export interface AdminUserAddress {
  id: number
  name: string
  address: string
  city_name: string
  contact_name: string
  contact_gender: 'mr' | 'ms' | ''
  contact_gender_label: string
  contact_phone: string
  longitude: string | number
  latitude: string | number
  is_default: boolean
  updated_at: string
}

export interface AdminUser {
  public_id: string
  nickname: string
  phone_masked: string
  avatar_url: string | null
  gender: Gender
  gender_label: string
  birth_date: string | null
  verification_status: VerificationStatus
  verification_status_label: string
  account_status: AccountStatus
  account_status_label: string
  identity: 'user' | 'provider'
  provider_status: ProviderApplicationStatus | null
  provider_status_label: string | null
  risk_flag: AdminUserRiskFlag | null
  order_count: number
  activity_count: number
  date_joined: string
  last_login: string | null
  recent_orders?: AdminUserRecentOrder[]
  recent_activities?: AdminUserRecentActivity[]
  addresses?: AdminUserAddress[]
}

export interface AdminUserSummary {
  total: number
  verified: number
  providers: number
  flagged: number
  suspended: number
}

export interface ProviderApplication {
  id: number
  public_id: string
  nickname: string
  phone: string
  verification_status: VerificationStatus
  gender: Gender
  birth_date: string | null
  status: ProviderApplicationStatus
  lifestyle_photo_url: string | null
  service_city_code: string
  service_city_name: string
  bio: string
  max_service_radius_km: number
  service_names: string[]
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string
}

export interface AdminProviderService {
  id: number
  category: string
  billing_type: 'hourly' | 'per_session'
  billing_type_label: string
  price_amount: number
  estimated_duration_minutes: number | null
  description: string
  is_active: boolean
}

export interface AdminProviderAvailability {
  weekday: number
  weekday_label: string
  starts_at: string
  ends_at: string
  is_active: boolean
}

export interface AdminProviderCreditAdjustment {
  id: number
  delta: number
  before_score: number
  after_score: number
  reason: string
  operator_name: string
  organization_name: string | null
  created_at: string
}

export interface AdminProviderRecentOrder {
  order_no: string
  customer_name: string
  service_name: string
  status: ProviderOrderStatus
  status_label: string
  payable_amount: number
  created_at: string
}

export interface AdminProvider {
  id: number
  public_id: string
  nickname: string
  phone_masked: string
  gender: Gender
  gender_label: string
  birth_date: string | null
  verification_status: VerificationStatus
  verification_status_label: string
  account_status: AccountStatus
  account_status_label: string
  status: ProviderApplicationStatus
  status_label: string
  bio: string
  lifestyle_photo_available: boolean
  lifestyle_photo_url: string | null
  service_city_code: string
  service_city_name: string
  is_online: boolean
  has_live_location: boolean
  current_longitude: string | null
  current_latitude: string | null
  location_accuracy_m: string | null
  location_updated_at: string | null
  location_expires_at: string | null
  max_service_radius_km: number
  rating: string
  service_count: number
  order_count: number
  credit_score: number
  is_accepting_orders: boolean
  admin_order_restricted: boolean
  admin_restriction_reason: string
  service_names: string[]
  services: AdminProviderService[]
  weekly_availability: AdminProviderAvailability[]
  credit_adjustments: AdminProviderCreditAdjustment[]
  recent_orders?: AdminProviderRecentOrder[]
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string
  created_at: string
  updated_at: string
}

export interface AdminProviderSummary {
  total: number
  accepting: number
  restricted: number
  suspended: number
  pending: number
}

export type ProviderOrderStatus =
  | 'pending_payment'
  | 'pending_acceptance'
  | 'pending_support'
  | 'pending_service'
  | 'departed'
  | 'in_service'
  | 'pending_confirmation'
  | 'pending_review'
  | 'completed'
  | 'cancelled'
  | 'after_sales'
  | 'refunded'

export type FulfillmentStage = 'all' | 'active' | 'pending_confirmation' | 'ended'
export type FulfillmentAnomalyFilter =
  | 'all'
  | 'any'
  | 'missing_evidence'
  | 'timeline_gap'
  | 'confirmation_overdue'

export interface FulfillmentAnomaly {
  code: Exclude<FulfillmentAnomalyFilter, 'all' | 'any'>
  label: string
}

export interface ProviderOrderSupportNote {
  id: number
  author_name: string
  organization_name: string | null
  content: string
  created_at: string
}

export type AfterSalesCaseType = 'refund' | 'service_dispute' | 'provider_cancel' | 'other'
export type AfterSalesCaseStatus = 'pending' | 'processing' | 'approved' | 'rejected'

export interface AdminAfterSalesCase {
  public_id: string
  case_no: string
  case_type: AfterSalesCaseType
  case_type_label: string
  status: AfterSalesCaseStatus
  status_label: string
  order_no: string
  order_status: ProviderOrderStatus
  order_status_label: string
  order_payable_amount: number
  customer_name: string
  provider_name: string
  service_name: string
  service_city_code: string
  service_city_name: string
  requested_amount: number
  approved_amount: number | null
  reason: string
  result_note: string
  creator_name: string
  organization_name: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface AfterSalesSummary {
  total: number
  pending: number
  processing: number
  approved: number
}

export interface AdminProviderOrder {
  public_id: string
  order_no: string
  status: ProviderOrderStatus
  status_label: string
  customer_public_id: string
  customer_name: string
  customer_phone_masked: string
  provider_public_id: string
  provider_name: string
  provider_phone_masked: string
  service_name: string
  service_city_code: string
  service_city_name: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  meeting_location_name: string
  meeting_address: string
  contact_name: string
  contact_gender: 'mr' | 'ms' | ''
  contact_gender_label: string
  contact_phone_masked: string
  note: string
  unit_price_amount: number
  service_fee_amount: number
  transport_fee_amount: number
  other_fee_amount: number
  discount_amount: number
  payable_amount: number
  paid_at: string | null
  accepted_at: string | null
  departed_at: string | null
  arrival_photo_available: boolean
  arrival_photo_uploaded_at: string | null
  arrival_location: null | {
    longitude: string
    latitude: string
    accuracy_m: string | null
  }
  service_started_at: string | null
  completion_submitted_at: string | null
  confirmation_expires_at: string | null
  customer_confirmed_at: string | null
  auto_confirmed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  anomalies: FulfillmentAnomaly[]
  support_notes: ProviderOrderSupportNote[]
  after_sales_cases: AdminAfterSalesCase[]
  review: {
    rating: number
    content: string
    customer_name: string
    is_anonymous: boolean
    image_urls: string[]
    created_at: string
    is_visible: boolean
  } | null
}

export interface ProviderOrderSummary {
  total: number
  active: number
  pending_confirmation: number
  anomalies: number
}
