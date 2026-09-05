<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Close,
  Document,
  EditPen,
  Money,
  Plus,
  Refresh,
  Search,
  Service,
  Tickets,
  Warning,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import type {
  AdminAfterSalesCase,
  AfterSalesCaseStatus,
  AfterSalesCaseType,
  AfterSalesSummary,
} from '../types'

const props = defineProps<{ preview: boolean; canReview: boolean }>()

const rows = ref<AdminAfterSalesCase[]>([])
const selected = ref<AdminAfterSalesCase | null>(null)
const summary = ref<AfterSalesSummary>({ total: 0, pending: 0, processing: 0, approved: 0, refunded: 0 })
const statusFilter = ref<AfterSalesCaseStatus | ''>('')
const typeFilter = ref<AfterSalesCaseType | ''>('')
const cityFilter = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const drawerVisible = ref(false)
const createVisible = ref(false)
const actionVisible = ref(false)
const saving = ref(false)
const actionMode = ref<'approve' | 'reject'>('approve')
const createForm = ref({
  orderNo: '',
  caseType: 'refund' as AfterSalesCaseType,
  requestedAmountYuan: 0,
  reason: '',
})
const actionForm = ref({ approvedAmountYuan: 0, resultNote: '' })

const statusOptions: Array<{ value: AfterSalesCaseStatus; label: string }> = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'approved', label: '已同意·待退款' },
  { value: 'refunded', label: '退款成功' },
  { value: 'rejected', label: '已驳回' },
]
const typeOptions: Array<{ value: AfterSalesCaseType; label: string }> = [
  { value: 'refund', label: '退款申请' },
  { value: 'service_dispute', label: '服务争议' },
  { value: 'provider_cancel', label: '达人取消' },
  { value: 'other', label: '其他售后' },
]
const summaryCards = computed(() => [
  { key: '', label: '全部售后', value: summary.value.total, icon: Tickets, tone: 'blue' },
  { key: 'pending', label: '待处理', value: summary.value.pending, icon: Clock, tone: 'orange' },
  { key: 'processing', label: '处理中', value: summary.value.processing, icon: Service, tone: 'cyan' },
  { key: 'approved', label: '待退款', value: summary.value.approved, icon: Money, tone: 'red' },
  { key: 'refunded', label: '退款成功', value: summary.value.refunded, icon: CircleCheck, tone: 'cyan' },
])

function demoCase(
  index: number,
  status: AfterSalesCaseStatus,
  overrides: Partial<AdminAfterSalesCase> = {},
): AdminAfterSalesCase {
  const created = new Date(Date.now() - index * 36e5).toISOString()
  const type = (['refund', 'service_dispute', 'provider_cancel', 'other'] as AfterSalesCaseType[])[index % 4]
  const typeLabel = typeOptions.find((item) => item.value === type)?.label || '其他售后'
  const statusLabel = statusOptions.find((item) => item.value === status)?.label || '待处理'
  return {
    public_id: `00000000-0000-0000-0000-00000000010${index}`,
    case_no: `AS20260823000${index + 1}`,
    case_type: type,
    case_type_label: typeLabel,
    status,
    status_label: statusLabel,
    order_no: `DZY20260823030${index + 1}`,
    order_status: 'after_sales',
    order_status_label: '售后中',
    order_payable_amount: 34600,
    customer_name: index % 2 ? '李女士' : '张女士',
    provider_name: index % 2 ? '小北' : '晓晓',
    service_name: index % 2 ? '摄影陪伴' : '城市陪伴',
    service_city_code: '130400',
    service_city_name: '邯郸市',
    requested_amount: index === 1 ? 0 : 34600,
    approved_amount: status === 'approved' ? 28600 : null,
    reason: index === 1 ? '用户对实际服务时长存在争议，申请平台复核履约记录。' : '用户反馈服务内容与约定存在差异，申请平台核查并处理退款。',
    evidence_urls: [],
    result_note: status === 'approved' ? '履约资料核查完成，同意部分退款，等待支付系统执行。' : status === 'rejected' ? '订单履约时间线和集合照完整，本次售后申请不成立。' : '',
    creator_name: '运营管理员',
    organization_name: '乐搭伴运营平台',
    reviewed_by_name: ['approved', 'rejected'].includes(status) ? '客服主管' : null,
    reviewed_at: ['approved', 'rejected'].includes(status) ? created : null,
    created_at: created,
    updated_at: created,
    refund_order: null,
    ...overrides,
  }
}

function demoRows() {
  return [
    demoCase(0, 'pending'),
    demoCase(1, 'processing'),
    demoCase(2, 'approved'),
    demoCase(3, 'rejected'),
    demoCase(4, 'refunded', { order_status: 'refunded', order_status_label: '已退款' }),
  ]
}

function filteredDemoRows() {
  let items = demoRows()
  if (statusFilter.value) items = items.filter((item) => item.status === statusFilter.value)
  if (typeFilter.value) items = items.filter((item) => item.case_type === typeFilter.value)
  const keyword = search.value.trim().toLowerCase()
  if (keyword) {
    items = items.filter((item) => [item.case_no, item.order_no, item.customer_name, item.provider_name]
      .some((value) => value.toLowerCase().includes(keyword)))
  }
  return items
}

function formatAmount(amount: number | null) {
  if (amount === null) return '—'
  return `¥${(amount / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function statusType(status: AfterSalesCaseStatus) {
  if (status === 'refunded') return 'success'
  if (status === 'approved') return 'warning'
  if (status === 'rejected') return 'info'
  if (status === 'processing') return 'primary'
  return 'danger'
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
        pending: all.filter((item) => item.status === 'pending').length,
        processing: all.filter((item) => item.status === 'processing').length,
        approved: all.filter((item) => item.status === 'approved').length,
        refunded: all.filter((item) => item.status === 'refunded').length,
      }
      return
    }
    const data = await adminApi.afterSalesCases({
      status: statusFilter.value,
      case_type: typeFilter.value,
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
    ElMessage.error(error instanceof Error ? error.message : '退款售后列表加载失败')
  } finally {
    loading.value = false
  }
}

function selectSummary(key: string) {
  statusFilter.value = key as AfterSalesCaseStatus | ''
  page.value = 1
  load()
}

function resetFilters() {
  statusFilter.value = ''
  typeFilter.value = ''
  cityFilter.value = ''
  search.value = ''
  page.value = 1
  load()
}

async function openDetail(row: AdminAfterSalesCase) {
  drawerVisible.value = true
  selected.value = row
  if (props.preview) return
  detailLoading.value = true
  try {
    selected.value = await adminApi.afterSalesCase(row.case_no)
  } catch (error) {
    drawerVisible.value = false
    ElMessage.error(error instanceof Error ? error.message : '售后详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function openCreate() {
  createForm.value = { orderNo: '', caseType: 'refund', requestedAmountYuan: 0, reason: '' }
  createVisible.value = true
}

async function createCase() {
  const form = createForm.value
  if (!form.orderNo.trim()) return ElMessage.warning('请填写订单号')
  if (form.caseType === 'refund' && form.requestedAmountYuan <= 0) return ElMessage.warning('退款金额必须大于 0')
  if (form.reason.trim().length < 5) return ElMessage.warning('申请原因至少填写 5 个字')
  saving.value = true
  try {
    const item = props.preview
      ? demoCase(4, 'pending', {
        case_no: `AS${Date.now()}`,
        order_no: form.orderNo.trim(),
        case_type: form.caseType,
        case_type_label: typeOptions.find((option) => option.value === form.caseType)?.label || '其他售后',
        requested_amount: Math.round(form.requestedAmountYuan * 100),
        reason: form.reason.trim(),
      })
      : await adminApi.createAfterSalesCase(
        form.orderNo.trim(), form.caseType,
        Math.round(form.requestedAmountYuan * 100), form.reason.trim(),
      )
    createVisible.value = false
    ElMessage.success('售后工单已登记，订单已进入售后处理中')
    await load()
    openDetail(item)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '售后工单登记失败')
  } finally {
    saving.value = false
  }
}

async function startReview() {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm(
      `确认开始处理售后单 ${selected.value.case_no}？`,
      '接手售后工单',
      { confirmButtonText: '开始处理', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    selected.value = props.preview
      ? { ...selected.value, status: 'processing', status_label: '处理中' }
      : await adminApi.reviewAfterSalesCase(selected.value.case_no, 'start_review')
    ElMessage.success('已进入处理中')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败')
  } finally {
    saving.value = false
  }
}

function openAction(mode: 'approve' | 'reject') {
  if (!selected.value) return
  actionMode.value = mode
  actionForm.value = {
    approvedAmountYuan: mode === 'approve' ? selected.value.requested_amount / 100 : 0,
    resultNote: '',
  }
  actionVisible.value = true
}

async function submitAction() {
  if (!selected.value) return
  if (actionForm.value.resultNote.trim().length < 5) return ElMessage.warning('审核结论至少填写 5 个字')
  if (actionMode.value === 'approve' && actionForm.value.approvedAmountYuan <= 0) {
    return ElMessage.warning('退款申请的核准金额必须大于 0')
  }
  saving.value = true
  try {
    const approvedAmount = Math.round(actionForm.value.approvedAmountYuan * 100)
    selected.value = props.preview
      ? {
        ...selected.value,
        status: actionMode.value === 'approve' ? 'approved' : 'rejected',
        status_label: actionMode.value === 'approve' ? '已同意·待退款' : '已驳回',
        approved_amount: actionMode.value === 'approve' ? approvedAmount : null,
        result_note: actionForm.value.resultNote.trim(),
        reviewed_by_name: '运营管理员',
        reviewed_at: new Date().toISOString(),
      }
      : await adminApi.reviewAfterSalesCase(
        selected.value.case_no,
        actionMode.value,
        actionForm.value.resultNote.trim(),
        actionMode.value === 'approve' ? approvedAmount : undefined,
      )
    actionVisible.value = false
    ElMessage.success(actionMode.value === 'approve' ? '审核通过，退款已发起' : '售后申请已驳回')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审核提交失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page after-sales-page">
    <header class="page-heading after-sales-heading">
      <div>
        <h1>退款与售后</h1>
        <p>登记服务争议、审核退款申请；审核通过后自动生成退款单并执行原路退款</p>
      </div>
      <div class="heading-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
        <el-button v-if="canReview" type="primary" :icon="Plus" @click="openCreate">登记售后</el-button>
      </div>
    </header>

    <el-alert
      class="payment-boundary"
      type="warning"
      :closable="false"
      show-icon
      title="当前阶段仅完成售后审核闭环"
      description="退款审核、退款单和订单状态分别留痕；只有渠道退款成功后，订单才会更新为已退款。"
    />

    <section class="after-sales-summary" aria-label="退款售后概况">
      <button
        v-for="card in summaryCards"
        :key="card.key || 'all'"
        :class="{ active: statusFilter === card.key }"
        @click="selectSummary(card.key)"
      >
        <el-icon :class="card.tone"><component :is="card.icon" /></el-icon>
        <span>{{ card.label }}</span><strong>{{ card.value }}</strong><small>点击筛选</small>
      </button>
    </section>

    <section class="after-sales-panel">
      <header class="after-sales-filters">
        <el-input
          v-model="search"
          clearable
          :prefix-icon="Search"
          placeholder="售后单号 / 订单号 / 用户 / 达人"
          @keyup.enter="page = 1; load()"
        />
        <el-select v-model="cityFilter" placeholder="服务城市">
          <el-option label="全部城市" value="" />
          <el-option label="邯郸市" value="130400" />
          <el-option label="北京市" value="110100" />
          <el-option label="上海市" value="310100" />
        </el-select>
        <el-select v-model="typeFilter" clearable placeholder="售后类型">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="statusFilter" clearable placeholder="处理状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
      </header>

      <el-table
        v-loading="loading"
        :data="rows"
        height="calc(100vh - 448px)"
        empty-text="当前筛选条件下没有退款售后记录"
        row-class-name="after-sales-row"
        @row-click="openDetail"
      >
        <el-table-column label="售后单 / 类型" min-width="185">
          <template #default="scope"><div class="case-identity"><strong>{{ scope.row.case_no }}</strong><span>{{ scope.row.case_type_label }}</span></div></template>
        </el-table-column>
        <el-table-column label="关联订单" min-width="180">
          <template #default="scope"><div class="case-identity"><strong>{{ scope.row.order_no }}</strong><span>{{ scope.row.service_name }} · {{ scope.row.service_city_name }}</span></div></template>
        </el-table-column>
        <el-table-column label="用户 / 达人" width="140">
          <template #default="scope"><div class="case-identity"><strong>{{ scope.row.customer_name }}</strong><span>达人：{{ scope.row.provider_name }}</span></div></template>
        </el-table-column>
        <el-table-column label="申请金额" width="112">
          <template #default="scope"><strong class="refund-amount">{{ formatAmount(scope.row.requested_amount) }}</strong></template>
        </el-table-column>
        <el-table-column label="处理状态" width="130">
          <template #default="scope"><el-tag :type="statusType(scope.row.status)" effect="plain">{{ scope.row.status_label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="scope"><el-button link type="primary" @click.stop="openDetail(scope.row)">查看详情</el-button></template>
        </el-table-column>
      </el-table>
      <footer class="after-sales-footer"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="pageSize" @current-change="load" /></footer>
    </section>

    <el-drawer v-model="drawerVisible" size="600px" :with-header="false" destroy-on-close>
      <div v-if="selected" v-loading="detailLoading" class="after-sales-drawer">
        <header>
          <div><h2>退款售后详情</h2><p>{{ selected.case_no }}</p></div>
          <el-tag :type="statusType(selected.status)" effect="plain">{{ selected.status_label }}</el-tag>
          <button aria-label="关闭退款售后详情" @click="drawerVisible = false"><el-icon><Close /></el-icon></button>
        </header>

        <el-alert v-if="selected.status === 'approved'" class="drawer-message" type="warning" :closable="false" show-icon title="审核已通过，退款处理中" description="退款完成后系统会自动更新售后单、支付单与订单状态。" />
        <el-alert v-if="selected.status === 'refunded'" class="drawer-message" type="success" :closable="false" show-icon title="退款已完成" :description="`退款单 ${selected.refund_order?.refund_no || '已生成'} 已按原支付路径处理。`" />

        <section class="case-section case-overview">
          <div><span>售后类型</span><strong>{{ selected.case_type_label }}</strong></div>
          <div><span>处理状态</span><strong>{{ selected.status_label }}</strong></div>
          <div><span>申请金额</span><strong class="amount">{{ formatAmount(selected.requested_amount) }}</strong></div>
          <div><span>核准金额</span><strong class="amount">{{ formatAmount(selected.approved_amount) }}</strong></div>
          <div><span>登记人员</span><strong>{{ selected.creator_name }}</strong></div>
          <div><span>登记时间</span><strong>{{ formatDateTime(selected.created_at) }}</strong></div>
        </section>

        <section class="case-section">
          <h3><el-icon><Document /></el-icon> 关联订单</h3>
          <div class="order-card">
            <header><strong>{{ selected.order_no }}</strong><el-tag size="small" effect="plain">{{ selected.order_status_label }}</el-tag></header>
            <p>{{ selected.service_name }} · {{ selected.service_city_name }}</p>
            <div><span>用户 {{ selected.customer_name }}</span><span>达人 {{ selected.provider_name }}</span><b>订单实付 {{ formatAmount(selected.order_payable_amount) }}</b></div>
          </div>
        </section>

        <section class="case-section">
          <h3><el-icon><Warning /></el-icon> 申请原因</h3>
          <p class="reason-copy">{{ selected.reason }}</p>
        </section>

        <section v-if="selected.evidence_urls.length" class="case-section">
          <h3><el-icon><Document /></el-icon> 用户凭证</h3>
          <div class="evidence-grid">
            <el-image
              v-for="(url, index) in selected.evidence_urls"
              :key="url"
              :src="url"
              fit="cover"
              :preview-src-list="selected.evidence_urls"
              :initial-index="index"
              preview-teleported
            />
          </div>
        </section>

        <section v-if="selected.result_note" class="case-section">
          <h3><el-icon><CircleCheck /></el-icon> 审核结论</h3>
          <p class="reason-copy">{{ selected.result_note }}</p>
          <div class="review-meta">{{ selected.reviewed_by_name || '平台管理员' }} · {{ formatDateTime(selected.reviewed_at) }}</div>
        </section>

        <section v-if="selected.refund_order" class="case-section">
          <h3><el-icon><Money /></el-icon> 退款执行</h3>
          <div class="order-card"><header><strong>{{ selected.refund_order.refund_no }}</strong><el-tag :type="selected.refund_order.status === 'succeeded' ? 'success' : selected.refund_order.status === 'failed' ? 'danger' : 'warning'" size="small">{{ selected.refund_order.status_label }}</el-tag></header><p>原路退款 {{ formatAmount(selected.refund_order.refund_amount) }}</p><div><span>渠道退款号 {{ selected.refund_order.gateway_refund_no || '尚未生成' }}</span></div></div>
        </section>

        <footer v-if="canReview && ['pending', 'processing'].includes(selected.status)" class="case-actions">
          <el-button v-if="selected.status === 'pending'" :icon="EditPen" :loading="saving" @click="startReview">开始处理</el-button>
          <div><el-button type="danger" plain @click="openAction('reject')">驳回申请</el-button><el-button type="primary" @click="openAction('approve')">审核通过</el-button></div>
        </footer>
      </div>
    </el-drawer>

    <el-dialog v-model="createVisible" title="登记退款 / 售后" width="520px" destroy-on-close>
      <el-alert class="form-alert" type="info" :closable="false" show-icon title="登记后订单将进入“售后中”状态" />
      <el-form label-position="top">
        <el-form-item label="关联订单号" required><el-input v-model="createForm.orderNo" placeholder="请输入完整达人订单号" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="售后类型" required><el-select v-model="createForm.caseType"><el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="申请退款金额（元）" :required="createForm.caseType === 'refund'"><el-input-number v-model="createForm.requestedAmountYuan" :min="0" :precision="2" :step="10" controls-position="right" /></el-form-item>
        </div>
        <el-form-item label="申请原因" required><el-input v-model="createForm.reason" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="记录用户诉求、已核实事实和相关说明" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="createCase">确认登记</el-button></template>
    </el-dialog>

    <el-dialog v-model="actionVisible" :title="actionMode === 'approve' ? '审核通过' : '驳回申请'" width="500px" destroy-on-close>
      <el-alert v-if="actionMode === 'approve'" class="form-alert" type="warning" :closable="false" show-icon title="通过后将创建退款单并立即发起原路退款" />
      <el-form label-position="top">
        <el-form-item v-if="actionMode === 'approve'" label="核准退款金额（元）" required><el-input-number v-model="actionForm.approvedAmountYuan" :min="0" :max="(selected?.requested_amount || 0) / 100" :precision="2" :step="10" controls-position="right" /></el-form-item>
        <el-form-item label="审核结论" required><el-input v-model="actionForm.resultNote" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="说明核查依据、处理结论及后续动作" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="actionVisible = false">取消</el-button><el-button :type="actionMode === 'approve' ? 'primary' : 'danger'" :loading="saving" @click="submitAction">确认{{ actionMode === 'approve' ? '通过' : '驳回' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.after-sales-page{min-height:calc(100vh - 76px)}.after-sales-heading{margin-bottom:14px}.heading-actions{display:flex;gap:10px}.payment-boundary{margin-bottom:14px}.after-sales-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}.after-sales-summary button{position:relative;display:grid;grid-template-columns:52px 1fr;grid-template-rows:auto auto;align-items:center;min-height:92px;padding:16px 18px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.after-sales-summary button:hover{border-color:#9cdfe0;box-shadow:0 10px 28px rgba(29,72,87,.08);transform:translateY(-1px)}.after-sales-summary button:focus-visible{outline:3px solid rgba(8,184,189,.22);outline-offset:2px}.after-sales-summary button.active{border-color:var(--brand);box-shadow:0 0 0 2px rgba(8,184,189,.1)}.after-sales-summary .el-icon{grid-row:1/3;width:44px;height:44px;border-radius:12px;font-size:23px}.after-sales-summary .el-icon.cyan{background:#e4f8f8}.after-sales-summary .el-icon.blue{color:#2679e9!important;background:#e9f1ff}.after-sales-summary .el-icon.orange{background:#fff0e6}.after-sales-summary .el-icon.red{color:#d9485f;background:#fff0f2}.after-sales-summary span{color:var(--muted);font-size:13px}.after-sales-summary strong{font-size:27px}.after-sales-summary small{position:absolute;right:16px;bottom:16px;color:#9aa1ab}.after-sales-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.after-sales-filters{display:grid;grid-template-columns:minmax(250px,1.5fr) 130px 140px 145px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.case-identity{display:flex;flex-direction:column;gap:5px}.case-identity strong{font-size:13px}.case-identity span{color:var(--muted);font-size:12px}.refund-amount{color:var(--orange);font-size:14px}.after-sales-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.after-sales-drawer{min-height:100%;padding-bottom:96px;background:#f7f9fb}.after-sales-drawer>header{position:sticky;z-index:3;top:0;display:flex;align-items:center;gap:12px;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.after-sales-drawer>header div{margin-right:auto}.after-sales-drawer>header h2{margin:0;font-size:20px}.after-sales-drawer>header p{margin:5px 0 0;color:var(--muted);font-size:12px}.after-sales-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.after-sales-drawer>header button:hover{background:#f0f4f5}.drawer-message{margin:16px 20px 0;width:auto}.case-section{margin:14px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.case-section h3{display:flex;align-items:center;gap:8px;margin:0 0 16px;font-size:15px}.case-section h3 .el-icon{color:var(--brand);font-size:18px}.case-overview{display:grid;grid-template-columns:1fr 1fr;gap:16px}.case-overview div{display:flex;flex-direction:column;gap:6px}.case-overview span{color:var(--muted);font-size:12px}.case-overview strong{font-size:14px}.case-overview .amount{color:var(--orange);font-size:17px}.order-card{padding:14px;border:1px solid #e5eaed;border-radius:7px;background:#fbfcfd}.order-card header{display:flex;align-items:center;justify-content:space-between}.order-card p{margin:8px 0;color:#4f5967;font-size:13px}.order-card div{display:flex;gap:14px;color:var(--muted);font-size:12px}.order-card b{margin-left:auto;color:#394351}.reason-copy{margin:0;color:#3d4755;font-size:14px;line-height:1.75;white-space:pre-wrap}.review-meta{margin-top:12px;color:var(--muted);font-size:12px}.case-actions{position:fixed;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;width:600px;padding:14px 20px;border-top:1px solid var(--line);background:#fff;box-shadow:0 -8px 24px rgba(32,45,55,.06)}.form-alert{margin-bottom:16px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid :deep(.el-select),.form-grid :deep(.el-input-number),:deep(.el-input-number){width:100%}:deep(.after-sales-row){cursor:pointer}:deep(.el-drawer__body){padding:0}:deep(.el-table__row:hover td){background:#f2fbfb!important}@media(max-width:1360px){.after-sales-filters{grid-template-columns:minmax(220px,1fr) 120px 130px 135px 66px 66px}.after-sales-summary button{padding:14px}.after-sales-summary small{display:none}}@media(prefers-reduced-motion:reduce){.after-sales-summary button{transition:none}.after-sales-summary button:hover{transform:none}}
.after-sales-summary{grid-template-columns:repeat(5,minmax(0,1fr))}
.evidence-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.evidence-grid :deep(.el-image){width:100%;aspect-ratio:1;border:1px solid var(--line);border-radius:7px;background:#f3f6f7;cursor:zoom-in}
</style>
