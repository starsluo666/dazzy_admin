<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import { formatMoney } from '../utils/format'
import type { RefundContext } from '../utils/refunds'

const props = defineProps<{ modelValue: boolean; kind: 'provider' | 'activity'; reference: string; preview?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [] }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const context = ref<RefundContext | null>(null)
const loading = ref(false), saving = ref(false), error = ref(''), reason = ref('')
const amount = ref(0), principal = ref(0), fee = ref(0)
let sequence = 0
const total = computed(() => Math.round((props.kind === 'provider' ? amount.value : principal.value + fee.value) * 100))
watch(() => [props.modelValue, props.reference], async () => {
  const own = ++sequence
  context.value = null; reason.value = ''; error.value = ''; loading.value = false
  if (!props.modelValue) return
  if (props.preview) { error.value = '预览模式不登记真实退款申请'; return }
  loading.value = true
  try {
    const data = await adminApi.refundContext(props.kind, props.reference)
    if (own !== sequence) return
    context.value = data; amount.value = data.remaining / 100
    principal.value = (data.components.find(item => item.key === 'principal')?.remaining || 0) / 100
    fee.value = (data.components.find(item => item.key === 'service_fee')?.remaining || 0) / 100
  } catch (cause) { if (own === sequence) error.value = cause instanceof Error ? cause.message : '无法读取可退金额' }
  finally { if (own === sequence) loading.value = false }
})
async function submit() {
  const data = context.value
  if (!data?.can_create || saving.value) return
  if (reason.value.trim().length < 5) return ElMessage.warning('请填写至少 5 个字的退款原因')
  if (!Number.isSafeInteger(total.value) || total.value <= 0 || total.value > data.remaining) return ElMessage.warning('请填写有效的可退金额')
  saving.value = true
  try {
    await ElMessageBox.confirm(`为 ${data.customer} 登记 ${formatMoney(total.value)} 退款申请？提交只登记售后，需审核后执行退款。`, '确认登记退款申请',
      { type: 'warning', confirmButtonText: '确认登记', cancelButtonText: '返回核对' })
    if (props.kind === 'provider') await adminApi.createAfterSalesCase(data.reference, 'refund', total.value, reason.value.trim())
    else await adminApi.createActivityRefundCase(data.reference, Math.round(principal.value * 100), Math.round(fee.value * 100), reason.value.trim())
    ElMessage.success('退款申请已登记，等待审核；尚未退款')
    visible.value = false; emit('created')
  } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause instanceof Error ? cause.message : '登记失败，请刷新核对后重试') }
  finally { saving.value = false }
}
</script>

<template>
  <el-dialog v-model="visible" title="登记退款申请" width="560px" append-to-body destroy-on-close :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <div v-loading="loading" class="refund-request">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-if="context">
        <p><strong>{{ context.customer }}</strong><br /><span class="reference">{{ context.reference }}</span></p>
        <dl><div><dt>实付</dt><dd>{{ formatMoney(context.paid) }}</dd></div><div><dt>已退款</dt><dd>{{ formatMoney(context.refunded) }}</dd></div><div><dt>退款占用 / 待核实</dt><dd>{{ formatMoney(context.occupied) }}</dd></div><div><dt>剩余可退</dt><dd>{{ formatMoney(context.remaining) }}</dd></div></dl>
        <el-alert v-if="context.blocked_reason" :title="context.blocked_reason" type="warning" :closable="false" />
        <p v-if="context.open_case_no">关联售后单：{{ context.open_case_no }}</p>
        <p class="notice">{{ context.notice }}</p>
        <el-form label-position="top" :disabled="!context.can_create || saving">
          <el-form-item v-if="kind === 'provider'" label="申请退款金额（元）" required><el-input-number v-model="amount" :min="0.01" :max="context.remaining / 100" :precision="2" controls-position="right" /></el-form-item>
          <template v-else><el-form-item label="申请退还 AA 本金（元）"><el-input-number v-model="principal" :min="0" :max="(context.components[0]?.remaining || 0) / 100" :precision="2" /></el-form-item><el-form-item label="申请退还平台服务费（元）"><el-input-number v-model="fee" :min="0" :max="(context.components[1]?.remaining || 0) / 100" :precision="2" /></el-form-item></template>
          <el-form-item label="申请原因 / 核实情况" required><el-input v-model="reason" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="填写用户诉求、已核实情况及退款依据" /></el-form-item>
        </el-form>
        <p class="notice">申请不等于退款成功。超额审批转主管，退款执行结果以服务端核验为准。</p>
      </template>
    </div>
    <template #footer><el-button :disabled="saving" @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!context?.can_create || loading" @click="submit">登记申请 · {{ formatMoney(total) }}</el-button></template>
  </el-dialog>
</template>

<style scoped>
.refund-request{min-height:100px}.reference,.notice{font-size:13px;color:#738092;line-height:1.7;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:18px;background:#f5f8fa;border-radius:12px}dt{font-size:12px;color:#738092}dd{margin:5px 0 0;font-size:18px;font-variant-numeric:tabular-nums;font-weight:600}.el-input-number{width:100%}
</style>
