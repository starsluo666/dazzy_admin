<script setup lang="ts">
import { computed } from 'vue'
import { Bell, Calendar, CircleCheck, Coin, DataAnalysis, Document, Grid, List, Menu as MenuIcon, Operation, Setting, User, UserFilled, Notebook, Timer } from '@element-plus/icons-vue'
import type { AdminMe, AdminPage } from '../types'

const props = defineProps<{ active: AdminPage; session: AdminMe | null }>()
const emit = defineEmits<{ navigate: [page: AdminPage]; logout: [] }>()

const can = (permission: string) => Boolean(
  props.session?.permissions?.includes('*') || props.session?.permissions?.includes(permission),
)
const navigation = computed(() => [
  { key: 'dashboard', label: '运营总览', icon: DataAnalysis, enabled: can('dashboard.view') },
  { key: 'users-group', label: '用户管理', icon: User, group: true, visible: can('user.view') },
  { key: 'users', label: '用户列表', icon: List, child: true, enabled: can('user.view'), visible: can('user.view') },
  { key: 'providers-group', label: '达人管理', icon: UserFilled, group: true, visible: can('provider.view') || can('provider.review') },
  { key: 'providers', label: '达人列表', icon: List, child: true, enabled: can('provider.view'), visible: can('provider.view') },
  { key: 'provider_reviews', label: '入驻审核', icon: CircleCheck, child: true, enabled: can('provider.review'), visible: can('provider.review') },
  { key: 'operations-group', label: '运营配置', icon: Operation, group: true, visible: can('service_category.view') || can('operations.manage') },
  { key: 'services', label: '服务分类', icon: Grid, child: true, enabled: can('service_category.view'), visible: can('service_category.view') },
  { key: 'platform_settings', label: '平台参数', icon: Setting, child: true, enabled: can('operations.manage'), visible: can('operations.manage') },
  { key: 'provider_rules', label: '接单规则', icon: Operation, child: true, enabled: can('operations.manage'), visible: can('operations.manage') },
  { key: 'activities', label: '活动管理', icon: Calendar, enabled: can('activity.view'), visible: can('activity.view') },
  { key: 'orders-group', label: '订单管理', icon: Document, group: true, visible: can('order.fulfillment.view') || can('order.after_sales.view') },
  { key: 'orders', label: '达人订单', icon: List, child: true, enabled: can('order.fulfillment.view'), visible: can('order.fulfillment.view') },
  { key: 'after_sales', label: '退款 / 售后', icon: Coin, child: true, enabled: can('order.after_sales.view'), visible: can('order.after_sales.view') },
  { key: 'settlements', label: '退款与结算', icon: Coin, enabled: false },
  { key: 'reports', label: '内容与举报', icon: MenuIcon, enabled: false },
  { key: 'system-group', label: '系统管理', icon: Setting, group: true, visible: can('organization.manage') || can('system.task.view') || can('audit.view') },
  { key: 'system', label: '账号与权限', icon: UserFilled, child: true, enabled: can('organization.manage'), visible: can('organization.manage') },
  { key: 'tasks', label: '任务中心', icon: Timer, child: true, enabled: can('system.task.view'), visible: can('system.task.view') },
  { key: 'audit_logs', label: '操作审计', icon: Notebook, child: true, enabled: can('audit.view'), visible: can('audit.view') },
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
  system: '系统管理 / 账号与权限',
  tasks: '系统管理 / 任务中心',
  audit_logs: '系统管理 / 操作审计',
}
function navigate(key: string, enabled: boolean) {
  if (enabled && ['dashboard', 'users', 'providers', 'provider_reviews', 'services', 'platform_settings', 'provider_rules', 'activities', 'orders', 'after_sales', 'system', 'tasks', 'audit_logs'].includes(key)) {
    emit('navigate', key as AdminPage)
  }
}
function groupActive(key: string) {
  return (key === 'users-group' && props.active === 'users')
    || (key === 'providers-group' && ['providers', 'provider_reviews'].includes(props.active))
    || (key === 'orders-group' && ['orders', 'after_sales'].includes(props.active))
    || (key === 'operations-group' && ['services', 'platform_settings', 'provider_rules'].includes(props.active))
    || (key === 'system-group' && ['system', 'tasks', 'audit_logs'].includes(props.active))
}
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-symbol">乐</div><div><strong>乐搭伴</strong><span>运营平台</span></div></div>
      <nav>
        <template v-for="item in navigation" :key="item.key">
          <div v-if="item.group" class="nav-group" :class="{ active: groupActive(item.key) }">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
          </div>
          <button
            v-else
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
        <el-badge is-dot><el-icon class="top-icon"><Bell /></el-icon></el-badge>
        <span class="scope">{{ scopeLabel }}</span>
        <el-dropdown @command="$emit('logout')"><div class="account"><el-avatar :size="34"><UserFilled /></el-avatar><span>{{ session?.user?.nickname || 'admin' }}⌄</span></div><template #dropdown><el-dropdown-menu><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </header>
      <main><slot /></main>
    </section>
  </div>
</template>
