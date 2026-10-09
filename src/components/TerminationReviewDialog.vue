<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminAfterSalesCase, TerminationSummary } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'
import RefundPolicyNotice from './RefundPolicyNotice.vue'

const props = defineProps<{ item: AdminAfterSalesCase; preview: boolean }>()
const emit = defineEmits<{ close: []; saved: [item: AdminAfterSalesCase] }>()
const fields = [{ key: 'service', label: '服务费' }, { key: 'transport', label: '交通费' }, { key: 'other', label: '其他费用' }] as const
const amounts = ref<Record<'service' | 'transport' | 'other', number | undefined>>({ service: undefined, transport: undefined, other: undefined })
const responsibility = ref<NonNullable<TerminationSummary['decision']>['responsibility']>()
const endedAt = ref(new Date(props.item.termination!.reported_ended_at))
const note = ref('')
const saving = ref(false)
const total = computed(() => fields.reduce((sum, field) => sum + Math.round((amounts.value[field.key] || 0) * 100), 0))

async function submit() {
  if (saving.value) return
  if (props.preview) return ElMessage.info('预览模式不会处理订单')
  if (!responsibility.value || !endedAt.value || !Number.isFinite(endedAt.value.getTime())) return ElMessage.warning('请填写实际结束时间和责任归属')
  if (fields.some(field => amounts.value[field.key] == null || !Number.isFinite(amounts.value[field.key]))) return ElMessage.warning('请逐项核定退款金额；不退的费用请明确填 0')
  if (note.value.trim().length < 5) return ElMessage.warning('请填写至少 5 个字的核查依据')
  saving.value = true
  try {
    await ElMessageBox.confirm(`确认终止服务并核准退款 ${formatMoney(total.value)}？退款与剩余款核账分别处理，不自动扣信用分。`, '确认终止裁定', { type: 'warning', confirmButtonText: '确认裁定', cancelButtonText: '返回核对' })
    const item = await adminApi.resolveTermination(props.item.case_no, {
      ended_at: endedAt.value.toISOString(), responsibility: responsibility.value,
      component_refunds: {
        service: Math.round(amounts.value.service! * 100), transport: Math.round(amounts.value.transport! * 100), other: Math.round(amounts.value.other! * 100),
      }, result_note: note.value.trim(),
    })
    if (item.requires_supervisor && ['pending', 'processing'].includes(item.status)) ElMessage.warning('已转主管审核，尚未终止或退款')
    else ElMessage.success('服务已终止，资金进度请查看工单')
    emit('saved', item)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '裁定提交失败')
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog :model-value="true" title="核定提前终止服务" width="580px" top="6vh" :body-style="{ maxHeight: 'calc(88vh - 150px)', overflowY: 'auto' }" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @close="emit('close')">
    <RefundPolicyNotice :preview="preview" kind="provider" :reference="item.order_no" />
    <el-alert type="warning" :closable="false" title="不按服务时间自动折半退款" description="请核对双方陈述、到场记录和凭证。服务费与交通费分别裁定，剩余款待核账，不自动进入可提现余额。信用分另行按责任规则处理。" />
    <p class="timeline">开始服务 {{ formatDateTime(item.termination!.service_started_at) }}<br>预约结束 {{ formatDateTime(item.termination!.scheduled_ends_at) }}</p>
    <el-form label-position="top" :disabled="saving">
      <el-form-item label="核实的实际结束时间" required><el-date-picker v-model="endedAt" type="datetime" /></el-form-item>
      <el-form-item label="责任归属" required><el-select v-model="responsibility" placeholder="请选择核查结论"><el-option label="达人责任" value="provider" /><el-option label="用户责任" value="customer" /><el-option label="双方责任" value="both" /><el-option label="非双方责任" value="neither" /></el-select></el-form-item>
      <el-form-item v-for="field in fields" :key="field.key" :label="`${field.label}退款（元），最多 ${formatMoney(item.termination!.refundable_components[field.key])}`" required>
        <el-input-number v-model="amounts[field.key]" :min="0" :max="item.termination!.refundable_components[field.key] / 100" :precision="2" controls-position="right" placeholder="不退请填 0" />
      </el-form-item>
      <p class="total">本次退款合计 <strong>{{ formatMoney(total) }}</strong></p>
      <el-form-item label="核查依据与处理结论" required><el-input v-model="note" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="写明双方诉求、有效履约部分及路费处理依据" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('close')">返回核对</el-button><el-button type="primary" :loading="saving" @click="submit">确认终止裁定</el-button></template>
  </el-dialog>
</template>

<style scoped>
.timeline{color:var(--muted);line-height:1.7}.total{display:flex;justify-content:space-between;padding:14px;border-radius:8px;background:var(--page-bg,#f4f8f9);font-variant-numeric:tabular-nums}.total strong{color:var(--brand)}
</style>
