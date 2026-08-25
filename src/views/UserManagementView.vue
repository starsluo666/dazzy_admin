<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Close,
  Lock,
  Refresh,
  Search,
  User,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import type {
  AccountStatus,
  AdminUser,
  AdminUserSummary,
  UserRiskLevel,
  VerificationStatus,
} from '../types'

const props = defineProps<{
  preview: boolean
  canManageStatus: boolean
  canManageRisk: boolean
}>()

const rows = ref<AdminUser[]>([])
const selected = ref<AdminUser | null>(null)
const summary = ref<AdminUserSummary>({ total: 0, verified: 0, providers: 0, flagged: 0, suspended: 0 })
const search = ref('')
const verificationFilter = ref<VerificationStatus | ''>('')
const accountFilter = ref<AccountStatus | ''>('')
const identityFilter = ref<'all' | 'provider' | 'user'>('all')
const riskFilter = ref<'all' | 'flagged' | 'unflagged'>('all')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const drawerVisible = ref(false)
const actionVisible = ref(false)
const actionSaving = ref(false)
const actionForm = reactive<{
  kind: 'account' | 'risk'
  action: 'restrict' | 'suspend' | 'restore' | 'mark' | 'clear'
  level: UserRiskLevel
  reason: string
}>({ kind: 'account', action: 'restrict', level: 'medium', reason: '' })

const accountLabels: Record<AccountStatus, string> = {
  active: '正常', restricted: '受限', suspended: '已封禁', closed: '已注销',
}
const verificationLabels: Record<VerificationStatus, string> = {
  unverified: '未认证', pending: '认证中', verified: '已认证', rejected: '认证未通过',
}
const riskLabels: Record<UserRiskLevel, string> = {
  low: '一般关注', medium: '重点关注', high: '高风险',
}

const summaryCards = computed(() => [
  { key: 'all', label: '注册用户', value: summary.value.total, icon: UserFilled, tone: 'blue' },
  { key: 'verified', label: '实名认证', value: summary.value.verified, icon: CircleCheck, tone: 'cyan' },
  { key: 'providers', label: '达人身份', value: summary.value.providers, icon: User, tone: 'purple' },
  { key: 'flagged', label: '风险用户', value: summary.value.flagged, icon: Warning, tone: 'red' },
  { key: 'suspended', label: '已封禁', value: summary.value.suspended, icon: Lock, tone: 'orange' },
])

function demoUser(index: number, overrides: Partial<AdminUser> = {}): AdminUser {
  const names = ['林晓晓', '陈宇航', '王一然', '张子墨', '李思思']
  const now = new Date().toISOString()
  return {
    public_id: `00000000-0000-0000-0000-00000000000${index + 1}`,
    nickname: names[index],
    phone_masked: `138****${6688 + index}`,
    avatar_url: null,
    gender: index % 2 ? 'male' : 'female',
    gender_label: index % 2 ? '男' : '女',
    birth_date: index % 2 ? '1998-06-18' : '2000-03-12',
    verification_status: 'verified',
    verification_status_label: '已认证',
    account_status: 'active',
    account_status_label: '正常',
    identity: index === 0 ? 'provider' : 'user',
    provider_status: index === 0 ? 'approved' : null,
    provider_status_label: index === 0 ? '已通过' : null,
    risk_flag: null,
    order_count: 3 + index * 2,
    activity_count: index,
    date_joined: `2026-08-${String(18 - index).padStart(2, '0')}T10:20:00+08:00`,
    last_login: now,
    recent_orders: [{
      order_no: `DZY20260823030${index + 1}`,
      service_name: '城市陪伴',
      provider_name: '晓晓',
      status: 'completed',
      status_label: '已完成',
      payable_amount: 26800,
      created_at: now,
    }],
    recent_activities: index ? [{
      id: index,
      title: '周末桌游同好局',
      status: 'recruiting',
      status_label: '报名中',
      starts_at: '2026-08-30T14:00:00+08:00',
    }] : [],
    addresses: index === 0 ? [{
      id: 1,
      name: '邯郸美乐城',
      address: '人民东路456号 2号楼1单元',
      city_name: '邯郸市',
      contact_name: '林晓晓',
      contact_gender: 'ms',
      contact_gender_label: '女士',
      contact_phone: '18800006666',
      longitude: '114.5120000',
      latitude: '36.6130000',
      is_default: true,
      updated_at: now,
    }] : [],
    ...overrides,
  }
}

function demoRows() {
  return [
    demoUser(0),
    demoUser(1, { risk_flag: {
      level: 'medium', level_label: '重点关注', reason: '多次取消已支付订单，建议持续观察',
      is_active: true, marked_by_name: '风控专员', marked_at: new Date().toISOString(),
      cleared_by_name: null, cleared_at: null, updated_at: new Date().toISOString(),
    } }),
    demoUser(2, { verification_status: 'unverified', verification_status_label: '未认证' }),
    demoUser(3, { account_status: 'suspended', account_status_label: '已封禁', risk_flag: {
      level: 'high', level_label: '高风险', reason: '疑似绕过平台进行私下交易',
      is_active: true, marked_by_name: '风控专员', marked_at: new Date().toISOString(),
      cleared_by_name: null, cleared_at: null, updated_at: new Date().toISOString(),
    } }),
    demoUser(4, { account_status: 'restricted', account_status_label: '受限', verification_status: 'pending', verification_status_label: '认证中' }),
  ]
}

function filteredDemoRows() {
  let items = demoRows()
  const keyword = search.value.trim().toLowerCase()
  if (keyword) items = items.filter((item) => [item.nickname, item.phone_masked].some((value) => value.toLowerCase().includes(keyword)))
  if (verificationFilter.value) items = items.filter((item) => item.verification_status === verificationFilter.value)
  if (accountFilter.value) items = items.filter((item) => item.account_status === accountFilter.value)
  if (identityFilter.value !== 'all') items = items.filter((item) => item.identity === identityFilter.value)
  if (riskFilter.value === 'flagged') items = items.filter((item) => item.risk_flag)
  if (riskFilter.value === 'unflagged') items = items.filter((item) => !item.risk_flag)
  return items
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
function formatAmount(amount: number) { return `¥${(amount / 100).toLocaleString()}` }
function formatCoordinate(value: string | number) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(7) : '—'
}
function accountTagType(status: AccountStatus) {
  if (status === 'active') return 'success'
  if (status === 'restricted') return 'warning'
  if (status === 'suspended') return 'danger'
  return 'info'
}
function verificationTagType(status: VerificationStatus) {
  if (status === 'verified') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      const all = demoRows()
      rows.value = filteredDemoRows()
      total.value = rows.value.length
      summary.value = {
        total: all.length,
        verified: all.filter((item) => item.verification_status === 'verified').length,
        providers: all.filter((item) => item.identity === 'provider').length,
        flagged: all.filter((item) => item.risk_flag).length,
        suspended: all.filter((item) => item.account_status === 'suspended').length,
      }
      return
    }
    const data = await adminApi.users({
      search: search.value.trim(),
      verification_status: verificationFilter.value,
      account_status: accountFilter.value,
      identity: identityFilter.value,
      risk: riskFilter.value,
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户数据加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  search.value = ''
  verificationFilter.value = ''
  accountFilter.value = ''
  identityFilter.value = 'all'
  riskFilter.value = 'all'
  page.value = 1
  load()
}

function selectSummary(key: string) {
  verificationFilter.value = key === 'verified' ? 'verified' : ''
  identityFilter.value = key === 'providers' ? 'provider' : 'all'
  riskFilter.value = key === 'flagged' ? 'flagged' : 'all'
  accountFilter.value = key === 'suspended' ? 'suspended' : ''
  page.value = 1
  load()
}

async function openDetail(row: AdminUser) {
  selected.value = row
  drawerVisible.value = true
  if (props.preview) return
  detailLoading.value = true
  try {
    selected.value = await adminApi.user(row.public_id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function openAction(kind: 'account' | 'risk', action: typeof actionForm.action) {
  actionForm.kind = kind
  actionForm.action = action
  actionForm.level = selected.value?.risk_flag?.level || 'medium'
  actionForm.reason = ''
  actionVisible.value = true
}

const actionTitle = computed(() => ({
  restrict: '限制用户账号', suspend: '封禁用户账号', restore: '恢复用户账号',
  mark: selected.value?.risk_flag ? '调整风险标记' : '标记风险用户', clear: '解除风险标记',
}[actionForm.action]))

async function submitAction() {
  if (!selected.value || actionSaving.value) return
  if (actionForm.reason.trim().length < 2) {
    ElMessage.warning('请填写明确的操作原因')
    return
  }
  actionSaving.value = true
  try {
    let updated: AdminUser
    if (props.preview) {
      const risk = actionForm.action === 'mark' ? {
        level: actionForm.level,
        level_label: riskLabels[actionForm.level],
        reason: actionForm.reason.trim(),
        is_active: true,
        marked_by_name: '运营管理员',
        marked_at: new Date().toISOString(),
        cleared_by_name: null,
        cleared_at: null,
        updated_at: new Date().toISOString(),
      } : actionForm.action === 'clear' ? null : selected.value.risk_flag
      const accountStatus: AccountStatus = actionForm.action === 'restrict' ? 'restricted'
        : actionForm.action === 'suspend' ? 'suspended'
          : actionForm.action === 'restore' ? 'active' : selected.value.account_status
      updated = { ...selected.value, risk_flag: risk, account_status: accountStatus, account_status_label: accountLabels[accountStatus] }
    } else if (actionForm.kind === 'account') {
      updated = await adminApi.changeUserAccount(
        selected.value.public_id,
        actionForm.action as 'restrict' | 'suspend' | 'restore',
        actionForm.reason.trim(),
      )
    } else {
      updated = await adminApi.changeUserRisk(
        selected.value.public_id,
        actionForm.action as 'mark' | 'clear',
        actionForm.reason.trim(),
        actionForm.action === 'mark' ? actionForm.level : undefined,
      )
    }
    selected.value = { ...selected.value, ...updated }
    rows.value = rows.value.map((item) => item.public_id === updated.public_id ? { ...item, ...updated } : item)
    actionVisible.value = false
    ElMessage.success(`${actionTitle.value}成功，已记录审计日志`)
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户操作失败')
  } finally {
    actionSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page user-management-page">
    <header class="page-heading management-heading">
      <div><h1>用户管理</h1><p>查询平台用户、认证与业务记录，处理账号状态和风险标记</p></div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
    </header>

    <section class="management-summary user-summary" aria-label="用户概况">
      <button v-for="card in summaryCards" :key="card.key" @click="selectSummary(card.key)">
        <el-icon :class="card.tone"><component :is="card.icon" /></el-icon>
        <span>{{ card.label }}</span><strong>{{ card.value }}</strong><small>点击筛选</small>
      </button>
    </section>

    <section class="management-panel">
      <header class="user-filters">
        <el-input v-model="search" clearable :prefix-icon="Search" placeholder="昵称 / 手机号" @keyup.enter="page = 1; load()" />
        <el-select v-model="identityFilter" placeholder="用户身份">
          <el-option label="全部身份" value="all" /><el-option label="普通用户" value="user" /><el-option label="达人用户" value="provider" />
        </el-select>
        <el-select v-model="verificationFilter" clearable placeholder="实名认证">
          <el-option v-for="(label, value) in verificationLabels" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="accountFilter" clearable placeholder="账号状态">
          <el-option v-for="(label, value) in accountLabels" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="riskFilter" placeholder="风险状态">
          <el-option label="全部风险" value="all" /><el-option label="已标记" value="flagged" /><el-option label="未标记" value="unflagged" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button><el-button type="primary" @click="page = 1; load()">查询</el-button>
      </header>

      <el-table v-loading="loading" :data="rows" height="calc(100vh - 370px)" empty-text="当前筛选条件下没有用户" @row-click="openDetail">
        <el-table-column label="用户" min-width="170">
          <template #default="scope"><div class="person-cell"><el-avatar :size="38" :src="scope.row.avatar_url || undefined">{{ scope.row.nickname.slice(0, 1) }}</el-avatar><div><strong>{{ scope.row.nickname }}</strong><span>{{ scope.row.phone_masked }}</span></div></div></template>
        </el-table-column>
        <el-table-column label="身份" width="90"><template #default="scope"><el-tag :type="scope.row.identity === 'provider' ? 'primary' : 'info'" effect="plain">{{ scope.row.identity === 'provider' ? '达人' : '用户' }}</el-tag></template></el-table-column>
        <el-table-column label="实名认证" width="105"><template #default="scope"><el-tag :type="verificationTagType(scope.row.verification_status)" effect="plain">{{ scope.row.verification_status_label }}</el-tag></template></el-table-column>
        <el-table-column label="账号状态" width="98"><template #default="scope"><el-tag :type="accountTagType(scope.row.account_status)" effect="plain">{{ scope.row.account_status_label }}</el-tag></template></el-table-column>
        <el-table-column label="业务记录" min-width="130"><template #default="scope"><div class="record-cell"><strong>{{ scope.row.order_count }} 笔订单</strong><span>{{ scope.row.activity_count }} 场活动</span></div></template></el-table-column>
        <el-table-column label="风险标记" min-width="150"><template #default="scope"><el-tag v-if="scope.row.risk_flag" :type="scope.row.risk_flag.level === 'high' ? 'danger' : 'warning'" effect="light">{{ scope.row.risk_flag.level_label }}</el-tag><span v-else class="normal-copy"><el-icon><CircleCheck /></el-icon> 无风险标记</span></template></el-table-column>
        <el-table-column label="注册时间" width="145"><template #default="scope">{{ formatDateTime(scope.row.date_joined) }}</template></el-table-column>
        <el-table-column label="操作" width="78" fixed="right"><template #default="scope"><el-button link type="primary" @click.stop="openDetail(scope.row)">查看详情</el-button></template></el-table-column>
      </el-table>
      <footer class="management-footer"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="pageSize" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="610px" :with-header="false" destroy-on-close>
      <div v-if="selected" v-loading="detailLoading" class="management-drawer">
        <header><div><h2>用户详情</h2><p>{{ selected.public_id }}</p></div><el-tag :type="accountTagType(selected.account_status)" effect="plain">{{ selected.account_status_label }}</el-tag><button aria-label="关闭用户详情" @click="drawerVisible = false"><el-icon><Close /></el-icon></button></header>
        <section class="identity-card"><el-avatar :size="58" :src="selected.avatar_url || undefined">{{ selected.nickname.slice(0, 1) }}</el-avatar><div><h3>{{ selected.nickname }} <el-tag size="small" effect="plain">{{ selected.identity === 'provider' ? '达人用户' : '普通用户' }}</el-tag></h3><p>{{ selected.phone_masked }} · {{ selected.gender_label }} · {{ selected.verification_status_label }}</p><span>注册于 {{ formatDateTime(selected.date_joined) }}</span></div></section>

        <el-alert v-if="selected.risk_flag" class="risk-alert" type="warning" :closable="false" show-icon :title="`${selected.risk_flag.level_label}：${selected.risk_flag.reason}`" :description="`${selected.risk_flag.marked_by_name} · ${formatDateTime(selected.risk_flag.marked_at)}`" />

        <section class="detail-section account-overview"><div><span>账号状态</span><strong>{{ selected.account_status_label }}</strong></div><div><span>实名认证</span><strong>{{ selected.verification_status_label }}</strong></div><div><span>达人状态</span><strong>{{ selected.provider_status_label || '非达人' }}</strong></div><div><span>最近登录</span><strong>{{ formatDateTime(selected.last_login) }}</strong></div></section>
        <section class="detail-section"><h3>业务概况</h3><div class="business-counts"><article><strong>{{ selected.order_count }}</strong><span>达人订单</span></article><article><strong>{{ selected.activity_count }}</strong><span>关联活动</span></article></div></section>
        <section class="detail-section"><div class="address-section-title"><h3>常用地址</h3><span>{{ selected.addresses?.length || 0 }} 条</span></div><div v-if="selected.addresses?.length" class="address-records"><article v-for="address in selected.addresses" :key="address.id"><header><strong>{{ address.name }}</strong><el-tag v-if="address.is_default" size="small" type="primary" effect="plain">默认</el-tag></header><p>{{ address.city_name }} {{ address.address }}</p><div class="address-contact"><span>联系人</span><strong>{{ address.contact_name }}{{ address.contact_gender_label }}</strong><span>手机号</span><strong>{{ address.contact_phone }}</strong></div><footer><span>经度 {{ formatCoordinate(address.longitude) }}</span><span>纬度 {{ formatCoordinate(address.latitude) }}</span></footer></article></div><el-empty v-else :image-size="48" description="暂无常用地址" /></section>
        <section class="detail-section"><h3>最近订单</h3><div v-if="selected.recent_orders?.length" class="compact-records"><article v-for="order in selected.recent_orders" :key="order.order_no"><div><strong>{{ order.service_name }}</strong><span>{{ order.order_no }} · 达人 {{ order.provider_name }}</span></div><div><b>{{ formatAmount(order.payable_amount) }}</b><el-tag size="small" effect="plain">{{ order.status_label }}</el-tag></div></article></div><el-empty v-else :image-size="48" description="暂无订单记录" /></section>
        <section class="detail-section"><h3>最近活动</h3><div v-if="selected.recent_activities?.length" class="compact-records"><article v-for="activity in selected.recent_activities" :key="activity.id"><div><strong>{{ activity.title }}</strong><span>{{ formatDateTime(activity.starts_at) }}</span></div><el-tag size="small" effect="plain">{{ activity.status_label }}</el-tag></article></div><el-empty v-else :image-size="48" description="暂无活动记录" /></section>
        <footer class="drawer-actions"><div><el-button v-if="canManageRisk && !selected.risk_flag" @click="openAction('risk', 'mark')">标记风险</el-button><el-button v-if="canManageRisk && selected.risk_flag" @click="openAction('risk', 'mark')">调整风险</el-button><el-button v-if="canManageRisk && selected.risk_flag" @click="openAction('risk', 'clear')">解除风险</el-button></div><div><el-button v-if="canManageStatus && selected.account_status === 'active'" @click="openAction('account', 'restrict')">限制账号</el-button><el-button v-if="canManageStatus && ['active', 'restricted'].includes(selected.account_status)" type="danger" @click="openAction('account', 'suspend')">封禁账号</el-button><el-button v-if="canManageStatus && ['restricted', 'suspended'].includes(selected.account_status)" type="primary" @click="openAction('account', 'restore')">恢复账号</el-button></div></footer>
      </div>
    </el-drawer>

    <el-dialog v-model="actionVisible" :title="actionTitle" width="480px" append-to-body>
      <el-alert v-if="actionForm.action === 'suspend'" type="error" :closable="false" show-icon title="封禁后现有登录态会立即失效，用户将无法重新登录。" />
      <el-form label-position="top" class="action-form">
        <el-form-item v-if="actionForm.action === 'mark'" label="风险等级"><el-select v-model="actionForm.level"><el-option v-for="(label, value) in riskLabels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="操作原因"><el-input v-model="actionForm.reason" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="请填写事实依据或复核结论，提交后写入审计日志" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="actionVisible = false">取消</el-button><el-button :type="actionForm.action === 'suspend' ? 'danger' : 'primary'" :loading="actionSaving" @click="submitAction">确认提交</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-management-page{min-height:calc(100vh - 76px)}.management-heading{margin-bottom:18px}.management-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.management-summary button{position:relative;display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto auto;align-items:center;min-height:88px;padding:14px 15px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.management-summary button:hover{border-color:#9cdfe0;box-shadow:0 8px 24px rgba(29,72,87,.08);transform:translateY(-1px)}.management-summary button:focus-visible{outline:3px solid rgba(8,184,189,.22);outline-offset:2px}.management-summary .el-icon{grid-row:1/3;width:40px;height:40px;border-radius:11px;font-size:21px}.management-summary .blue{color:#2679e9!important;background:#e9f1ff}.management-summary .cyan{color:#00aeb4!important;background:#e4f8f8}.management-summary .purple{color:#7b61cf;background:#f0edff}.management-summary .red{color:#d9485f;background:#fff0f2}.management-summary .orange{color:#e97825!important;background:#fff0e6}.management-summary span{color:var(--muted);font-size:12px}.management-summary strong{font-size:25px}.management-summary small{position:absolute;right:14px;bottom:14px;color:#a0a7b0}.management-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.user-filters{display:grid;grid-template-columns:minmax(190px,1.3fr) 120px 130px 120px 120px 66px 66px;gap:9px;padding:14px 16px;border-bottom:1px solid var(--line)}.person-cell{display:flex;align-items:center;gap:10px}.person-cell div,.record-cell{display:flex;flex-direction:column;gap:4px}.person-cell strong,.record-cell strong{font-size:13px}.person-cell span,.record-cell span{color:var(--muted);font-size:12px}.normal-copy{display:inline-flex;align-items:center;gap:4px;color:#078d76}.management-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.management-drawer{min-height:100%;padding-bottom:86px;background:#f7f9fb}.management-drawer>header{position:sticky;z-index:3;top:0;display:flex;align-items:center;gap:12px;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.management-drawer>header div{margin-right:auto}.management-drawer>header h2{margin:0;font-size:20px}.management-drawer>header p{max-width:350px;margin:5px 0 0;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis}.management-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.management-drawer>header button:hover{background:#f0f4f5}.identity-card{display:flex;gap:14px;margin:16px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.identity-card h3{display:flex;align-items:center;gap:8px;margin:2px 0 7px;font-size:17px}.identity-card p,.identity-card span{margin:0;color:#5e6877;font-size:12px}.identity-card span{display:block;margin-top:7px;color:var(--muted)}.risk-alert{margin:14px 20px 0;width:auto}.detail-section{margin:14px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.detail-section>h3{margin:0 0 15px;font-size:15px}.account-overview{display:grid;grid-template-columns:1fr 1fr;gap:16px}.account-overview div{display:flex;flex-direction:column;gap:5px}.account-overview span{color:var(--muted);font-size:12px}.account-overview strong{font-size:13px}.business-counts{display:grid;grid-template-columns:1fr 1fr;gap:10px}.business-counts article{display:flex;align-items:baseline;gap:8px;padding:13px;border-radius:7px;background:#f4f9fa}.business-counts strong{color:var(--brand);font-size:22px}.business-counts span{color:var(--muted);font-size:12px}.compact-records{display:flex;flex-direction:column}.compact-records article{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:58px;border-bottom:1px solid #edf0f3}.compact-records article:last-child{border-bottom:0}.compact-records article>div{display:flex;flex-direction:column;gap:4px}.compact-records article>div:last-child{align-items:end}.compact-records strong,.compact-records b{font-size:13px}.compact-records b{color:var(--orange)}.compact-records span{color:var(--muted);font-size:11px}.drawer-actions{position:fixed;right:0;bottom:0;z-index:4;display:flex;align-items:center;justify-content:space-between;width:610px;min-height:72px;padding:12px 20px;border-top:1px solid var(--line);background:#fff}.drawer-actions>div{display:flex;gap:7px}.action-form{margin-top:18px}.action-form .el-select{width:100%}:deep(.el-drawer__body){padding:0}:deep(.el-table__row){cursor:pointer}:deep(.el-table__row:hover td){background:#f2fbfb!important}:deep(.el-empty){padding:12px 0}@media(max-width:1360px){.management-summary small{display:none}.user-filters{grid-template-columns:minmax(170px,1fr) 110px 120px 110px 110px 62px 62px}}@media(prefers-reduced-motion:reduce){.management-summary button{transition:none}.management-summary button:hover{transform:none}}
.address-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.address-section-title h3{margin:0;font-size:15px}.address-section-title span{color:var(--muted);font-size:12px}.address-records{display:flex;flex-direction:column;gap:10px}.address-records article{padding:14px;border:1px solid #e4eaed;border-radius:8px;background:#fbfcfd}.address-records header{display:flex;align-items:center;gap:9px}.address-records header strong{font-size:14px}.address-records p{margin:8px 0 12px;color:#4f5967;font-size:13px;line-height:1.55}.address-contact{display:grid;grid-template-columns:52px 1fr 48px 1fr;align-items:center;gap:7px;padding:10px 12px;border-radius:6px;background:#f1f7f8}.address-contact span{color:var(--muted);font-size:11px}.address-contact strong{font-size:12px}.address-records footer{display:flex;gap:16px;margin-top:10px;color:#75808e;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
</style>
