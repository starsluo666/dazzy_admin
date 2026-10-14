export type RefundComponent = 'service' | 'transport' | 'other'
export type FulfillmentResponsibility = 'customer' | 'provider' | 'both' | 'neither'
export interface FulfillmentRefundInput {
  revision: number
  responsibility: FulfillmentResponsibility
  mode: 'policy' | 'manual'
  occurred_at: string
  customer_no_show: boolean
  component_refunds?: Record<RefundComponent, number>
  result_note: string
  facts_confirmed: boolean
}
export interface FulfillmentRefundContext {
  case_no: string
  order_no: string
  revision: number
  paid: number
  refunded: number
  components: { key: RefundComponent; label: string; paid: number; remaining: number }[]
  timeline: Record<string, string | null>
  transport_mode: string
  policy_available: boolean
  policy_clauses: string[]
  blocked_reason: string
  can_preview: boolean
  can_approve: boolean
  policy: { single_limit: number; daily_limit: number; daily_remaining: number; supervisor: boolean }
  proposed?: FulfillmentRefundInput | null
}
export interface FulfillmentRefundQuote {
  token: string
  label: string
  stage: string
  responsibility_label: string
  occurred_at: string
  component_refunds: Record<RefundComponent, number>
  refund_amount: number
  remaining_amount: number
  routes: { wallet: number; external: number }
  requires_supervisor: boolean
}
