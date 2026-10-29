<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import { useOperationsWork } from '../composables/operationsWork'
import { contentKinds, contentStates, contentActions, type ContentReview } from '../utils/contentReviews'
import { formatDateTime } from '../utils/format'

const props = defineProps<{ preview: boolean; permissions: string[] }>()
const route = useRoute(), work = useOperationsWork()
const rows = ref<ContentReview[]>([]), page = ref(1), total = ref(0)
const status = ref(''), kind = ref(''), search = ref('')
const enabled = ref(false), automatic = ref(false), loading = ref(false), saving = ref(false)
const error = ref(''), detailError = ref(''), drawer = ref(false), detailLoading = ref(false)
const selected = ref<ContentReview | null>(null), reason = ref(''), stale = ref(false)
const registering = ref(false), registerKind = ref('provider'), targetId = ref<number | undefined>()
const registerError = ref('')
const canManage = computed(() => !props.preview && (props.permissions.includes('*') || props.permissions.includes('content.review.manage')))
const available = computed(() => {
  const row = selected.value
  if (!row?.is_current || row.target_available === false || !canManage.value || stale.value) return []
  const retryable = row.items?.some(item => item.state === 'error' && (item.kind !== 'video' || item.task_id))
  if (['queued', 'processing', 'manual'].includes(row.status)) return ['approve', 'reject', ...(row.status === 'manual' && enabled.value && automatic.value && retryable ? ['retry'] : [])]
  if (row.status === 'approved') return ['withdraw']
  if (row.status === 'rejected') return ['approve']
  if (row.status === 'withdrawn') return ['restore']
  return []
})
const itemStates: Record<string, string> = { pending: '待检测', submitting: '任务提交中', polling: '视频检测中', pass: '通过', review: '需复核', block: '未通过', error: '检测未完成' }
let listGeneration = 0, detailGeneration = 0
async function load() {
  const own = ++listGeneration
  loading.value = true; error.value = ''
  try {
    if (props.preview) { rows.value = []; total.value = 0; return }
    const data = await adminApi.contentReviews({ page: page.value, status: status.value || undefined, kind: kind.value || undefined, q: search.value || undefined,
      todo: typeof route.query.todo === 'string' ? route.query.todo : undefined,
      work_id: typeof route.query.work_id === 'string' ? route.query.work_id : undefined })
    if (own !== listGeneration) return
    rows.value = data.items; total.value = data.pagination.total; enabled.value = data.enabled; automatic.value = data.automatic
    void work.refresh()
  } catch (cause) { if (own === listGeneration) { rows.value = []; total.value = 0; error.value = cause instanceof Error ? cause.message : '内容审核加载失败' } }
  finally { if (own === listGeneration) loading.value = false }
}
async function open(id: number) {
  const own = ++detailGeneration
  drawer.value = true; selected.value = null; detailLoading.value = true; detailError.value = ''; reason.value = ''; stale.value = false
  try { const row = await adminApi.contentReview(id); if (own === detailGeneration) selected.value = row }
  catch (cause) { if (own === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '详情加载失败' }
  finally { if (own === detailGeneration) detailLoading.value = false }
}
async function act(action: string) {
  const row = selected.value
  if (!row || !available.value.includes(action) || saving.value || reason.value.trim().length < 5) return
  const note = reason.value.trim()
  try { await ElMessageBox.confirm(`确认${contentActions[action]}？该操作会记录核查依据。`, '确认内容处置', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  if (selected.value?.id !== row.id || selected.value.revision !== row.revision || saving.value) return
  saving.value = true; detailError.value = ''
  try {
    const updated = await adminApi.decideContentReview(row.id, { action, revision: row.revision, reason: note })
    if (selected.value?.id === row.id) { selected.value = updated; reason.value = '' }
    await load()
  } catch (cause) { stale.value = true; detailError.value = cause instanceof Error ? cause.message : '操作未完成，请刷新详情后核查' }
  finally { saving.value = false }
}
async function register() {
  if (!targetId.value || saving.value || !canManage.value) return
  saving.value = true; registerError.value = ''
  try {
    const row = await adminApi.registerContentReview({ kind: registerKind.value, target_id: targetId.value })
    registering.value = false; await load(); await open(row.id)
  } catch (cause) { registerError.value = cause instanceof Error ? cause.message : '登记失败' }
  finally { saving.value = false }
}
onMounted(load)
function closeDetail(done: () => void) { if (!saving.value) { ++detailGeneration; done() } }
</script>

<template>
  <section class="content-reviews">
    <header><div><h1>内容审核</h1><p>集中核查公开内容，保留检测结果和每次处置依据。</p></div><div><el-button :loading="loading" @click="load">刷新记录</el-button><el-button v-if="canManage" type="primary" @click="registering = true; registerError = ''">登记现有内容</el-button></div></header>
    <el-alert :closable="false" :type="enabled ? 'info' : 'warning'" :title="!enabled ? '新内容自动送审尚未启用，可登记现有内容进行人工核查。' : automatic ? '自动检测已启用；存疑或检测失败的内容转人工复核。' : '当前采用人工内容审核。'" />
    <p class="muted">内容通过不替代达人、活动、评价原有业务审核。下架仅停止公开展示和新预约，不会自动退款或变更已有订单。</p>
    <div class="filters">
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="内容状态"><el-option v-for="[value, label] in contentStates" :key="value" :value="value" :label="label" /></el-select>
      <el-select v-model="kind" clearable placeholder="全部类型" aria-label="内容类型"><el-option v-for="[value, label] in contentKinds" :key="value" :value="value" :label="label" /></el-select>
      <el-input v-model="search" clearable placeholder="搜索审核编号或文字" aria-label="搜索内容" @keyup.enter="page = 1; load()" />
      <el-button type="primary" @click="page = 1; load()">查询</el-button>
    </div>
    <el-alert v-if="error" type="error" :title="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="暂无内容审核记录">
      <el-table-column label="内容" min-width="250"><template #default="{ row }"><strong>{{ row.title || '未填写文字' }}</strong><div class="muted">{{ row.kind_label }} · 原记录 ID {{ row.target_id }}</div></template></el-table-column>
      <el-table-column label="状态" width="170"><template #default="{ row }"><el-tag :type="row.status === 'approved' ? 'success' : ['rejected', 'withdrawn'].includes(row.status) ? 'danger' : 'warning'">{{ row.status_label }}</el-tag></template></el-table-column>
      <el-table-column label="说明" prop="reason" min-width="210" show-overflow-tooltip />
      <el-table-column label="提交时间" width="185"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="open(row.id)">核查详情</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="load" />
    <el-drawer v-model="drawer" title="内容核查详情" size="min(760px, 96vw)" :before-close="closeDetail">
      <div v-loading="detailLoading">
        <el-alert v-if="detailError" type="error" :title="detailError" :closable="false" />
        <template v-if="selected">
          <div class="detail-heading"><el-tag>{{ selected.status_label }}</el-tag><el-button :disabled="saving" @click="open(selected.id)">刷新详情</el-button></div>
          <el-alert v-if="selected.target_available === false" title="原内容已不存在，此记录仅供历史核查。" type="warning" :closable="false" />
          <p class="muted">{{ selected.public_id }} · 第 {{ selected.revision }} 版<br>{{ selected.kind_label }} · 原记录 ID {{ selected.target_id }}</p>
          <el-alert v-if="selected.blocking_review" title="此公开内容由另一条审核记录下架，请先核查原记录。" type="warning" :closable="false"><el-button link type="primary" :disabled="saving" @click="open(selected.blocking_review.id)">查看原下架记录</el-button></el-alert>
          <h3>送审内容</h3>
          <dl><template v-for="(value, label) in selected.text" :key="label"><dt>{{ label }}</dt><dd>{{ value || '未填写' }}</dd></template></dl>
          <div class="media-grid"><div v-for="asset in selected.assets" :key="asset.id"><template v-if="asset.url"><video v-if="asset.kind === 'video'" :src="asset.url" controls preload="metadata" /><el-image v-else :src="asset.url" :preview-src-list="[asset.url]" fit="contain" preview-teleported /></template><el-alert v-else title="素材已变更或不可用，请核实后再处理" type="warning" :closable="false" /></div></div>
          <h3>检测记录</h3>
          <el-table :data="selected.items" empty-text="无检测记录"><el-table-column label="类型" width="80"><template #default="{ row }">{{ row.kind === 'text' ? '文字' : row.kind === 'video' ? '视频' : '图片' }}</template></el-table-column><el-table-column label="结果"><template #default="{ row }">{{ itemStates[row.state] || '待核查' }}</template></el-table-column><el-table-column label="检测分类" prop="label" /><el-table-column label="跟踪记录" min-width="170"><template #default="{ row }"><small>{{ row.error_code || row.request_id || '—' }}</small></template></el-table-column></el-table>
          <template v-if="available.length"><h3>人工处置</h3><el-input v-model="reason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="填写核查依据或处理原因，至少5个字" aria-label="核查依据" :disabled="saving" /><div class="actions"><el-button v-for="action in available" :key="action" :type="['reject', 'withdraw'].includes(action) ? 'danger' : action === 'retry' ? 'default' : 'primary'" :disabled="saving || reason.trim().length < 5" :loading="saving" @click="act(action)">{{ contentActions[action] }}</el-button></div></template>
          <h3>处置记录</h3><el-timeline><el-timeline-item v-for="event in selected.events" :key="event.revision + event.action" :timestamp="formatDateTime(event.created_at)"><strong>{{ contentActions[event.action] || event.action }}</strong><p>{{ event.note || '已记录' }}</p><small class="muted">操作人：{{ event.actor }}</small></el-timeline-item></el-timeline>
        </template>
      </div>
    </el-drawer>
    <el-dialog v-model="registering" title="登记现有内容" width="480px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
      <p class="muted">用于核查历史内容。登记本身不会通过原业务审核；内容不合适时可驳回或下架。</p>
      <el-alert v-if="registerError" :title="registerError" type="error" :closable="false" />
      <el-form label-position="top"><el-form-item label="内容类型"><el-select v-model="registerKind"><el-option v-for="[value, label] in contentKinds" :key="value" :value="value" :label="label" /></el-select></el-form-item><el-form-item label="原业务记录 ID"><el-input-number v-model="targetId" :min="1" :precision="0" /></el-form-item></el-form>
      <template #footer><el-button :disabled="saving" @click="registering = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!targetId" @click="register">登记审核</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.content-reviews{display:grid;gap:20px}.content-reviews header,.detail-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.content-reviews h1{margin:0 0 8px;font-size:26px}.content-reviews header p,.muted{color:#778293;font-size:13px;line-height:1.7;margin:0}.filters{display:flex;gap:12px}.filters .el-select{width:180px}.filters .el-input{max-width:340px}.el-pagination{justify-content:flex-end}h3{margin:26px 0 14px;font-size:16px}dl{background:#f6f8fa;padding:20px;border-radius:12px}dt{font-size:13px;color:#778293}dd{margin:6px 0 18px;white-space:pre-wrap;overflow-wrap:anywhere}dd:last-child{margin-bottom:0}.media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.media-grid video,.media-grid .el-image{width:100%;height:220px;background:#f3f5f7;border-radius:10px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.actions .el-button{margin:0}small{overflow-wrap:anywhere}@media(max-width:760px){.filters{flex-wrap:wrap}.content-reviews header{align-items:flex-start;flex-direction:column}.media-grid{grid-template-columns:1fr}}
</style>
