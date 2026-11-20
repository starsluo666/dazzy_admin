export interface FirstOrderRule { enabled: boolean; mode: 'fixed' | 'percentage'; amount: number; rate_bps: number }
export interface InviteConfig {
  enabled: boolean; store_reward_amount: number; provider_reward_amount: number; revision: number
  store_registration_enabled: boolean; provider_registration_enabled: boolean
  store_first_order: FirstOrderRule; provider_first_order: FirstOrderRule
}
export interface InviteSource {
  public_id: string; code: string; kind: 'store' | 'provider'; name: string; active: boolean
  revision: number; invite_url: string; qr_data?: string
  store_account_bound?: boolean; store_phone_masked?: string; store_identity_status?: string
}
export interface StoreIdentity {
  identity_real_name: string; identity_number_masked: string; identity_status: string
  identity_front_photo_url: string; identity_back_photo_url: string; identity_face_photo_url: string
}
export interface InviteReward {
  public_id: string; source: InviteSource; source_name_snapshot: string; code_snapshot: string; amount: number
  invitee_public_id: string; profile_id: number; invitee_phone_masked: string; real_name: string; service_city_name: string
  application_status: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; status_label: string
  review_note: string; reviewed_at: string | null; paid_at: string | null; transfer_reference: string | null
  payout_note: string; created_at: string; revision: number
  reward_kind_label?: string; order_no?: string | null; order_completed_at?: string | null
  payout_method?: 'manual' | 'balance'; payout_status?: string | null
  payout_request_no?: string | null; payout_blocker?: string
}
export interface InvitePage<T> { items: T[]; pagination: { page: number; page_size: number; total: number } }
export interface RewardPage extends InvitePage<InviteReward> { summary: Array<{ status: string; count: number; amount: number }> }
export interface RewardAction { action: 'approve' | 'reject' | 'paid'; revision: number; note: string; confirmed: boolean; transfer_reference?: string; paid_at?: string }
