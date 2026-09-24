import type { AdminPage } from './types'

export const ADMIN_PAGES: AdminPage[] = [
  'dashboard',
  'users',
  'providers',
  'provider_reviews',
  'services',
  'platform_settings',
  'provider_rules',
  'activities',
  'orders',
  'after_sales',
  'settlements',
  'activity_finance',
  'support_cases',
  'coupons',
  'system',
  'tasks',
  'audit_logs',
]

export const ADMIN_PAGE_PERMISSIONS: Record<AdminPage, string> = {
  dashboard: 'dashboard.view',
  users: 'user.view',
  providers: 'provider.view',
  provider_reviews: 'provider.review',
  services: 'service_category.view',
  platform_settings: 'operations.manage',
  provider_rules: 'operations.manage',
  activities: 'activity.view',
  orders: 'order.fulfillment.view',
  after_sales: 'order.after_sales.view',
  settlements: 'order.finance.view',
  activity_finance: 'activity_finance.view',
  support_cases: 'support.case.view',
  coupons: 'support.case.manage',
  system: 'organization.manage',
  tasks: 'system.task.view',
  audit_logs: 'audit.view',
}

export function isAdminPage(value: unknown): value is AdminPage {
  return typeof value === 'string' && ADMIN_PAGES.includes(value as AdminPage)
}

export function canAccessAdminPage(
  page: AdminPage,
  permissions: string[] | undefined,
  preview = false,
) {
  return preview || Boolean(
    permissions?.includes('*') || permissions?.includes(ADMIN_PAGE_PERMISSIONS[page]),
  )
}

export function firstAccessibleAdminPage(
  permissions: string[] | undefined,
  preview = false,
): AdminPage | null {
  return ADMIN_PAGES.find((page) => canAccessAdminPage(page, permissions, preview)) ?? null
}
