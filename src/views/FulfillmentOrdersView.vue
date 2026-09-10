<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Close,
  DocumentChecked,
  Location,
  Picture,
  Refresh,
  Search,
  Tickets,
  Van,
  Warning,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatDateTime, formatMoney as formatAmount, formatServiceWindow } from '../utils/format'
import type {
  AdminProviderOrder,
  FulfillmentAnomalyFilter,
  FulfillmentStage,
  ProviderOrderStatus,
  ProviderOrderSummary,
} from '../types'

const props = defineProps<{ preview: boolean; canAddNote: boolean; canManageReview: boolean; initialSearch?: string }>()
const emit = defineEmits<{ openAfterSales: [orderNo: string] }>()

const rows = ref<AdminProviderOrder[]>([])
const selected = ref<AdminProviderOrder | null>(null)
const summary = ref<ProviderOrderSummary>({ total: 0, active: 0, pending_confirmation: 0, anomalies: 0 })
const stage = ref<FulfillmentStage>('all')
const anomaly = ref<FulfillmentAnomalyFilter>('all')
const statusFilter = ref<ProviderOrderStatus | ''>('')
const cityFilter = ref('')
const search = ref(props.initialSearch || '')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const drawerVisible = ref(false)
const evidenceLoading = ref(false)
const evidenceUrl = ref('')
const evidenceExpiresIn = ref(0)
const noteContent = ref('')
const noteSaving = ref(false)
const marksCustomerContact = ref(false)
const reviewSaving = ref(false)

const supportContactDeadlinePassed = computed(() => Boolean(
  selected.value?.support_contact_deadline_at
  && Date.parse(selected.value.support_contact_deadline_at) <= Date.now(),
))
const canMarkCustomerContact = computed(() => Boolean(
  selected.value?.status === 'pending_support'
  && selected.value.provider_rejected_at
  && selected.value.support_contact_deadline_at
  && !selected.value.support_contacted_at
  && !selected.value.provider_rejection_refund
  && !supportContactDeadlinePassed.value,
))

const statusLabels: Record<ProviderOrderStatus, string> = {
  pending_payment: '待支付',
  pending_acceptance: '待接单',
  pending_support: '待客服处理',
  pending_service: '待服务',
  departed: '已出发',
  in_service: '服务中',
  pending_confirmation: '待确认',
  pending_review: '待评价',
  completed: '已完成',
  cancelled: '已取消',
  after_sales: '售后中',
  refunded: '已退款',
}

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({
  value: value as ProviderOrderStatus,
  label,
}))

const summaryCards = computed(() => [
  { key: 'all', label: '全部订单', value: summary.value.total, icon: Tickets, tone: 'blue' },
  { key: 'active', label: '履约中', value: summary.value.active, icon: Van, tone: 'cyan' },
  { key: 'pending_confirmation', label: '待用户确认', value: summary.value.pending_confirmation, icon: Clock, tone: 'orange' },
  { key: 'anomalies', label: '异常订单', value: summary.value.anomalies, icon: Warning, tone: 'red' },
])

const timeline = computed(() => {
  if (!selected.value) return []
  const order = selected.value
  return [
    { label: '订单支付', value: order.paid_at },
    { label: '达人接单', value: order.accepted_at },
    { label: '达人出发', value: order.departed_at },
    { label: '集合照留存', value: order.arrival_photo_uploaded_at },
    { label: '开始服务', value: order.service_started_at },
    { label: '提交完成', value: order.completion_submitted_at },
    {
      label: order.auto_confirmed_at ? '系统自动确认' : '用户确认',
      value: order.auto_confirmed_at || order.customer_confirmed_at,
    },
  ]
})

function demoOrder(
  orderNo: string,
  orderStatus: ProviderOrderStatus,
  overrides: Partial<AdminProviderOrder> = {},
): AdminProviderOrder {
  const now = new Date()
  const iso = now.toISOString()
  const overdue = new Date(now.getTime() - 4 * 86400000).toISOString()
  return {
    public_id: '00000000-0000-0000-0000-000000000001',
    order_no: orderNo,
    status: orderStatus,
    status_label: statusLabels[orderStatus],
    customer_public_id: '00000000-0000-0000-0000-000000000002',
    customer_name: '张女士',
    customer_phone_masked: '138****6688',
    provider_public_id: '00000000-0000-0000-0000-000000000003',
    provider_name: '晓晓',
    provider_phone_masked: '139****2211',
    service_name: '城市陪伴',
    service_city_code: '130400',
    service_city_name: '邯郸市',
    starts_at: '2026-08-24T13:20:00+08:00',
    ends_at: '2026-08-24T15:20:00+08:00',
    duration_minutes: 120,
    meeting_location_name: '邯郸美乐城',
    meeting_address: '人民东路456号 南门',
    contact_name: '张',
    contact_gender: 'ms',
    contact_gender_label: '女士',
    contact_phone_masked: '138****6688',
    note: '请提前十分钟联系',
    unit_price_amount: 28000,
    service_fee_amount: 28000,
    transport_fee_amount: 7600,
    other_fee_amount: 0,
    discount_amount: 1000,
    payable_amount: 34600,
    paid_at: iso,
    accepted_at: iso,
    provider_rejected_at: null,
    support_contact_deadline_at: null,
    support_contacted_at: null,
    support_contacted_by_name: null,
    provider_rejection_refund: null,
    departed_at: iso,
    arrival_photo_available: true,
    arrival_photo_uploaded_at: iso,
    arrival_location: { longitude: '114.5060000', latitude: '36.6200000', accuracy_m: '12.50' },
    service_started_at: orderStatus === 'departed' ? null : iso,
    completion_submitted_at: orderStatus === 'pending_confirmation' ? overdue : null,
    confirmation_expires_at: orderStatus === 'pending_confirmation' ? iso : null,
    customer_confirmed_at: null,
    auto_confirmed_at: null,
    cancelled_at: null,
    created_at: iso,
    updated_at: iso,
    anomalies: [],
    support_notes: [],
    after_sales_cases: [],
    review: null,
    ...overrides,
  }
}

function demoRows() {
  return [
    demoOrder('DZY202608230301', 'departed'),
    demoOrder('DZY202608230302', 'in_service', {
      arrival_photo_available: false,
      arrival_photo_uploaded_at: null,
      arrival_location: null,
      anomalies: [{ code: 'missing_evidence', label: '缺少集合照' }],
    }),
    demoOrder('DZY202608230303', 'pending_confirmation', {
      anomalies: [{ code: 'confirmation_overdue', label: '待确认超时' }],
      support_notes: [{
        id: 1,
        author_name: '运营管理员',
        organization_name: '乐搭伴运营平台',
        content: '已电话联系用户，等待用户确认服务结果。',
        created_at: new Date().toISOString(),
      }],
    }),
    demoOrder('DZY202608230304', 'pending_review', {
      completion_submitted_at: new Date().toISOString(),
      customer_confirmed_at: new Date().toISOString(),
    }),
    demoOrder('DZY202608230305', 'pending_support', {
      accepted_at: null,
      provider_rejected_at: new Date(Date.now() - 5 * 60000).toISOString(),
      support_contact_deadline_at: new Date(Date.now() + 10 * 60000).toISOString(),
    }),
  ]
}

function filteredDemoRows() {
  let items = demoRows()
  if (stage.value === 'active') items = items.filter((item) => ['departed', 'in_service'].includes(item.status))
  if (stage.value === 'pending_confirmation') items = items.filter((item) => item.status === 'pending_confirmation')
  if (stage.value === 'ended') items = items.filter((item) => ['pending_review', 'completed', 'cancelled', 'after_sales', 'refunded'].includes(item.status))
  if (statusFilter.value) items = items.filter((item) => item.status === statusFilter.value)
  if (anomaly.value === 'any') items = items.filter((item) => item.anomalies.length)
  if (!['all', 'any'].includes(anomaly.value)) {
    items = items.filter((item) => item.anomalies.some((issue) => issue.code === anomaly.value))
  }
  const keyword = search.value.trim().toLowerCase()
  if (keyword) {
    items = items.filter((item) => [item.order_no, item.customer_name, item.provider_name]
      .some((value) => value.toLowerCase().includes(keyword)))
  }
  return items
}

function formatServiceTime(order: AdminProviderOrder) {
  return formatServiceWindow(order.starts_at, order.ends_at)
}

function statusType(orderStatus: ProviderOrderStatus) {
  if (['completed', 'pending_review'].includes(orderStatus)) return 'success'
  if (['cancelled', 'refunded'].includes(orderStatus)) return 'info'
  if (['pending_confirmation', 'pending_support', 'after_sales'].includes(orderStatus)) return 'warning'
  return 'primary'
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
        active: all.filter((item) => ['departed', 'in_service'].includes(item.status)).length,
        pending_confirmation: all.filter((item) => item.status === 'pending_confirmation').length,
        anomalies: all.filter((item) => item.anomalies.length).length,
      }
      return
    }
    const data = await adminApi.providerOrders({
      stage: stage.value,
      anomaly: anomaly.value,
      status: statusFilter.value,
      city_code: cityFilter.value,
      search: search.value.trim(),
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    rows.value = []
    total.value = 0
    ElMessage.error(error instanceof Error ? error.message : '履约订单加载失败')
  } finally {
    loading.value = false
  }
}

function selectSummary(key: string) {
  page.value = 1
  statusFilter.value = ''
  if (key === 'anomalies') {
    stage.value = 'all'
    anomaly.value = 'any'
  } else {
    stage.value = key as FulfillmentStage
    anomaly.value = 'all'
  }
  load()
}

function resetFilters() {
  stage.value = 'all'
  anomaly.value = 'all'
  statusFilter.value = ''
  cityFilter.value = ''
  search.value = ''
  page.value = 1
  load()
}

async function openDetail(row: AdminProviderOrder) {
  drawerVisible.value = true
  selected.value = row
  evidenceUrl.value = ''
  evidenceExpiresIn.value = 0
  noteContent.value = ''
  marksCustomerContact.value = false
  if (props.preview) return
  detailLoading.value = true
  try {
    selected.value = await adminApi.providerOrder(row.order_no)
  } catch (error) {
    drawerVisible.value = false
    ElMessage.error(error instanceof Error ? error.message : '订单详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

async function viewEvidence() {
  if (!selected.value || evidenceLoading.value) return
  try {
    await ElMessageBox.confirm(
      '集合照属于敏感履约资料。本次查看将记录后台账号、订单和访问时间。',
      '查看集合地点照片',
      { confirmButtonText: '确认查看', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  evidenceLoading.value = true
  try {
    if (props.preview) {
      evidenceUrl.value = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22500%22%3E%3Crect width=%22800%22 height=%22500%22 fill=%22%23d9f7f5%22/%3E%3Cpath d=%22M90 420l190-190 110 100 95-80 225 170z%22 fill=%22%2308b8bd%22 opacity=%22.55%22/%3E%3Ccircle cx=%22600%22 cy=%22130%22 r=%2260%22 fill=%22%23ff8a45%22/%3E%3Ctext x=%22400%22 y=%22470%22 text-anchor=%22middle%22 font-size=%2230%22 fill=%22%23172033%22%3E集合地点履约照片示意%3C/text%3E%3C/svg%3E'
      evidenceExpiresIn.value = 300
    } else {
      const data = await adminApi.providerOrderEvidence(selected.value.order_no)
      evidenceUrl.value = data.url
      evidenceExpiresIn.value = data.expires_in
    }
    ElMessage.success('已授权查看，访问记录已写入审计日志')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '集合照加载失败')
  } finally {
    evidenceLoading.value = false
  }
}

async function addSupportNote() {
  if (!selected.value || noteSaving.value) return
  const content = noteContent.value.trim()
  if (!content) {
    ElMessage.warning('请先填写客服备注')
    return
  }
  noteSaving.value = true
  try {
    const markContact = marksCustomerContact.value && canMarkCustomerContact.value
    const note = props.preview
      ? {
        id: Date.now(), author_name: '运营管理员', organization_name: '乐搭伴运营平台',
        content, created_at: new Date().toISOString(),
      }
      : await adminApi.addProviderOrderSupportNote(
        selected.value.order_no,
        content,
        markContact,
      )
    if (props.preview) {
      selected.value.support_notes = [...selected.value.support_notes, note]
      if (markContact) {
        selected.value.support_contacted_at = new Date().toISOString()
        selected.value.support_contacted_by_name = '运营管理员'
      }
    } else {
      const updated = await adminApi.providerOrder(selected.value.order_no)
      selected.value = updated
      rows.value = rows.value.map(item => item.order_no === updated.order_no ? updated : item)
    }
    noteContent.value = ''
    marksCustomerContact.value = false
    ElMessage.success(markContact ? '已记录有效联系并停止自动退款' : '客服备注已添加并记录审计日志')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '客服备注添加失败')
  } finally {
    noteSaving.value = false
  }
}

async function moderateReview(action: 'hide' | 'restore') {
  if (!selected.value?.review || reviewSaving.value) return
  let reason = ''
  if (action === 'hide') {
    try {
      const result = await ElMessageBox.prompt(
        '请填写屏蔽原因，操作会同步影响达人公开评分。',
        '屏蔽评价',
        { inputPlaceholder: '例如：包含辱骂或泄露隐私信息', inputValidator: value => value.trim().length >= 2 || '至少填写2个字' },
      )
      reason = result.value
    } catch { return }
  } else {
    try { await ElMessageBox.confirm('恢复后评价会重新公开，并计入达人评分。', '恢复评价') }
    catch { return }
  }
  reviewSaving.value = true
  try {
    const updated = props.preview
      ? { ...selected.value, review: { ...selected.value.review, is_visible: action === 'restore' } }
      : await adminApi.moderateProviderOrderReview(selected.value.order_no, action, reason)
    selected.value = updated
    rows.value = rows.value.map(item => item.order_no === updated.order_no ? updated : item)
    ElMessage.success(action === 'hide' ? '评价已屏蔽' : '评价已恢复')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '评价状态更新失败')
  } finally { reviewSaving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page fulfillment-page">
    <header class="page-heading fulfillment-heading">
      <div>
        <h1>达人订单</h1>
        <p>查询订单全量信息，核查出发、集合照、服务开始与用户确认记录</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
    </header>

    <section class="fulfillment-summary" aria-label="履约订单概况">
      <button
        v-for="card in summaryCards"
        :key="card.key"
        :class="{ active: card.key === 'anomalies' ? anomaly === 'any' : stage === card.key && anomaly === 'all' }"
        @click="selectSummary(card.key)"
      >
        <el-icon :class="card.tone"><component :is="card.icon" /></el-icon>
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>点击筛选</small>
      </button>
    </section>

    <section class="order-panel">
      <header class="order-filters">
        <el-input
          v-model="search"
          clearable
          :prefix-icon="Search"
          placeholder="订单号 / 用户 / 达人 / 手机号"
          @keyup.enter="page = 1; load()"
        />
        <el-select v-model="cityFilter" placeholder="服务城市">
          <el-option label="全部城市" value="" />
          <el-option label="邯郸市" value="130400" />
          <el-option label="北京市" value="110100" />
          <el-option label="上海市" value="310100" />
        </el-select>
        <el-select v-model="statusFilter" clearable placeholder="订单状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="anomaly" placeholder="异常类型">
          <el-option label="不限异常" value="all" />
          <el-option label="全部异常订单" value="any" />
          <el-option label="缺少集合照" value="missing_evidence" />
          <el-option label="履约时间线缺失" value="timeline_gap" />
          <el-option label="待确认超时" value="confirmation_overdue" />
          <el-option label="拒单客服超时" value="support_contact_overdue" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
      </header>

      <el-table
        v-loading="loading"
        :data="rows"
        height="calc(100vh - 370px)"
        empty-text="当前筛选条件下没有履约订单"
        row-class-name="fulfillment-row"
        @row-click="openDetail"
      >
        <el-table-column label="订单 / 服务" min-width="190">
          <template #default="scope">
            <div class="order-identity">
              <strong>{{ scope.row.order_no }}</strong>
              <span>{{ scope.row.service_name }} · {{ formatAmount(scope.row.payable_amount) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户 / 达人" min-width="150">
          <template #default="scope">
            <div class="party-cell"><strong>{{ scope.row.customer_name }}</strong><span>达人：{{ scope.row.provider_name }}</span></div>
          </template>
        </el-table-column>
        <el-table-column prop="service_city_name" label="城市" width="85" />
        <el-table-column label="服务时间" width="170">
          <template #default="scope">{{ formatServiceTime(scope.row) }}</template>
        </el-table-column>
        <el-table-column label="订单状态" width="105">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)" effect="plain">{{ scope.row.status_label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="集合照" width="88">
          <template #default="scope">
            <span :class="scope.row.arrival_photo_available ? 'evidence-ok' : 'evidence-missing'">
              {{ scope.row.arrival_photo_available ? '已留存' : '未上传' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="异常" min-width="145">
          <template #default="scope">
            <div v-if="scope.row.anomalies.length" class="anomaly-tags">
              <el-tag v-for="issue in scope.row.anomalies" :key="issue.code" type="danger" effect="light">
                {{ issue.label }}
              </el-tag>
            </div>
            <span v-else class="normal-copy"><el-icon><CircleCheck /></el-icon> 正常</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="78" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click.stop="openDetail(scope.row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <footer class="order-table-footer">
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="page"
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          @current-change="load"
        />
      </footer>
    </section>

    <el-drawer v-model="drawerVisible" size="620px" :with-header="false" destroy-on-close>
      <div v-if="selected" v-loading="detailLoading" class="fulfillment-drawer">
        <header>
          <div><h2>履约详情</h2><p>{{ selected.order_no }}</p></div>
          <el-tag :type="statusType(selected.status)" effect="plain">{{ selected.status_label }}</el-tag>
          <button aria-label="关闭履约详情" @click="drawerVisible = false"><el-icon><Close /></el-icon></button>
        </header>

        <el-alert
          v-if="selected.anomalies.length"
          class="drawer-alert"
          type="error"
          :closable="false"
          show-icon
          :title="selected.anomalies.map((item) => item.label).join('、')"
          description="请结合履约时间线和客服备注核查；当前页面不提供直接修改订单状态。"
        />

        <el-alert
          v-if="selected.provider_rejected_at"
          class="drawer-alert"
          :type="selected.support_contacted_at ? 'success' : selected.provider_rejection_refund?.status === 'failed' ? 'error' : 'warning'"
          :closable="false"
          show-icon
          :title="selected.support_contacted_at ? '客服已完成有效联系' : selected.provider_rejection_refund ? `系统退款${selected.provider_rejection_refund.status_label}` : '达人主动拒单，等待客服有效联系'"
          :description="selected.support_contacted_at ? `${selected.support_contacted_by_name || '客服'}于 ${formatDateTime(selected.support_contacted_at)} 完成登记，自动退款任务已停止。` : selected.provider_rejection_refund ? `退款单 ${selected.provider_rejection_refund.refund_no}，金额 ${formatAmount(selected.provider_rejection_refund.refund_amount)}。${selected.provider_rejection_refund.failure_reason || ''}` : `请在 ${formatDateTime(selected.support_contact_deadline_at)} 前完成有效联系，否则系统自动发起全额退款。`"
        />

        <section class="detail-section order-overview">
          <div><span>服务项目</span><strong>{{ selected.service_name }}</strong></div>
          <div><span>订单金额</span><strong class="amount">{{ formatAmount(selected.payable_amount) }}</strong></div>
          <div><span>服务时间</span><strong>{{ formatServiceTime(selected) }}</strong></div>
          <div><span>服务城市</span><strong>{{ selected.service_city_name }}</strong></div>
          <div v-if="selected.confirmation_expires_at"><span>确认截止</span><strong>{{ formatDateTime(selected.confirmation_expires_at) }}</strong></div>
          <div v-if="selected.provider_rejected_at"><span>达人拒单时间</span><strong>{{ formatDateTime(selected.provider_rejected_at) }}</strong></div>
          <div v-if="selected.support_contact_deadline_at"><span>客服联系截止</span><strong>{{ formatDateTime(selected.support_contact_deadline_at) }}</strong></div>
          <div v-if="selected.support_contacted_at"><span>有效联系记录</span><strong>{{ selected.support_contacted_by_name || '客服' }} · {{ formatDateTime(selected.support_contacted_at) }}</strong></div>
          <div v-if="selected.provider_rejection_refund"><span>自动退款结果</span><strong>{{ selected.provider_rejection_refund.status_label }} · {{ formatAmount(selected.provider_rejection_refund.refund_amount) }}</strong></div>
          <div class="wide"><span>集合地点</span><strong>{{ [selected.meeting_location_name, selected.meeting_address].filter(Boolean).join('，') }}</strong></div>
        </section>

        <section class="detail-section">
          <h3><el-icon><Tickets /></el-icon> 费用明细</h3>
          <div class="price-breakdown">
            <div><span>服务费</span><strong>{{ formatAmount(selected.service_fee_amount) }}</strong></div>
            <div><span>往返交通费</span><strong>{{ formatAmount(selected.transport_fee_amount) }}</strong></div>
            <div><span>其他费用</span><strong>{{ formatAmount(selected.other_fee_amount) }}</strong></div>
            <div class="discount"><span>优惠抵扣</span><strong>-{{ formatAmount(selected.discount_amount) }}</strong></div>
            <div class="total"><span>订单实付</span><strong>{{ formatAmount(selected.payable_amount) }}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h3><el-icon><DocumentChecked /></el-icon> 履约时间线</h3>
          <div class="fulfillment-timeline">
            <div v-for="item in timeline" :key="item.label" :class="{ pending: !item.value }">
              <i><CircleCheck v-if="item.value" /><Clock v-else /></i>
              <span>{{ item.label }}</span>
              <strong>{{ formatDateTime(item.value) }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-section evidence-section">
          <h3><el-icon><Picture /></el-icon> 集合地点证据</h3>
          <template v-if="selected.arrival_photo_available">
            <div class="evidence-meta">
              <p><span>上传时间</span>{{ formatDateTime(selected.arrival_photo_uploaded_at) }}</p>
              <p><span>上传位置</span>{{ selected.arrival_location ? `${selected.arrival_location.longitude}, ${selected.arrival_location.latitude}` : '未记录' }}</p>
              <p><span>定位精度</span>{{ selected.arrival_location?.accuracy_m ? `约 ${selected.arrival_location.accuracy_m} 米` : '未记录' }}</p>
            </div>
            <el-button v-if="!evidenceUrl" type="primary" plain :loading="evidenceLoading" @click="viewEvidence">
              授权查看集合照
            </el-button>
            <div v-else class="evidence-preview">
              <el-image :src="evidenceUrl" :preview-src-list="[evidenceUrl]" fit="cover" preview-teleported />
              <p>本次访问已记录，链接约 {{ Math.ceil(evidenceExpiresIn / 60) }} 分钟内有效。</p>
            </div>
          </template>
          <el-empty v-else :image-size="54" description="达人尚未上传集合地点照片" />
        </section>

        <section class="detail-section">
          <h3><el-icon><Location /></el-icon> 服务双方</h3>
          <div class="party-grid">
            <article><span>用户</span><strong>{{ selected.customer_name }}</strong><p>{{ selected.customer_phone_masked }}</p></article>
            <article><span>达人</span><strong>{{ selected.provider_name }}</strong><p>{{ selected.provider_phone_masked }}</p></article>
            <article><span>订单联系人</span><strong>{{ selected.contact_name }}{{ selected.contact_gender_label }}</strong><p>{{ selected.contact_phone_masked }}</p></article>
          </div>
          <p v-if="selected.note" class="customer-note">用户备注：{{ selected.note }}</p>
        </section>

        <section v-if="selected.after_sales_cases.length" class="detail-section after-sales-section">
          <div class="section-heading"><h3><el-icon><Warning /></el-icon> 关联售后</h3><el-button link type="primary" @click="emit('openAfterSales', selected!.order_no)">去处理售后</el-button></div>
          <div class="after-sales-list">
            <article v-for="item in selected.after_sales_cases" :key="item.case_no">
              <div><strong>{{ item.case_no }}</strong><span>{{ item.case_type_label }} · {{ formatDateTime(item.created_at) }}</span></div>
              <div><el-tag :type="item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'info' : 'warning'" effect="plain">{{ item.status_label }}</el-tag><b>{{ formatAmount(item.approved_amount ?? item.requested_amount) }}</b></div>
            </article>
          </div>
          <p class="after-sales-note">售后审核请前往“售后退款”模块处理，订单状态会随审核结果同步更新。</p>
        </section>

        <section class="detail-section" v-if="selected.review">
          <div class="section-heading"><h3><el-icon><CircleCheck /></el-icon> 用户评价</h3><el-tag :type="selected.review.is_visible ? 'success' : 'info'" effect="plain">{{ selected.review.is_visible ? '公开展示' : '已屏蔽' }}</el-tag></div>
          <div class="review-admin"><strong>{{ '★'.repeat(selected.review.rating) }}<span>{{ selected.review.rating }} 分</span></strong><small>{{ selected.review.customer_name }}{{ selected.review.is_anonymous ? '（匿名展示）' : '' }} · {{ formatDateTime(selected.review.created_at) }}</small><p>{{ selected.review.content || '用户未填写文字评价' }}</p><div v-if="selected.review.image_urls.length" class="review-images"><el-image v-for="url in selected.review.image_urls" :key="url" :src="url" :preview-src-list="selected.review.image_urls" fit="cover" preview-teleported /></div></div>
          <el-button v-if="canManageReview" :loading="reviewSaving" :type="selected.review.is_visible ? 'danger' : 'primary'" plain @click="moderateReview(selected.review.is_visible ? 'hide' : 'restore')">{{ selected.review.is_visible ? '屏蔽评价' : '恢复评价' }}</el-button>
        </section>

        <section class="detail-section support-section">
          <h3><el-icon><Tickets /></el-icon> 客服备注</h3>
          <div v-if="selected.support_notes.length" class="support-notes">
            <article v-for="note in selected.support_notes" :key="note.id">
              <header><strong>{{ note.author_name }}</strong><span>{{ formatDateTime(note.created_at) }}</span></header>
              <p>{{ note.content }}</p>
              <small>{{ note.organization_name || '平台管理员' }} · 仅追加不可修改</small>
            </article>
          </div>
          <el-empty v-else :image-size="48" description="暂无客服备注" />
          <template v-if="canAddNote">
            <el-input
              v-model="noteContent"
              type="textarea"
              :rows="3"
              maxlength="1000"
              show-word-limit
              placeholder="记录联系结果、异常核查情况或后续处理建议"
            />
            <div v-if="selected.provider_rejected_at && !selected.support_contacted_at && !selected.provider_rejection_refund" class="support-contact-choice">
              <el-checkbox v-model="marksCustomerContact" :disabled="!canMarkCustomerContact">
                已完成有效联系，停止15分钟自动退款
              </el-checkbox>
              <span v-if="supportContactDeadlinePassed">客服联系截止时间已到，系统将按任务状态处理退款</span>
              <span v-else>仅在已实际联系用户后勾选，操作会写入审计日志</span>
            </div>
            <div class="note-submit"><span>提交后不可编辑或删除</span><el-button type="primary" :loading="noteSaving" @click="addSupportNote">添加备注</el-button></div>
          </template>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.fulfillment-page{min-height:calc(100vh - 76px)}.fulfillment-heading{margin-bottom:18px}.fulfillment-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}.fulfillment-summary button{position:relative;display:grid;grid-template-columns:52px 1fr;grid-template-rows:auto auto;align-items:center;min-height:92px;padding:16px 18px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.fulfillment-summary button:hover{border-color:#9cdfe0;box-shadow:0 10px 28px rgba(29,72,87,.08);transform:translateY(-1px)}.fulfillment-summary button:focus-visible{outline:3px solid rgba(8,184,189,.22);outline-offset:2px}.fulfillment-summary button.active{border-color:var(--brand);box-shadow:0 0 0 2px rgba(8,184,189,.1)}.fulfillment-summary .el-icon{grid-row:1/3;width:44px;height:44px;border-radius:12px;font-size:23px}.fulfillment-summary .el-icon.cyan{background:#e4f8f8}.fulfillment-summary .el-icon.blue{color:#2679e9!important;background:#e9f1ff}.fulfillment-summary .el-icon.orange{background:#fff0e6}.fulfillment-summary .el-icon.red{color:#d9485f;background:#fff0f2}.fulfillment-summary span{color:var(--muted);font-size:13px}.fulfillment-summary strong{font-size:27px}.fulfillment-summary small{position:absolute;right:16px;bottom:16px;color:#9aa1ab}.order-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.order-filters{display:grid;grid-template-columns:minmax(230px,1.5fr) 130px 140px 155px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.order-identity,.party-cell{display:flex;flex-direction:column;gap:5px}.order-identity strong{font-size:13px}.order-identity span,.party-cell span{color:var(--muted);font-size:12px}.party-cell strong{font-size:13px}.evidence-ok{color:#078d76}.evidence-missing{color:#d94747}.anomaly-tags{display:flex;flex-wrap:wrap;gap:4px}.normal-copy{display:inline-flex;align-items:center;gap:4px;color:#078d76}.order-table-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.fulfillment-drawer{min-height:100%;padding-bottom:28px;background:#f7f9fb}.fulfillment-drawer>header{position:sticky;z-index:3;top:0;display:flex;align-items:center;gap:12px;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.fulfillment-drawer>header div{margin-right:auto}.fulfillment-drawer>header h2{margin:0;font-size:20px}.fulfillment-drawer>header p{margin:5px 0 0;color:var(--muted);font-size:12px}.fulfillment-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.fulfillment-drawer>header button:hover{background:#f0f4f5}.drawer-alert{margin:16px 20px 0;width:auto}.detail-section{margin:14px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.detail-section h3{display:flex;align-items:center;gap:8px;margin:0 0 16px;font-size:15px}.detail-section h3 .el-icon{color:var(--brand);font-size:18px}.order-overview{display:grid;grid-template-columns:1fr 1fr;gap:16px}.order-overview div{display:flex;flex-direction:column;gap:6px}.order-overview .wide{grid-column:1/-1}.order-overview span,.evidence-meta span{color:var(--muted);font-size:12px}.order-overview strong{font-size:14px}.order-overview .amount{color:var(--orange);font-size:18px}.price-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}.price-breakdown div{display:flex;align-items:center;justify-content:space-between;padding-bottom:9px;border-bottom:1px dashed #e8ecef}.price-breakdown span{color:var(--muted);font-size:13px}.price-breakdown strong{font-size:13px}.price-breakdown .discount strong{color:#078d76}.price-breakdown .total{grid-column:1/-1;padding-top:3px;border-bottom:0}.price-breakdown .total strong{color:var(--orange);font-size:18px}.fulfillment-timeline{position:relative}.fulfillment-timeline::before{position:absolute;top:14px;bottom:14px;left:13px;width:1px;background:#dfe5e8;content:''}.fulfillment-timeline>div{position:relative;display:grid;grid-template-columns:28px 100px 1fr;align-items:center;min-height:40px}.fulfillment-timeline i{z-index:1;display:grid;place-items:center;width:27px;height:27px;border-radius:50%;color:#fff;background:var(--brand)}.fulfillment-timeline i svg{width:15px}.fulfillment-timeline span{padding-left:12px;font-size:13px}.fulfillment-timeline strong{color:#4c5665;font-size:12px;font-weight:500;text-align:right}.fulfillment-timeline .pending i{color:#9ba4ad;background:#edf1f3}.fulfillment-timeline .pending span,.fulfillment-timeline .pending strong{color:#9ba4ad}.evidence-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.evidence-meta p{display:flex;flex-direction:column;gap:4px;margin:0;font-size:13px}.evidence-preview .el-image{width:100%;height:245px;border-radius:8px;background:#edf2f3}.evidence-preview p{margin:9px 0 0;color:var(--muted);font-size:12px}.party-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.party-grid article{padding:12px;border:1px solid #e8ecef;border-radius:7px}.party-grid span{color:var(--muted);font-size:12px}.party-grid strong{display:block;margin:6px 0;font-size:14px}.party-grid p{margin:0;color:#596474;font-size:12px}.customer-note{margin:12px 0 0;padding:10px 12px;border-radius:6px;color:#5b6471;background:#f4f7f8;font-size:13px}.support-notes{display:flex;flex-direction:column;gap:9px;margin-bottom:14px}.support-notes article{padding:12px;border-left:3px solid var(--brand);border-radius:4px;background:#f5fbfb}.support-notes header{display:flex;justify-content:space-between}.support-notes header strong{font-size:13px}.support-notes header span,.support-notes small{color:var(--muted);font-size:11px}.support-notes p{margin:8px 0;color:#3f4958;font-size:13px;line-height:1.65}.note-submit{display:flex;align-items:center;justify-content:space-between;margin-top:10px}.note-submit span{color:var(--muted);font-size:12px}:deep(.fulfillment-row){cursor:pointer}:deep(.el-drawer__body){padding:0}:deep(.el-empty){padding:14px 0}:deep(.el-table__row:hover td){background:#f2fbfb!important}@media(max-width:1360px){.order-filters{grid-template-columns:minmax(210px,1fr) 120px 130px 145px 66px 66px}.fulfillment-summary button{padding:14px}.fulfillment-summary small{display:none}}
@media(prefers-reduced-motion:reduce){.fulfillment-summary button{transition:none}.fulfillment-summary button:hover{transform:none}}
.section-heading{display:flex;align-items:center;justify-content:space-between}.section-heading h3{margin-bottom:16px}
.review-admin{display:flex;flex-direction:column;gap:9px;margin-bottom:14px;padding:14px;border-radius:8px;background:#f7fbfb}.review-admin>strong{color:#f2a11b;font-size:18px;letter-spacing:1px}.review-admin>strong span{margin-left:10px;color:#273342;font-size:13px;letter-spacing:0}.review-admin>small{color:var(--muted);font-size:12px}.review-admin>p{margin:0;color:#3f4958;font-size:13px;line-height:1.65}.review-images{display:grid;grid-template-columns:repeat(3,88px);gap:8px;margin-top:3px}.review-images :deep(.el-image){width:88px;height:88px;border-radius:7px;background:#eaf0f1}
.after-sales-list{display:flex;flex-direction:column;gap:8px}.after-sales-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid #e8ecef;border-radius:7px;background:#fbfcfc}.after-sales-list article>div{display:flex;align-items:flex-end;gap:8px}.after-sales-list article>div:first-child{min-width:0;flex-direction:column;align-items:flex-start;gap:4px}.after-sales-list strong{font-size:13px}.after-sales-list span{color:var(--muted);font-size:11px}.after-sales-list b{color:var(--orange);font-size:13px}.after-sales-note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
.support-contact-choice{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding:10px 12px;border-radius:7px;background:#fff8e8}.support-contact-choice>span{color:var(--muted);font-size:11px}
</style>
