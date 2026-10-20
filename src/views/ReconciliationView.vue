<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { adminApi } from '../services/api'
import { useOperationsWork } from '../composables/operationsWork'
import { billTypes, type ReconciliationRow } from '../utils/reconciliation'
import { formatMoney, formatDateTime } from '../utils/format'

const props = defineProps<{ preview: boolean; permissions: string[] }>()
const route = useRoute(), work = useOperationsWork()
const view = ref(route.query.view === 'issues' || route.query.todo ? 'issues' : 'batches')
const dates = ref<string[]>([]), bill = ref(''), search = ref(''), includeClosed = ref(false)
const batchId = ref('')
const issueStatus = ref('')
const rows = ref<ReconciliationRow[]>([]), total = ref(0), page = ref(1)
const loading = ref(false), saving = ref(false), detailLoading = ref(false), error = ref(''), detailError = ref('')
const enabled = ref(false), startDate = ref(''), drawer = ref(false), selected = ref<ReconciliationRow | null>(null)
const note = ref(''), evidence = ref('')
let generation = 0, detailGeneration = 0
const can = (code: string) => props.permissions.includes('*') || props.permissions.includes(code)
const amount = (value: number | null | undefined) => value == null ? '待核实' : formatMoney(value)
const actions: Record<string, string> = { start: '开始核查', submit: '提交复核', approve: '复核结案', return: '退回核查', detected: '发现差异', evidence_changed: '证据更新', rechecked: '重新对账' }
async function load() {
  const own = ++generation
  loading.value = true; error.value = ''
  try {
    if (props.preview) { rows.value = []; total.value = 0; return }
    const data = await adminApi.reconciliation({
      view: view.value, page: page.value, start: dates.value?.[0], end: dates.value?.[1],
      bill_type: bill.value || undefined, search: search.value || undefined,
      include_closed: String(includeClosed.value),
      batch_id: view.value === 'issues' && batchId.value ? batchId.value : undefined,
      issue_status: view.value === 'issues' && issueStatus.value ? issueStatus.value : undefined,
      work_id: view.value === 'issues' && typeof route.query.work_id === 'string' ? route.query.work_id : undefined,
    })
    if (own !== generation) return
    rows.value = data.items; total.value = data.total; enabled.value = data.enabled; startDate.value = data.start_date
    void work.refresh()
  } catch (cause) {
    if (own === generation) { rows.value = []; error.value = cause instanceof Error ? cause.message : '对账记录加载失败' }
  } finally { if (own === generation) loading.value = false }
}
async function open(row: ReconciliationRow) {
  const own = ++detailGeneration
  drawer.value = true; selected.value = null; detailError.value = ''; detailLoading.value = true
  note.value = ''; evidence.value = ''
  try {
    const data = await adminApi.reconciliationIssue(row.id)
    if (own === detailGeneration) selected.value = data
  } catch (cause) { if (own === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '核查详情加载失败' }
  finally { if (own === detailGeneration) detailLoading.value = false }
}
function openBatch(row: ReconciliationRow) {
  batchId.value = String(row.id); view.value = 'issues'
}
async function act(action: string) {
  if (!selected.value?.revision || saving.value) return
  saving.value = true; detailError.value = ''
  try {
    selected.value = await adminApi.reconciliationAction(selected.value.id, {
      action, revision: selected.value.revision, note: note.value.trim(), evidence_reference: evidence.value.trim(),
    })
    note.value = ''; evidence.value = ''; await load()
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : '操作未完成，请刷新核查详情' }
  finally { saving.value = false }
}
watch(view, () => { page.value = 1; drawer.value = false; ++detailGeneration; void load() })
watch(() => route.fullPath, () => {
  batchId.value = ''; page.value = 1
  const next = route.query.view === 'issues' || route.query.todo ? 'issues' : 'batches'
  if (view.value === next) void load()
  else view.value = next
})
onMounted(load)
</script>

<template>
  <section class="reconciliation-page">
    <header><div><h1>每日对账</h1><p>核对渠道账单与平台流水，差异交由财务核查。</p></div><el-button :loading="loading" @click="load">刷新记录</el-button></header>
    <el-alert v-if="!enabled" type="warning" :closable="false" title="自动对账尚未启用，当前仅展示已保存的记录。" />
    <el-alert v-else type="info" :closable="false" :title="`自动对账已启用 · 起始交易日期 ${startDate || '待配置'} · 每日 18:30 后核对前日账单`" />
    <p class="muted">金额一致不代表费用、银行到账均已核实。账单未生成、格式异常或无法逐笔关联时会保留待办；本页不补款、不退款、不修改原账务。</p>
    <el-radio-group v-model="view" aria-label="对账视图"><el-radio-button value="batches">每日账单</el-radio-button><el-radio-button value="issues">差异待办</el-radio-button></el-radio-group>
    <div class="filters">
      <el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="交易开始日期" end-placeholder="交易结束日期" />
      <el-select v-model="bill" clearable placeholder="全部账单" aria-label="账单类型"><el-option v-for="[value, label] in billTypes" :key="value" :value="value" :label="label" /></el-select>
      <el-select v-if="view === 'issues'" v-model="issueStatus" clearable placeholder="全部待办状态" aria-label="待办状态">
        <el-option value="open" label="待核查" /><el-option value="processing" label="核查中" />
        <el-option value="review" label="待复核" /><el-option value="resolved" label="人工核查已结案" /><el-option value="cleared" label="重新对账已一致" />
      </el-select>
      <el-input v-if="view === 'issues'" v-model="search" clearable placeholder="搜索单号或差异说明" aria-label="搜索差异" @keyup.enter="page = 1; load()" />
      <el-button type="primary" @click="page = 1; load()">查询</el-button>
    </div>
    <el-checkbox v-if="view === 'issues'" v-model="includeClosed" @change="page = 1; load()">包含已结案记录</el-checkbox>
    <el-button v-if="view === 'issues' && batchId" link type="primary" @click="batchId = ''; page = 1; load()">清除当前账单筛选</el-button>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="当前没有对账记录">
      <el-table-column label="交易日期" prop="data_date" width="130" />
      <el-table-column label="账单类型" prop="bill_label" min-width="160" />
      <el-table-column label="核对状态" min-width="180"><template #default="{ row }"><el-tag :type="['matched', 'cleared', 'resolved'].includes(row.status) ? 'success' : 'warning'">{{ row.status_label }}</el-tag></template></el-table-column>
      <template v-if="view === 'batches'">
        <el-table-column label="账单笔数 / 已匹配" min-width="155"><template #default="{ row }">{{ row.summary?.channel_count ?? '—' }} / {{ row.summary?.matched_count ?? '—' }}</template></el-table-column>
        <el-table-column label="未完成核查" width="120"><template #default="{ row }"><el-button link type="primary" @click="openBatch(row)">{{ row.open_count }} 项</el-button></template></el-table-column>
        <el-table-column label="最近对账" min-width="180"><template #default="{ row }">{{ formatDateTime(row.checked_at) }}</template></el-table-column>
      </template>
      <template v-else>
        <el-table-column label="业务单号 / 流水" prop="reference" min-width="210" />
        <el-table-column label="差异说明" prop="message" min-width="290" />
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="open(row)">核查详情</el-button></template></el-table-column>
      </template>
    </el-table>
    <footer><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" /></footer>
    <el-drawer v-model="drawer" title="对账差异核查" size="560px" :show-close="!saving" :close-on-click-modal="!saving" :close-on-press-escape="!saving">
      <div v-loading="detailLoading">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="selected">
          <p>{{ selected.data_date }} · {{ selected.bill_label }}</p><h3>{{ selected.reference || '账单整体核查' }}</h3>
          <el-tag type="warning">{{ selected.status_label }}</el-tag>
          <p>{{ selected.message }}</p>
          <p v-if="selected.evidence?.request_date">请求日期：{{ selected.evidence.request_date }}</p>
          <p v-if="selected.evidence?.request_seq">请求流水：{{ selected.evidence.request_seq }}</p>
          <p v-if="selected.evidence?.count">涉及 {{ selected.evidence.count }} 笔记录</p>
          <dl v-if="selected.evidence">
            <div><dt>本地金额</dt><dd>{{ amount(selected.evidence.local_amount) }}</dd></div>
            <div><dt>渠道金额</dt><dd>{{ amount(selected.evidence.channel_amount) }}</dd></div>
            <div><dt>本地费用</dt><dd>{{ amount(selected.evidence.local_fee) }}</dd></div>
            <div><dt>渠道费用</dt><dd>{{ amount(selected.evidence.channel_fee) }}</dd></div>
          </dl>
          <p v-if="selected.evidence?.fields?.length">需核查：{{ selected.evidence.fields.join('、') }}</p>
          <template v-if="!['resolved', 'cleared'].includes(selected.status) && (can('reconciliation.manage') || can('reconciliation.review'))">
            <el-input v-model="note" type="textarea" :rows="4" maxlength="1000" placeholder="填写核查依据与处理说明，至少 5 个字" aria-label="核查说明" />
            <el-input v-if="selected.status === 'processing'" v-model="evidence" maxlength="200" placeholder="核账凭证编号或内部存放位置（勿填账号、密钥或签名链接）" aria-label="核账凭证" />
            <div class="actions">
              <el-button v-if="selected.status === 'open' && can('reconciliation.manage')" :loading="saving" @click="act('start')">开始核查</el-button>
              <el-button v-if="selected.status === 'processing' && can('reconciliation.manage')" type="primary" :loading="saving" @click="act('submit')">提交复核</el-button>
              <template v-if="selected.status === 'review' && can('reconciliation.review')">
                <el-button :loading="saving" @click="act('return')">退回核查</el-button>
                <el-button type="primary" :loading="saving" @click="act('approve')">复核结案</el-button>
              </template>
            </div>
          </template>
          <p class="muted">复核须由另一位财务完成。结案仅记录核查结果，不改变支付、退款、分账、提现或账户冻结状态。</p>
          <h3>核查记录</h3>
          <article v-for="(record, index) in selected.events || []" :key="index" class="event">
            <strong>{{ actions[record.action] || record.action }} · {{ record.actor || '系统' }}</strong><small>{{ formatDateTime(record.created_at) }}</small>
            <p>{{ record.note }}</p><p v-if="record.evidence_reference">凭证：{{ record.evidence_reference }}</p>
          </article>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.reconciliation-page{padding:28px}.reconciliation-page header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}h1{margin:0;font-size:24px}header p,.muted,small{color:#728095;font-size:13px;line-height:1.8}.filters{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.filters .el-select{width:190px}.filters .el-input{max-width:260px}.filters .el-date-editor{flex:none;max-width:330px}footer{display:flex;align-items:center;justify-content:space-between;padding:20px 0;color:#728095}dl{border:1px solid #e4e9ed;border-radius:8px;padding:0 14px}dl>div{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #eef1f3}dl>div:last-child{border:0}dd{margin:0;font-weight:650}dt{color:#728095}.actions{display:flex;gap:10px;margin-top:16px}.el-textarea+.el-input{margin-top:12px}.event{padding:14px 0;border-top:1px solid #e4e9ed}.event small{float:right}.event p,h3{overflow-wrap:anywhere}
</style>
