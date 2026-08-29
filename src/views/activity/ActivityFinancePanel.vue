<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Clock, Money, Refresh, Search, Tickets, WarningFilled } from '@element-plus/icons-vue'

import { adminApi } from '../../services/api'
import type {
  ActivityAfterSalesStatus,
  AdminActivityAfterSales,
  AdminActivityFinanceSummary,
  AdminActivityParticipationPayment,
  AdminActivityParticipationRefund,
} from '../../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
type RecordType = 'payment' | 'refund' | 'after_sales'

const recordType = ref<RecordType>('payment')
const rows = ref<Array<AdminActivityParticipationPayment | AdminActivityParticipationRefund | AdminActivityAfterSales>>([])
const summary = ref<AdminActivityFinanceSummary>({
  paid_count: 0,
  pending_payment_count: 0,
  refund_count: 0,
  refunded_amount: 0,
  open_after_sales_count: 0,
})
const search = ref('')
const statusFilter = ref('')
const cityFilter = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const handling = ref(false)
const drawerVisible = ref(false)
const selectedCase = ref<AdminActivityAfterSales | null>(null)

const tabs: Array<{ key: RecordType; label: string }> = [
  { key: 'payment', label: '参与支付' },
  { key: 'refund', label: '退款记录' },
  { key: 'after_sales', label: '退款 / 售后' },
]
const statusOptions = computed(() => {
  if (recordType.value === 'payment') return [
    { value: 'pending_payment', label: '待支付' }, { value: 'paid', label: '已支付' },
    { value: 'closed', label: '已关闭' }, { value: 'partially_refunded', label: '部分退款' },
    { value: 'refunded', label: '已退款' },
  ]
  if (recordType.value === 'refund') return [
    { value: 'pending', label: '待退款' }, { value: 'processing', label: '退款中' },
    { value: 'succeeded', label: '退款成功' }, { value: 'failed', label: '退款失败' },
  ]
  return [
    { value: 'pending', label: '待处理' }, { value: 'processing', label: '处理中' },
    { value: 'approved', label: '已同意' }, { value: 'rejected', label: '已驳回' },
  ]
})
const summaryCards = computed(() => [
  { label: '支付成功', value: summary.value.paid_count, suffix: '笔', icon: CircleCheck, tone: 'cyan' },
  { label: '待支付锁位', value: summary.value.pending_payment_count, suffix: '笔', icon: Clock, tone: 'orange' },
  { label: '成功退款', value: summary.value.refund_count, suffix: '笔', icon: Tickets, tone: 'blue' },
  { label: '累计退款金额', value: money(summary.value.refunded_amount), suffix: '', icon: Money, tone: 'purple' },
  { label: '待处理售后', value: summary.value.open_after_sales_count, suffix: '单', icon: WarningFilled, tone: 'red' },
])

function iso(hours: number) { return new Date(Date.now() + hours * 3600000).toISOString() }

const demoPayments: AdminActivityParticipationPayment[] = [
  {
    order_no: 'APO28D6A708D37E4DA09EFA', activity_id: 23, activity_title: '邯郸周边轻徒步交友',
    city_code: '130400', city_name: '邯郸市', payer_name: '小雨', payer_phone_masked: '188****6621',
    aa_principal_amount: 3600, platform_service_fee_amount: 360, payable_amount: 3960,
    channel: 'mock_wechat', channel_label: '模拟微信支付', status: 'paid', status_label: '已支付',
    gateway_trade_no: 'MOCK202608290001', expires_at: iso(-20), paid_at: iso(-21), closed_at: null,
    created_at: iso(-21), updated_at: iso(-21),
  },
  {
    order_no: 'APO85D9C28D679D42E498B0', activity_id: 24, activity_title: '年轻人商务交流午餐会',
    city_code: '130400', city_name: '邯郸市', payer_name: '阿哲', payer_phone_masked: '186****1201',
    aa_principal_amount: 12800, platform_service_fee_amount: 1280, payable_amount: 14080,
    channel: 'mock_alipay', channel_label: '模拟支付宝', status: 'pending_payment', status_label: '待支付',
    gateway_trade_no: '', expires_at: iso(.34), paid_at: null, closed_at: null,
    created_at: iso(-.16), updated_at: iso(-.16),
  },
  {
    order_no: 'APOC4B12CB077C943D09B57', activity_id: 21, activity_title: '周五晚桌球新手友好局',
    city_code: '130400', city_name: '邯郸市', payer_name: '可可', payer_phone_masked: '186****1202',
    aa_principal_amount: 4800, platform_service_fee_amount: 480, payable_amount: 5280,
    channel: 'mock_wechat', channel_label: '模拟微信支付', status: 'refunded', status_label: '已退款',
    gateway_trade_no: 'MOCK202608280017', expires_at: iso(-31), paid_at: iso(-32), closed_at: null,
    created_at: iso(-32), updated_at: iso(-3),
  },
]

const demoRefunds: AdminActivityParticipationRefund[] = [
  {
    refund_no: 'APR47A1D82BD2DA4C19930D', payment_order_no: 'APOC4B12CB077C943D09B57',
    activity_id: 21, activity_title: '周五晚桌球新手友好局', city_code: '130400', city_name: '邯郸市',
    beneficiary_name: '可可', beneficiary_phone_masked: '186****1202', refund_type: 'organizer_cancellation',
    refund_type_label: '发起人取消', status: 'succeeded', status_label: '模拟退款成功',
    principal_refund_amount: 4800, service_fee_refund_amount: 480, refund_amount: 5280,
    retained_principal_amount: 0, retained_service_fee_amount: 0, retained_principal_destination: 'none',
    retained_principal_destination_label: '无扣除', reason: '发起人临时有事，活动取消', operator_name: null,
    requested_at: iso(-3.1), refunded_at: iso(-3), created_at: iso(-3.1), updated_at: iso(-3),
  },
  {
    refund_no: 'APR64E99A401F4D4FF08821', payment_order_no: 'APO20BD821BC38B41868C27',
    activity_id: 25, activity_title: '桌游欢乐派对', city_code: '130400', city_name: '邯郸市',
    beneficiary_name: '林一', beneficiary_phone_masked: '186****1203', refund_type: 'participant_cancellation',
    refund_type_label: '参与者取消', status: 'succeeded', status_label: '模拟退款成功',
    principal_refund_amount: 4060, service_fee_refund_amount: 0, refund_amount: 4060,
    retained_principal_amount: 1740, retained_service_fee_amount: 580, retained_principal_destination: 'organizer',
    retained_principal_destination_label: '归发起人', reason: '个人行程冲突', operator_name: null,
    requested_at: iso(-6), refunded_at: iso(-5.9), created_at: iso(-6), updated_at: iso(-5.9),
  },
]

const demoCases = ref<AdminActivityAfterSales[]>([
  {
    case_no: 'AAS1919C5F8781347F5B3A0', activity_id: 24, activity_title: '年轻人商务交流午餐会',
    city_code: '130400', city_name: '邯郸市', applicant_name: '小雨', applicant_phone_masked: '188****6621',
    reason: 'venue_change', reason_label: '临时变更场地', description: '活动开始前临时换到较远场地，无法按时到达，希望退回本次报名费用。',
    evidence_count: 2, status: 'pending', status_label: '待处理', requested_principal_amount: 12800,
    requested_service_fee_amount: 1280, requested_amount: 14080, approved_principal_amount: 0,
    approved_service_fee_amount: 0, approved_amount: 0, result_note: '', reviewed_by_name: null,
    reviewed_at: null, refund_order: null, created_at: iso(-2), updated_at: iso(-2),
  },
  {
    case_no: 'AAS9C1801A26AB14D56B4C2', activity_id: 23, activity_title: '邯郸周边轻徒步交友',
    city_code: '130400', city_name: '邯郸市', applicant_name: '阿哲', applicant_phone_masked: '186****1201',
    reason: 'false_information', reason_label: '活动信息不实', description: '实际路线和活动介绍不一致，已上传现场照片和沟通记录。',
    evidence_count: 3, status: 'processing', status_label: '处理中', requested_principal_amount: 3600,
    requested_service_fee_amount: 360, requested_amount: 3960, approved_principal_amount: 0,
    approved_service_fee_amount: 0, approved_amount: 0, result_note: '', reviewed_by_name: '运营管理员',
    reviewed_at: null, refund_order: null, created_at: iso(-7), updated_at: iso(-4),
  },
])

function demoRows() {
  const source = recordType.value === 'payment' ? demoPayments : recordType.value === 'refund' ? demoRefunds : demoCases.value
  const keyword = search.value.trim().toLowerCase()
  return source.filter((row) => {
    const text = JSON.stringify(row).toLowerCase()
    return (!keyword || text.includes(keyword))
      && (!statusFilter.value || row.status === statusFilter.value)
      && (!cityFilter.value || row.city_code === cityFilter.value)
  })
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      rows.value = demoRows()
      total.value = rows.value.length
      summary.value = { paid_count: 12, pending_payment_count: 3, refund_count: 6, refunded_amount: 28740, open_after_sales_count: 2 }
      return
    }
    const data = await adminApi.activityFinance({
      record_type: recordType.value, search: search.value.trim(), status: statusFilter.value,
      city_code: cityFilter.value, page: page.value, page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '活动账务数据加载失败')
  } finally { loading.value = false }
}

function switchType(type: RecordType) {
  recordType.value = type
  statusFilter.value = ''
  page.value = 1
  load()
}

function resetFilters() {
  search.value = ''
  statusFilter.value = ''
  cityFilter.value = ''
  page.value = 1
  load()
}

function openCase(item: AdminActivityAfterSales) {
  selectedCase.value = item
  drawerVisible.value = true
}

async function handleCase(action: 'start_review' | 'approve' | 'reject') {
  if (!selectedCase.value || !props.canManage) return
  let note = ''
  try {
    if (action === 'start_review') {
      await ElMessageBox.confirm('领取后售后单将进入处理中状态。', '开始处理售后', {
        confirmButtonText: '确认领取', cancelButtonText: '取消', type: 'info',
      })
    } else {
      const approving = action === 'approve'
      const result = await ElMessageBox.prompt(
        approving ? `同意后将按申请金额 ${money(selectedCase.value.requested_amount)} 原路退款。` : '驳回后不会生成退款单。',
        approving ? '同意退款申请' : '驳回售后申请',
        {
          inputPlaceholder: '请填写处理结论（至少 5 个字）',
          inputValidator: (value) => value.trim().length >= 5 || '至少填写 5 个字',
          confirmButtonText: approving ? '确认退款' : '确认驳回', cancelButtonText: '取消',
          type: approving ? 'warning' : 'info',
        },
      )
      note = result.value.trim()
    }
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }

  handling.value = true
  try {
    if (props.preview) {
      const item = demoCases.value.find((entry) => entry.case_no === selectedCase.value?.case_no)
      if (item) {
        item.status = (action === 'start_review' ? 'processing' : action === 'approve' ? 'approved' : 'rejected') as ActivityAfterSalesStatus
        item.status_label = action === 'start_review' ? '处理中' : action === 'approve' ? '已同意' : '已驳回'
        item.result_note = note
        item.reviewed_by_name = '运营管理员'
        item.reviewed_at = action === 'start_review' ? null : new Date().toISOString()
        if (action === 'approve') {
          item.approved_principal_amount = item.requested_principal_amount
          item.approved_service_fee_amount = item.requested_service_fee_amount
          item.approved_amount = item.requested_amount
        }
        selectedCase.value = { ...item }
      }
    } else {
      selectedCase.value = await adminApi.reviewActivityAfterSales(selectedCase.value.case_no, action, note)
    }
    ElMessage.success(action === 'start_review' ? '售后单已领取' : action === 'approve' ? '退款已处理完成' : '售后申请已驳回')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '售后操作失败')
  } finally { handling.value = false }
}

function money(value = 0) { return `¥${(value / 100).toFixed(2)}` }
function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function paymentTag(status: string) {
  if (status === 'paid') return 'success'
  if (status === 'pending_payment') return 'warning'
  if (status === 'partially_refunded') return 'primary'
  return 'info'
}
function caseTag(status: string) {
  if (status === 'pending') return 'warning'
  if (status === 'processing') return 'primary'
  if (status === 'approved' || status === 'succeeded') return 'success'
  return 'info'
}

onMounted(load)
</script>

<template>
  <div class="finance-workspace">
    <section class="finance-summary">
      <article v-for="item in summaryCards" :key="item.label">
        <el-icon :class="item.tone"><component :is="item.icon" /></el-icon>
        <div><span>{{ item.label }}</span><strong>{{ item.value }}<small>{{ item.suffix }}</small></strong></div>
      </article>
    </section>

    <section class="finance-panel">
      <header class="finance-toolbar">
        <div class="record-tabs">
          <button v-for="tab in tabs" :key="tab.key" :class="{ active: recordType === tab.key }" @click="switchType(tab.key)">{{ tab.label }}</button>
        </div>
        <el-input v-model="search" clearable :prefix-icon="Search" placeholder="搜索单号、活动或用户" @keyup.enter="page = 1; load()" />
        <el-select v-model="cityFilter" clearable placeholder="全部城市" @change="page = 1; load()">
          <el-option label="邯郸市" value="130400" /><el-option label="北京市" value="110100" />
        </el-select>
        <el-select v-model="statusFilter" clearable placeholder="全部状态" @change="page = 1; load()">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
        <el-button :icon="Refresh" @click="resetFilters" />
      </header>

      <el-table v-if="recordType === 'payment'" v-loading="loading" :data="rows" height="calc(100vh - 424px)" empty-text="暂无参与支付记录">
        <el-table-column label="支付单 / 活动" min-width="250">
          <template #default="{ row }"><div class="primary-cell"><strong>{{ row.activity_title }}</strong><small>{{ row.order_no }} · #{{ row.activity_id }}</small></div></template>
        </el-table-column>
        <el-table-column label="付款人" min-width="130"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.payer_name }}</strong><small>{{ row.payer_phone_masked }}</small></div></template></el-table-column>
        <el-table-column label="金额构成" min-width="150"><template #default="{ row }"><div class="primary-cell"><strong class="money">{{ money(row.payable_amount) }}</strong><small>AA {{ money(row.aa_principal_amount) }} + 服务费 {{ money(row.platform_service_fee_amount) }}</small></div></template></el-table-column>
        <el-table-column label="渠道" width="125" prop="channel_label" />
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="paymentTag(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
        <el-table-column label="支付 / 失效时间" min-width="145"><template #default="{ row }"><div class="primary-cell"><strong>{{ formatDate(row.paid_at) }}</strong><small v-if="!row.paid_at">锁位至 {{ formatDate(row.expires_at) }}</small><small v-else>{{ row.gateway_trade_no }}</small></div></template></el-table-column>
      </el-table>

      <el-table v-else-if="recordType === 'refund'" v-loading="loading" :data="rows" height="calc(100vh - 424px)" empty-text="暂无退款记录">
        <el-table-column label="退款单 / 活动" min-width="240"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.activity_title }}</strong><small>{{ row.refund_no }}</small></div></template></el-table-column>
        <el-table-column label="退款用户" min-width="125"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.beneficiary_name }}</strong><small>{{ row.beneficiary_phone_masked }}</small></div></template></el-table-column>
        <el-table-column label="退款类型" min-width="125" prop="refund_type_label" />
        <el-table-column label="退还金额" width="120"><template #default="{ row }"><strong class="money">{{ money(row.refund_amount) }}</strong></template></el-table-column>
        <el-table-column label="扣留 / 归属" min-width="150"><template #default="{ row }"><div class="primary-cell"><strong>{{ money(row.retained_principal_amount + row.retained_service_fee_amount) }}</strong><small>{{ row.retained_principal_destination_label || '无扣除' }}</small></div></template></el-table-column>
        <el-table-column label="状态" width="115"><template #default="{ row }"><el-tag :type="caseTag(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
        <el-table-column label="完成时间" min-width="135"><template #default="{ row }">{{ formatDate(row.refunded_at) }}</template></el-table-column>
      </el-table>

      <el-table v-else v-loading="loading" :data="rows" height="calc(100vh - 424px)" empty-text="暂无退款售后记录">
        <el-table-column label="售后单 / 活动" min-width="245"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.activity_title }}</strong><small>{{ row.case_no }} · {{ row.reason_label }}</small></div></template></el-table-column>
        <el-table-column label="申请人" min-width="125"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.applicant_name }}</strong><small>{{ row.applicant_phone_masked }}</small></div></template></el-table-column>
        <el-table-column label="申请退款" width="125"><template #default="{ row }"><strong class="money">{{ money(row.requested_amount) }}</strong></template></el-table-column>
        <el-table-column label="材料" width="80"><template #default="{ row }">{{ row.evidence_count }} 份</template></el-table-column>
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="caseTag(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
        <el-table-column label="申请时间" min-width="130"><template #default="{ row }">{{ formatDate(row.created_at) }}</template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openCase(row)">{{ ['pending','processing'].includes(row.status) ? '去处理' : '查看' }}</el-button></template></el-table-column>
      </el-table>

      <footer class="finance-footer"><span>共 {{ total }} 条记录</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="560px" destroy-on-close>
      <template #header><div class="drawer-heading"><span>活动退款 / 售后</span><el-tag v-if="selectedCase" :type="caseTag(selectedCase.status)">{{ selectedCase.status_label }}</el-tag></div></template>
      <div v-if="selectedCase" class="case-detail">
        <section class="case-hero"><small>{{ selectedCase.case_no }}</small><h2>{{ selectedCase.activity_title }}</h2><p>{{ selectedCase.applicant_name }} · {{ selectedCase.applicant_phone_masked }} · {{ selectedCase.city_name }}</p></section>
        <section class="case-card"><header><h3>用户诉求</h3><el-tag effect="plain">{{ selectedCase.reason_label }}</el-tag></header><p>{{ selectedCase.description }}</p><div class="evidence-note">已提交 {{ selectedCase.evidence_count }} 份证明材料，材料查看需走受控访问链路</div></section>
        <section class="amount-grid"><article><span>申请退 AA 本金</span><strong>{{ money(selectedCase.requested_principal_amount) }}</strong></article><article><span>申请退平台服务费</span><strong>{{ money(selectedCase.requested_service_fee_amount) }}</strong></article><article class="total"><span>申请退款合计</span><strong>{{ money(selectedCase.requested_amount) }}</strong></article></section>
        <section v-if="selectedCase.result_note" class="case-card"><header><h3>处理结论</h3><span>{{ selectedCase.reviewed_by_name }}</span></header><p>{{ selectedCase.result_note }}</p><div v-if="selectedCase.status === 'approved'" class="approved-refund">已批准并退款 {{ money(selectedCase.approved_amount ?? 0) }}<small>{{ selectedCase.refund_order?.refund_no }}</small></div></section>
        <section class="rule-note"><strong>处理原则</strong><p>常规取消优先按活动退款规则自动计算；不可抗力、信息不实或未履约等特殊情形进入人工售后。批准后由统一退款服务生成退款单，避免重复退款。</p></section>
      </div>
      <template #footer>
        <div v-if="selectedCase && canManage && ['pending','processing'].includes(selectedCase.status)" class="case-actions">
          <el-button v-if="selectedCase.status === 'pending'" :loading="handling" @click="handleCase('start_review')">领取处理</el-button>
          <el-button :disabled="handling" @click="handleCase('reject')">驳回申请</el-button>
          <el-button type="primary" :loading="handling" @click="handleCase('approve')">同意并退款</el-button>
        </div>
        <el-button v-else @click="drawerVisible = false">关闭</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.finance-workspace{display:flex;flex-direction:column;gap:14px}.finance-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.finance-summary article{display:flex;align-items:center;gap:11px;min-height:80px;padding:13px 14px;border:1px solid var(--line);border-radius:8px;background:#fff}.finance-summary .el-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:10px;font-size:19px}.finance-summary .cyan{color:#039aa1;background:#e4f8f8}.finance-summary .orange{color:#e97825;background:#fff0e6}.finance-summary .blue{color:#2679e9;background:#e9f1ff}.finance-summary .purple{color:#7957d7;background:#f1edff}.finance-summary .red{color:#dc5c4b;background:#fff0ed}.finance-summary article>div{display:flex;min-width:0;flex-direction:column;gap:4px}.finance-summary span{color:var(--muted);font-size:11px}.finance-summary strong{color:#172033;font-size:21px;white-space:nowrap}.finance-summary small{margin-left:3px;font-size:10px;font-weight:500}.finance-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.finance-toolbar{display:grid;grid-template-columns:auto minmax(210px,1fr) 120px 120px 64px 32px;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid var(--line)}.record-tabs{display:flex;padding:3px;border-radius:6px;background:#f2f5f6}.record-tabs button{padding:7px 13px;border:0;border-radius:5px;color:#64717c;background:transparent;font-size:12px}.record-tabs button.active{color:#087f84;background:#fff;box-shadow:0 1px 5px rgba(30,55,65,.12);font-weight:700}.primary-cell{display:flex;min-width:0;flex-direction:column;gap:4px}.primary-cell strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.primary-cell small{overflow:hidden;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.money{color:#ef6d2e!important}.finance-footer{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;color:var(--muted);font-size:12px}.drawer-heading{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}.case-detail{display:flex;flex-direction:column;gap:12px}.case-hero{padding:2px 0 14px;border-bottom:1px solid var(--line)}.case-hero small{color:var(--muted);font-size:11px}.case-hero h2{margin:6px 0 8px;font-size:18px}.case-hero p{margin:0;color:#67737d;font-size:12px}.case-card{padding:15px;border:1px solid #e3e9ec;border-radius:8px}.case-card header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.case-card h3{margin:0;font-size:13px}.case-card header span{color:var(--muted);font-size:11px}.case-card p{margin:0;color:#535f69;font-size:12px;line-height:1.7}.evidence-note{margin-top:12px;padding:9px 10px;border-radius:6px;color:#71808a;background:#f5f7f8;font-size:11px}.amount-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.amount-grid article{display:flex;flex-direction:column;gap:5px;padding:13px;border:1px solid #e3e9ec;border-radius:8px}.amount-grid span{color:var(--muted);font-size:10px}.amount-grid strong{font-size:17px}.amount-grid .total{grid-column:1/3;border-color:#b6e5e6;background:#f0fbfb}.amount-grid .total strong{color:#078f94;font-size:20px}.approved-refund{display:flex;justify-content:space-between;margin-top:12px;padding:10px;border-radius:6px;color:#078f74;background:#ecfaf5;font-size:12px;font-weight:700}.approved-refund small{font-weight:400}.rule-note{padding:13px;border-left:3px solid #14b9bd;border-radius:4px;background:#f0fafa}.rule-note strong{font-size:12px}.rule-note p{margin:5px 0 0;color:#617079;font-size:11px;line-height:1.65}.case-actions{display:flex;justify-content:flex-end;gap:7px;width:100%}@media(max-width:1280px){.finance-summary{grid-template-columns:repeat(3,1fr)}.finance-toolbar{grid-template-columns:auto minmax(190px,1fr) 110px 110px 60px 32px}.record-tabs button{padding:7px 9px}}@media(prefers-reduced-motion:reduce){.record-tabs button{transition:none}}
</style>
