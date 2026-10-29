<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import { useOperationsWork } from '../composables/operationsWork'
import { formatDateTime, formatMoney } from '../utils/format'
import type { RecoveryCase, RecoveryList, PaymentJobHealth, PaymentReadiness } from '../utils/financeRecovery'
import PaymentReadinessPanel from '../components/PaymentReadinessPanel.vue'

const props = defineProps<{ preview: boolean; permissions: string[] }>()
const route = useRoute(), work = useOperationsWork()
const can = (permission: string) => !props.preview && (props.permissions.includes('*') || props.permissions.includes(permission))
const view = ref(['jobs', 'pools', 'readiness'].includes(String(route.query.view)) ? String(route.query.view) : 'cases')
const linkedView = route.query.todo === 'payment_pool_hold' ? 'pools' : String(route.query.todo || '').startsWith('finance_recovery_') ? 'cases' : 'jobs'
const status = ref(route.query.todo === 'finance_recovery_review' ? 'review' : route.query.todo === 'finance_recovery_open' ? 'open' : '')
const search = ref(view.value === 'cases' && !route.query.kind ? String(route.query.search || '') : '')
const page = ref(1), total = ref(0), enabled = ref(false), loading = ref(false), saving = ref(false)
const rows = ref<RecoveryCase[]>([]), pools = ref<RecoveryList['pools']>([]), jobs = ref<PaymentJobHealth[]>([])
const readiness = ref<PaymentReadiness | null>(null)
const error = ref(''), detailError = ref(''), drawer = ref(false), selected = ref<RecoveryCase | null>(null)
const note = ref(''), evidence = ref(''), resolution = ref('record')
const newKind = ref(String(route.query.kind || '')), newTarget = ref(Number(route.query.target_id || 0))
const newReference = ref(String(route.query.reference || '')), newNote = ref(''), creating = ref(Boolean(newKind.value && newTarget.value))
let generation = 0, detailGeneration = 0
const actions: Record<string, string> = { create: '登记异常', query: '查询原流水', submit: '提交复核', approve: '独立复核通过', return: '退回核查', check_failed: '核验未完成' }
const jobLabels: Record<string, string> = { healthy: '最近运行正常', disabled: '未启用', waiting: '等待首次运行', running: '执行中', missing: '缺少任务记录', failed: '运行异常', stale: '长时间未运行', stuck: '执行超时', coverage: '账单核对不完整' }
async function load() {
  const own = ++generation
  loading.value = true; error.value = ''
  try {
    if (props.preview) return
    if (view.value === 'readiness') {
      readiness.value = null
      const data = await adminApi.paymentReadiness()
      if (own === generation) readiness.value = data
    } else if (view.value === 'jobs') {
      const data = await adminApi.paymentJobHealth()
      if (own === generation) jobs.value = data.items
    } else {
      const data = await adminApi.financeRecovery({
        view: view.value, page: page.value, status: status.value || undefined, search: search.value || undefined,
        work_id: route.query.todo && view.value === linkedView && typeof route.query.work_id === 'string' ? route.query.work_id : undefined,
      })
      if (own !== generation) return
      rows.value = data.items; total.value = view.value === 'pools' ? data.pools_total : data.total; enabled.value = data.recovery_enabled
      pools.value = data.pools
    }
    void work.refresh()
  } catch (cause) { if (own === generation) error.value = cause instanceof Error ? cause.message : '加载失败' }
  finally { if (own === generation) loading.value = false }
}
async function open(id: number) {
  const own = ++detailGeneration
  drawer.value = true; selected.value = null; detailError.value = ''; note.value = ''; evidence.value = ''
  try {
    const data = await adminApi.financeRecoveryDetail(id)
    if (own === detailGeneration) { selected.value = data; resolution.value = data.resolution }
  } catch (cause) { if (own === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '详情加载失败' }
}
async function create() {
  if (saving.value) return
  saving.value = true; error.value = ''
  try {
    const data = await adminApi.createFinanceRecovery({ kind: newKind.value, target_id: newTarget.value, note: newNote.value.trim() })
    creating.value = false; newNote.value = ''; await open(data.id); await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '登记失败' }
  finally { saving.value = false }
}
function poolCase(id: number, reference: string) {
  newKind.value = 'pool'; newTarget.value = id; newReference.value = reference; creating.value = true
}
async function act(action: string) {
  if (!selected.value || saving.value) return
  saving.value = true; detailError.value = ''
  try {
    if (action === 'approve') {
      await ElMessageBox.confirm(selected.value.resolution === 'resume'
        ? '通过后将再次核验原流水及账户资金。仅解除后续订单的付款暂停，原失败订单不会重付。确认独立复核通过？'
        : '仅登记核查结案，不退款、不补款、不改账，也不解除现有资金限制。确认复核通过？', '独立复核确认',
      { confirmButtonText: '确认复核', cancelButtonText: '取消', type: 'warning' })
    }
    selected.value = await adminApi.financeRecoveryAction(selected.value.id, {
      action, revision: selected.value.revision, note: note.value.trim(),
      evidence_reference: evidence.value.trim(), resolution: resolution.value,
    })
    note.value = ''; evidence.value = ''; await load()
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') detailError.value = cause instanceof Error ? cause.message : '操作未完成，请刷新详情'
  } finally { saving.value = false }
}
watch(view, () => { page.value = 1; void load() })
onMounted(load)
</script>

<template>
  <section class="recovery-page">
    <header><div><h1>资金处置与巡检</h1><p>保留原流水、核查凭证与独立复核记录。</p></div><el-button :loading="loading" @click="load">刷新本地记录</el-button></header>
    <el-alert v-if="view !== 'readiness'" type="warning" :closable="false" show-icon title="核查结案不等于解除冻结。这里不重付原单、不自动退款、不直接修改交易成功或余额。" />
    <el-radio-group v-model="view" :disabled="saving" class="tabs" aria-label="资金工作视图">
      <el-radio-button value="cases">资金处置单</el-radio-button><el-radio-button value="pools">平台付款暂停</el-radio-button><el-radio-button value="jobs">支付任务巡检</el-radio-button>
      <el-radio-button value="readiness">资金上线检查</el-radio-button>
    </el-radio-group>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-if="creating && ['cases', 'pools'].includes(view) && can('finance.recovery.manage')" class="create-card">
      <h3>登记异常 · {{ newReference }}</h3>
      <el-input v-model="newNote" type="textarea" maxlength="1000" aria-label="登记说明" placeholder="说明异常情况，不要填写密钥、银行卡号或下载链接" />
      <el-button type="primary" :loading="saving" :disabled="newNote.trim().length < 5" @click="create">确认登记</el-button>
      <el-button :disabled="saving" @click="creating = false">取消</el-button>
    </div>
    <template v-if="view === 'cases'">
      <div class="filters">
        <el-select v-model="status" clearable placeholder="全部处理状态" aria-label="处理状态"><el-option label="待核查" value="open" /><el-option label="待独立复核" value="review" /><el-option label="已核查结案" value="resolved" /><el-option label="已恢复后续处理" value="restored" /></el-select>
        <el-input v-model="search" clearable placeholder="原流水号 / 账户记录" @keyup.enter="page = 1; load()" /><el-button @click="page = 1; load()">查询</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" empty-text="暂无处置单，可从资金异常核查详情登记">
        <el-table-column prop="reference" label="原业务记录" min-width="220" /><el-table-column prop="kind_label" label="异常类型" min-width="150" />
        <el-table-column prop="status_label" label="处理状态" min-width="210" />
        <el-table-column label="登记时间" min-width="175"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="open(row.id)">处置详情</el-button></template></el-table-column>
      </el-table>
      <footer><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" /></footer>
    </template>
    <template v-else-if="view === 'pools'">
      <p class="muted">仅无证据冲突、已明确失败的余额付款可申请恢复后续处理。原失败流水及历史证据始终保留。受控恢复当前{{ enabled ? '已启用' : '未启用' }}。</p>
      <el-table v-loading="loading" :data="pools" empty-text="当前没有暂停的平台付款账户">
        <el-table-column prop="reference" label="账户记录" min-width="180" /><el-table-column prop="reason" label="暂停原因" min-width="380" />
        <el-table-column label="操作" width="140"><template #default="{ row }"><el-button v-if="can('finance.recovery.manage')" type="primary" plain @click="poolCase(row.id, row.reference)">登记处置单</el-button></template></el-table-column>
      </el-table>
      <footer><span>共 {{ total }} 个暂停账户</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" /></footer>
    </template>
    <PaymentReadinessPanel v-else-if="view === 'readiness'" :report="readiness" :loading="loading" :preview="preview" @open-jobs="view = 'jobs'" />
    <template v-else>
      <p class="muted">检查实际执行记录，不只看容器在线。任务停止、超时、运行失败及账单核对不完整会进入实时待办；不会自动重发资金请求。</p>
      <el-table v-loading="loading" :data="jobs" empty-text="暂无巡检记录">
        <el-table-column prop="label" label="任务" min-width="190" />
        <el-table-column label="状态" min-width="150"><template #default="{ row }"><el-tag :type="row.alert ? 'danger' : row.state === 'disabled' ? 'info' : 'success'">{{ jobLabels[row.state] || row.state }}</el-tag></template></el-table-column>
        <el-table-column label="最近开始" min-width="175"><template #default="{ row }">{{ formatDateTime(row.started_at) }}</template></el-table-column>
        <el-table-column label="最近成功执行" min-width="175"><template #default="{ row }">{{ formatDateTime(row.succeeded_at) }}</template></el-table-column>
        <el-table-column prop="reason" label="检查结果" min-width="300" />
      </el-table>
    </template>
    <el-drawer v-model="drawer" title="资金处置详情" size="620px" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @closed="++detailGeneration">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <template v-if="selected">
        <h2>{{ selected.reference }}</h2><el-tag>{{ selected.status_label }}</el-tag>
        <p>原业务状态：{{ selected.current_state }}<span v-if="selected.current_amount != null"> · {{ formatMoney(selected.current_amount) }}</span></p>
        <el-alert v-if="selected.current_reason" :title="selected.current_reason" type="warning" :closable="false" />
        <p class="muted">处置方式：{{ selected.resolution === 'resume' ? '恢复后续处理（不重付原单）' : '仅登记核查结果（不解除限制）' }}</p>
        <el-button :disabled="saving" @click="open(selected.id)">刷新详情</el-button>
        <div v-if="selected.status === 'open' && can('finance.recovery.manage') || selected.status === 'review' && can('finance.recovery.review')" class="action-form">
          <el-form label-position="top">
            <el-form-item label="核查说明"><el-input v-model="note" aria-label="核查说明" type="textarea" maxlength="1000" placeholder="填写核查结论，不要填写敏感资料或下载链接" /></el-form-item>
            <template v-if="selected.status === 'open'">
              <el-form-item label="内部凭证编号"><el-input v-model="evidence" aria-label="内部凭证编号" maxlength="200" /></el-form-item>
              <el-form-item label="提交方式"><el-select v-model="resolution" aria-label="提交方式"><el-option label="仅登记核查结果（不解除限制）" value="record" /><el-option v-if="selected.kind === 'pool'" :disabled="!enabled" label="恢复后续处理（不重付原单）" value="resume" /></el-select></el-form-item>
            </template>
          </el-form>
          <template v-if="selected.status === 'open'">
            <el-button v-if="selected.kind !== 'wallet'" :loading="saving" :disabled="note.trim().length < 5" @click="act('query')">查询原流水</el-button>
            <el-button type="primary" :loading="saving" :disabled="note.trim().length < 5 || !evidence.trim()" @click="act('submit')">提交独立复核</el-button>
          </template>
          <template v-else>
            <el-button :loading="saving" :disabled="note.trim().length < 5" @click="act('return')">退回核查</el-button>
            <el-button type="primary" :loading="saving" :disabled="note.trim().length < 5" @click="act('approve')">独立复核通过</el-button>
          </template>
        </div>
        <h3>处理记录</h3>
        <el-timeline>
          <el-timeline-item v-for="(event, index) in selected.events" :key="index" :timestamp="formatDateTime(event.created_at)">
            <strong>{{ actions[event.action] || event.action }} · {{ event.actor }}</strong><p>{{ event.note }}</p><p v-if="event.evidence_reference" class="muted">凭证：{{ event.evidence_reference }}</p>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.recovery-page{padding:28px}.recovery-page header,.recovery-page footer{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}h1{margin:0;font-size:24px}.muted,header p,footer{color:#728095;font-size:13px;line-height:1.8}.tabs{margin:20px 0}.filters{display:flex;gap:12px;margin-bottom:18px}.filters .el-select{width:220px}.filters .el-input{max-width:400px}footer{margin-top:20px}.create-card,.action-form{padding:20px;border:1px solid #e3e9ed;border-radius:12px;margin:20px 0}.create-card .el-button{margin-top:16px}h2,p{overflow-wrap:anywhere}
</style>
