<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import LoginView from './views/LoginView.vue'
import AdminShell from './layouts/AdminShell.vue'
import DashboardView from './views/DashboardView.vue'
import ProviderReviewView from './views/ProviderReviewView.vue'
import ProviderManagementView from './views/ProviderManagementView.vue'
import FulfillmentOrdersView from './views/FulfillmentOrdersView.vue'
import AfterSalesView from './views/AfterSalesView.vue'
import UserManagementView from './views/UserManagementView.vue'
import ServiceCategoriesView from './views/ServiceCategoriesView.vue'
import ActivityManagementView from './views/ActivityManagementView.vue'
import AuditLogsView from './views/AuditLogsView.vue'
import ProviderOrderingSettingsView from './views/ProviderOrderingSettingsView.vue'
import PlatformOperationSettingsView from './views/PlatformOperationSettingsView.vue'
import SystemManagementView from './views/SystemManagementView.vue'
import TaskCenterView from './views/TaskCenterView.vue'
import SupportCasesView from './views/SupportCasesView.vue'
import ProviderOrderFinanceView from './views/ProviderOrderFinanceView.vue'
import { adminApi, getAccessToken, setSessionExpiredHandler } from './services/api'
import type { AdminMe, AdminPage } from './types'

const currentPage = ref<AdminPage>('dashboard')
const session = ref<AdminMe | null>(null)
const loading = ref(true)
const orderSearch = ref('')
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')

const authenticated = computed(() => preview || Boolean(session.value))
const canAddOrderNote = computed(() => preview || Boolean(
  session.value?.permissions.includes('*')
  || session.value?.permissions.includes('order.support_note.add'),
))
const hasPermission = (permission: string) => computed(() => preview || Boolean(
  session.value?.permissions.includes('*') || session.value?.permissions.includes(permission),
))
const canManageUserStatus = hasPermission('user.status.manage')
const canManageUserRisk = hasPermission('user.risk.manage')
const canManageProvider = hasPermission('provider.manage')
const canAdjustProviderCredit = hasPermission('provider.credit.adjust')
const canReviewProvider = hasPermission('provider.review')
const canReviewAfterSales = hasPermission('order.after_sales.review')
const canManageOrderFinance = hasPermission('order.finance.manage')
const canManageOrderReview = hasPermission('order.review.manage')
const canManageServiceCategory = hasPermission('service_category.manage')
const canReviewActivity = hasPermission('activity.review')
const canManageActivity = hasPermission('activity.manage')
const canViewActivityCategory = hasPermission('activity_category.view')
const canManageActivityCategory = hasPermission('activity_category.manage')
const canViewActivityReport = hasPermission('activity_report.view')
const canManageActivityReport = hasPermission('activity_report.manage')
const canViewActivityFinance = hasPermission('activity_finance.view')
const canManageActivityAfterSales = hasPermission('activity_after_sales.manage')
const canManageActivitySettlement = hasPermission('activity_settlement.manage')
const canRetryTask = hasPermission('system.task.retry')
const canManageSupportCase = hasPermission('support.case.manage')

setSessionExpiredHandler(() => {
  session.value = null
  loading.value = false
  currentPage.value = 'dashboard'
  setTimeout(() => {
    ElMessage.closeAll()
    ElMessage.warning('登录已过期，请重新登录')
  }, 50)
})

async function loadSession() {
  if (preview) {
    session.value = {
      user: { nickname: '运营管理员', phone: '138****0000' },
      role_name: '超级管理员',
      organization: { name: '乐搭伴运营平台' },
      permissions: ['*'],
      data_scope: 'all',
      city_codes: [],
    }
    loading.value = false
    return
  }
  if (!getAccessToken()) {
    loading.value = false
    return
  }
  try {
    session.value = await adminApi.me()
    const permissions = session.value.permissions
    if (!permissions.includes('*') && !permissions.includes('dashboard.view')) {
      if (permissions.includes('user.view')) currentPage.value = 'users'
      else if (permissions.includes('provider.view')) currentPage.value = 'providers'
      else if (permissions.includes('provider.review')) currentPage.value = 'provider_reviews'
      else if (permissions.includes('service_category.view')) currentPage.value = 'services'
      else if (permissions.includes('operations.manage')) currentPage.value = 'platform_settings'
      else if (permissions.includes('activity.view')) currentPage.value = 'activities'
      else if (permissions.includes('order.fulfillment.view')) currentPage.value = 'orders'
      else if (permissions.includes('order.after_sales.view')) currentPage.value = 'after_sales'
      else if (permissions.includes('order.finance.view')) currentPage.value = 'settlements'
      else if (permissions.includes('support.case.view')) currentPage.value = 'support_cases'
      else if (permissions.includes('system.task.view')) currentPage.value = 'tasks'
      else if (permissions.includes('organization.manage')) currentPage.value = 'system'
      else if (permissions.includes('audit.view')) currentPage.value = 'audit_logs'
    }
  } catch (error) {
    if (getAccessToken()) {
      ElMessage.error(error instanceof Error ? error.message : '网络异常，登录状态加载失败')
    }
  } finally {
    loading.value = false
  }
}

async function logout() {
  try {
    await adminApi.logout()
  } finally {
    session.value = null
  }
}

function navigate(page: AdminPage) {
  if (page === 'orders') orderSearch.value = ''
  currentPage.value = page
}

function openOrderFromTask(orderNo: string) {
  orderSearch.value = orderNo
  currentPage.value = 'orders'
}

onMounted(loadSession)
</script>

<template>
  <div v-if="loading" class="screen-loader"><span></span></div>
  <LoginView v-else-if="!authenticated" @authenticated="loadSession" />
  <AdminShell
    v-else
    :active="currentPage"
    :session="session"
    @navigate="navigate"
    @logout="logout"
  >
    <DashboardView
      v-if="currentPage === 'dashboard'"
      :preview="preview"
      @review-provider="currentPage = 'provider_reviews'"
      @review-activity="currentPage = 'activities'"
    />
    <UserManagementView
      v-else-if="currentPage === 'users'"
      :preview="preview"
      :can-manage-status="canManageUserStatus"
      :can-manage-risk="canManageUserRisk"
    />
    <ProviderManagementView
      v-else-if="currentPage === 'providers'"
      :preview="preview"
      :can-manage="canManageProvider"
      :can-adjust-credit="canAdjustProviderCredit"
      :can-review="canReviewProvider"
      @review="currentPage = 'provider_reviews'"
    />
    <ProviderReviewView v-else-if="currentPage === 'provider_reviews'" :preview="preview" />
    <ServiceCategoriesView
      v-else-if="currentPage === 'services'"
      :preview="preview"
      :can-manage="canManageServiceCategory"
    />
    <ProviderOrderingSettingsView
      v-else-if="currentPage === 'provider_rules'"
      @open-audit="currentPage = 'audit_logs'"
    />
    <PlatformOperationSettingsView
      v-else-if="currentPage === 'platform_settings'"
      @open-audit="currentPage = 'audit_logs'"
    />
    <ActivityManagementView
      v-else-if="currentPage === 'activities'"
      :preview="preview"
      :can-review="canReviewActivity"
      :can-manage="canManageActivity"
      :can-view-category="canViewActivityCategory"
      :can-manage-category="canManageActivityCategory"
      :can-view-report="canViewActivityReport"
      :can-manage-report="canManageActivityReport"
      :can-view-finance="canViewActivityFinance"
      :can-manage-after-sales="canManageActivityAfterSales"
      :can-manage-settlement="canManageActivitySettlement"
    />
    <FulfillmentOrdersView v-else-if="currentPage === 'orders'" :preview="preview" :can-add-note="canAddOrderNote" :can-manage-review="canManageOrderReview" :initial-search="orderSearch" @open-after-sales="currentPage = 'after_sales'" />
    <AfterSalesView
      v-else-if="currentPage === 'after_sales'"
      :preview="preview"
      :can-review="canReviewAfterSales"
    />
    <ProviderOrderFinanceView
      v-else-if="currentPage === 'settlements'"
      :preview="preview"
      :can-manage="canManageOrderFinance"
    />
    <SupportCasesView
      v-else-if="currentPage === 'support_cases'"
      :preview="preview"
      :can-manage="canManageSupportCase"
    />
    <SystemManagementView
      v-else-if="currentPage === 'system'"
      @open-audit="currentPage = 'audit_logs'"
    />
    <TaskCenterView
      v-else-if="currentPage === 'tasks'"
      :preview="preview"
      :can-retry="canRetryTask"
      @open-order="openOrderFromTask"
      @open-audit="currentPage = 'audit_logs'"
    />
    <AuditLogsView v-else-if="currentPage === 'audit_logs'" />
  </AdminShell>
</template>
