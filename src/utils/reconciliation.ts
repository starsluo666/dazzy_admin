export interface ReconciliationRow {
  id: string | number
  data_date: string
  bill_label: string
  status: string
  status_label: string
  checked_at?: string | null
  open_count?: number
  summary?: { channel_count?: number; matched_count?: number; fee_unverified_count?: number; coverage?: string }
  reference?: string
  message?: string
  revision?: number
  evidence?: { local_amount?: number; channel_amount?: number; local_fee?: number | null; channel_fee?: number | null; fields?: string[]; count?: number; request_seq?: string; request_date?: string }
  events?: Array<{ action: string; note: string; evidence_reference: string; created_at: string; actor?: string }>
}
export const billTypes = [
  ['TRADE_BILL', '交易及退款账单'], ['SPLIT_BILL', '分账账单'], ['WITHDRAWAL_BILL', '出金账单'],
  ['SETTLE_BILL', '商户结算账单'], ['SETTLE_USER_BILL', '用户结算账单'],
] as const
