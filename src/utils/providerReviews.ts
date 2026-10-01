import type { ProviderChangeReviewKind } from '../types'

export type ProviderReviewMode = 'application' | ProviderChangeReviewKind
export type ProviderReviewSummary = {
  applications: number
  onboarding: number
  profile_changes: number
  service_changes: number
  total: number
}

export const providerReviewQueues = [
  { mode: 'application', count: 'applications', todo: 'provider_application_review', label: '入驻初审', description: '审核达人入驻意向；通过后申请人进入达人端完成实名、正式资料和服务配置' },
  { mode: 'onboarding', count: 'onboarding', todo: 'provider_onboarding_review', label: '开通审核', description: '综合核验实名认证、达人资料和首次服务配置；全部通过后开通接单资格' },
  { mode: 'profile', count: 'profile_changes', todo: 'provider_profile_review', label: '资料变更', description: '审核已开通达人的公开资料变更；通过后更新展示内容' },
  { mode: 'service', count: 'service_changes', todo: 'provider_service_review', label: '服务变更', description: '审核已开通达人的新增、修改和重新上架服务；通过后正式生效' },
] as const

export function parseProviderReviewMode(value: unknown): ProviderReviewMode {
  return providerReviewQueues.find(queue => queue.mode === value)?.mode ?? 'application'
}

export function parseProviderReviewStatus(value: unknown, mode: ProviderReviewMode) {
  if (value === 'approved' || value === 'rejected') return value
  if (value === 'suspended' && mode === 'application') return value
  return 'pending'
}

export function providerReviewModeForTodo(key: string): ProviderReviewMode | null {
  // Allow the previous API response during staggered deployments.
  if (key === 'provider_review') return 'application'
  return providerReviewQueues.find(queue => queue.todo === key)?.mode ?? null
}

export function firstPendingProviderReview(summary: ProviderReviewSummary): ProviderReviewMode {
  return providerReviewQueues.find(queue => summary[queue.count] > 0)?.mode ?? 'application'
}

export function providerReviewNotice(summary: ProviderReviewSummary, previous: ProviderReviewSummary | null) {
  const increased = providerReviewQueues.filter(queue => (
    summary[queue.count] > (previous?.[queue.count] ?? 0)
  ))
  if (!increased.length) return null
  return {
    mode: increased[0]!.mode,
    message: increased.map(queue => `${queue.label} ${summary[queue.count] - (previous?.[queue.count] ?? 0)} 条`).join('、'),
  }
}
