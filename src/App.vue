<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { adminApi, clearSession, getAccessToken } from './services/api'
import type { AdminMe, AdminPage } from './types'

const currentPage = ref<AdminPage>('dashboard')
const session = ref<AdminMe | null>(null)
const loading = ref(true)
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
const canManageServiceCategory = hasPermission('service_category.manage')
const canReviewActivity = hasPermission('activity.review')

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
      else if (permissions.includes('activity.view')) currentPage.value = 'activities'
      else if (permissions.includes('order.fulfillment.view')) currentPage.value = 'orders'
      else if (permissions.includes('order.after_sales.view')) currentPage.value = 'after_sales'
    }
  } catch {
    clearSession()
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

onMounted(loadSession)
</script>

<template>
  <div v-if="loading" class="screen-loader"><span></span></div>
  <LoginView v-else-if="!authenticated" @authenticated="loadSession" />
  <AdminShell
    v-else
    :active="currentPage"
    :session="session"
    @navigate="currentPage = $event"
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
    <ActivityManagementView
      v-else-if="currentPage === 'activities'"
      :preview="preview"
      :can-review="canReviewActivity"
    />
    <FulfillmentOrdersView v-else-if="currentPage === 'orders'" :preview="preview" :can-add-note="canAddOrderNote" />
    <AfterSalesView
      v-else-if="currentPage === 'after_sales'"
      :preview="preview"
      :can-review="canReviewAfterSales"
    />
  </AdminShell>
</template>
