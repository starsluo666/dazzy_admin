export interface RefundPolicy { single_limit: number; daily_limit: number; daily_used: number; daily_remaining: number; can_approve: boolean; supervisor: boolean; timezone: string }

export interface RefundContext {
  reference: string; customer: string; paid: number; refunded: number; occupied: number; remaining: number
  components: Array<{ key: string; label: string; paid: number; remaining: number }>
  open_case_no: string; blocked_reason: string; notice: string; can_create: boolean
  policy: RefundPolicy
}
