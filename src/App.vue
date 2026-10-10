<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { createOperationsWork, operationsWorkKey } from './composables/operationsWork'
import type { WorkTarget } from './utils/operationsWork'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import LoginView from './views/LoginView.vue'
import AdminShell from './layouts/AdminShell.vue'
import DashboardView from './views/DashboardView.vue'
import ProviderReviewView from './views/ProviderReviewView.vue'
import ProviderManagementView from './views/ProviderManagementView.vue'
import FulfillmentOrdersView from './views/FulfillmentOrdersView.vue'
import AfterSalesView from './views/AfterSalesView.vue'
import UserManagementView from './views/UserManagementView.vue'
import ServiceCategoriesView from './views/ServiceCategoriesView.vue'
import AssetsView from './views/AssetsView.vue'
import CouponCampaignsView from './views/CouponCampaignsView.vue'
import ActivityManagementView from './views/ActivityManagementView.vue'
import ActivityCategoriesView from './views/ActivityCategoriesView.vue'
import ActivityReportsView from './views/ActivityReportsView.vue'
import AuditLogsView from './views/AuditLogsView.vue'
import ProviderOrderingSettingsView from './views/ProviderOrderingSettingsView.vue'
import ProviderTrainingView from './views/ProviderTrainingView.vue'
import PlatformOperationSettingsView from './views/PlatformOperationSettingsView.vue'
import ReceivingWithdrawalSettingsView from './views/ReceivingWithdrawalSettingsView.vue'
import SystemManagementView from './views/SystemManagementView.vue'
import TaskCenterView from './views/TaskCenterView.vue'
import SupportCasesView from './views/SupportCasesView.vue'
import CouponManagementView from './views/CouponManagementView.vue'
import CouponIssueRecordsView from './views/CouponIssueRecordsView.vue'
import NewcomerGiftView from './views/NewcomerGiftView.vue'
import InvitationRulesView from './views/InvitationRulesView.vue'
import InvitationRecordsView from './views/InvitationRecordsView.vue'
import ProviderInvitesView from './views/ProviderInvitesView.vue'
import ProviderOrderFinanceView from './views/ProviderOrderFinanceView.vue'
import FinanceWorkView from './views/FinanceWorkView.vue'
import ActivityFinancePanel from './views/activity/ActivityFinancePanel.vue'
import WalletFinanceView from './views/WalletFinanceView.vue'
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
import type { ProviderReviewMode } from './utils/providerReviews'

const route = useRoute()
const operationsWork = createOperationsWork()
provide(operationsWorkKey, operationsWork)
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
const canCreateProviderRefund = computed(() => hasPermission('order.after_sales.create').value && hasPermission('order.after_sales.view').value)
const canCreateActivityRefund = computed(() => hasPermission('activity_after_sales.create').value && hasPermission('activity_finance.view').value)
const canApproveRefund = computed(() => hasPermission('refund.approve').value || hasPermission('refund.supervise').value)
const canSuperviseRefund = hasPermission('refund.supervise')
const canRetryRefund = hasPermission('refund.retry')
const canManageOrderFinance = hasPermission('order.finance.manage')
const canManageOrderReview = hasPermission('order.review.manage')
const canReviewFulfillment = hasPermission('order.fulfillment.review')
const canManageServiceCategory = hasPermission('service_category.manage')
const canUseAssets = hasPermission('asset.view')
const canManageAssets = hasPermission('asset.manage')
const canReviewActivity = hasPermission('activity.review')
const canManageActivity = hasPermission('activity.manage')
const canManageActivityCategory = hasPermission('activity_category.manage')
const canManageActivityReport = hasPermission('activity_report.manage')
const canManageActivityAfterSales = hasPermission('activity_after_sales.manage')
const canManageActivitySettlement = hasPermission('activity_settlement.manage')
const canRetryTask = hasPermission('system.task.retry')
const canManageSupportCase = hasPermission('support.case.manage')
const canManageCoupon = hasPermission('coupon.manage')
const canManageCouponCampaign = hasPermission('coupon_campaign.manage')
const canIssueCoupon = hasPermission('coupon.issue')
const canViewCoupon = hasPermission('coupon.view')
const canManageGrowth = hasPermission('growth.manage')
const canManageProviderInvites = hasPermission('provider_invite.manage')
const canReviewProviderInvites = hasPermission('provider_invite.review')
const canPayProviderInvites = hasPermission('provider_invite.pay')
const canManageWallet = hasPermission('wallet.manage')
const canViewAudit = hasPermission('audit.view')

setSessionExpiredHandler(() => {
  operationsWork.clear()
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
    operationsWork.clear()
  }
}

function navigate(page: AdminPage, queryOverrides: LocationQueryRaw = {}) {
  if (!canAccessAdminPage(page, session.value?.permissions, preview)) {
    ElMessage.warning('当前账号无权访问该页面')
    return
  }
  if (page === 'orders') orderSearch.value = ''
  const query: LocationQueryRaw = { ...route.query }
  delete query.review
  delete query.review_status
  delete query.activity_status
  delete query.todo
  delete query.work_id
  delete query.search
  delete query.record_type
  Object.assign(query, queryOverrides)
  void router.push({ name: page, query })
}

function openProviderReview(mode: ProviderReviewMode = 'application') {
  navigate('provider_reviews', { review: mode })
}

function openActivityReview() {
  navigate('activities', { activity_status: 'pending_review' })
}

function openOrderFromTask(orderNo: string) {
  navigate('orders')
  orderSearch.value = orderNo
}

function openWork(target: WorkTarget) {
  navigate(target.page, target.query)
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
    :preview="preview"
    @navigate="navigate"
    @review-provider="openProviderReview"
    @open-work="openWork"
    @logout="logout"
  >
    <div v-if="route.query.todo" class="work-filter-banner"><span>当前仅显示所选待办范围内的记录。</span><el-button link type="primary" @click="navigate(currentPage)">查看全部记录</el-button></div>
    <el-empty
      v-if="!firstAccessiblePage"
      description="当前账号尚未配置管理端页面权限，请联系平台管理员"
    />
    <DashboardView
      v-else-if="currentPage === 'dashboard'"
      :preview="preview"
      @review-provider="openProviderReview"
      @review-activity="openActivityReview"
      @open-work="openWork"
    />
    <UserManagementView
      v-else-if="currentPage === 'users'"
      :preview="preview"
      :can-manage-status="canManageUserStatus"
      :can-manage-risk="canManageUserRisk"
      :can-issue-coupon="canIssueCoupon && canViewCoupon"
    />
    <ProviderManagementView
      v-else-if="currentPage === 'providers'"
      :preview="preview"
      :can-manage="canManageProvider"
      :can-adjust-credit="canAdjustProviderCredit"
      :can-review="canReviewProvider"
      @review="navigate('provider_reviews')"
    />
    <ProviderReviewView :key="route.fullPath" v-else-if="currentPage === 'provider_reviews'" :preview="preview" />
    <ServiceCategoriesView
      v-else-if="currentPage === 'services'"
      :preview="preview"
      :can-manage="canManageServiceCategory"
      :can-use-assets="canUseAssets"
      :can-upload-assets="canManageAssets"
    />
    <AssetsView v-else-if="currentPage === 'assets'" :preview="preview" :can-manage="canManageAssets" />
    <CouponCampaignsView v-else-if="currentPage === 'coupon_campaigns'" :preview="preview" :can-manage="canManageCouponCampaign" :can-use-assets="canUseAssets" :can-upload-assets="canManageAssets" />
    <ProviderTrainingView v-else-if="currentPage === 'provider_training'" :preview="preview" />
    <ProviderOrderingSettingsView
      v-else-if="currentPage === 'provider_rules'"
      @open-audit="navigate('audit_logs')"
    />
    <PlatformOperationSettingsView
      v-else-if="currentPage === 'platform_settings'"
      @open-audit="navigate('audit_logs')"
    />
    <ReceivingWithdrawalSettingsView
      v-else-if="currentPage === 'receiving_settings'"
      :can-view-audit="canViewAudit"
      @open-audit="navigate('audit_logs')"
    />
    <ActivityManagementView :key="route.fullPath"
      v-else-if="currentPage === 'activities'"
      :preview="preview"
      :can-review="canReviewActivity"
      :can-manage="canManageActivity"
      :can-create-refund="canCreateActivityRefund"
      :initial-status="route.query.activity_status === 'pending_review' ? 'pending_review' : ''"
    />
    <ActivityCategoriesView
      v-else-if="currentPage === 'activity_categories'"
      :preview="preview"
      :can-manage="canManageActivityCategory"
      :can-use-assets="canUseAssets"
      :can-upload-assets="canManageAssets"
    />
    <ActivityReportsView :key="route.fullPath"
      v-else-if="currentPage === 'activity_reports'"
      :preview="preview"
      :can-manage="canManageActivityReport"
    />
    <FulfillmentOrdersView :key="route.fullPath" v-else-if="currentPage === 'orders'" :preview="preview" :can-create-refund="canCreateProviderRefund" :can-add-note="canAddOrderNote" :can-manage-review="canManageOrderReview" :can-review-fulfillment="canReviewFulfillment" :can-adjust-credit="canAdjustProviderCredit" :initial-search="orderSearch" @open-after-sales="(orderNo) => navigate('after_sales', { search: orderNo })" />
    <AfterSalesView :key="route.fullPath"
      v-else-if="currentPage === 'after_sales'"
      :preview="preview"
      :can-review="canReviewAfterSales"
      :can-create="canCreateProviderRefund"
      :can-approve="canApproveRefund"
      :can-supervise="canSuperviseRefund"
    />
    <FinanceWorkView :key="route.fullPath" v-else-if="currentPage === 'finance_alerts'" :preview="preview" />
    <ProviderOrderFinanceView :key="route.fullPath"
      v-else-if="currentPage === 'settlements'"
      :preview="preview"
      :can-manage="canManageOrderFinance"
      :can-retry-refund="canRetryRefund"
    />
    <ActivityFinancePanel :key="route.fullPath"
      v-else-if="currentPage === 'activity_finance'"
      :preview="preview"
      :can-manage-after-sales="canManageActivityAfterSales"
      :can-manage-settlement="canManageActivitySettlement"
      :can-create-refund="canCreateActivityRefund"
      :can-approve-refund="canApproveRefund"
      :can-supervise-refund="canSuperviseRefund"
      :can-retry-refund="canRetryRefund"
    />
    <WalletFinanceView
      v-else-if="currentPage === 'wallets'"
      :preview="preview"
      :can-manage="canManageWallet"
    />
    <SupportCasesView :key="route.fullPath"
      v-else-if="currentPage === 'support_cases'"
      :preview="preview"
      :can-manage="canManageSupportCase"
    />
    <CouponManagementView
      v-else-if="currentPage === 'coupons'"
      :preview="preview"
      :can-manage="canManageCoupon"
      :can-issue="canIssueCoupon"
    />
    <CouponIssueRecordsView
      v-else-if="currentPage === 'coupon_records'"
      :preview="preview"
      :can-issue="canIssueCoupon"
    />
    <NewcomerGiftView
      v-else-if="currentPage === 'newcomer_gift'"
      :preview="preview"
      :can-manage="canManageGrowth"
    />
    <InvitationRulesView
      v-else-if="currentPage === 'invitation_rules'"
      :preview="preview"
      :can-manage="canManageGrowth"
    />
    <InvitationRecordsView
      v-else-if="currentPage === 'invitation_records'"
      :preview="preview"
    />
    <ProviderInvitesView v-else-if="currentPage === 'provider_invites'" :preview="preview"
      :can-manage="canManageProviderInvites"
      :can-review="canReviewProviderInvites"
      :can-pay="canPayProviderInvites" />
    <SystemManagementView
      v-else-if="currentPage === 'system'"
      @open-audit="navigate('audit_logs')"
    />
    <TaskCenterView :key="route.fullPath"
      v-else-if="currentPage === 'tasks'"
      :preview="preview"
      :can-retry="canRetryTask"
      :can-retry-refund="canRetryRefund"
      @open-order="openOrderFromTask"
      @open-audit="navigate('audit_logs')"
    />
    <AuditLogsView v-else-if="currentPage === 'audit_logs'" />
  </AdminShell>
</template>

<style scoped>
.work-filter-banner{padding:12px 24px;background:#edfafa;display:flex;gap:20px;align-items:center;font-size:13px;color:#48616b}
</style>
