<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Coin, CreditCard, Refresh, Search, SuccessFilled, Tickets, WarningFilled } from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatDateTime, formatMoney as formatAmount } from '../utils/format'
import type {
  ProviderOrderFinanceSummary,
  ProviderOrderPaymentRecord,
  ProviderOrderRefundRecord,
  ProviderOrderSettlementRecord,
} from '../types'

type RecordType = 'payment' | 'refund' | 'settlement' | 'exception'
type FinanceRecord = ProviderOrderPaymentRecord | ProviderOrderRefundRecord | ProviderOrderSettlementRecord

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const active = ref<RecordType>('payment')
const rows = ref<FinanceRecord[]>([])
const summary = ref<ProviderOrderFinanceSummary>({
  paid_amount: 0,
  refunded_amount: 0,
  pending_settlement_amount: 0,
  settled_amount: 0,
  exception_count: 0,
})
const search = ref('')
const cityCode = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const retrying = ref('')
const drawerVisible = ref(false)
const selected = ref<FinanceRecord | null>(null)

const tabs: Array<{ key: RecordType; label: string }> = [
  { key: 'payment', label: '支付记录' },
  { key: 'refund', label: '退款记录' },
  { key: 'settlement', label: '达人结算' },
  { key: 'exception', label: '异常交易' },
]
const statusOptions = computed(() => {
  if (active.value === 'payment') return [
    ['pending_payment', '待支付'], ['paid', '已支付'], ['closed', '已关闭'],
    ['partially_refunded', '部分退款'], ['refunded', '已退款'],
  ]
  if (active.value === 'refund' || active.value === 'exception') return [
    ['pending', '待退款'], ['processing', '退款处理中'], ['succeeded', '退款成功'], ['failed', '退款失败'],
  ]
  return [
    ['risk_frozen', '风险冻结中'], ['dispute_frozen', '争议冻结中'],
    ['settled', '已结算入账'], ['cancelled', '已取消'],
  ]
})
const summaryCards = computed(() => [
  { label: '累计实付', value: summary.value.paid_amount, icon: CreditCard, tone: 'blue' },
  { label: '累计退款', value: summary.value.refunded_amount, icon: Tickets, tone: 'orange' },
  { label: '待结算收入', value: summary.value.pending_settlement_amount, icon: Coin, tone: 'cyan' },
  { label: '已结算收入', value: summary.value.settled_amount, icon: SuccessFilled, tone: 'green' },
  { label: '异常交易', value: summary.value.exception_count, icon: WarningFilled, tone: 'red', count: true },
])

const demoPayment: ProviderOrderPaymentRecord = {
  payment_no: 'POP8A33F1E40DA748F2B003', order_no: 'DZY202609050001', customer_name: '林小雨',
  provider_name: '晓晓', service_name: '桌球陪伴', city_code: '130400', city_name: '邯郸市',
  channel: 'mock_wechat', channel_label: '模拟微信支付', status: 'paid', status_label: '已支付',
  service_fee_amount: 35600, transport_fee_amount: 1000, other_fee_amount: 0, discount_amount: 0,
  payable_amount: 36600, gateway_trade_no: 'MOCKPAY8D4C7211', expires_at: new Date().toISOString(),
  paid_at: new Date().toISOString(), closed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
const demoRefund: ProviderOrderRefundRecord = {
  refund_no: 'POR09F73A01D0E54E2691D2', order_no: 'DZY202609040006', payment_no: 'POP63A873AC',
  customer_name: '周可可', provider_name: '甜甜', service_name: '桌游陪伴', city_code: '130400', city_name: '邯郸市',
  source_type: 'after_sales', source_type_label: '退款售后', source_reference: 'AS51AE0C2A', status: 'succeeded',
  status_label: '退款成功', service_fee_refund_amount: 17800, transport_fee_refund_amount: 0,
  other_fee_refund_amount: 0, refund_amount: 17800, gateway_refund_no: 'MOCKREF0954B8', reason: '服务时间调整，协商部分退款',
  operator_name: '运营管理员', requested_at: new Date().toISOString(), refunded_at: new Date().toISOString(),
  failure_reason: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
const demoSettlement: ProviderOrderSettlementRecord = {
  settlement_no: 'POSA8094F3142AD4E5C9081', order_no: 'DZY202609030012', provider_name: '晓晓',
  service_name: '桌球陪伴', city_code: '130400', city_name: '邯郸市', status: 'risk_frozen', status_label: '风险冻结中',
  paid_amount: 36600, refunded_amount: 0, net_service_fee_amount: 35600, net_transport_fee_amount: 1000,
  net_other_fee_amount: 0, platform_commission_rate: '20.00', platform_commission_amount: 7120,
  provider_service_income_amount: 28480, provider_settlement_amount: 29480, frozen_at: new Date().toISOString(),
  freeze_until: new Date(Date.now() + 86400000).toISOString(), dispute_reason: '', settled_at: null,
  cancelled_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

function paymentRow(row: FinanceRecord): row is ProviderOrderPaymentRecord { return 'payment_no' in row }
function refundRow(row: FinanceRecord): row is ProviderOrderRefundRecord { return 'refund_no' in row }
function settlementRow(row: FinanceRecord): row is ProviderOrderSettlementRecord { return 'settlement_no' in row }
function statusType(status: string) {
  if (['paid', 'succeeded', 'settled'].includes(status)) return 'success'
  if (['failed', 'dispute_frozen'].includes(status)) return 'danger'
  if (['pending_payment', 'pending', 'processing', 'risk_frozen'].includes(status)) return 'warning'
  return 'info'
}
function rowIdentity(row: FinanceRecord) {
  if (paymentRow(row)) return row.payment_no
  if (refundRow(row)) return row.refund_no
  return row.settlement_no
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      summary.value = { paid_amount: 8624600, refunded_amount: 386200, pending_settlement_amount: 625800, settled_amount: 5831200, exception_count: 1 }
      rows.value = active.value === 'payment' ? [demoPayment]
        : active.value === 'settlement' ? [demoSettlement]
          : [{ ...demoRefund, ...(active.value === 'exception' ? { status: 'failed' as const, status_label: '退款失败', failure_reason: '渠道响应超时，请重试' } : {}) }]
      total.value = rows.value.length
      return
    }
    const data = await adminApi.providerOrderFinance({
      record_type: active.value,
      search: search.value.trim(),
      city_code: cityCode.value,
      status: active.value === 'exception' ? '' : statusFilter.value,
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    summary.value = data.summary
    total.value = data.pagination.total
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '交易数据加载失败')
  } finally {
    loading.value = false
  }
}
function switchTab(key: RecordType) { active.value = key; statusFilter.value = ''; page.value = 1; load() }
function resetFilters() { search.value = ''; cityCode.value = ''; statusFilter.value = ''; page.value = 1; load() }
function openDetail(row: FinanceRecord) { selected.value = row; drawerVisible.value = true }
async function retryRefund(row: ProviderOrderRefundRecord) {
  if (!props.canManage || retrying.value) return
  try {
    await ElMessageBox.confirm(
      `确认重新执行退款单 ${row.refund_no}（${formatAmount(row.refund_amount)}）？${row.failure_reason ? ` 上次失败原因：${row.failure_reason}` : ''}`,
      '确认重试退款',
      {
        confirmButtonText: '确认重试',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  retrying.value = row.refund_no
  try {
    if (!props.preview) await adminApi.retryProviderOrderRefund(row.refund_no)
    ElMessage.success('退款任务已重新执行')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '退款重试失败')
  } finally {
    retrying.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="finance-page">
    <header class="page-heading">
      <div><h1>交易与结算</h1><p>追踪达人订单从用户支付、退款处理到达人收入结算的完整资金链路</p></div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
    </header>

    <section class="summary-grid">
      <article v-for="card in summaryCards" :key="card.label" :class="card.tone">
        <el-icon><component :is="card.icon" /></el-icon>
        <div><span>{{ card.label }}</span><strong>{{ card.count ? card.value : formatAmount(card.value) }}</strong></div>
      </article>
    </section>

    <section class="money-flow" aria-label="资金处理流程">
      <div><i>1</i><span><strong>用户支付</strong><small>支付单独立留痕</small></span></div><b>→</b>
      <div><i>2</i><span><strong>履约确认</strong><small>生成结算快照</small></span></div><b>→</b>
      <div><i>3</i><span><strong>风险冻结</strong><small>售后自动暂停</small></span></div><b>→</b>
      <div><i>4</i><span><strong>达人入账</strong><small>到期幂等结算</small></span></div>
    </section>

    <section class="finance-panel">
      <div class="record-tabs">
        <button v-for="tab in tabs" :key="tab.key" :class="{ active: active === tab.key }" @click="switchTab(tab.key)">
          {{ tab.label }}<em v-if="tab.key === 'exception' && summary.exception_count">{{ summary.exception_count }}</em>
        </button>
      </div>
      <div class="filters">
        <el-input v-model="search" :prefix-icon="Search" clearable placeholder="搜索交易单号、订单号、用户或达人" @keyup.enter="page = 1; load()" />
        <el-select v-model="cityCode" clearable placeholder="全部城市"><el-option label="邯郸市" value="130400" /><el-option label="北京市" value="110100" /></el-select>
        <el-select v-if="active !== 'exception'" v-model="statusFilter" clearable placeholder="全部状态"><el-option v-for="item in statusOptions" :key="item[0]" :label="item[1]" :value="item[0]" /></el-select>
        <el-button type="primary" @click="page = 1; load()">查询</el-button><el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" height="calc(100vh - 505px)" empty-text="暂无符合条件的交易记录" @row-click="openDetail">
        <template v-if="active === 'payment'">
          <el-table-column label="支付单 / 订单" min-width="210"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.payment_no }}</strong><span>{{ row.order_no }}</span></div></template></el-table-column>
          <el-table-column label="用户 / 达人" min-width="150"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.customer_name }}</strong><span>{{ row.provider_name }} · {{ row.service_name }}</span></div></template></el-table-column>
          <el-table-column label="支付渠道" min-width="125" prop="channel_label" />
          <el-table-column label="实付金额" min-width="120"><template #default="{ row }"><strong class="amount">{{ formatAmount(row.payable_amount) }}</strong></template></el-table-column>
          <el-table-column label="状态" width="115"><template #default="{ row }"><el-tag :type="statusType(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
          <el-table-column label="支付时间" min-width="175"><template #default="{ row }">{{ formatDateTime(row.paid_at) }}</template></el-table-column>
        </template>
        <template v-else-if="active === 'refund' || active === 'exception'">
          <el-table-column label="退款单 / 订单" min-width="210"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.refund_no }}</strong><span>{{ row.order_no }}</span></div></template></el-table-column>
          <el-table-column label="退款用户" min-width="130" prop="customer_name" />
          <el-table-column label="退款来源" min-width="125" prop="source_type_label" />
          <el-table-column label="退款金额" min-width="120"><template #default="{ row }"><strong class="refund-amount">-{{ formatAmount(row.refund_amount) }}</strong></template></el-table-column>
          <el-table-column label="状态" width="115"><template #default="{ row }"><el-tag :type="statusType(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
          <el-table-column label="申请时间" min-width="175"><template #default="{ row }">{{ formatDateTime(row.requested_at) }}</template></el-table-column>
          <el-table-column v-if="active === 'exception'" label="操作" width="128" fixed="right"><template #default="{ row }"><el-button link type="primary" :loading="retrying === row.refund_no" :disabled="!canManage" @click.stop="retryRefund(row)">重试</el-button><el-button link type="primary" @click.stop="openDetail(row)">详情</el-button></template></el-table-column>
        </template>
        <template v-else>
          <el-table-column label="结算单 / 订单" min-width="210"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.settlement_no }}</strong><span>{{ row.order_no }}</span></div></template></el-table-column>
          <el-table-column label="达人 / 服务" min-width="150"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.provider_name }}</strong><span>{{ row.service_name }} · {{ row.city_name }}</span></div></template></el-table-column>
          <el-table-column label="平台抽成" min-width="125"><template #default="{ row }">{{ row.platform_commission_rate }}% · {{ formatAmount(row.platform_commission_amount) }}</template></el-table-column>
          <el-table-column label="达人结算" min-width="125"><template #default="{ row }"><strong class="amount">{{ formatAmount(row.provider_settlement_amount) }}</strong></template></el-table-column>
          <el-table-column label="状态" width="125"><template #default="{ row }"><el-tag :type="statusType(row.status)" effect="light">{{ row.status_label }}</el-tag></template></el-table-column>
          <el-table-column label="预计 / 实际入账" min-width="175"><template #default="{ row }">{{ formatDateTime(row.settled_at || row.freeze_until) }}</template></el-table-column>
        </template>
        <el-table-column v-if="active !== 'exception'" label="操作" width="80" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="openDetail(row)">详情</el-button></template></el-table-column>
      </el-table>
      <footer><span>共 {{ total }} 条记录</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :page-size="pageSize" :total="total" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="520px" :with-header="false">
      <div v-if="selected" class="detail-drawer">
        <header><div><h2>交易详情</h2><p>{{ rowIdentity(selected) }}</p></div><el-tag :type="statusType(selected.status)" effect="light">{{ selected.status_label }}</el-tag></header>
        <section v-if="paymentRow(selected)"><h3>支付构成</h3><dl><div><dt>服务费</dt><dd>{{ formatAmount(selected.service_fee_amount) }}</dd></div><div><dt>交通费</dt><dd>{{ formatAmount(selected.transport_fee_amount) }}</dd></div><div><dt>优惠金额</dt><dd>-{{ formatAmount(selected.discount_amount) }}</dd></div><div class="total"><dt>用户实付</dt><dd>{{ formatAmount(selected.payable_amount) }}</dd></div></dl><p>渠道交易号：{{ selected.gateway_trade_no || '尚未生成' }}</p></section>
        <section v-else-if="refundRow(selected)"><h3>退款分配</h3><dl><div><dt>服务费退款</dt><dd>{{ formatAmount(selected.service_fee_refund_amount) }}</dd></div><div><dt>交通费退款</dt><dd>{{ formatAmount(selected.transport_fee_refund_amount) }}</dd></div><div><dt>其他费用退款</dt><dd>{{ formatAmount(selected.other_fee_refund_amount) }}</dd></div><div class="total"><dt>退款总额</dt><dd>{{ formatAmount(selected.refund_amount) }}</dd></div></dl><p>{{ selected.reason }}</p><el-alert v-if="selected.failure_reason" type="error" :closable="false" :title="selected.failure_reason" /></section>
        <section v-else-if="settlementRow(selected)"><h3>结算分配</h3><dl><div><dt>净服务费</dt><dd>{{ formatAmount(selected.net_service_fee_amount) }}</dd></div><div><dt>平台抽成</dt><dd>{{ formatAmount(selected.platform_commission_amount) }}</dd></div><div><dt>交通及其他</dt><dd>{{ formatAmount(selected.net_transport_fee_amount + selected.net_other_fee_amount) }}</dd></div><div class="total"><dt>达人结算</dt><dd>{{ formatAmount(selected.provider_settlement_amount) }}</dd></div></dl><p>冻结期至 {{ formatDateTime(selected.freeze_until) }}</p><el-alert v-if="selected.dispute_reason" type="warning" :closable="false" :title="selected.dispute_reason" /></section>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.finance-page{min-height:calc(100vh - 76px)}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}.page-heading h1{margin:0;color:#172033;font-size:24px}.page-heading p{margin:6px 0 0;color:var(--muted);font-size:13px}.summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.summary-grid article{display:flex;align-items:center;gap:12px;min-height:82px;padding:13px 15px;border:1px solid var(--line);border-radius:9px;background:#fff}.summary-grid .el-icon{display:grid;place-items:center;flex:0 0 39px;width:39px;height:39px;border-radius:11px;font-size:20px}.summary-grid div{display:flex;min-width:0;flex-direction:column;gap:5px}.summary-grid span{color:var(--muted);font-size:11px}.summary-grid strong{font-size:20px}.summary-grid .blue .el-icon{color:#2679e9;background:#eaf2ff}.summary-grid .orange .el-icon{color:#e97825;background:#fff0e6}.summary-grid .cyan .el-icon{color:#078f94;background:#e4f8f8}.summary-grid .green .el-icon{color:#25a267;background:#e9f8f0}.summary-grid .red .el-icon{color:#d95050;background:#fff0f0}.money-flow{display:flex;align-items:center;justify-content:center;gap:22px;margin:14px 0;padding:13px 20px;border:1px solid #cdeced;border-radius:9px;background:linear-gradient(90deg,#f5fdfd,#fff)}.money-flow>div{display:flex;align-items:center;gap:9px}.money-flow i{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;color:#078f94;background:#dff7f7;font-size:12px;font-style:normal;font-weight:750}.money-flow span{display:flex;flex-direction:column;gap:2px}.money-flow strong{font-size:12px}.money-flow small{color:var(--muted);font-size:10px}.money-flow b{color:#8dcfd2;font-size:17px}.finance-panel{overflow:hidden;border:1px solid var(--line);border-radius:9px;background:#fff}.record-tabs{display:flex;height:51px;align-items:flex-end;padding:0 16px;border-bottom:1px solid var(--line)}.record-tabs button{position:relative;height:51px;padding:0 19px;border:0;color:#68717d;background:transparent;font-size:13px}.record-tabs button.active{color:#078f94;font-weight:700}.record-tabs button.active::after{position:absolute;right:14px;bottom:-1px;left:14px;height:2px;background:#08b8bd;content:''}.record-tabs em{display:inline-grid;min-width:16px;height:16px;place-items:center;margin-left:5px;border-radius:8px;color:#fff;background:#e35d5d;font-size:9px;font-style:normal}.filters{display:grid;grid-template-columns:minmax(280px,1fr) 130px 145px 68px 68px;gap:9px;padding:13px 16px;border-bottom:1px solid var(--line)}.filters .el-button+.el-button{margin-left:0}.primary-cell{display:flex;flex-direction:column;gap:4px}.primary-cell strong{font-size:12px}.primary-cell span{color:var(--muted);font-size:11px}.amount{color:#087e83}.refund-amount{color:#d45b45}.finance-panel footer{display:flex;height:55px;align-items:center;justify-content:space-between;padding:0 17px;color:var(--muted);font-size:12px}.detail-drawer{padding:27px}.detail-drawer>header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--line)}.detail-drawer h2{margin:0;font-size:21px}.detail-drawer header p{margin:6px 0 0;color:var(--muted);font-size:12px}.detail-drawer section{margin-top:22px}.detail-drawer h3{font-size:15px}.detail-drawer dl{overflow:hidden;margin:12px 0;border:1px solid var(--line);border-radius:8px}.detail-drawer dl>div{display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line)}.detail-drawer dl>div:last-child{border:0}.detail-drawer dt{color:var(--muted)}.detail-drawer dd{margin:0;font-weight:650}.detail-drawer .total{background:#f5fbfb}.detail-drawer .total dd{color:#078f94;font-size:16px}.detail-drawer section>p{color:var(--muted);font-size:12px;line-height:1.7}@media(max-width:1280px){.summary-grid{grid-template-columns:repeat(3,1fr)}.money-flow{justify-content:flex-start;overflow:auto}.filters{grid-template-columns:minmax(220px,1fr) 120px 130px 64px 64px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
