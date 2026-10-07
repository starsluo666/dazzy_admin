import type { AdminPage } from '../types'

export interface WorkTarget { page: AdminPage; query: Record<string, string> }
export interface WorkTodo {
  key: string; label: string; group: 'urgent' | 'finance' | 'system' | 'support' | 'review'; priority: string
  count: number; unread_count: number; overdue_count: number; oldest_at: string | null
  target: WorkTarget; reminder_hours: number; signals: string[]
}
export interface WorkSummary {
  todos: WorkTodo[]; total: number; unread_count: number; overdue_count: number; updated_at: string; viewer: string
}
export interface WorkItem {
  queue: string; object_id: string; event_version: string; title: string; reference: string
  created_at: string; read: boolean; overdue: boolean; target: WorkTarget
}
export const workGroups = [
  { key: 'urgent', label: '紧急异常' }, { key: 'finance', label: '资金核查' }, { key: 'system', label: '系统任务' },
  { key: 'support', label: '客服处理' }, { key: 'review', label: '业务审核' },
] as const

export interface FinanceWorkItem {
  id: string; reference: string; provider_name: string; city_code: string; amount: number | null
  status: string; status_label: string; reason: string; last_queried_at: string | null; order_no: string
  checks: Array<{ label: string; actual: number; expected: number }>
}
export const financeWorkQueues = [
  { key: 'distribution_attention', label: '分账结果待核查' },
  { key: 'distribution_preflight_attention', label: '分账前置核验异常' },
  { key: 'distribution_credit_attention', label: '分账成功未入余额' },
  { key: 'withdrawal_attention', label: '提现结果及流水待核查' },
  { key: 'income_reconciliation', label: '达人余额核账' },
] as const

export function unseenWork(todos: WorkTodo[], seen: Set<string>) {
  return todos.filter(todo => todo.unread_count > 0 && todo.signals.some(signal => !seen.has(signal)))
}
export function waitLabel(iso: string | null, now = Date.now()) {
  if (!iso) return '暂无待办'
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000))
  if (!Number.isFinite(minutes)) return '待处理'
  return minutes < 60 ? `${minutes} 分钟` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时` : `${Math.floor(minutes / 1440)} 天`
}
