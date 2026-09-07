<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Calendar,
  CircleCheck,
  CircleClose,
  Clock,
  Location,
  Refresh,
  Search,
  UserFilled,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import type { ActivityStatus, AdminActivity, AdminActivitySummary } from '../types'
import { formatDateTime as formatDate, formatMoney as money } from '../utils/format'
import ActivityCategoriesPanel from './activity/ActivityCategoriesPanel.vue'
import ActivityFinancePanel from './activity/ActivityFinancePanel.vue'
import ActivityReportsPanel from './activity/ActivityReportsPanel.vue'

const props = defineProps<{
  preview: boolean
  canReview: boolean
  canManage: boolean
  canViewCategory: boolean
  canManageCategory: boolean
  canViewReport: boolean
  canManageReport: boolean
  canViewFinance: boolean
  canManageAfterSales: boolean
  canManageSettlement: boolean
}>()

const rows = ref<AdminActivity[]>([])
const summary = ref<AdminActivitySummary>({ total: 0, pending_review: 0, active: 0, ended: 0 })
const search = ref('')
const statusFilter = ref<ActivityStatus | ''>('')
const cityFilter = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const reviewing = ref(false)
const drawerVisible = ref(false)
const selected = ref<AdminActivity | null>(null)
const activePanel = ref<'list' | 'categories' | 'reports' | 'finance'>('list')
const panels = computed(() => [
  { key: 'list', label: '活动列表' },
  ...(props.canViewCategory ? [{ key: 'categories', label: '分类配置' }] : []),
  ...(props.canViewReport ? [{ key: 'reports', label: '举报与处置' }] : []),
  ...(props.canViewFinance ? [{ key: 'finance', label: '活动账务' }] : []),
] as Array<{ key: 'list' | 'categories' | 'reports' | 'finance'; label: string }>)

const statusOptions: Array<{ label: string; value: ActivityStatus }> = [
  { label: '待审核', value: 'pending_review' },
  { label: '报名中', value: 'recruiting' },
  { label: '已成局', value: 'formed' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已驳回', value: 'rejected' },
  { label: '已取消', value: 'cancelled' },
  { label: '未成局', value: 'failed_to_form' },
]

const cityOptions = [
  { label: '邯郸市', value: '130400' },
  { label: '北京市', value: '110100' },
  { label: '上海市', value: '310100' },
  { label: '广州市', value: '440100' },
]

function future(days: number, hour = 19) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, 30, 0, 0)
  return value.toISOString()
}

function demoActivity(
  id: number,
  title: string,
  category: string,
  organizer: string,
  status: ActivityStatus,
  amount: number,
  count: number,
  capacity: number,
  days: number,
): AdminActivity {
  const statusLabel = statusOptions.find((item) => item.value === status)?.label || '草稿'
  const paid = status !== 'rejected'
  return {
    id, title, status, status_label: statusLabel, category_name: category,
    category_slug: category === '桌球' ? 'billiards' : 'board-games',
    organizer_public_id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    organizer_name: organizer, organizer_phone_masked: `188****${String(6600 + id)}`,
    organizer_verification_status: 'verified', organizer_verification_status_label: '已认证',
    organizer_account_status: 'active', organizer_account_status_label: '正常',
    cover_url: null, city_code: '130400', city_name: '邯郸市', starts_at: future(days),
    ends_at: future(days, 22), formation_deadline: future(Math.max(1, days - 1), 18),
    meeting_place_name: id % 2 ? '丛台区桌球俱乐部' : '美乐城桌游空间',
    meeting_address: id % 2 ? '丛台区人民东路 128 号 3 层' : '丛台区人民路美乐城 5 层',
    source_longitude: '114.4921000', source_latitude: '36.6123000', capacity,
    min_participants: Math.min(4, capacity), participant_count: count,
    description: '周末轻松组局，欢迎新手参加。现场气氛友好，活动开始前请提前十分钟到达集合地点。',
    participation_rules: '守时参加，文明交流；临时无法到场请尽早取消报名。',
    aa_principal_amount: amount, refund_template_version: 'standard-v1',
    refund_rule_snapshot: { before_24h: '全额退', within_24h: '按平台规则处理' },
    publish_order: {
      order_no: `ACT20260829${String(id).padStart(8, '0')}`,
      status: paid ? 'paid' : 'refunded', status_label: paid ? '已支付' : '已退款',
      aa_principal_amount: amount, platform_service_fee_amount: Math.round(amount * 0.1),
      payable_amount: Math.round(amount * 1.1), pricing_snapshot: { platform_service_fee_rate: '0.10' },
      paid_at: future(-2),
    },
    published_at: status === 'pending_review' || status === 'rejected' ? null : future(-1),
    reviewed_by_name: status === 'pending_review' ? null : '运营管理员',
    reviewed_at: status === 'pending_review' ? null : future(-1),
    rejection_reason: status === 'rejected' ? '活动介绍信息不完整，请补充参与规则后重新发布。' : '',
    cancellation_reason: '', cancelled_by_name: null, cancelled_at: null,
    refund_records: status === 'rejected' ? [{
      refund_no: `ARF20260829${String(id).padStart(6, '0')}`, refund_type: 'review_rejection',
      refund_type_label: '审核驳回退款', status: 'simulated_refunded', status_label: '模拟退款成功',
      principal_amount: amount, service_fee_amount: Math.round(amount * .1),
      refund_amount: Math.round(amount * 1.1), beneficiary_name: organizer,
      retained_principal_amount: 0, retained_service_fee_amount: 0,
      retained_principal_destination: '',
      reason: '活动介绍信息不完整，请补充参与规则后重新发布。', operator_name: '运营管理员',
      refunded_at: future(-1),
    }] : [],
    report_count: id === 23 ? 1 : 0,
    participants: Array.from({ length: count }, (_, index) => ({
      public_id: `10000000-0000-4000-8000-${String(id * 10 + index).padStart(12, '0')}`,
      nickname: ['小雨', '阿哲', '可可', '林一'][index % 4], phone_masked: `186****${String(1200 + index)}`,
      status: 'active', status_label: '已报名', joined_at: future(-1), cancelled_at: null,
    })),
    created_at: future(-2), updated_at: future(-1),
  }
}

const demoActivities = ref<AdminActivity[]>([
  demoActivity(21, '周五晚桌球新手友好局', '桌球', '晓晓', 'pending_review', 4800, 1, 6, 5),
  demoActivity(22, '城市推理夜 · 欢乐剧本局', '桌游', '周末玩家', 'pending_review', 6800, 1, 8, 7),
  demoActivity(23, '邯郸周边轻徒步交友', '爬山', '山野清风', 'recruiting', 3600, 5, 12, 9),
  demoActivity(24, '年轻人商务交流午餐会', '商务', '林先生', 'formed', 12800, 7, 10, 4),
  demoActivity(25, '桌游欢乐派对', '桌游', '甜甜', 'rejected', 5800, 1, 8, 6),
])

const summaryCards = computed(() => [
  { key: '', label: '全部活动', value: summary.value.total, icon: Calendar, tone: 'blue' },
  { key: 'pending_review', label: '待内容审核', value: summary.value.pending_review, icon: Clock, tone: 'orange' },
  { key: 'active', label: '招募 / 进行中', value: summary.value.active, icon: CircleCheck, tone: 'cyan' },
  { key: 'ended', label: '已结束', value: summary.value.ended, icon: CircleClose, tone: 'gray' },
])

function demoFiltered() {
  const keyword = search.value.trim().toLowerCase()
  return demoActivities.value.filter((item) => {
    const matchedKeyword = !keyword || `${item.title} ${item.organizer_name} ${item.meeting_place_name}`.toLowerCase().includes(keyword)
    const matchedCity = !cityFilter.value || item.city_code === cityFilter.value
    const matchedStatus = !statusFilter.value || item.status === statusFilter.value
    return matchedKeyword && matchedCity && matchedStatus
  })
}

function computeDemoSummary() {
  const items = demoActivities.value.filter((item) => !cityFilter.value || item.city_code === cityFilter.value)
  return {
    total: items.length,
    pending_review: items.filter((item) => item.status === 'pending_review').length,
    active: items.filter((item) => ['recruiting', 'formed', 'in_progress'].includes(item.status)).length,
    ended: items.filter((item) => ['rejected', 'completed', 'cancelled', 'failed_to_form'].includes(item.status)).length,
  }
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      rows.value = demoFiltered()
      total.value = rows.value.length
      summary.value = computeDemoSummary()
      return
    }
    const data = await adminApi.activities({
      search: search.value.trim(), status: statusFilter.value, city_code: cityFilter.value,
      page: page.value, page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '活动数据加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(activity: AdminActivity) {
  selected.value = activity
  drawerVisible.value = true
  detailLoading.value = true
  try {
    selected.value = props.preview
      ? demoActivities.value.find((item) => item.id === activity.id) || activity
      : await adminApi.activity(activity.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '活动详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

async function review(decision: 'approve' | 'reject') {
  if (!selected.value || !props.canReview) return
  let reason = ''
  if (decision === 'reject') {
    try {
      const result = await ElMessageBox.prompt(
        '驳回后将关闭活动，并退回发起人支付的 AA 本金和平台服务费。',
        '驳回活动',
        { inputPlaceholder: '请填写明确的驳回原因', inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字', confirmButtonText: '确认驳回并退款', cancelButtonText: '取消', type: 'warning' },
      )
      reason = result.value.trim()
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      throw error
    }
  } else {
    try {
      await ElMessageBox.confirm('通过后活动将立即进入报名招募状态。', '通过活动审核', {
        confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'success',
      })
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      throw error
    }
  }
  reviewing.value = true
  try {
    if (props.preview) {
      const item = demoActivities.value.find((row) => row.id === selected.value?.id)
      if (item) {
        item.status = decision === 'approve' ? 'recruiting' : 'rejected'
        item.status_label = decision === 'approve' ? '报名中' : '已驳回'
        item.reviewed_by_name = '运营管理员'
        item.reviewed_at = new Date().toISOString()
        item.published_at = decision === 'approve' ? item.reviewed_at : null
        item.rejection_reason = reason
        if (decision === 'reject' && item.publish_order) {
          item.publish_order.status = 'refunded'
          item.publish_order.status_label = '已退款'
        }
        selected.value = { ...item }
      }
    } else {
      selected.value = await adminApi.reviewActivity(selected.value.id, decision, reason)
    }
    ElMessage.success(decision === 'approve' ? '活动已通过，现已进入招募' : '活动已驳回，模拟退款已完成')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审核操作失败')
  } finally {
    reviewing.value = false
  }
}

async function cancelActivity() {
  if (!selected.value || !props.canManage) return
  try {
    const result = await ElMessageBox.prompt(
      '取消后活动将停止招募，并按规则同步处理发起人发布款与所有参与者退款。',
      '取消 / 下架活动',
      { inputPlaceholder: '请填写取消原因', inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字', confirmButtonText: '确认取消并退款', cancelButtonText: '暂不取消', type: 'warning' },
    )
    reviewing.value = true
    if (props.preview) {
      const item = demoActivities.value.find((row) => row.id === selected.value?.id)
      if (item) {
        item.status = 'cancelled'; item.status_label = '已取消'
        item.cancellation_reason = result.value.trim(); item.cancelled_by_name = '运营管理员'
        item.cancelled_at = new Date().toISOString()
        if (item.publish_order) { item.publish_order.status = 'refunded'; item.publish_order.status_label = '已退款' }
        item.refund_records.push({ refund_no: `ARF${Date.now()}`, refund_type: 'admin_cancellation', refund_type_label: '后台取消退款', status: 'simulated_refunded', status_label: '模拟退款成功', principal_amount: item.aa_principal_amount, service_fee_amount: Math.round(item.aa_principal_amount * .1), refund_amount: Math.round(item.aa_principal_amount * 1.1), retained_principal_amount: 0, retained_service_fee_amount: 0, retained_principal_destination: '', beneficiary_name: item.organizer_name, reason: result.value.trim(), operator_name: '运营管理员', refunded_at: item.cancelled_at })
        selected.value = { ...item }
      }
    } else selected.value = await adminApi.changeActivityStatus(selected.value.id, result.value.trim())
    ElMessage.success('活动已取消，发布支付退款记录已生成'); await load()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '取消活动失败')
  } finally { reviewing.value = false }
}

function selectSummary(key: string) {
  if (key === 'active' || key === 'ended') return
  statusFilter.value = key as ActivityStatus | ''
  page.value = 1
  load()
}

function resetFilters() {
  search.value = ''
  cityFilter.value = ''
  statusFilter.value = ''
  page.value = 1
  load()
}

function statusType(status: ActivityStatus) {
  if (status === 'pending_review') return 'warning'
  if (['recruiting', 'formed', 'completed'].includes(status)) return 'success'
  if (['rejected', 'cancelled', 'failed_to_form'].includes(status)) return 'danger'
  return 'info'
}

onMounted(load)
</script>

<template>
  <div class="page activity-page">
    <header class="page-heading activity-heading">
      <div><h1>活动管理</h1><p>审核活动内容，核对发起人资质、报名信息与发布支付</p></div>
      <el-button :icon="Refresh" @click="load">刷新数据</el-button>
    </header>

    <nav class="activity-tabs">
      <button v-for="panel in panels" :key="panel.key" :class="{ active: activePanel === panel.key }" @click="activePanel = panel.key">{{ panel.label }}</button>
    </nav>

    <template v-if="activePanel === 'list'">
    <section class="activity-summary">
      <button v-for="item in summaryCards" :key="item.label" :class="{ static: item.key === 'active' || item.key === 'ended' }" @click="selectSummary(item.key)">
        <el-icon :class="item.tone"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>{{ item.key === 'pending_review' ? '优先处理' : '实时统计' }}</small>
      </button>
    </section>

    <section class="activity-panel">
      <div class="activity-filters">
        <el-input v-model="search" clearable :prefix-icon="Search" placeholder="搜索活动、发起人或集合地点" @keyup.enter="page = 1; load()" />
        <el-select v-model="cityFilter" clearable placeholder="全部城市" @change="page = 1; load()">
          <el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value" />
        </el-select>
        <el-select v-model="statusFilter" clearable placeholder="全部状态" @change="page = 1; load()">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" height="calc(100vh - 386px)" empty-text="暂无符合条件的活动">
        <el-table-column label="活动信息" min-width="250">
          <template #default="{ row }">
            <div class="activity-info">
              <div class="mini-cover" :class="`cover-${row.id % 3}`"><span>{{ row.category_name.slice(0, 1) }}</span></div>
              <div><strong>{{ row.title }}</strong><small>#{{ row.id }} · {{ row.category_name }}</small></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发起人" min-width="140">
          <template #default="{ row }"><div class="organizer"><strong>{{ row.organizer_name }}</strong><small>{{ row.organizer_phone_masked }}</small></div></template>
        </el-table-column>
        <el-table-column label="城市 / 时间" min-width="170">
          <template #default="{ row }"><div class="time-place"><strong>{{ row.city_name || row.city_code || '未标记' }}</strong><small>{{ formatDate(row.starts_at) }}</small></div></template>
        </el-table-column>
        <el-table-column label="报名" width="110">
          <template #default="{ row }"><div class="capacity"><strong>{{ row.participant_count }}</strong><span>/ {{ row.capacity }} 人</span></div></template>
        </el-table-column>
        <el-table-column label="单人 AA" width="115">
          <template #default="{ row }"><strong class="amount">{{ money(row.aa_principal_amount) }}</strong></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" effect="light">{{ row.status_label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">{{ row.status === 'pending_review' ? '去审核' : '查看' }}</el-button></template>
        </el-table-column>
      </el-table>
      <footer class="activity-footer"><span>共 {{ total }} 条活动</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="680px" destroy-on-close class="activity-drawer">
      <template #header>
        <div class="drawer-title"><span>活动详情</span><el-tag v-if="selected" :type="statusType(selected.status)">{{ selected.status_label }}</el-tag></div>
      </template>
      <div v-loading="detailLoading" v-if="selected" class="detail-body">
        <section class="detail-hero">
          <div class="poster" :class="`cover-${selected.id % 3}`"><span>{{ selected.category_name }}</span><b>同城好搭子</b></div>
          <div><small>活动 #{{ selected.id }}</small><h2>{{ selected.title }}</h2><p><el-icon><Location /></el-icon>{{ selected.city_name }} · {{ selected.meeting_place_name }}</p><p><el-icon><Clock /></el-icon>{{ formatDate(selected.starts_at) }} — {{ formatDate(selected.ends_at) }}</p></div>
        </section>

        <section class="detail-card organizer-card">
          <header><h3>发起人与资质</h3></header>
          <div class="organizer-profile"><el-avatar :size="44"><UserFilled /></el-avatar><div><strong>{{ selected.organizer_name }}</strong><span>{{ selected.organizer_phone_masked }}</span></div><el-tag type="success" effect="plain">{{ selected.organizer_verification_status_label }}</el-tag><el-tag effect="plain">账号{{ selected.organizer_account_status_label }}</el-tag></div>
        </section>

        <section class="detail-grid">
          <article class="detail-card"><header><h3>活动与报名</h3></header><dl><div><dt>活动分类</dt><dd>{{ selected.category_name }}</dd></div><div><dt>报名人数</dt><dd>{{ selected.participant_count }} / {{ selected.capacity }} 人</dd></div><div><dt>最少成局</dt><dd>{{ selected.min_participants }} 人</dd></div><div><dt>成局截止</dt><dd>{{ formatDate(selected.formation_deadline) }}</dd></div></dl></article>
          <article class="detail-card"><header><h3>发布支付</h3><el-tag :type="selected.publish_order?.status === 'paid' ? 'success' : 'info'" size="small">{{ selected.publish_order?.status_label || '无支付单' }}</el-tag></header><dl><div><dt>AA 本金</dt><dd>{{ money(selected.publish_order?.aa_principal_amount) }}</dd></div><div><dt>平台服务费</dt><dd>{{ money(selected.publish_order?.platform_service_fee_amount) }}</dd></div><div class="total"><dt>实付合计</dt><dd>{{ money(selected.publish_order?.payable_amount) }}</dd></div><div><dt>支付单号</dt><dd class="order-no">{{ selected.publish_order?.order_no || '—' }}</dd></div></dl></article>
        </section>
        <section v-if="selected.settlement" class="detail-card settlement-card"><header><h3>履约与结算</h3><el-tag :type="selected.settlement.status === 'settled' ? 'success' : selected.settlement.status === 'dispute_frozen' ? 'danger' : 'warning'" size="small">{{ selected.settlement.status_label }}</el-tag></header><dl><div><dt>结算单号</dt><dd class="order-no">{{ selected.settlement.settlement_no }}</dd></div><div><dt>预计 / 实际入账</dt><dd>{{ money(selected.settlement.settlement_amount) }}</dd></div><div><dt>履约确认截止</dt><dd>{{ formatDate(selected.settlement.confirmation_deadline) }}</dd></div><div><dt>风险冻结截止</dt><dd>{{ formatDate(selected.settlement.freeze_until) }}</dd></div><div v-if="selected.settlement.dispute_reason"><dt>冻结原因</dt><dd>{{ selected.settlement.dispute_reason }}</dd></div></dl></section>

        <section class="detail-card"><header><h3>集合地点</h3></header><p class="location-name">{{ selected.meeting_place_name }}</p><p class="muted">{{ selected.meeting_address }}</p><p class="coordinate">管理坐标：{{ selected.source_longitude }}, {{ selected.source_latitude }}</p></section>
        <section class="detail-card content-card"><header><h3>活动内容</h3></header><h4>活动介绍</h4><p>{{ selected.description }}</p><h4>参与规则</h4><p>{{ selected.participation_rules }}</p><h4>退款规则快照</h4><pre>{{ JSON.stringify(selected.refund_rule_snapshot, null, 2) }}</pre></section>

        <section v-if="selected.participants.length" class="detail-card"><header><h3>报名用户（{{ selected.participants.length }}）</h3></header><div class="participant-list"><div v-for="participant in selected.participants" :key="participant.public_id"><el-avatar :size="32">{{ participant.nickname.slice(0, 1) }}</el-avatar><span><strong>{{ participant.nickname }}</strong><small>{{ participant.phone_masked }} · {{ formatDate(participant.joined_at) }}</small></span><el-tag type="success" size="small" effect="plain">{{ participant.status_label }}</el-tag></div></div></section>

        <section v-if="selected.reviewed_at" class="detail-card review-result"><header><h3>审核记录</h3></header><p><strong>{{ selected.reviewed_by_name }}</strong> 于 {{ formatDate(selected.reviewed_at) }} 完成审核</p><p v-if="selected.rejection_reason" class="reject-reason">驳回原因：{{ selected.rejection_reason }}</p></section>
        <section v-if="selected.cancelled_at" class="detail-card review-result"><header><h3>取消记录</h3></header><p><strong>{{ selected.cancelled_by_name }}</strong> 于 {{ formatDate(selected.cancelled_at) }} 取消活动</p><p class="reject-reason">取消原因：{{ selected.cancellation_reason }}</p></section>
        <section v-if="selected.refund_records.length" class="detail-card"><header><h3>退款记录（{{ selected.refund_records.length }}）</h3></header><div v-for="refund in selected.refund_records" :key="refund.refund_no" class="refund-row"><div><strong>{{ refund.refund_type_label }}</strong><small>{{ refund.refund_no }} · {{ formatDate(refund.refunded_at) }}</small></div><div><strong>{{ money(refund.refund_amount) }}</strong><el-tag type="success" size="small">{{ refund.status_label }}</el-tag></div></div></section>
      </div>
      <template #footer>
        <div v-if="selected?.status === 'pending_review' && canReview" class="review-actions"><span>请核对内容与支付信息后操作</span><el-button :disabled="reviewing" @click="review('reject')">驳回并退款</el-button><el-button type="primary" :loading="reviewing" @click="review('approve')">通过并开始招募</el-button></div>
        <div v-else-if="selected && ['recruiting','formed'].includes(selected.status) && canManage" class="review-actions"><span>取消后将原子化处理活动状态、参与者退款与发起人发布款</span><el-button type="danger" plain :loading="reviewing" @click="cancelActivity">取消 / 下架活动</el-button></div>
        <el-button v-else @click="drawerVisible = false">关闭</el-button>
      </template>
    </el-drawer>
    </template>

    <ActivityCategoriesPanel v-else-if="activePanel === 'categories'" :preview="preview" :can-manage="canManageCategory" />
    <ActivityReportsPanel v-else-if="activePanel === 'reports'" :preview="preview" :can-manage="canManageReport" />
    <ActivityFinancePanel v-else :preview="preview" :can-manage-after-sales="canManageAfterSales" :can-manage-settlement="canManageSettlement" />
  </div>
</template>

<style scoped>
.activity-page{min-height:calc(100vh - 76px)}.activity-heading{margin-bottom:10px}.activity-tabs{display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--line)}.activity-tabs button{position:relative;padding:11px 20px;border:0;color:var(--muted);background:transparent;font-size:13px}.activity-tabs button.active{color:#078f94;font-weight:700}.activity-tabs button.active::after{position:absolute;right:18px;bottom:-1px;left:18px;height:2px;background:#08b8bd;content:''}.activity-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.activity-summary button{position:relative;display:grid;grid-template-columns:50px 1fr;grid-template-rows:auto auto;align-items:center;min-height:88px;padding:14px 16px;border:1px solid var(--line);border-radius:8px;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.activity-summary button:not(.static):hover{border-color:#9cdfe0;box-shadow:0 8px 24px rgba(29,72,87,.08);transform:translateY(-1px)}.activity-summary .el-icon{grid-row:1/3;width:40px;height:40px;border-radius:11px;font-size:21px}.activity-summary .blue{color:#2679e9;background:#e9f1ff}.activity-summary .cyan{color:#00aeb4;background:#e4f8f8}.activity-summary .orange{color:#e97825;background:#fff0e6}.activity-summary .gray{color:#6f7884;background:#f0f2f4}.activity-summary span{color:var(--muted);font-size:12px}.activity-summary strong{font-size:25px;color:#172033}.activity-summary small{position:absolute;right:14px;bottom:14px;color:#9ba4af;font-size:10px}.activity-summary button.static{cursor:default}.activity-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.activity-filters{display:grid;grid-template-columns:minmax(280px,1fr) 135px 135px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.activity-info{display:flex;align-items:center;gap:11px}.mini-cover{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:8px;color:#fff;font-weight:800}.cover-0{background:linear-gradient(145deg,#35cad0,#087f91)}.cover-1{background:linear-gradient(145deg,#ffb36b,#f06431)}.cover-2{background:linear-gradient(145deg,#76a7ff,#6554cc)}.activity-info>div:last-child,.organizer,.time-place{display:flex;flex-direction:column;gap:5px}.activity-info strong{overflow:hidden;max-width:185px;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.activity-info small,.organizer small,.time-place small{color:var(--muted);font-size:11px}.organizer strong,.time-place strong{font-size:12px}.capacity strong{color:#0b9ba1;font-size:18px}.capacity span{color:var(--muted);font-size:11px}.amount{color:#ef6d2e;font-size:13px}.activity-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.drawer-title{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}.detail-body{display:flex;flex-direction:column;gap:12px;padding-bottom:12px}.detail-hero{display:grid;grid-template-columns:156px 1fr;gap:18px;align-items:center;padding-bottom:16px;border-bottom:1px solid #e8edf0}.poster{display:flex;flex-direction:column;justify-content:flex-end;width:156px;height:112px;padding:14px;border-radius:10px;color:#fff}.poster span{font-size:20px;font-weight:800}.poster b{margin-top:3px;font-size:11px;opacity:.86}.detail-hero small{color:var(--muted)}.detail-hero h2{margin:6px 0 12px;font-size:19px}.detail-hero p{display:flex;align-items:center;gap:5px;margin:5px 0;color:#626d79;font-size:12px}.detail-card{padding:16px;border:1px solid #e4eaed;border-radius:8px;background:#fff}.detail-card header{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.detail-card h3{margin:0;font-size:14px}.organizer-profile{display:flex;align-items:center;gap:10px}.organizer-profile>div{display:flex;flex:1;flex-direction:column;gap:4px}.organizer-profile span{color:var(--muted);font-size:11px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail-card dl{margin:0}.detail-card dl>div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #edf0f2;font-size:12px}.detail-card dl>div:last-child{border:0}.detail-card dt{color:var(--muted)}.detail-card dd{margin:0;font-weight:650}.detail-card .total dd{color:#ef6d2e}.order-no{max-width:150px;overflow:hidden;text-overflow:ellipsis}.location-name{margin:0 0 6px;font-weight:700}.muted{margin:0;color:var(--muted);font-size:12px}.coordinate{margin:10px 0 0;padding:8px 10px;border-radius:5px;color:#71808b;background:#f5f7f8;font-size:11px}.content-card h4{margin:14px 0 5px;font-size:12px}.content-card p{margin:0;color:#5e6974;font-size:12px;line-height:1.7}.content-card pre{margin:0;padding:10px;border-radius:5px;color:#53606a;background:#f7f9fa;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}.participant-list{display:flex;flex-direction:column}.participant-list>div{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #edf0f2}.participant-list>div:last-child{border:0}.participant-list span{display:flex;flex:1;flex-direction:column;gap:3px}.participant-list strong{font-size:12px}.participant-list small{color:var(--muted);font-size:10px}.review-result p{margin:0;color:#626d79;font-size:12px}.reject-reason{margin-top:9px!important;padding:9px;border-radius:5px;color:#b34f28!important;background:#fff5ed}.refund-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #edf0f2}.refund-row:last-child{border:0}.refund-row>div{display:flex;flex-direction:column;gap:4px}.refund-row>div:last-child{align-items:flex-end}.refund-row small{color:var(--muted);font-size:10px}.review-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%}.review-actions span{margin-right:auto;color:var(--muted);font-size:11px}:deep(.activity-drawer .el-drawer__footer){border-top:1px solid #e8edf0}:deep(.el-table__row:hover td){background:#f2fbfb!important}@media(max-width:1280px){.activity-filters{grid-template-columns:minmax(230px,1fr) 120px 120px 64px 64px}.activity-summary small{display:none}}@media(prefers-reduced-motion:reduce){.activity-summary button{transition:none}.activity-summary button:hover{transform:none}}
</style>
