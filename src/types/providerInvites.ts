export interface InviteConfig { enabled: boolean; store_reward_amount: number; provider_reward_amount: number; revision: number }
export interface InviteSource { public_id: string; code: string; kind: 'store' | 'provider'; name: string; active: boolean; revision: number; invite_url: string; qr_data?: string }
export interface InviteReward {
  public_id: string; source: InviteSource; source_name_snapshot: string; code_snapshot: string; amount: number
  invitee_public_id: string; profile_id: number; invitee_phone_masked: string; real_name: string; service_city_name: string
  application_status: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; status_label: string
  review_note: string; reviewed_at: string | null; paid_at: string | null; transfer_reference: string | null
  payout_note: string; created_at: string; revision: number
}
export interface InvitePage<T> { items: T[]; pagination: { page: number; page_size: number; total: number } }
export interface RewardPage extends InvitePage<InviteReward> { summary: Array<{ status: string; count: number; amount: number }> }
export interface RewardAction { action: 'approve' | 'reject' | 'paid'; revision: number; note: string; confirmed: boolean; transfer_reference?: string; paid_at?: string }
