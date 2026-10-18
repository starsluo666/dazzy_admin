export interface RefundPolicy { single_limit: number; daily_limit: number; daily_used: number; daily_remaining: number; can_approve: boolean; supervisor: boolean; timezone: string }

export interface RefundContext {
  reference: string; customer: string; paid: number; refunded: number; occupied: number; remaining: number
  components: Array<{ key: string; label: string; paid: number; remaining: number }>
  open_case_no: string; blocked_reason: string; notice: string; can_create: boolean
  policy: RefundPolicy
  manual?: { eligible: boolean; remaining: number; completed_amount: number; occupied_amount: number; open_case_no: string; blocked_reason: string; notice: string; can_create: boolean }
}

export interface ManualRefundCase {
  case_no: string; order_no: string; customer_name: string; provider_name: string; requested_amount: number
  reason: string; status: string; status_label: string; revision: number; created_at: string; updated_at: string
  created_by: string; processed_by: string; reviewed_by: string; receipt_no: string; evidence_reference: string
  handling_note: string; review_note: string; paid_at: string | null; closed_at: string | null; notice: string
  actions: string[]; records?: Array<{ action: string; actor__nickname: string; after: Record<string, unknown>; created_at: string }>
}
