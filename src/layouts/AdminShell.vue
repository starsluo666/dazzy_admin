<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { ElNotification } from 'element-plus'
import { Bell, Calendar, ChatLineRound, CircleCheck, Coin, DataAnalysis, Document, Grid, List, Operation, Setting, User, UserFilled, Notebook, Timer } from '@element-plus/icons-vue'
import { isAdminPage } from '../navigation'
import { adminApi } from '../services/api'
import type { AdminMe, AdminPage } from '../types'

const props = defineProps<{ active: AdminPage; session: AdminMe | null; preview: boolean }>()
const emit = defineEmits<{ navigate: [page: AdminPage]; logout: [] }>()

interface NavigationItem {
  key: string
  label: string
  icon: Component
  group?: boolean
  child?: boolean
  parent?: string
  enabled?: boolean
  visible?: boolean
}

const collapsedGroups = ref<Set<string>>(new Set())
const pendingProviderReviews = ref(0)
let previousProviderReviewCount: number | null = null
let providerReviewPollTimer: number | undefined

const can = (permission: string) => Boolean(
  props.session?.permissions?.includes('*') || props.session?.permissions?.includes(permission),
)
const navigation = computed<NavigationItem[]>(() => [
  { key: 'dashboard', label: '运营总览', icon: DataAnalysis, enabled: can('dashboard.view') },
  { key: 'users-group', label: '用户管理', icon: User, group: true, visible: can('user.view') },
  { key: 'users', label: '用户列表', icon: List, child: true, parent: 'users-group', enabled: can('user.view'), visible: can('user.view') },
  { key: 'providers-group', label: '达人管理', icon: UserFilled, group: true, visible: can('provider.view') || can('provider.review') },
  { key: 'providers', label: '达人列表', icon: List, child: true, parent: 'providers-group', enabled: can('provider.view'), visible: can('provider.view') },
  { key: 'provider_reviews', label: '入驻审核', icon: CircleCheck, child: true, parent: 'providers-group', enabled: can('provider.review'), visible: can('provider.review') },
  { key: 'operations-group', label: '运营配置', icon: Operation, group: true, visible: can('service_category.view') || can('operations.manage') },
  { key: 'services', label: '服务分类', icon: Grid, child: true, parent: 'operations-group', enabled: can('service_category.view'), visible: can('service_category.view') },
  { key: 'platform_settings', label: '平台参数', icon: Setting, child: true, parent: 'operations-group', enabled: can('operations.manage'), visible: can('operations.manage') },
  { key: 'provider_rules', label: '接单规则', icon: Operation, child: true, parent: 'operations-group', enabled: can('operations.manage'), visible: can('operations.manage') },
  { key: 'activities', label: '活动管理', icon: Calendar, enabled: can('activity.view'), visible: can('activity.view') },
  { key: 'orders-group', label: '订单管理', icon: Document, group: true, visible: can('order.fulfillment.view') || can('order.after_sales.view') },
  { key: 'orders', label: '达人订单', icon: List, child: true, parent: 'orders-group', enabled: can('order.fulfillment.view'), visible: can('order.fulfillment.view') },
  { key: 'after_sales', label: '退款 / 售后', icon: Coin, child: true, parent: 'orders-group', enabled: can('order.after_sales.view'), visible: can('order.after_sales.view') },
  { key: 'finance-group', label: '财务管理', icon: Coin, group: true, visible: can('order.finance.view') || can('activity_finance.view') },
  { key: 'settlements', label: '达人订单财务', icon: Document, child: true, parent: 'finance-group', enabled: can('order.finance.view'), visible: can('order.finance.view') },
  { key: 'activity_finance', label: '活动财务', icon: Calendar, child: true, parent: 'finance-group', enabled: can('activity_finance.view'), visible: can('activity_finance.view') },
  { key: 'support-group', label: '客服与投诉', icon: ChatLineRound, group: true, visible: can('support.case.view') || can('support.case.manage') },
  { key: 'support_cases', label: '客服工单', icon: List, child: true, parent: 'support-group', enabled: can('support.case.view'), visible: can('support.case.view') },
  { key: 'coupons', label: '优惠券', icon: Coin, child: true, parent: 'support-group', enabled: can('support.case.manage'), visible: can('support.case.manage') },
  { key: 'system-group', label: '系统管理', icon: Setting, group: true, visible: can('organization.manage') || can('system.task.view') || can('audit.view') },
  { key: 'system', label: '账号与权限', icon: UserFilled, child: true, parent: 'system-group', enabled: can('organization.manage'), visible: can('organization.manage') },
  { key: 'tasks', label: '任务中心', icon: Timer, child: true, parent: 'system-group', enabled: can('system.task.view'), visible: can('system.task.view') },
  { key: 'audit_logs', label: '操作审计', icon: Notebook, child: true, parent: 'system-group', enabled: can('audit.view'), visible: can('audit.view') },
].filter((item) => item.visible !== false))
const scopeLabel = computed(() => props.session?.data_scope === 'all'
  ? '全部数据'
  : props.session?.city_codes?.length
    ? `${props.session.city_codes.length}个城市`
    : '本组织')
const pageLabels: Record<AdminPage, string> = {
  dashboard: '运营总览',
  users: '用户管理 / 用户列表',
  providers: '达人管理 / 达人列表',
  provider_reviews: '达人管理 / 入驻审核',
  services: '运营配置 / 服务分类',
  platform_settings: '运营配置 / 平台参数',
  provider_rules: '运营配置 / 接单规则',
  activities: '活动管理',
  orders: '订单管理 / 达人订单',
  after_sales: '订单管理 / 退款与售后',
  settlements: '财务管理 / 达人订单财务',
  activity_finance: '财务管理 / 活动财务',
  support_cases: '客服与投诉 / 客服工单',
  coupons: '客服与投诉 / 优惠券',
  system: '系统管理 / 账号与权限',
  tasks: '系统管理 / 任务中心',
  audit_logs: '系统管理 / 操作审计',
}
function navigate(key: string, enabled: boolean) {
  if (enabled && isAdminPage(key)) emit('navigate', key)
}
function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}
function groupExpanded(key: string) {
  return !collapsedGroups.value.has(key)
}
function childVisible(parent?: string) {
  return !parent || groupExpanded(parent)
}
function groupActive(key: string) {
  return (key === 'users-group' && props.active === 'users')
    || (key === 'providers-group' && ['providers', 'provider_reviews'].includes(props.active))
    || (key === 'orders-group' && ['orders', 'after_sales'].includes(props.active))
    || (key === 'finance-group' && ['settlements', 'activity_finance'].includes(props.active))
    || (key === 'support-group' && ['support_cases', 'coupons'].includes(props.active))
    || (key === 'operations-group' && ['services', 'platform_settings', 'provider_rules'].includes(props.active))
    || (key === 'system-group' && ['system', 'tasks', 'audit_logs'].includes(props.active))
}

function openProviderReviews() {
  if (can('provider.review')) emit('navigate', 'provider_reviews')
}

async function refreshProviderReviewSummary() {
  if (!can('provider.review')) return
  try {
    const summary = props.preview
      ? { total: 3 }
      : await adminApi.providerReviewSummary()
    const previous = previousProviderReviewCount
    pendingProviderReviews.value = summary.total
    previousProviderReviewCount = summary.total
    if (!props.preview && summary.total > 0 && (previous === null || summary.total > previous)) {
      ElNotification({
        title: previous === null ? '达人审核待办' : '有新的达人审核待办',
        message: previous === null
          ? `当前有 ${summary.total} 条达人审核待处理`
          : `新增 ${summary.total - previous} 条，当前共 ${summary.total} 条待处理`,
        type: 'warning',
        duration: 6000,
        onClick: openProviderReviews,
      })
    }
  } catch {
    // 顶栏提醒失败不阻断管理端的其他操作，下一个轮询周期会自动重试。
  }
}

onMounted(() => {
  void refreshProviderReviewSummary()
  providerReviewPollTimer = window.setInterval(refreshProviderReviewSummary, 60_000)
})

onBeforeUnmount(() => {
  if (providerReviewPollTimer !== undefined) window.clearInterval(providerReviewPollTimer)
})
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-symbol">乐</div><div><strong>乐搭伴</strong><span>运营平台</span></div></div>
      <nav>
        <template v-for="item in navigation" :key="item.key">
          <button
            v-if="item.group"
            class="nav-group"
            :class="{ active: groupActive(item.key), collapsed: !groupExpanded(item.key) }"
            :aria-expanded="groupExpanded(item.key)"
            :aria-label="`${item.label}，${groupExpanded(item.key) ? '点击收起' : '点击展开'}`"
            @click="toggleGroup(item.key)"
          >
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span><i class="nav-caret" />
          </button>
          <button
            v-else-if="childVisible(item.parent)"
            :class="{ active: active === item.key, child: item.child, disabled: !item.enabled }"
            :disabled="!item.enabled"
            @click="navigate(item.key, Boolean(item.enabled))"
          ><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></button>
        </template>
      </nav>
      <div class="sidebar-profile"><el-avatar :size="40"><UserFilled /></el-avatar><div><strong>{{ session?.user?.nickname || '运营管理员' }}</strong><span>{{ session?.role_name }}</span></div></div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div class="breadcrumb">首页&nbsp;&nbsp;/&nbsp;&nbsp;<strong>{{ pageLabels[active] }}</strong></div>
        <el-input class="global-search" placeholder="搜索用户、订单、活动" clearable />
        <el-badge
          v-if="can('provider.review')"
          :value="pendingProviderReviews"
          :hidden="pendingProviderReviews === 0"
          :max="99"
        >
          <button
            class="notification-button"
            type="button"
            aria-label="打开达人审核待办"
            @click="openProviderReviews"
          ><el-icon class="top-icon"><Bell /></el-icon></button>
        </el-badge>
        <span class="scope">{{ scopeLabel }}</span>
        <el-dropdown @command="$emit('logout')"><div class="account"><el-avatar :size="34"><UserFilled /></el-avatar><span>{{ session?.user?.nickname || 'admin' }}⌄</span></div><template #dropdown><el-dropdown-menu><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </header>
      <main><slot /></main>
    </section>
  </div>
</template>

<style scoped>
.notification-button {
  display: grid;
  place-items: center;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  color: #303847;
  background: transparent;
}

.notification-button:hover {
  color: var(--brand);
  background: #eefafa;
}

.notification-button:focus-visible {
  outline: 3px solid rgb(8 184 189 / 22%);
  outline-offset: 2px;
}
</style>
