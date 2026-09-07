<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
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
import {
  canAccessAdminPage,
  firstAccessibleAdminPage,
  isAdminPage,
} from './navigation'
import {
  adminApi,
  getAccessToken,
  restoreAdminSession,
  setSessionExpiredHandler,
} from './services/api'
import type { AdminMe, AdminPage } from './types'

const route = useRoute()
const router = useRouter()
const session = ref<AdminMe | null>(null)
const loading = ref(true)
const orderSearch = ref('')
const preview = import.meta.env.DEV && (
  new URLSearchParams(location.search).has('preview') || route.query.preview !== undefined
)

const authenticated = computed(() => preview || Boolean(session.value))
const requestedPage = computed<AdminPage>(() => (
  isAdminPage(route.name) ? route.name : 'dashboard'
))
const firstAccessiblePage = computed(() => firstAccessibleAdminPage(
  session.value?.permissions,
  preview,
))
const currentPage = computed(() => (
  canAccessAdminPage(requestedPage.value, session.value?.permissions, preview)
    ? requestedPage.value
    : firstAccessiblePage.value ?? requestedPage.value
))
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
  setTimeout(() => {
    ElMessage.closeAll()
    ElMessage.warning('登录已过期，请重新登录')
  }, 50)
})

async function ensureCurrentPageAllowed(notify = false) {
  if (!authenticated.value) return
  if (canAccessAdminPage(requestedPage.value, session.value?.permissions, preview)) return
  const fallback = firstAccessiblePage.value
  if (!fallback) return
  await router.replace({ name: fallback, query: route.query })
  if (notify) ElMessage.warning('当前账号无权访问该页面，已为你切换到可用页面')
}

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
    await ensureCurrentPageAllowed()
    loading.value = false
    return
  }
  if (!getAccessToken()) {
    const restored = await restoreAdminSession()
    if (restored.status === 'expired') {
      loading.value = false
      return
    }
    if (restored.status === 'unavailable') {
      ElMessage.error(restored.message)
      loading.value = false
      return
    }
  }
  try {
    session.value = await adminApi.me()
    await ensureCurrentPageAllowed()
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
  if (!canAccessAdminPage(page, session.value?.permissions, preview)) {
    ElMessage.warning('当前账号无权访问该页面')
    return
  }
  if (page === 'orders') orderSearch.value = ''
  void router.push({ name: page, query: route.query })
}

function openOrderFromTask(orderNo: string) {
  orderSearch.value = orderNo
  navigate('orders')
}

watch(requestedPage, () => {
  if (!loading.value && authenticated.value) void ensureCurrentPageAllowed(true)
})

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
    <el-empty
      v-if="!firstAccessiblePage"
      description="当前账号尚未配置管理端页面权限，请联系平台管理员"
    />
    <DashboardView
      v-else-if="currentPage === 'dashboard'"
      :preview="preview"
      @review-provider="navigate('provider_reviews')"
      @review-activity="navigate('activities')"
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
      @review="navigate('provider_reviews')"
    />
    <ProviderReviewView v-else-if="currentPage === 'provider_reviews'" :preview="preview" />
    <ServiceCategoriesView
      v-else-if="currentPage === 'services'"
      :preview="preview"
      :can-manage="canManageServiceCategory"
    />
    <ProviderOrderingSettingsView
      v-else-if="currentPage === 'provider_rules'"
      @open-audit="navigate('audit_logs')"
    />
    <PlatformOperationSettingsView
      v-else-if="currentPage === 'platform_settings'"
      @open-audit="navigate('audit_logs')"
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
    <FulfillmentOrdersView v-else-if="currentPage === 'orders'" :preview="preview" :can-add-note="canAddOrderNote" :can-manage-review="canManageOrderReview" :initial-search="orderSearch" @open-after-sales="navigate('after_sales')" />
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
      @open-audit="navigate('audit_logs')"
    />
    <TaskCenterView
      v-else-if="currentPage === 'tasks'"
      :preview="preview"
      :can-retry="canRetryTask"
      @open-order="openOrderFromTask"
      @open-audit="navigate('audit_logs')"
    />
    <AuditLogsView v-else-if="currentPage === 'audit_logs'" />
  </AdminShell>
</template>
