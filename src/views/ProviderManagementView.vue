<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Close,
  CreditCard,
  Location,
  Refresh,
  Search,
  Service,
  Star,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatDateTime, formatMoney as formatAmount } from '../utils/format'
import type {
  AdminProvider,
  AdminProviderSummary,
  ProviderIdentityStatus,
  ProviderApplicationStatus,
} from '../types'

const props = defineProps<{
  preview: boolean
  canManage: boolean
  canAdjustCredit: boolean
  canReview: boolean
}>()
const emit = defineEmits<{ review: [] }>()

const rows = ref<AdminProvider[]>([])
const selected = ref<AdminProvider | null>(null)
const summary = ref<AdminProviderSummary>({ total: 0, accepting: 0, restricted: 0, suspended: 0, pending: 0 })
const search = ref('')
const cityFilter = ref('')
const statusFilter = ref<ProviderApplicationStatus | ''>('')
const identityFilter = ref<ProviderIdentityStatus | ''>('')
const acceptingFilter = ref<'all' | 'accepting' | 'paused' | 'restricted'>('all')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const drawerVisible = ref(false)
const actionVisible = ref(false)
const actionSaving = ref(false)
const identityReviewing = ref(false)
const actionForm = reactive<{
  kind: 'status' | 'credit'
  action: 'restrict_orders' | 'resume_orders' | 'suspend_qualification' | 'restore_qualification'
  delta: number
  reason: string
}>({ kind: 'status', action: 'restrict_orders', delta: -2, reason: '' })

const statusLabels: Record<ProviderApplicationStatus, string> = {
  draft: '草稿', pending: '待审核', approved: '已通过', rejected: '已驳回', suspended: '已暂停',
}
const identityLabels: Record<ProviderIdentityStatus, string> = {
  unverified: '未认证', pending: '认证中', verified: '已认证', rejected: '认证未通过',
}

const summaryCards = computed(() => [
  { key: 'all', label: '全部达人', value: summary.value.total, icon: UserFilled, tone: 'blue' },
  { key: 'accepting', label: '在线达人', value: summary.value.accepting, icon: CircleCheck, tone: 'cyan' },
  { key: 'restricted', label: '接单受限', value: summary.value.restricted, icon: Warning, tone: 'orange' },
  { key: 'suspended', label: '资格暂停', value: summary.value.suspended, icon: Service, tone: 'red' },
  { key: 'pending', label: '待审核', value: summary.value.pending, icon: CreditCard, tone: 'purple' },
])

function demoProvider(index: number, overrides: Partial<AdminProvider> = {}): AdminProvider {
  const names = ['林晓晓', '陈宇航', '王一然', '张子墨', '李思思']
  const now = new Date().toISOString()
  return {
    id: index + 1,
    public_id: `10000000-0000-0000-0000-00000000000${index + 1}`,
    nickname: names[index], phone_masked: `139****${2211 + index}`,
    gender: index % 2 ? 'male' : 'female', gender_label: index % 2 ? '男' : '女',
    birth_date: index % 2 ? '1998-06-18' : '2000-03-12',
    identity_status: 'verified', identity_status_label: '已认证',
    account_status: 'active', account_status_label: '正常',
    status: 'approved', status_label: '已通过',
    bio: '热爱城市探索与摄影，熟悉本地路线，性格开朗有耐心。',
    lifestyle_photo_available: true, lifestyle_photo_url: null,
    service_city_code: '130400', service_city_name: '邯郸市',
    is_online: index !== 2, has_live_location: true,
    current_longitude: '114.5389610', current_latitude: '36.6256570',
    location_accuracy_m: '18.50', location_updated_at: now,
    location_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    max_service_radius_km: 20,
    rating: index ? '4.80' : '4.92', service_count: 56 + index * 18, order_count: 64 + index * 20,
    credit_score: 100 - index * 4, is_accepting_orders: index !== 2,
    admin_order_restricted: false, admin_restriction_reason: '',
    service_names: ['城市陪伴', index % 2 ? '桌游陪玩' : '旅游陪伴'],
    services: [
      { id: 1, category: '城市陪伴', billing_type: 'hourly', billing_type_label: '按小时', price_amount: 16800, estimated_duration_minutes: null, description: '城市漫步、探店和拍照陪伴', is_active: true },
      { id: 2, category: '桌游陪玩', billing_type: 'per_session', billing_type_label: '按次', price_amount: 25800, estimated_duration_minutes: 180, description: '桌游规则讲解与陪玩', is_active: true },
    ],
    weekly_availability: [
      { weekday: 5, weekday_label: '六', starts_at: '13:00:00', ends_at: '18:00:00', is_active: true },
      { weekday: 6, weekday_label: '日', starts_at: '10:00:00', ends_at: '17:00:00', is_active: true },
    ],
    credit_adjustments: index === 1 ? [{ id: 1, delta: -2, before_score: 100, after_score: 98, reason: '接单前主动拒单', operator_name: '系统规则', organization_name: '乐搭伴运营平台', created_at: now }] : [],
    recent_orders: [{ order_no: `DZY20260823040${index + 1}`, customer_name: '张女士', service_name: '城市陪伴', status: 'completed', status_label: '已完成', payable_amount: 33600, created_at: now }],
    submitted_at: '2026-08-15T10:20:00+08:00', reviewed_at: '2026-08-16T09:30:00+08:00', rejection_reason: '',
    identity_real_name: names[index], identity_number_masked: '1304**********1234',
    identity_front_photo_url: null, identity_back_photo_url: null, identity_face_photo_url: null,
    identity_submitted_at: now, identity_reviewed_at: now, identity_rejection_reason: '',
    is_profile_complete: true,
    created_at: now, updated_at: now,
    ...overrides,
  }
}

function demoRows() {
  return [
    demoProvider(0),
    demoProvider(1, { credit_score: 82 }),
    demoProvider(2, { is_online: false, is_accepting_orders: false, admin_order_restricted: true, admin_restriction_reason: '服务投诉待复核' }),
    demoProvider(3, { status: 'suspended', status_label: '已暂停', is_online: false, is_accepting_orders: false, admin_order_restricted: true, admin_restriction_reason: '资料真实性复核中' }),
    demoProvider(4, { status: 'pending', status_label: '待审核', is_online: false, is_accepting_orders: false, has_live_location: false, current_longitude: null, current_latitude: null, location_accuracy_m: null, location_updated_at: null, location_expires_at: null, service_count: 0, order_count: 0, service_names: [], services: [], weekly_availability: [] }),
  ]
}

function filteredDemoRows() {
  let items = demoRows()
  const keyword = search.value.trim().toLowerCase()
  if (keyword) items = items.filter((item) => [item.nickname, item.phone_masked].some((value) => value.toLowerCase().includes(keyword)))
  if (cityFilter.value) items = items.filter((item) => item.service_city_code === cityFilter.value)
  if (statusFilter.value) items = items.filter((item) => item.status === statusFilter.value)
  if (identityFilter.value) items = items.filter((item) => item.identity_status === identityFilter.value)
  if (acceptingFilter.value === 'accepting') items = items.filter((item) => item.is_online)
  if (acceptingFilter.value === 'paused') items = items.filter((item) => item.status === 'approved' && !item.is_online && !item.admin_order_restricted)
  if (acceptingFilter.value === 'restricted') items = items.filter((item) => item.admin_order_restricted)
  return items
}

function coordinateLabel(provider: AdminProvider) {
  if (!provider.current_longitude || !provider.current_latitude) return '未记录坐标'
  return `${provider.current_longitude}, ${provider.current_latitude}`
}
function statusTagType(status: ProviderApplicationStatus) {
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'rejected' || status === 'suspended') return 'danger'
  return 'info'
}
function serviceState(provider: AdminProvider) {
  if (provider.status === 'suspended') return { label: '资格暂停', type: 'danger' as const }
  if (provider.admin_order_restricted) return { label: '平台限制', type: 'warning' as const }
  if (provider.status !== 'approved') return { label: '不可接单', type: 'info' as const }
  if (provider.identity_status !== 'verified') return { label: '待实名', type: 'warning' as const }
  if (!provider.is_profile_complete) return { label: '待完善资料', type: 'warning' as const }
  if (provider.is_online) return { label: '在线', type: 'success' as const }
  return { label: '离线', type: 'info' as const }
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
        accepting: all.filter((item) => item.is_online).length,
        restricted: all.filter((item) => item.admin_order_restricted).length,
        suspended: all.filter((item) => item.status === 'suspended').length,
        pending: all.filter((item) => item.status === 'pending').length,
      }
      return
    }
    const data = await adminApi.managedProviders({
      search: search.value.trim(), city_code: cityFilter.value, status: statusFilter.value,
      identity_status: identityFilter.value, accepting: acceptingFilter.value,
      page: page.value, page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '达人数据加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  search.value = ''; cityFilter.value = ''; statusFilter.value = ''; identityFilter.value = ''; acceptingFilter.value = 'all'; page.value = 1; load()
}
function selectSummary(key: string) {
  statusFilter.value = key === 'suspended' ? 'suspended' : key === 'pending' ? 'pending' : ''
  acceptingFilter.value = key === 'accepting' ? 'accepting' : key === 'restricted' ? 'restricted' : 'all'
  page.value = 1; load()
}
async function openDetail(row: AdminProvider) {
  selected.value = row
  drawerVisible.value = true
  if (props.preview) return
  detailLoading.value = true
  try { selected.value = await adminApi.managedProvider(row.id) }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '达人详情加载失败') }
  finally { detailLoading.value = false }
}

const actionTitles = {
  restrict_orders: '限制达人接单', resume_orders: '解除接单限制',
  suspend_qualification: '暂停达人资格', restore_qualification: '恢复达人资格',
}
const actionTitle = computed(() => actionForm.kind === 'credit' ? '调整信用分' : actionTitles[actionForm.action])

function openStatusAction(action: typeof actionForm.action) {
  actionForm.kind = 'status'; actionForm.action = action; actionForm.reason = ''; actionVisible.value = true
}
function openCreditAction() {
  actionForm.kind = 'credit'; actionForm.delta = -2; actionForm.reason = ''; actionVisible.value = true
}
async function submitAction() {
  if (!selected.value || actionSaving.value) return
  if (actionForm.reason.trim().length < 2) { ElMessage.warning('请填写明确的操作原因'); return }
  if (actionForm.kind === 'credit' && actionForm.delta === 0) { ElMessage.warning('调整分值不能为 0'); return }
  actionSaving.value = true
  try {
    let updated: AdminProvider
    if (props.preview) {
      const next = { ...selected.value }
      if (actionForm.kind === 'credit') {
        const after = next.credit_score + actionForm.delta
        if (after < 0 || after > 100) throw new Error('调整后信用分必须在 0–100 分之间')
        next.credit_adjustments = [{ id: Date.now(), delta: actionForm.delta, before_score: next.credit_score, after_score: after, reason: actionForm.reason, operator_name: '运营管理员', organization_name: '乐搭伴运营平台', created_at: new Date().toISOString() }, ...next.credit_adjustments]
        next.credit_score = after
      } else if (actionForm.action === 'restrict_orders') {
        next.admin_order_restricted = true; next.is_accepting_orders = false; next.is_online = false; next.admin_restriction_reason = actionForm.reason
      } else if (actionForm.action === 'resume_orders') {
        next.admin_order_restricted = false; next.is_accepting_orders = false; next.is_online = false; next.admin_restriction_reason = ''
      } else if (actionForm.action === 'suspend_qualification') {
        next.status = 'suspended'; next.status_label = '已暂停'; next.admin_order_restricted = true; next.is_accepting_orders = false; next.is_online = false; next.admin_restriction_reason = actionForm.reason
      } else {
        next.status = 'approved'; next.status_label = '已通过'; next.admin_order_restricted = false; next.is_accepting_orders = false; next.is_online = false; next.admin_restriction_reason = ''
      }
      updated = next
    } else if (actionForm.kind === 'credit') {
      updated = await adminApi.adjustProviderCredit(selected.value.id, actionForm.delta, actionForm.reason.trim())
    } else {
      updated = await adminApi.changeProviderStatus(selected.value.id, actionForm.action, actionForm.reason.trim())
    }
    selected.value = { ...selected.value, ...updated }
    rows.value = rows.value.map((item) => item.id === updated.id ? { ...item, ...updated } : item)
    actionVisible.value = false
    ElMessage.success(`${actionTitle.value}成功，已记录审计日志`)
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '达人操作失败')
  } finally { actionSaving.value = false }
}

async function reviewIdentity(decision: 'approve' | 'reject') {
  if (!selected.value || identityReviewing.value) return
  let reason = ''
  if (decision === 'reject') {
    try {
      const result = await ElMessageBox.prompt('请填写实名认证未通过原因，达人将看到该说明。', '驳回实名认证', { inputValidator: value => Boolean(value.trim()) || '必须填写原因' })
      reason = result.value.trim()
    } catch { return }
  } else {
    try { await ElMessageBox.confirm('确认身份信息与三张认证材料一致并通过核验吗？', '通过实名认证', { type: 'warning' }) }
    catch { return }
  }
  identityReviewing.value = true
  try {
    const updated = props.preview
      ? { ...selected.value, identity_status: decision === 'approve' ? 'verified' as const : 'rejected' as const, identity_status_label: decision === 'approve' ? '已认证' : '认证未通过', identity_rejection_reason: reason }
      : await adminApi.reviewProviderIdentity(selected.value.id, decision, reason)
    selected.value = { ...selected.value, ...updated }
    rows.value = rows.value.map(item => item.id === updated.id ? { ...item, ...updated } : item)
    ElMessage.success(decision === 'approve' ? '实名认证已通过' : '实名认证已驳回')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '实名认证审核失败') }
  finally { identityReviewing.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page provider-management-page">
    <header class="page-heading management-heading"><div><h1>达人管理</h1><p>查看达人服务、档期、订单与信用信息，管理接单和资格状态</p></div><div><el-button v-if="canReview" @click="emit('review')">入驻审核 <el-badge v-if="summary.pending" :value="summary.pending" /></el-button><el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button></div></header>

    <section class="provider-summary" aria-label="达人概况"><button v-for="card in summaryCards" :key="card.key" @click="selectSummary(card.key)"><el-icon :class="card.tone"><component :is="card.icon" /></el-icon><span>{{ card.label }}</span><strong>{{ card.value }}</strong><small>点击筛选</small></button></section>

    <section class="provider-panel">
      <header class="provider-filters"><el-input v-model="search" clearable :prefix-icon="Search" placeholder="达人昵称 / 手机号" @keyup.enter="page = 1; load()" /><el-select v-model="cityFilter" clearable placeholder="服务城市"><el-option label="邯郸市" value="130400" /><el-option label="北京市" value="110100" /><el-option label="上海市" value="310100" /></el-select><el-select v-model="statusFilter" clearable placeholder="入驻状态"><el-option v-for="(label, value) in statusLabels" :key="value" :label="label" :value="value" /></el-select><el-select v-model="acceptingFilter" placeholder="定位状态"><el-option label="全部状态" value="all" /><el-option label="在线" value="accepting" /><el-option label="离线" value="paused" /><el-option label="平台限制" value="restricted" /></el-select><el-select v-model="identityFilter" clearable placeholder="达人实名认证"><el-option v-for="(label, value) in identityLabels" :key="value" :label="label" :value="value" /></el-select><el-button @click="resetFilters">重置</el-button><el-button type="primary" @click="page = 1; load()">查询</el-button></header>

      <el-table v-loading="loading" :data="rows" height="calc(100vh - 370px)" empty-text="当前筛选条件下没有达人" @row-click="openDetail">
        <el-table-column label="达人" min-width="170"><template #default="scope"><div class="provider-person"><el-avatar :size="38">{{ scope.row.nickname.slice(0, 1) }}</el-avatar><div><strong>{{ scope.row.nickname }}</strong><span>{{ scope.row.phone_masked }} · {{ scope.row.service_city_name }}</span></div></div></template></el-table-column>
        <el-table-column label="服务项目" min-width="165"><template #default="scope"><div class="service-names"><el-tag v-for="name in scope.row.service_names.slice(0, 2)" :key="name" size="small" effect="plain">{{ name }}</el-tag><span v-if="!scope.row.service_names.length">尚未配置</span></div></template></el-table-column>
        <el-table-column label="达人状态" width="96"><template #default="scope"><el-tag :type="statusTagType(scope.row.status)" effect="plain">{{ scope.row.status_label }}</el-tag></template></el-table-column>
        <el-table-column label="实名认证" width="105"><template #default="scope"><el-tag :type="scope.row.identity_status === 'verified' ? 'success' : scope.row.identity_status === 'rejected' ? 'danger' : 'warning'" effect="plain">{{ scope.row.identity_status_label }}</el-tag></template></el-table-column>
        <el-table-column label="定位状态" width="100"><template #default="scope"><el-tag :type="serviceState(scope.row).type" effect="light">{{ serviceState(scope.row).label }}</el-tag></template></el-table-column>
        <el-table-column label="信用 / 评分" width="120"><template #default="scope"><div class="score-cell"><strong>{{ scope.row.credit_score }}分</strong><span><el-icon><Star /></el-icon>{{ scope.row.rating }}</span></div></template></el-table-column>
        <el-table-column label="服务数据" min-width="120"><template #default="scope"><div class="score-cell"><strong>{{ scope.row.service_count }} 次服务</strong><span>{{ scope.row.order_count }} 笔订单</span></div></template></el-table-column>
        <el-table-column label="更新时间" width="145"><template #default="scope">{{ formatDateTime(scope.row.updated_at) }}</template></el-table-column>
        <el-table-column label="操作" width="78" fixed="right"><template #default="scope"><el-button link type="primary" @click.stop="openDetail(scope.row)">查看详情</el-button></template></el-table-column>
      </el-table>
      <footer class="provider-footer"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="pageSize" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="640px" :with-header="false" destroy-on-close>
      <div v-if="selected" v-loading="detailLoading" class="provider-drawer">
        <header><div><h2>达人详情</h2><p>PA{{ selected.id.toString().padStart(10, '0') }}</p></div><el-tag :type="statusTagType(selected.status)" effect="plain">{{ selected.status_label }}</el-tag><button aria-label="关闭达人详情" @click="drawerVisible = false"><el-icon><Close /></el-icon></button></header>
        <el-alert v-if="selected.admin_order_restricted" class="restriction-alert" :type="selected.status === 'suspended' ? 'error' : 'warning'" :closable="false" show-icon :title="serviceState(selected).label" :description="selected.admin_restriction_reason || '平台已限制该达人接单'" />
        <section class="provider-identity"><el-avatar :size="60">{{ selected.nickname.slice(0, 1) }}</el-avatar><div><h3>{{ selected.nickname }} <el-tag size="small" :type="serviceState(selected).type" effect="plain">{{ serviceState(selected).label }}</el-tag></h3><p>{{ selected.phone_masked }} · {{ selected.gender_label }} · {{ selected.service_city_name }}</p><span>{{ selected.identity_status_label }} · 服务半径 {{ selected.max_service_radius_km }}km</span></div><div class="credit-score"><strong>{{ selected.credit_score }}</strong><span>信用分</span></div></section>
        <section class="detail-section"><div class="section-title"><h3>达人实名认证</h3><el-tag :type="selected.identity_status === 'verified' ? 'success' : selected.identity_status === 'rejected' ? 'danger' : 'warning'" effect="plain">{{ selected.identity_status_label }}</el-tag></div><div v-if="selected.identity_status !== 'unverified'" class="identity-review"><div class="identity-fields"><span>真实姓名</span><strong>{{ selected.identity_real_name || '—' }}</strong><span>证件号码</span><strong>{{ selected.identity_number_masked || '—' }}</strong><span>提交时间</span><strong>{{ formatDateTime(selected.identity_submitted_at) }}</strong></div><div class="identity-photos"><el-image v-for="(url,label) in { '身份证人像面':selected.identity_front_photo_url,'身份证国徽面':selected.identity_back_photo_url,'本人核验照片':selected.identity_face_photo_url }" :key="label" :src="url || ''" :preview-src-list="url ? [url] : []" fit="cover" preview-teleported><template #error><span>{{ label }}未上传</span></template></el-image></div><el-alert v-if="selected.identity_rejection_reason" type="error" :closable="false" :title="selected.identity_rejection_reason"/><div v-if="canReview && selected.identity_status === 'pending'" class="identity-actions"><el-button :loading="identityReviewing" @click="reviewIdentity('reject')">驳回认证</el-button><el-button type="primary" :loading="identityReviewing" @click="reviewIdentity('approve')">通过认证</el-button></div></div><el-empty v-else :image-size="48" description="达人尚未提交实名认证" /></section>
        <section class="detail-section"><div class="section-title"><h3>当前接单位置</h3><el-tag size="small" :type="selected.is_online ? 'success' : 'info'" effect="plain">{{ selected.is_online ? '在线' : '离线' }}</el-tag></div><div v-if="selected.has_live_location" class="service-location"><el-icon><Location /></el-icon><div><strong>{{ coordinateLabel(selected) }}</strong><p>定位精度约 {{ selected.location_accuracy_m || '—' }} 米 · 服务半径 {{ selected.max_service_radius_km }}km</p><span>最后更新 {{ formatDateTime(selected.location_updated_at) }} · 有效至 {{ formatDateTime(selected.location_expires_at) }}</span></div></div><el-empty v-else :image-size="48" description="达人尚未上报接单位置" /><p class="location-privacy">精确坐标仅供平台管理和距离计算使用，用户端只展示距离。</p></section>
        <section class="detail-section provider-metrics"><div><span>综合评分</span><strong>{{ selected.rating }}</strong></div><div><span>服务次数</span><strong>{{ selected.service_count }}</strong></div><div><span>订单总量</span><strong>{{ selected.order_count }}</strong></div><div><span>服务项目</span><strong>{{ selected.service_names.length }}</strong></div></section>
        <section class="detail-section"><h3>达人资料</h3><p class="provider-bio">{{ selected.bio || '达人尚未填写个人简介' }}</p><div v-if="selected.lifestyle_photo_available" class="photo-status"><span>生活照</span><el-image v-if="selected.lifestyle_photo_url" :src="selected.lifestyle_photo_url" :preview-src-list="[selected.lifestyle_photo_url]" fit="cover" preview-teleported /><el-tag v-else type="success" effect="plain">已留存，仅审核人员可查看</el-tag></div></section>
        <section class="detail-section"><h3>服务配置</h3><div v-if="selected.services.length" class="service-cards"><article v-for="service in selected.services" :key="service.id"><header><strong>{{ service.category }}</strong><el-tag size="small" :type="service.is_active ? 'success' : 'info'" effect="plain">{{ service.is_active ? '启用' : '停用' }}</el-tag></header><p>{{ service.billing_type_label }} · <b>{{ formatAmount(service.price_amount) }}</b><template v-if="service.estimated_duration_minutes"> · {{ service.estimated_duration_minutes }}分钟</template></p><span>{{ service.description || '暂无服务说明' }}</span></article></div><el-empty v-else :image-size="48" description="尚未配置服务项目" /></section>
        <section class="detail-section"><h3>每周档期</h3><div v-if="selected.weekly_availability.length" class="schedule-list"><span v-for="slot in selected.weekly_availability" :key="`${slot.weekday}-${slot.starts_at}`">周{{ slot.weekday_label }}　{{ slot.starts_at.slice(0, 5) }}–{{ slot.ends_at.slice(0, 5) }}</span></div><el-empty v-else :image-size="48" description="尚未配置每周档期" /></section>
        <section class="detail-section"><h3>最近订单</h3><div v-if="selected.recent_orders?.length" class="provider-records"><article v-for="order in selected.recent_orders" :key="order.order_no"><div><strong>{{ order.service_name }}</strong><span>{{ order.order_no }} · 用户 {{ order.customer_name }}</span></div><div><b>{{ formatAmount(order.payable_amount) }}</b><el-tag size="small" effect="plain">{{ order.status_label }}</el-tag></div></article></div><el-empty v-else :image-size="48" description="暂无订单记录" /></section>
        <section class="detail-section"><h3>信用分记录</h3><div v-if="selected.credit_adjustments.length" class="credit-history"><article v-for="item in selected.credit_adjustments" :key="item.id"><strong :class="item.delta > 0 ? 'positive' : 'negative'">{{ item.delta > 0 ? '+' : '' }}{{ item.delta }}</strong><div><b>{{ item.reason }}</b><span>{{ item.before_score }} → {{ item.after_score }} · {{ item.operator_name }} · {{ formatDateTime(item.created_at) }}</span></div></article></div><el-empty v-else :image-size="48" description="暂无人工调整记录" /></section>
        <footer class="provider-actions"><el-button v-if="canAdjustCredit && ['approved', 'suspended'].includes(selected.status)" @click="openCreditAction">调整信用分</el-button><div><el-button v-if="canManage && selected.status === 'approved' && !selected.admin_order_restricted" @click="openStatusAction('restrict_orders')">限制接单</el-button><el-button v-if="canManage && selected.status === 'approved' && selected.admin_order_restricted" type="primary" @click="openStatusAction('resume_orders')">解除限制</el-button><el-button v-if="canManage && selected.status === 'approved'" type="danger" @click="openStatusAction('suspend_qualification')">暂停资格</el-button><el-button v-if="canManage && selected.status === 'suspended'" type="primary" @click="openStatusAction('restore_qualification')">恢复资格</el-button></div></footer>
      </div>
    </el-drawer>

    <el-dialog v-model="actionVisible" :title="actionTitle" width="480px" append-to-body>
      <el-alert v-if="actionForm.action === 'suspend_qualification' && actionForm.kind === 'status'" type="error" :closable="false" show-icon title="暂停后达人无法使用达人端，也不能接受新预约。" />
      <el-form label-position="top" class="provider-action-form"><el-form-item v-if="actionForm.kind === 'credit'" label="调整分值"><el-input-number v-model="actionForm.delta" :min="-100" :max="100" /><span class="score-preview">调整后 {{ Math.max(0, Math.min(100, (selected?.credit_score || 0) + actionForm.delta)) }} 分</span></el-form-item><el-form-item label="操作原因"><el-input v-model="actionForm.reason" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="请填写投诉、复核或规则依据，提交后写入审计日志" /></el-form-item></el-form>
      <template #footer><el-button @click="actionVisible = false">取消</el-button><el-button :type="actionForm.action === 'suspend_qualification' ? 'danger' : 'primary'" :loading="actionSaving" @click="submitAction">确认提交</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.provider-management-page{min-height:calc(100vh - 76px)}.management-heading{margin-bottom:18px}.management-heading>div:last-child{display:flex;gap:8px}.provider-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.provider-summary button{position:relative;display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto auto;align-items:center;min-height:88px;padding:14px 15px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.provider-summary button:hover{border-color:#9cdfe0;box-shadow:0 8px 24px rgba(29,72,87,.08);transform:translateY(-1px)}.provider-summary button:focus-visible{outline:3px solid rgba(8,184,189,.22);outline-offset:2px}.provider-summary .el-icon{grid-row:1/3;width:40px;height:40px;border-radius:11px;font-size:21px}.provider-summary .blue{color:#2679e9!important;background:#e9f1ff}.provider-summary .cyan{color:#00aeb4!important;background:#e4f8f8}.provider-summary .purple{color:#7b61cf;background:#f0edff}.provider-summary .red{color:#d9485f;background:#fff0f2}.provider-summary .orange{color:#e97825!important;background:#fff0e6}.provider-summary span{color:var(--muted);font-size:12px}.provider-summary strong{font-size:25px}.provider-summary small{position:absolute;right:14px;bottom:14px;color:#a0a7b0}.provider-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.provider-filters{display:grid;grid-template-columns:minmax(190px,1.3fr) 115px 120px 120px 120px 66px 66px;gap:9px;padding:14px 16px;border-bottom:1px solid var(--line)}.provider-person{display:flex;align-items:center;gap:10px}.provider-person>div,.score-cell{display:flex;flex-direction:column;gap:4px}.provider-person strong,.score-cell strong{font-size:13px}.provider-person span,.score-cell span{color:var(--muted);font-size:12px}.score-cell span{display:flex;align-items:center;gap:3px}.score-cell .el-icon{color:#efa834}.service-names{display:flex;flex-wrap:wrap;gap:4px}.service-names>span{color:var(--muted);font-size:12px}.provider-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.provider-drawer{min-height:100%;padding-bottom:86px;background:#f7f9fb}.provider-drawer>header{position:sticky;z-index:3;top:0;display:flex;align-items:center;gap:12px;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.provider-drawer>header div{margin-right:auto}.provider-drawer>header h2{margin:0;font-size:20px}.provider-drawer>header p{margin:5px 0 0;color:var(--muted);font-size:12px}.provider-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.provider-drawer>header button:hover{background:#f0f4f5}.restriction-alert{margin:14px 20px 0;width:auto}.provider-identity{display:flex;align-items:center;gap:14px;margin:14px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.provider-identity>div:nth-child(2){flex:1}.provider-identity h3{display:flex;align-items:center;gap:8px;margin:0 0 7px;font-size:17px}.provider-identity p,.provider-identity span{margin:0;color:#5e6877;font-size:12px}.provider-identity span{display:block;margin-top:7px;color:var(--muted)}.credit-score{display:flex;flex-direction:column;align-items:center;width:72px;padding:9px;border-radius:8px;background:#f2fbfb}.credit-score strong{color:var(--brand);font-size:25px}.credit-score span{margin:2px 0 0}.detail-section{margin:14px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.detail-section>h3{margin:0 0 15px;font-size:15px}.section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.section-title h3{margin:0;font-size:15px}.service-location{display:flex;align-items:flex-start;gap:12px;padding:13px;border-radius:8px;background:#f3fafb}.service-location>.el-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;color:var(--brand);background:#dff5f5;font-size:19px}.service-location>div{display:flex;flex-direction:column;gap:5px;min-width:0}.service-location strong{font-size:14px}.service-location p{margin:0;color:#4e5a68;font-size:12px;line-height:1.5}.service-location span{color:var(--muted);font-size:11px}.location-privacy{margin:12px 0 0;color:#8b6c55;font-size:11px;line-height:1.5}.provider-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.provider-metrics div{display:flex;flex-direction:column;gap:5px}.provider-metrics span{color:var(--muted);font-size:11px}.provider-metrics strong{font-size:19px}.provider-bio{margin:0;color:#4f5a68;font-size:13px;line-height:1.75}.photo-status{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid #edf0f3;font-size:13px}.photo-status .el-image{width:92px;height:72px;border-radius:7px}.service-cards{display:grid;grid-template-columns:1fr 1fr;gap:9px}.service-cards article{padding:12px;border:1px solid #e6eaed;border-radius:7px}.service-cards header{display:flex;align-items:center;justify-content:space-between}.service-cards strong{font-size:13px}.service-cards p{margin:8px 0;color:#596474;font-size:12px}.service-cards b{color:var(--orange)}.service-cards span{color:var(--muted);font-size:11px}.schedule-list{display:flex;flex-wrap:wrap;gap:7px}.schedule-list span{padding:7px 10px;border-radius:5px;color:#485464;background:#f2f7f8;font-size:12px}.provider-records,.credit-history{display:flex;flex-direction:column}.provider-records article,.credit-history article{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;border-bottom:1px solid #edf0f3}.provider-records article:last-child,.credit-history article:last-child{border-bottom:0}.provider-records article>div{display:flex;flex-direction:column;gap:4px}.provider-records article>div:last-child{align-items:end}.provider-records strong,.provider-records b{font-size:13px}.provider-records b{color:var(--orange)}.provider-records span,.credit-history span{color:var(--muted);font-size:11px}.credit-history{gap:0}.credit-history article{justify-content:flex-start}.credit-history>article>strong{display:grid;place-items:center;width:42px;height:34px;border-radius:6px}.credit-history .positive{color:#078d76;background:#ecf9f5}.credit-history .negative{color:#d9485f;background:#fff0f2}.credit-history div{display:flex;flex-direction:column;gap:4px}.credit-history b{font-size:12px}.provider-actions{position:fixed;right:0;bottom:0;z-index:4;display:flex;align-items:center;justify-content:space-between;width:640px;min-height:72px;padding:12px 20px;border-top:1px solid var(--line);background:#fff}.provider-actions>div{display:flex;gap:7px}.provider-action-form{margin-top:18px}.score-preview{margin-left:12px;color:var(--muted);font-size:12px}:deep(.el-drawer__body){padding:0}:deep(.el-table__row){cursor:pointer}:deep(.el-table__row:hover td){background:#f2fbfb!important}:deep(.el-empty){padding:12px 0}@media(max-width:1360px){.provider-summary small{display:none}.provider-filters{grid-template-columns:minmax(170px,1fr) 105px 110px 110px 110px 62px 62px}}@media(prefers-reduced-motion:reduce){.provider-summary button{transition:none}.provider-summary button:hover{transform:none}}
.identity-review{display:flex;gap:14px;flex-direction:column}.identity-fields{display:grid;grid-template-columns:82px 1fr;gap:9px 14px;padding:13px;border-radius:7px;background:#f6f9fa;font-size:12px}.identity-fields span{color:var(--muted)}.identity-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.identity-photos .el-image{display:flex;height:105px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:7px;background:#f5f7f8}.identity-photos span{color:var(--muted);font-size:11px}.identity-actions{display:flex;justify-content:flex-end;gap:8px}
</style>
