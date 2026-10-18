<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import { useWorkRoute } from '../composables/workRoute'
import { useOperationsWork } from '../composables/operationsWork'
import { formatDateTime, formatMoney } from '../utils/format'
import RefundRequestDialog from '../components/RefundRequestDialog.vue'
import type { ManualRefundCase } from '../utils/refunds'

const props = defineProps<{ preview: boolean; canCreate: boolean }>()
const route = useWorkRoute(), work = useOperationsWork()
const search = ref(route.initialSearch), status = ref(''), page = ref(1), total = ref(0)
const rows = ref<ManualRefundCase[]>([]), selected = ref<ManualRefundCase | null>(null)
const loading = ref(false), saving = ref(false), detailLoading = ref(false), drawer = ref(false), error = ref('')
const orderNo = ref(''), createVisible = ref(false)
const actionVisible = ref(false), action = ref(''), note = ref(''), receipt = ref(''), evidence = ref('')
const paidAt = ref<Date | null>(null)
const statusNames: Record<string, string> = { pending: '待财务处理', processing: '财务处理中', reviewing: '待财务复核', completed: '人工处理已核验', rejected: '已驳回·未退款' }
const actionNames: Record<string, string> = { create: '登记人工售后', start: '开始处理', submit_evidence: '登记退款凭证', verify: '核验凭证并结案', return: '退回补充凭证', reject: '驳回申请（未退款）' }
let listSequence = 0, detailSequence = 0
async function load() {
  const own = ++listSequence
  loading.value = true; error.value = ''
  try {
    if (props.preview) { rows.value = []; total.value = 0; return }
    const data = await adminApi.manualRefunds({ page: page.value, search: search.value.trim(), status: status.value, ...route.query() })
    if (own !== listSequence) return
    rows.value = data.items; total.value = data.total
    void work.refresh()
  } catch (cause) { if (own === listSequence) { rows.value = []; total.value = 0; error.value = cause instanceof Error ? cause.message : '加载失败，请重试' } }
  finally { if (own === listSequence) loading.value = false }
}
async function open(item: ManualRefundCase) {
  const own = ++detailSequence
  selected.value = null; drawer.value = true; detailLoading.value = true
  try {
    const data = await adminApi.manualRefund(item.case_no)
    if (own === detailSequence) selected.value = data
  } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '详情加载失败') }
  finally { if (own === detailSequence) detailLoading.value = false }
}
function begin(value: string) {
  if (!selected.value?.actions.includes(value) || saving.value) return
  action.value = value; note.value = ''; receipt.value = selected.value.receipt_no
  evidence.value = selected.value.evidence_reference
  paidAt.value = selected.value.paid_at ? new Date(selected.value.paid_at) : null
  actionVisible.value = true
}
async function submit() {
  const item = selected.value
  if (!item || props.preview || saving.value) return
  if (note.value.trim().length < 5) return ElMessage.warning('请填写至少 5 个字的处理依据')
  if (action.value === 'submit_evidence' && (!receipt.value.trim() || evidence.value.trim().length < 5 || !paidAt.value)) return ElMessage.warning('请补全实际退款流水、凭证位置与退款时间')
  saving.value = true
  try {
    await ElMessageBox.confirm(`确认${actionNames[action.value]}？金额 ${formatMoney(item.requested_amount)}。本操作只登记人工处理，不调用退款接口、不修改渠道或收入流水。`, '确认人工处理记录', { type: 'warning', confirmButtonText: '确认登记', cancelButtonText: '返回核对' })
    selected.value = await adminApi.manualRefundAction(item.case_no, {
      action: action.value, revision: item.revision, note: note.value.trim(),
      ...(action.value === 'submit_evidence' ? { receipt_no: receipt.value.trim(), evidence_reference: evidence.value.trim(), paid_at: paidAt.value!.toISOString() } : {}),
    })
    actionVisible.value = false; ElMessage.success('处理记录已保存'); void load()
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') {
      ElMessage.error(cause instanceof Error ? cause.message : '保存失败，请刷新原工单核对')
      actionVisible.value = false; await open(item)
    }
  } finally { saving.value = false }
}
function create() {
  if (!orderNo.value.trim()) return ElMessage.warning('请输入达人订单号')
  orderNo.value = orderNo.value.trim(); createVisible.value = true
}
onMounted(load)
</script>

<template>
  <section class="manual-refunds">
    <header><div><h1>已结算订单人工售后</h1><p>客服登记诉求，财务处理资金，再由另一位审核人核验凭证。</p></div><el-button :loading="loading" @click="load">刷新记录</el-button></header>
    <el-alert type="info" :closable="false" title="此处不发起退款，也不自动退回分账。人工结案只记录已核验的处理结果，渠道状态与收入账务仍须单独核对。" />
    <div v-if="canCreate" class="controls"><el-input v-model="orderNo" placeholder="输入已分账或已结算的达人订单号" aria-label="登记人工售后的订单号" /><el-button type="primary" :disabled="preview" @click="create">转人工售后</el-button></div>
    <div class="controls">
      <el-input v-model="search" placeholder="搜索工单号 / 订单号" clearable @keyup.enter="page = 1; load()" />
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="人工售后状态"><el-option v-for="(label, key) in statusNames" :key="key" :value="key" :label="label" /></el-select>
      <el-button @click="page = 1; load()">查询</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="暂无人工售后记录">
      <el-table-column label="工单 / 订单" min-width="245"><template #default="{ row }"><strong>{{ row.case_no }}</strong><p class="muted">{{ row.order_no }}</p></template></el-table-column>
      <el-table-column label="用户 / 达人" min-width="160"><template #default="{ row }">{{ row.customer_name }}<p class="muted">达人：{{ row.provider_name }}</p></template></el-table-column>
      <el-table-column label="申请金额" min-width="110"><template #default="{ row }">{{ formatMoney(row.requested_amount) }}</template></el-table-column>
      <el-table-column label="人工处理状态" min-width="165"><template #default="{ row }"><el-tag :type="row.status === 'completed' ? 'success' : 'warning'">{{ row.status_label }}</el-tag></template></el-table-column>
      <el-table-column label="登记时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{ row }"><el-button type="primary" link :disabled="saving" @click="open(row)">查看处理</el-button></template></el-table-column>
    </el-table>
    <footer><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" /></footer>
    <el-drawer v-model="drawer" title="人工售后详情" size="min(640px, 95vw)" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <div v-loading="detailLoading">
        <template v-if="selected">
          <h2>{{ selected.status_label }} · {{ formatMoney(selected.requested_amount) }}</h2>
          <p>{{ selected.case_no }}<br />{{ selected.order_no }}</p><p>{{ selected.customer_name }} · 达人 {{ selected.provider_name }}</p>
          <el-alert :title="selected.notice" type="info" :closable="false" />
          <h3>申请原因</h3><p class="prewrap">{{ selected.reason }}</p>
          <p>登记人：{{ selected.created_by }} · 处理人：{{ selected.processed_by || '—' }} · 复核人：{{ selected.reviewed_by || '—' }}</p>
          <h3>资金处理凭证</h3><p>实际退款流水：{{ selected.receipt_no || '待登记' }}</p><p>凭证编号 / 存放位置：{{ selected.evidence_reference || '待登记' }}</p><p>退款时间：{{ formatDateTime(selected.paid_at) }}</p>
          <p class="prewrap">{{ selected.handling_note }}</p><p class="prewrap">{{ selected.review_note }}</p>
          <div class="actions"><el-button v-for="name in selected.actions" :key="name" :type="name === 'verify' ? 'primary' : 'default'" :disabled="saving" @click="begin(name)">{{ actionNames[name] }}</el-button></div>
          <p v-if="selected.status === 'reviewing'" class="muted">复核须具有财务管理及主管退款审核权限；申请人和曾登记凭证的人员均不能复核本单。</p>
          <h3>处理记录</h3><el-timeline><el-timeline-item v-for="(record, index) in selected.records" :key="index" :timestamp="formatDateTime(record.created_at)">{{ record.actor__nickname }} · {{ actionNames[record.action.replace('manual_refund.', '')] || record.action }}<p class="prewrap">{{ record.after.review_note || record.after.handling_note || record.after.reason }}</p></el-timeline-item></el-timeline>
        </template>
      </div>
    </el-drawer>
    <el-dialog v-model="actionVisible" :title="actionNames[action]" width="min(560px, 95vw)" append-to-body :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-form label-position="top" :disabled="saving">
        <template v-if="action === 'submit_evidence'">
          <el-alert type="warning" :closable="false" :title="`仅在实际完成 ${formatMoney(selected?.requested_amount || 0)} 退款并取得凭证后登记。未到账或金额不符请继续核查，不提交为已处理。`" />
          <el-form-item label="实际退款流水号" required><el-input v-model="receipt" maxlength="128" :disabled="Boolean(selected?.receipt_no)" /></el-form-item>
          <el-form-item label="凭证编号 / 内部存放位置" required><el-input v-model="evidence" maxlength="500" placeholder="填写可供财务复核的回单编号或内部归档位置，不填写密码或密钥" /></el-form-item>
          <el-form-item label="实际退款时间" required><el-date-picker v-model="paidAt" type="datetime" placeholder="选择实际退款时间" /></el-form-item>
        </template>
        <el-form-item label="核实情况 / 处理依据" required><el-input v-model="note" type="textarea" :rows="4" maxlength="1000" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="actionVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">确认登记</el-button></template>
    </el-dialog>
    <RefundRequestDialog v-model="createVisible" kind="provider" :reference="orderNo" :preview="preview" @created="load" />
  </section>
</template>

<style scoped>
.manual-refunds{padding:28px}header,footer{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}h1{margin:0;font-size:24px}header p,.muted,footer{color:#738092;font-size:13px;line-height:1.7}.controls{display:flex;gap:12px;margin:18px 0}.controls .el-input{max-width:460px}.controls .el-select{width:200px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.actions .el-button{margin:0}footer{margin-top:18px}.prewrap{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}h3{margin-top:24px}.el-form-item{margin-top:18px}
@media(max-width:700px){.manual-refunds{padding:16px}.controls{flex-wrap:wrap}header{align-items:flex-start}footer{flex-wrap:wrap}}
</style>
