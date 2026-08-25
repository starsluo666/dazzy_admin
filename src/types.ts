export interface AdminMe {
  user: { nickname: string; phone: string; avatar_url?: string }
  organization: { id?: number; name: string } | null
  role_name: string
  permissions: string[]
  data_scope: string
  city_codes: string[]
}

export type AdminPage = 'dashboard' | 'users' | 'providers' | 'provider_reviews' | 'orders' | 'after_sales'

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
  service_location_name: string
  service_address: string
  map_source: 'amap' | 'tencent'
  source_longitude: string | null
  source_latitude: string | null
  has_service_location: boolean
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
  customer_confirmed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  anomalies: FulfillmentAnomaly[]
  support_notes: ProviderOrderSupportNote[]
  after_sales_cases: AdminAfterSalesCase[]
}

export interface ProviderOrderSummary {
  total: number
  active: number
  pending_confirmation: number
  anomalies: number
}
