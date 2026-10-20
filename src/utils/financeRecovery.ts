export interface RecoveryCase {
  id: number; case_no: string; kind: string; kind_label: string; target_id: number; reference: string
  status: 'open' | 'review' | 'resolved' | 'restored'; status_label: string; revision: number
  resolution: 'record' | 'resume'; created_at: string; queried_at: string | null
  current_state?: string; current_reason?: string; current_amount?: number | null
  events?: Array<{ action: string; note: string; evidence_reference: string; actor: string; created_at: string }>
}
export interface PaymentJobHealth {
  id: number | null; key: string; label: string; state: string; reason: string; alert: boolean
  started_at: string | null; finished_at: string | null; succeeded_at: string | null; quiet_seconds: number
}
export interface RecoveryList {
  items: RecoveryCase[]; total: number; pools_total: number; recovery_enabled: boolean
  pools: Array<{ id: number; reference: string; reason: string }>
}
