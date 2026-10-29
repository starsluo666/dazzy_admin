export const contentKinds = [
  ['nickname', '用户昵称'], ['avatar', '用户头像'], ['provider', '达人公开资料'],
  ['profile_revision', '达人资料修订'], ['service', '达人服务说明'],
  ['service_revision', '达人服务修订'], ['activity', '活动内容'], ['review', '订单评价'],
] as const
export const contentStates = [
  ['manual', '待人工复核'], ['queued', '等待检测'], ['processing', '检测中'],
  ['approved', '内容审核通过'], ['rejected', '内容审核未通过'], ['withdrawn', '已下架'],
] as const
export const contentActions: Record<string, string> = {
  approve: '核实通过', reject: '驳回内容', withdraw: '下架内容', restore: '恢复内容', retry: '重新检测',
  submitted: '提交审核', superseded: '新版本替代', machine_result: '自动检测结果',
}
export interface ContentReview {
  id: number; public_id: string; kind: string; kind_label: string; target_id: number; owner: string
  status: string; status_label: string; revision: number; is_current: boolean; reason: string
  machine_suggestion: string; created_at: string; title: string
  text?: Record<string, string>
  blocking_review?: { id: number; public_id: string } | null
  target_available?: boolean
  assets?: { id: string; kind: string; url: string | null }[]
  items?: { position: number; kind: string; state: string; suggestion: string; label: string; score: number | null; error_code: string; request_id: string; task_id: string }[]
  events?: { action: string; revision: number; actor: string; note: string; created_at: string }[]
}
export interface ContentReviewList {
  items: ContentReview[]; pagination: { page: number; page_size: number; total: number }
  enabled: boolean; automatic: boolean
}
