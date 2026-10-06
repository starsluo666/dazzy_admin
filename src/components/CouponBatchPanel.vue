<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminCouponTemplate, CouponIssueBatch } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'

const props = defineProps<{ templates: AdminCouponTemplate[] }>()
const emit = defineEmits<{ changed: [] }>()
const rows = ref<CouponIssueBatch[]>([])
const visible = ref(false)
const templateId = ref('')
const requestId = ref('')
const current = ref<CouponIssueBatch | null>(null)
const busy = ref(false)
const loading = ref(false)
let refreshAgain = false
const labels = { preview: '待确认（未发券）', queued: '排队中', running: '发放中', partial: '部分失败', completed: '已完成' }
watch(templateId, () => { current.value = null; requestId.value = crypto.randomUUID() })
function open() { templateId.value = ''; current.value = null; requestId.value = crypto.randomUUID(); visible.value = true }
async function refresh(silent = false) {
  if (loading.value) { refreshAgain = true; return }
  loading.value = true
  try { rows.value = (await adminApi.couponBatches()).items }
  catch (error) { if (!silent) ElMessage.error(error instanceof Error ? error.message : '批次加载失败') }
  finally {
    loading.value = false
    // A confirmation may finish while an older list request is in flight.
    if (refreshAgain) { refreshAgain = false; void refresh(true) }
  }
}
async function previewBatch() {
  if (!templateId.value || busy.value) return
  if (current.value) { current.value = null; requestId.value = crypto.randomUUID() }
  busy.value = true
  try {
    current.value = await adminApi.previewCouponBatch(templateId.value, requestId.value)
    await refresh()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '预览失败') }
  finally { busy.value = false }
}
async function execute(batch: CouponIssueBatch, action: 'confirm' | 'retry') {
  if (busy.value) return
  busy.value = true
  try {
    await ElMessageBox.confirm(action === 'confirm'
      ? `向预览中的 ${batch.total} 位用户各发一张「${batch.template.name}」，总面额 ${formatMoney(batch.total_face_amount)}。此操作不会随页面关闭而停止，确认发放？`
      : `仅重试 ${batch.failed} 位发放失败的用户；已成功用户不会重复收到。确认重试？`, action === 'confirm' ? '确认全员发放' : '重试失败项', { type: 'warning', confirmButtonText: action === 'confirm' ? '确认发放' : '确认重试', cancelButtonText: '取消' })
    await adminApi.couponBatchAction(batch.public_id, action)
    visible.value = false
    ElMessage.success('已加入发放队列，可在批次记录查看进度')
    await refresh()
    emit('changed')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '操作失败')
  } finally { busy.value = false }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void refresh(); timer = setInterval(() => { if (rows.value.some(row => ['queued', 'running'].includes(row.status))) void refresh(true) }, 5000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section class="batch-panel">
    <header><div><h2>全员发放</h2><p>向当前符合条件的用户各发一张优惠券，后台分批处理。</p></div><div><el-button :loading="loading" @click="refresh()">刷新进度</el-button><el-button type="primary" @click="open">给全部用户发放</el-button></div></header>
    <el-table :data="rows" empty-text="暂无发放批次" max-height="360">
      <el-table-column label="优惠券 / 批次" min-width="200"><template #default="{ row }"><strong>{{ row.template.name }}</strong><div class="muted">{{ formatDateTime(row.created_at) }} · {{ row.public_id.slice(0, 8) }}</div></template></el-table-column>
      <el-table-column label="状态" width="150"><template #default="{ row }"><el-tag :type="row.status === 'partial' ? 'warning' : row.status === 'completed' ? 'success' : 'info'">{{ labels[row.status as keyof typeof labels] }}</el-tag></template></el-table-column>
      <el-table-column label="人数 / 成功 / 待处理" min-width="160"><template #default="{ row }">{{ row.total }} / {{ row.issued }} / {{ row.pending }}</template></el-table-column>
      <el-table-column label="失败 / 跳过" width="110"><template #default="{ row }">{{ row.failed }} / {{ row.skipped }}</template></el-table-column>
      <el-table-column label="操作" width="140"><template #default="{ row }"><el-button v-if="row.status === 'partial'" link type="primary" :disabled="busy" @click="execute(row, 'retry')">重试失败项</el-button><span v-else>—</span></template></el-table-column>
    </el-table>
    <p class="muted">跳过：账号在发放前已受限、停用、注销或转为后台账号。长时间排队请检查 worker / beat 服务。</p>
  </section>
  <el-dialog v-model="visible" title="给全部用户发放优惠券" width="620px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
    <el-alert title="仅包含本批次预览时的正常用户，含达人账号；不包含后台账号或后续注册用户。" :closable="false" type="info" />
    <el-select v-model="templateId" filterable placeholder="选择优惠券" :disabled="busy" style="width:100%;margin-top:18px"><el-option v-for="item in templates.filter(item => item.is_active)" :key="item.public_id" :value="item.public_id" :label="`${item.name} · ${formatMoney(item.face_amount)}`" /></el-select>
    <div v-if="current" class="batch-preview"><h3>{{ current.template.name }}</h3><p>每人一张 {{ formatMoney(current.template.face_amount) }} · 订单金额大于 {{ formatMoney(current.template.min_order_amount) }} 可用</p><p>到账后 {{ current.template.valid_days }} 天有效</p><strong>{{ current.total }} 人 · 总面额 {{ formatMoney(current.total_face_amount) }}</strong><p class="muted">预览截至 {{ formatDateTime(current.preview_expires_at) }} 有效，尚未实际发券。关闭后需重新预览。</p></div>
    <template #footer><el-button :disabled="busy" @click="visible = false">取消</el-button><el-button :loading="busy" :disabled="!templateId" @click="previewBatch">{{ current ? '重新预览' : '预览人数和规则' }}</el-button><el-button type="primary" :loading="busy" :disabled="!current || !current.total || current.status !== 'preview'" @click="current && execute(current, 'confirm')">确认全员发放</el-button></template>
  </el-dialog>
</template>

<style scoped>
.batch-panel{margin-top:20px;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.batch-panel header{display:flex;gap:20px;align-items:center;justify-content:space-between;margin-bottom:14px}.batch-panel h2{font-size:16px;margin:0}.batch-panel p,.muted{font-size:12px;color:var(--muted);line-height:1.6}.batch-preview{margin-top:18px;padding:16px;border-radius:10px;background:#f0fafa}.batch-preview h3{margin-top:0}
</style>
