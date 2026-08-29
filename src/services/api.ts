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
  AdminAfterSalesCase,
  AdminMe,
  AdminProvider,
  AdminProviderOrder,
  AdminProviderSummary,
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
  ProviderApplicationStatus,
  ProviderOrderStatus,
  ProviderOrderSummary,
  ProviderOrderSupportNote,
  UserRiskLevel,
  VerificationStatus,
  ActivityReportStatus,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const ACCESS_KEY = 'dazzy_admin_access_token'
const REFRESH_KEY = 'dazzy_admin_refresh_token'

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY)
const getRefreshToken = () => localStorage.getItem(REFRESH_KEY)

export const clearSession = () => {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
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

let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  const refresh = getRefreshToken()
  if (!refresh) return false
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      const payload = await parseResponse(response) as { access?: string; refresh?: string } | null
      if (!response.ok || !payload?.access) {
        clearSession()
        return false
      }
      localStorage.setItem(ACCESS_KEY, payload.access)
      if (payload.refresh) localStorage.setItem(REFRESH_KEY, payload.refresh)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...options.headers,
    },
  })
  const payload = await parseResponse(response) as { data?: T } | null
  if (response.status === 401 && !retried && await refreshAccessToken()) {
    return request<T>(path, options, true)
  }
  if (!response.ok) throw new Error(errorMessage(payload))
  return payload?.data as T
}

export interface ProviderApplicationQuery {
  status: ProviderApplicationStatus
  city_code?: string
  verification_status?: VerificationStatus | ''
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
  verification_status?: VerificationStatus | ''
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
  verification_status?: VerificationStatus | ''
  search?: string
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

function queryString(query: object) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}

export const adminApi = {
  async login(phone: string, password: string) {
    const data = await request<{ access: string; refresh: string }>('/auth/login/password/', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    })
    localStorage.setItem(ACCESS_KEY, data.access)
    localStorage.setItem(REFRESH_KEY, data.refresh)
  },
  async logout() {
    const refresh = getRefreshToken()
    try {
      if (refresh) {
        await request<void>('/auth/logout/', {
          method: 'POST',
          body: JSON.stringify({ refresh }),
        })
      }
    } finally {
      clearSession()
    }
  },
  me: () => request<AdminMe>('/admin/me/'),
  overview: (days: 7 | 30 = 7) => request<{
    metrics: Record<string, number | null>
    trend: {
      days: 7 | 30
      points: Array<{ date: string; transaction_amount: number; order_count: number }>
    }
    todos: Array<{ key: string; label: string; count: number; priority: string }>
  }>(`/admin/overview/?days=${days}`),
  serviceCategories: (query: ServiceCategoryQuery) => request<{
    items: AdminServiceCategory[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminServiceCategorySummary
  }>(`/admin/service-categories/?${queryString(query)}`),
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
  activities: (query: AdminActivityQuery) => request<{
    items: AdminActivity[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivitySummary
  }>(`/admin/activities/?${queryString(query)}`),
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
  activityCategories: (query: AdminActivityCategoryQuery) => request<{
    items: AdminActivityCategory[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityCategorySummary
  }>(`/admin/activity-categories/?${queryString(query)}`),
  createActivityCategory: (payload: AdminActivityCategoryMutation) =>
    request<AdminActivityCategory>('/admin/activity-categories/', {
      method: 'POST', body: JSON.stringify(payload),
    }),
  updateActivityCategory: (id: number, payload: Partial<AdminActivityCategoryMutation>) =>
    request<AdminActivityCategory>(`/admin/activity-categories/${id}/`, {
      method: 'PATCH', body: JSON.stringify(payload),
    }),
  activityReports: (query: AdminActivityReportQuery) => request<{
    items: AdminActivityReport[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityReportSummary
  }>(`/admin/activity-reports/?${queryString(query)}`),
  reviewActivityReport: (
    caseNo: string,
    action: 'start_review' | 'resolve' | 'reject',
    resultNote = '',
  ) => request<AdminActivityReport>(
    `/admin/activity-reports/${encodeURIComponent(caseNo)}/action/`,
    { method: 'POST', body: JSON.stringify({ action, result_note: resultNote }) },
  ),
  activityFinance: (query: AdminActivityFinanceQuery) => request<{
    items: Array<AdminActivityParticipationPayment | AdminActivityParticipationRefund | AdminActivityAfterSales | AdminActivitySettlement>
    pagination: { page: number; page_size: number; total: number }
    summary: AdminActivityFinanceSummary
  }>(`/admin/activity-finance/?${queryString(query)}`),
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
    return request<{
      items: ProviderApplication[]
      pagination: { page: number; page_size: number; total: number }
    }>(`/admin/provider-applications/?${params}`)
  },
  reviewProvider: (id: number, decision: 'approve' | 'reject', reason = '') =>
    request<ProviderApplication>(`/admin/provider-applications/${id}/review/`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),
  users: (query: AdminUserQuery) => request<{
    items: AdminUser[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminUserSummary
  }>(`/admin/users/?${queryString(query)}`),
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
  managedProviders: (query: AdminProviderQuery) => request<{
    items: AdminProvider[]
    pagination: { page: number; page_size: number; total: number }
    summary: AdminProviderSummary
  }>(`/admin/providers/?${queryString(query)}`),
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
  providerOrders: (query: ProviderOrderQuery) => request<{
    items: AdminProviderOrder[]
    pagination: { page: number; page_size: number; total: number }
    summary: ProviderOrderSummary
  }>(`/admin/provider-orders/?${queryString(query)}`),
  providerOrder: (orderNo: string) =>
    request<AdminProviderOrder>(`/admin/provider-orders/${encodeURIComponent(orderNo)}/`),
  providerOrderEvidence: (orderNo: string) =>
    request<{ url: string; expires_in: number }>(
      `/admin/provider-orders/${encodeURIComponent(orderNo)}/evidence/`,
    ),
  addProviderOrderSupportNote: (orderNo: string, content: string) =>
    request<ProviderOrderSupportNote>(
      `/admin/provider-orders/${encodeURIComponent(orderNo)}/support-notes/`,
      { method: 'POST', body: JSON.stringify({ content }) },
    ),
  afterSalesCases: (query: AfterSalesQuery) => request<{
    items: AdminAfterSalesCase[]
    pagination: { page: number; page_size: number; total: number }
    summary: AfterSalesSummary
  }>(`/admin/order-after-sales/?${queryString(query)}`),
  afterSalesCase: (caseNo: string) =>
    request<AdminAfterSalesCase>(`/admin/order-after-sales/${encodeURIComponent(caseNo)}/`),
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
    action: 'start_review' | 'approve' | 'reject',
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
}
