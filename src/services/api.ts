import type {
  AccountStatus,
  ActivityStatus,
  AdminActivity,
  AdminActivityAfterSales,
  AdminActivityCategory,
  AdminActivityCategoryMutation,
  AdminActivityCategorySummary,
  AdminActivityFinanceSummary,
  AdminActivityParticipationPayment,
  AdminActivityParticipationRefund,
  AdminActivitySettlement,
  AdminActivityReport,
  AdminActivityReportSummary,
  AdminActivitySummary,
  AdminAuditLog,
  AdminAfterSalesCase,
  AdminMe,
  AdminOrganization,
  AdminOrganizationMember,
  AdminPermissionGroup,
  AdminProvider,
  AdminProviderOrder,
  AdminProviderSummary,
  AdminRole,
  AdminRoleDataScope,
  AdminScheduledTask,
  AdminSupportCase,
  AdminServiceCategory,
  AdminServiceCategoryMutation,
  AdminServiceCategorySummary,
  AdminUser,
  AdminUserSummary,
  AfterSalesCaseStatus,
  AfterSalesCaseType,
  AfterSalesSummary,
  FulfillmentAnomalyFilter,
  FulfillmentStage,
  ProviderApplication,
  ProviderChangeReview,
  ProviderChangeReviewKind,
  ProviderApplicationStatus,
  ProviderOrderStatus,
  ProviderOrderSummary,
  ProviderOrderSupportNote,
  ProviderOrderingSetting,
  ProviderOrderFinanceSummary,
  ProviderOrderPaymentRecord,
  ProviderOrderRefundRecord,
  ProviderOrderSettlementRecord,
  PlatformOperationSetting,
  UserRiskLevel,
  VerificationStatus,
  ActivityReportStatus,
  ScheduledTaskStatus,
  ScheduledTaskSummary,
  ScheduledTaskType,
  SupportCaseStatus,
  SupportCaseSummary,
  SupportCaseType,
  SupportTargetType,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const LEGACY_ACCESS_KEY = 'dazzy_admin_access_token'
const LEGACY_REFRESH_KEY = 'dazzy_admin_refresh_token'
let accessToken: string | null = null

// Remove tokens written by older admin builds. Refresh tokens now live only in
// the scoped HttpOnly cookie and access tokens stay in this tab's memory.
localStorage.removeItem(LEGACY_ACCESS_KEY)
localStorage.removeItem(LEGACY_REFRESH_KEY)

export const getAccessToken = () => accessToken

export const clearSession = () => {
  accessToken = null
  localStorage.removeItem(LEGACY_ACCESS_KEY)
  localStorage.removeItem(LEGACY_REFRESH_KEY)
}

let sessionExpiredHandler: (() => void) | null = null
let sessionExpiryNotified = false
let sessionExpiryNotificationSuppressed = false

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}

function notifySessionExpired() {
  if (sessionExpiryNotified || sessionExpiryNotificationSuppressed) return
  sessionExpiryNotified = true
  sessionExpiredHandler?.()
}

function errorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '请求失败'
  const record = payload as Record<string, unknown>
  if (typeof record.detail === 'string') return record.detail
  if (typeof record.message === 'string') return record.message
  if (record.error) return errorMessage(record.error)
  for (const value of Object.values(record)) {
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    if (value && typeof value === 'object') return errorMessage(value)
  }
  return '请求失败'
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : null
}

type RefreshResult =
  | { status: 'refreshed' }
  | { status: 'expired' }
  | { status: 'unavailable'; message: string }

let refreshPromise: Promise<RefreshResult> | null = null

async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/auth/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await parseResponse(response) as { data?: { access?: string } } | null
      if (response.ok && payload?.data?.access) {
        accessToken = payload.data.access
        sessionExpiryNotified = false
        return { status: 'refreshed' } as const
      }
      if (response.status === 401 || response.status === 403) {
        return { status: 'expired' } as const
      }
      return {
        status: 'unavailable',
        message: errorMessage(payload),
      } as const
    } catch {
      return {
        status: 'unavailable',
        message: '网络连接失败，暂时无法刷新登录状态',
      } as const
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function restoreAdminSession(): Promise<RefreshResult> {
  const result = await refreshAccessToken()
  if (result.status === 'expired') clearSession()
  return result
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const hadSession = Boolean(getAccessToken())
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...options.headers,
    },
  })
  const payload = await parseResponse(response) as { data?: T } | null
  if (response.status === 401 && hadSession) {
    if (!retried) {
      const refreshResult = await refreshAccessToken()
      if (refreshResult.status === 'refreshed') {
        return request<T>(path, options, true)
      }
      if (refreshResult.status === 'unavailable') {
        throw new Error(refreshResult.message)
      }
    }
    clearSession()
    notifySessionExpired()
    throw new Error('登录已过期，请重新登录')
  }
  if (!response.ok) throw new Error(errorMessage(payload))
  return payload?.data as T
}

type LatestRequestEntry = {
  controller: AbortController
  promise: Promise<unknown>
  successor?: LatestRequestEntry
}

const latestRequests = new Map<string, LatestRequestEntry>()

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

/**
 * Keep one active request for each list surface. Superseded callers resolve with
 * the newest response as well, so older view loads can never overwrite newer filters.
 */
function requestLatest<T>(key: string, path: string, options: RequestInit = {}): Promise<T> {
  const previous = latestRequests.get(key)
  const controller = new AbortController()
  const entry: LatestRequestEntry = { controller, promise: Promise.resolve() }
  const latestPromise = request<T>(path, { ...options, signal: controller.signal })
    .catch((error) => {
      if (isAbortError(error) && entry.successor) {
        return entry.successor.promise as Promise<T>
      }
      throw error
    })
    .finally(() => {
      if (latestRequests.get(key) === entry) latestRequests.delete(key)
    })
  entry.promise = latestPromise
  latestRequests.set(key, entry)
  if (previous) {
    previous.successor = entry
    previous.controller.abort()
  }
  return latestPromise
}

export interface ProviderApplicationQuery {
  status: ProviderApplicationStatus
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface ProviderOrderQuery {
  stage: FulfillmentStage
  anomaly: FulfillmentAnomalyFilter
  status?: ProviderOrderStatus | ''
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface AdminUserQuery {
  account_status?: AccountStatus | ''
  identity?: 'all' | 'provider' | 'user'
  risk?: 'all' | 'flagged' | 'unflagged'
  search?: string
  page?: number
  page_size?: number
}

export interface AdminProviderQuery {
  status?: ProviderApplicationStatus | ''
  accepting?: 'all' | 'accepting' | 'paused' | 'restricted'
  city_code?: string
  identity_status?: VerificationStatus | ''
  search?: string
  page?: number
  page_size?: number
}

export interface SupportCaseQuery {
  search?: string
  case_type?: SupportCaseType | ''
  target_type?: SupportTargetType | ''
  status?: SupportCaseStatus | ''
  status_group?: 'terminal' | ''
  city_code?: string
  page?: number
  page_size?: number
}

export interface AfterSalesQuery {
  status?: AfterSalesCaseStatus | ''
  case_type?: AfterSalesCaseType | ''
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface ProviderOrderFinanceQuery {
  record_type: 'payment' | 'refund' | 'settlement' | 'exception'
  status?: string
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface ServiceCategoryQuery {
  status?: 'all' | 'active' | 'inactive'
  search?: string
  page?: number
  page_size?: number
}

export interface AdminActivityQuery {
  status?: ActivityStatus | ''
  city_code?: string
  category?: string
  search?: string
  page?: number
  page_size?: number
}

export interface AdminActivityCategoryQuery {
  status?: 'all' | 'active' | 'inactive'
  search?: string
  page?: number
  page_size?: number
}

export interface AdminActivityReportQuery {
  status?: ActivityReportStatus | ''
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface AdminActivityFinanceQuery {
  record_type: 'payment' | 'refund' | 'after_sales' | 'settlement'
  status?: string
  city_code?: string
  search?: string
  page?: number
  page_size?: number
}

export interface AdminOrganizationMemberQuery {
  search?: string
  organization?: number | ''
  role?: number | ''
  status?: 'active' | 'inactive' | ''
}

export interface AdminRoleMutation {
  organization: number
  name: string
  code: string
  permissions: string[]
  data_scope: AdminRoleDataScope
}

export interface AdminOrganizationMemberMutation {
  phone?: string
  organization?: number
  role: number
  city_codes: string[]
  is_active: boolean
}

export interface ScheduledTaskQuery {
  task_type?: ScheduledTaskType | ''
  status?: ScheduledTaskStatus | ''
  search?: string
  overdue?: boolean
  page?: number
  page_size?: number
}

function queryString(query: object) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}

export const adminApi = {
  organizations: () => request<{ items: AdminOrganization[] }>('/admin/organizations/'),
  permissionCatalog: () => request<{
    groups: AdminPermissionGroup[]
    data_scopes: Array<{ value: AdminRoleDataScope; label: string }>
  }>('/admin/permissions/'),
  adminRoles: (organization: number | '' = '') => requestLatest<{
    items: AdminRole[]
    summary: { total: number; system: number; custom: number }
  }>('admin-roles', `/admin/roles/?${queryString({ organization })}`),
  createAdminRole: (payload: AdminRoleMutation) => request<AdminRole>('/admin/roles/', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateAdminRole: (roleId: number, payload: Partial<AdminRoleMutation>) => request<AdminRole>(`/admin/roles/${roleId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteAdminRole: (roleId: number) => request<void>(`/admin/roles/${roleId}/`, { method: 'DELETE' }),
  organizationMembers: (query: AdminOrganizationMemberQuery = {}) => requestLatest<{
    items: AdminOrganizationMember[]
    summary: { total: number; active: number; inactive: number; organizations: number }
  }>('admin-members', `/admin/members/?${queryString(query)}`),
  createOrganizationMember: (payload: AdminOrganizationMemberMutation & { phone: string; organization: number }) => request<AdminOrganizationMember>('/admin/members/', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateOrganizationMember: (memberId: number, payload: Partial<AdminOrganizationMemberMutation>) => request<AdminOrganizationMember>(`/admin/members/${memberId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  platformOperationSetting: () => request<PlatformOperationSetting>('/admin/operation-settings/platform/'),
  updatePlatformOperationSetting: (payload: Partial<PlatformOperationSetting>) => request<PlatformOperationSetting>('/admin/operation-settings/platform/', { method: 'PATCH', body: JSON.stringify(payload) }),
  providerOrderingSetting: () => request<ProviderOrderingSetting>('/admin/operation-settings/provider-ordering/'),
  updateProviderOrderingSetting: (payload: Partial<ProviderOrderingSetting>) => request<ProviderOrderingSetting>('/admin/operation-settings/provider-ordering/', { method: 'PATCH', body: JSON.stringify(payload) }),
  async login(phone: string, password: string) {
    const data = await request<{ access: string }>('/admin/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    })
    accessToken = data.access
    sessionExpiryNotified = false
  },
  async logout() {
    sessionExpiryNotificationSuppressed = true
    try {
      await request<void>('/admin/auth/logout/', { method: 'POST' })
    } finally {
      clearSession()
      sessionExpiryNotificationSuppressed = false
    }
  },
  me: () => request<AdminMe>('/admin/me/'),
  overview: (days: 7 | 30 = 7) => requestLatest<{
    metrics: Record<string, number | null>
    trend: {
      days: 7 | 30
      points: Array<{ date: string; transaction_amount: number; order_count: number }>
    }
    todos: Array<{ key: string; label: string; count: number; priority: string }>
  }>('admin-overview', `/admin/overview/?days=${days}`),
  serviceCategories: (query: ServiceCategoryQuery) => requestLatest<{
    items: AdminServiceCategory[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminServiceCategorySummary
  }>('admin-service-categories', `/admin/service-categories/?${queryString(query)}`),
  createServiceCategory: (payload: AdminServiceCategoryMutation) =>
    request<AdminServiceCategory>('/admin/service-categories/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateServiceCategory: (id: number, payload: Partial<AdminServiceCategoryMutation>) =>
    request<AdminServiceCategory>(`/admin/service-categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  activities: (query: AdminActivityQuery) => requestLatest<{
    items: AdminActivity[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivitySummary
  }>('admin-activities', `/admin/activities/?${queryString(query)}`),
  activity: (id: number) => request<AdminActivity>(`/admin/activities/${id}/`),
  reviewActivity: (id: number, decision: 'approve' | 'reject', reason = '') =>
    request<AdminActivity>(`/admin/activities/${id}/review/`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),
  changeActivityStatus: (id: number, reason: string) =>
    request<AdminActivity>(`/admin/activities/${id}/action/`, {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', reason }),
    }),
  activityCategories: (query: AdminActivityCategoryQuery) => requestLatest<{
    items: AdminActivityCategory[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityCategorySummary
  }>('admin-activity-categories', `/admin/activity-categories/?${queryString(query)}`),
  createActivityCategory: (payload: AdminActivityCategoryMutation) =>
    request<AdminActivityCategory>('/admin/activity-categories/', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  updateActivityCategory: (id: number, payload: Partial<AdminActivityCategoryMutation>) =>
    request<AdminActivityCategory>(`/admin/activity-categories/${id}/`, {
      method: 'PATCH', body: JSON.stringify(payload),
    }),
  activityReports: (query: AdminActivityReportQuery) => requestLatest<{
    items: AdminActivityReport[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityReportSummary
  }>('admin-activity-reports', `/admin/activity-reports/?${queryString(query)}`),
  reviewActivityReport: (
    caseNo: string,
    action: 'start_review' | 'resolve' | 'reject',
    resultNote = '',
  ) => request<AdminActivityReport>(
    `/admin/activity-reports/${encodeURIComponent(caseNo)}/action/`,
    { method: 'POST', body: JSON.stringify({ action, result_note: resultNote }) },
  ),
  activityFinance: (query: AdminActivityFinanceQuery) => requestLatest<{
    items: Array<AdminActivityParticipationPayment | AdminActivityParticipationRefund | AdminActivityAfterSales | AdminActivitySettlement>
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityFinanceSummary
  }>('admin-activity-finance', `/admin/activity-finance/?${queryString(query)}`),
  retryActivityRefund: (refundNo: string) => request<AdminActivityParticipationRefund>(
    `/admin/activity-refunds/${encodeURIComponent(refundNo)}/retry/`,
    { method: 'POST' },
  ),
  reviewActivityAfterSales: (
    caseNo: string,
    action: 'start_review' | 'approve' | 'reject',
    resultNote = '',
    approvedPrincipalAmount?: number,
    approvedServiceFeeAmount?: number,
  ) => request<AdminActivityAfterSales>(
    `/admin/activity-after-sales/${encodeURIComponent(caseNo)}/action/`,
    {
      method: 'POST',
      body: JSON.stringify({
        action,
        result_note: resultNote,
        ...(approvedPrincipalAmount === undefined ? {} : { approved_principal_amount: approvedPrincipalAmount }),
        ...(approvedServiceFeeAmount === undefined ? {} : { approved_service_fee_amount: approvedServiceFeeAmount }),
      }),
    },
  ),
  reviewActivitySettlement: (
    settlementNo: string,
    action: 'freeze_dispute' | 'release_dispute' | 'retry_settlement',
    reason = '',
  ) => request<AdminActivitySettlement>(
    `/admin/activity-settlements/${encodeURIComponent(settlementNo)}/action/`,
    { method: 'POST', body: JSON.stringify({ action, reason }) },
  ),
  providers: (query: ProviderApplicationQuery) => {
    const params = queryString(query)
    return requestLatest<{
      items: ProviderApplication[]
      pagination: { page: number; page_size: number; total: number }
    }>('admin-provider-applications', `/admin/provider-applications/?${params}`)
  },
  reviewProvider: (
    id: number,
    decision: 'approve' | 'reject',
    reason = '',
    allowedCategoryIds: number[] = [],
  ) =>
    request<ProviderApplication>(`/admin/provider-applications/${id}/review/`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, allowed_category_ids: allowedCategoryIds }),
    }),
  providerChangeReviews: (
    kind: ProviderChangeReviewKind,
    status: 'pending' | 'approved' | 'rejected' = 'pending',
    page = 1,
  ) => requestLatest<{
    items: ProviderChangeReview[]
    pagination: { page: number; page_size: number; total: number }
  }>(
    `provider-change-reviews-${kind}`,
    `/admin/provider-change-reviews/?${queryString({ kind, status, page, page_size: 20 })}`,
  ),
  reviewProviderChange: (
    kind: ProviderChangeReviewKind,
    id: number,
    decision: 'approve' | 'reject',
    reason = '',
  ) => request<{ id: number; kind: ProviderChangeReviewKind; status: string }>(
    `/admin/provider-change-reviews/${kind}/${id}/review/`,
    { method: 'POST', body: JSON.stringify({ decision, reason }) },
  ),
  reviewProviderIdentity: (id: number, decision: 'approve' | 'reject', reason = '') =>
    request<AdminProvider>(`/admin/providers/${id}/identity-review/`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),
  users: (query: AdminUserQuery) => requestLatest<{
    items: AdminUser[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminUserSummary
  }>('admin-users', `/admin/users/?${queryString(query)}`),
  user: (publicId: string) => request<AdminUser>(`/admin/users/${publicId}/`),
  changeUserAccount: (
    publicId: string,
    action: 'restrict' | 'suspend' | 'restore',
    reason: string,
  ) => request<AdminUser>(`/admin/users/${publicId}/account-action/`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  }),
  changeUserRisk: (
    publicId: string,
    action: 'mark' | 'clear',
    reason: string,
    level?: UserRiskLevel,
  ) => request<AdminUser>(`/admin/users/${publicId}/risk-action/`, {
    method: 'POST',
    body: JSON.stringify({ action, reason, ...(level ? { level } : {}) }),
  }),
  managedProviders: (query: AdminProviderQuery) => requestLatest<{
    items: AdminProvider[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminProviderSummary
  }>('admin-providers', `/admin/providers/?${queryString(query)}`),
  managedProvider: (id: number) => request<AdminProvider>(`/admin/providers/${id}/`),
  changeProviderStatus: (
    id: number,
    action: 'restrict_orders' | 'resume_orders' | 'suspend_qualification' | 'restore_qualification',
    reason: string,
  ) => request<AdminProvider>(`/admin/providers/${id}/action/`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  }),
  adjustProviderCredit: (id: number, delta: number, reason: string) =>
    request<AdminProvider>(`/admin/providers/${id}/credit-adjustment/`, {
      method: 'POST',
      body: JSON.stringify({ delta, reason }),
    }),
  providerOrders: (query: ProviderOrderQuery) => requestLatest<{
    items: AdminProviderOrder[]
    pagination: { page: number; page_size: number; total: number }
    summary: ProviderOrderSummary
  }>('admin-provider-orders', `/admin/provider-orders/?${queryString(query)}`),
  providerOrder: (orderNo: string) =>
    request<AdminProviderOrder>(`/admin/provider-orders/${encodeURIComponent(orderNo)}/`),
  providerOrderEvidence: (orderNo: string) =>
    request<{ url: string; expires_in: number }>(
      `/admin/provider-orders/${encodeURIComponent(orderNo)}/evidence/`,
    ),
  addProviderOrderSupportNote: (
    orderNo: string,
    content: string,
    marksCustomerContact = false,
  ) =>
    request<ProviderOrderSupportNote>(
      `/admin/provider-orders/${encodeURIComponent(orderNo)}/support-notes/`,
      {
        method: 'POST',
        body: JSON.stringify({ content, marks_customer_contact: marksCustomerContact }),
      },
    ),
  moderateProviderOrderReview: (
    orderNo: string,
    action: 'hide' | 'restore',
    reason = '',
  ) => request<AdminProviderOrder>(
    `/admin/provider-orders/${encodeURIComponent(orderNo)}/review/action/`,
    { method: 'POST', body: JSON.stringify({ action, reason }) },
  ),
  afterSalesCases: (query: AfterSalesQuery) => requestLatest<{
    items: AdminAfterSalesCase[]
    pagination: { page: number; page_size: number; total: number }
    summary: AfterSalesSummary
  }>('admin-order-after-sales', `/admin/order-after-sales/?${queryString(query)}`),
  afterSalesCase: (caseNo: string) =>
    request<AdminAfterSalesCase>(`/admin/order-after-sales/${encodeURIComponent(caseNo)}/`),
  providerOrderFinance: (query: ProviderOrderFinanceQuery) => requestLatest<{
    items: Array<ProviderOrderPaymentRecord | ProviderOrderRefundRecord | ProviderOrderSettlementRecord>
    pagination: { page: number; page_size: number; total: number }
    summary: ProviderOrderFinanceSummary
  }>('admin-provider-order-finance', `/admin/provider-order-finance/?${queryString(query)}`),
  retryProviderOrderRefund: (refundNo: string) => request<ProviderOrderRefundRecord>(
    `/admin/provider-order-refunds/${encodeURIComponent(refundNo)}/retry/`,
    { method: 'POST' },
  ),
  auditLogs: (query: { search?: string; action?: string; target_type?: string; page?: number; page_size?: number }) =>
    requestLatest<{ items: AdminAuditLog[]; pagination: { page: number; page_size: number; total: number } }>('admin-audit-logs', `/admin/audit-logs/?${queryString(query)}`),
  scheduledTasks: (query: ScheduledTaskQuery = {}) => requestLatest<{
    items: AdminScheduledTask[]
    pagination: { page: number; page_size: number; total: number }
    summary: ScheduledTaskSummary
    task_types: Array<{ value: ScheduledTaskType; label: string }>
    statuses: Array<{ value: ScheduledTaskStatus; label: string }>
  }>('admin-scheduled-tasks', `/admin/tasks/?${queryString(query)}`),
  scheduledTask: (publicId: string) =>
    request<AdminScheduledTask>(`/admin/tasks/${encodeURIComponent(publicId)}/`),
  retryScheduledTask: (publicId: string) =>
    request<AdminScheduledTask>(`/admin/tasks/${encodeURIComponent(publicId)}/retry/`, {
      method: 'POST',
    }),
  createAfterSalesCase: (
    orderNo: string,
    caseType: AfterSalesCaseType,
    requestedAmount: number,
    reason: string,
  ) => request<AdminAfterSalesCase>('/admin/order-after-sales/', {
    method: 'POST',
    body: JSON.stringify({
      order_no: orderNo,
      case_type: caseType,
      requested_amount: requestedAmount,
      reason,
    }),
  }),
  reviewAfterSalesCase: (
    caseNo: string,
    action: 'start_review' | 'approve' | 'reject' | 'retry_refund',
    resultNote = '',
    approvedAmount?: number,
  ) => request<AdminAfterSalesCase>(
    `/admin/order-after-sales/${encodeURIComponent(caseNo)}/action/`,
    {
      method: 'POST',
      body: JSON.stringify({
        action,
        result_note: resultNote,
        ...(approvedAmount !== undefined ? { approved_amount: approvedAmount } : {}),
      }),
    },
  ),
  supportCases: (query: SupportCaseQuery = {}) => requestLatest<{
    items: AdminSupportCase[]
    pagination: { page: number; page_size: number; total: number }
    summary: SupportCaseSummary
  }>('admin-support-cases', `/admin/support-cases/?${queryString(query)}`),
  supportCase: (caseNo: string) => request<AdminSupportCase>(
    `/admin/support-cases/${encodeURIComponent(caseNo)}/`,
  ),
  reviewSupportCase: (
    caseNo: string,
    action: 'start_review' | 'resolve' | 'reject' | 'close',
    resultNote = '',
  ) => request<AdminSupportCase>(
    `/admin/support-cases/${encodeURIComponent(caseNo)}/action/`,
    { method: 'POST', body: JSON.stringify({ action, result_note: resultNote }) },
  ),
  replySupportCase: (caseNo: string, content: string) => request<AdminSupportCase>(
    `/admin/support-cases/${encodeURIComponent(caseNo)}/reply/`,
    { method: 'POST', body: JSON.stringify({ content }) },
  ),
}
