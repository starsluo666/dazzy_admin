<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import { formatDateTime, formatMoney } from '../utils/format'
import type { AdminAfterSalesCase } from '../types'
import type { FulfillmentRefundContext, FulfillmentRefundInput, FulfillmentRefundQuote, FulfillmentResponsibility, RefundComponent } from '../utils/fulfillmentRefunds'

const props = defineProps<{ item: AdminAfterSalesCase; preview?: boolean }>()
const emit = defineEmits<{ close: []; saved: [item: AdminAfterSalesCase] }>()
const context = ref<FulfillmentRefundContext | null>(null)
const quote = ref<FulfillmentRefundQuote | null>(null)
const loading = ref(true), saving = ref(false), error = ref('')
const form = reactive({ responsibility: '' as FulfillmentResponsibility | '', mode: 'manual' as 'manual' | 'policy',
  occurredAt: null as Date | null, noShow: false, note: '', confirmed: false,
  amounts: { service: 0, transport: 0, other: 0 } as Record<RefundComponent, number> })
const labels = { paid_at: '付款', starts_at: '预约开始', ends_at: '预约结束', departed_at: '出发', arrived_at: '到达', service_started_at: '开始服务', completion_submitted_at: '提交完成' }
const stageLabels: Record<string, string> = { before_departure: '未出发', departed: '已出发未到达', arrived: '已到达未开始', in_service: '已开始服务' }
const needsSupervisor = computed(() => quote.value && !context.value?.policy.supervisor && (
  quote.value.requires_supervisor || !context.value?.policy.single_limit || !context.value?.policy.daily_limit || quote.value.refund_amount + (context.value?.refunded || 0) > (context.value?.policy.single_limit || 0)
  || quote.value.refund_amount > (context.value?.policy.daily_remaining || 0) || props.item.requires_supervisor))
watch(form, () => { quote.value = null; error.value = '' }, { deep: true, flush: 'sync' })
watch(() => form.responsibility, value => {
  form.mode = value === 'customer' && context.value?.policy_available ? 'policy' : 'manual'
  form.noShow = false
})
watch(() => form.mode, () => { form.noShow = false })
onMounted(async () => {
  try {
    if (props.preview) { error.value = '预览模式不处理真实订单'; return }
    const data = await adminApi.fulfillmentRefundContext(props.item.case_no)
    context.value = data
    for (const row of data.components) form.amounts[row.key] = row.remaining / 100
    const proposed = data.proposed
    form.occurredAt = proposed ? new Date(proposed.occurred_at) : null
    if (proposed) {
      form.responsibility = proposed.responsibility
      await nextTick()
      form.mode = proposed.mode
      await nextTick()
      form.noShow = proposed.customer_no_show
      form.note = proposed.result_note
      if (proposed.component_refunds) for (const key of ['service', 'transport', 'other'] as const) form.amounts[key] = proposed.component_refunds[key] / 100
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法加载订单资金与规则，请关闭后重试' }
  finally { loading.value = false }
})
function input(): FulfillmentRefundInput | null {
  if (!context.value || !form.responsibility) { ElMessage.warning('请选择核实后的责任归属'); return null }
  if (!form.occurredAt || !Number.isFinite(form.occurredAt.getTime())) { ElMessage.warning('请选择核实的取消或结束时间'); return null }
  if (!form.confirmed || form.note.trim().length < 5) { ElMessage.warning('请确认已核实证据，并填写至少 5 个字的处理依据'); return null }
  const amounts = Object.fromEntries(Object.entries(form.amounts).map(([key, value]) => [key, Math.round(value * 100)])) as Record<RefundComponent, number>
  if (form.mode === 'manual' && context.value.components.some(row => !Number.isSafeInteger(amounts[row.key]) || amounts[row.key] < 0 || amounts[row.key] > row.remaining)) {
    ElMessage.warning('各项退款金额不能超过剩余可退金额'); return null
  }
  return { revision: context.value.revision, responsibility: form.responsibility, mode: form.mode,
    occurred_at: form.occurredAt.toISOString(), customer_no_show: form.noShow, result_note: form.note.trim(), facts_confirmed: true,
    ...(form.mode === 'manual' ? { component_refunds: amounts } : {}) }
}
async function previewRefund() {
  if (saving.value || !context.value?.can_preview) return
  const data = input()
  if (!data) return
  saving.value = true; quote.value = null; error.value = ''
  try { quote.value = await adminApi.previewFulfillmentRefund(props.item.case_no, data) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '预览失败，请重新核对' }
  finally { saving.value = false }
}
async function submit() {
  if (saving.value || !quote.value || !context.value?.can_approve) return
  const current = quote.value
  saving.value = true
  try {
    await ElMessageBox.confirm(
      `本次退款 ${formatMoney(current.refund_amount)}，剩余 ${formatMoney(current.remaining_amount)}。裁定后结束本单履约；退款按原支付路径处理，剩余款仍待核账。超出权限额度时仅转主管，不发起退款。`,
      '确认履约售后裁定', { confirmButtonText: '确认提交', cancelButtonText: '返回核对', type: 'warning' })
    const updated = await adminApi.resolveFulfillmentRefund(props.item.case_no, current.token)
    if (['pending', 'processing'].includes(updated.status)) ElMessage.warning(updated.escalation_reason || '已转主管审核，尚未退款')
    else ElMessage.success(current.refund_amount ? '退款单已登记，等待执行结果' : '裁定已保存，本单无需退款')
    emit('saved', updated)
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') { quote.value = null; error.value = cause instanceof Error ? cause.message : '提交结果待核实，请刷新原售后单，勿重复登记' }
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog :model-value="true" title="履约异常 · 核实责任与退款" width="min(720px, calc(100vw - 32px))" top="6vh" append-to-body destroy-on-close
    :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @close="emit('close')">
    <div v-loading="loading" class="fulfillment-refund">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-if="context">
        <p class="muted">{{ item.order_no }} · {{ item.case_no }} · {{ context.transport_mode }}</p>
        <el-alert type="info" :closable="false" title="已转售后，自动确认与分账继续暂停" description="取消扣费规则仅适用于用户责任。达人提前离场、服务不足须核实有效服务及交通费，不按服务时长自动折半退款。" />
        <div class="facts"><div v-for="(label, key) in labels" :key="key"><span>{{ label }}</span><strong>{{ formatDateTime(context.timeline[key]) }}</strong></div></div>
        <el-alert v-if="context.blocked_reason || !context.can_preview" :title="context.blocked_reason || '当前账号缺少履约审核或售后审核权限，只可查看'" type="warning" :closable="false" />
        <el-form label-position="top" :disabled="saving || !context.can_preview">
          <div class="two-columns">
            <el-form-item label="责任归属" required><el-select v-model="form.responsibility" placeholder="请先核实责任"><el-option label="达人责任" value="provider" /><el-option label="用户责任" value="customer" /><el-option label="双方责任" value="both" /><el-option label="非双方责任" value="neither" /></el-select></el-form-item>
            <el-form-item label="核实的取消／结束时间" required><el-date-picker v-model="form.occurredAt" type="datetime" placeholder="不是客服审核时间" /></el-form-item>
          </div>
          <el-form-item label="退款计算方式" required><el-radio-group v-model="form.mode"><el-radio value="policy" :disabled="form.responsibility !== 'customer' || !context.policy_available">按下单取消规则</el-radio><el-radio value="manual">按证据人工裁定</el-radio></el-radio-group></el-form-item>
          <template v-if="form.mode === 'policy'">
            <el-collapse><el-collapse-item title="查看本单下单时的取消规则"><p v-for="clause in context.policy_clauses" :key="clause" class="muted">{{ clause }}</p></el-collapse-item></el-collapse>
            <el-checkbox v-model="form.noShow">核实为用户失联，且已有有效到场、联系和满时等待记录</el-checkbox>
          </template>
          <template v-else>
            <p class="muted">未服务的达人责任订单建议全退；部分服务请分别核定各项金额。用户责任不按原规则裁定时需主管审核。</p>
            <div class="two-columns"><el-form-item v-for="row in context.components" :key="row.key" :label="`${row.label}退款（元），最多 ${formatMoney(row.remaining)}`" required><el-input-number v-model="form.amounts[row.key]" :min="0" :max="row.remaining / 100" :precision="2" controls-position="right" /></el-form-item></div>
          </template>
          <el-form-item label="处理依据（将展示给双方，请勿填写无关隐私）" required><el-input v-model="form.note" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="写明双方陈述、到场和完成记录、核实时间及各项退款依据；人工调整须说明原因" /></el-form-item>
          <el-checkbox v-model="form.confirmed">已核对双方陈述及履约证据，确认责任和取消／结束时间</el-checkbox>
        </el-form>
        <section v-if="quote" class="refund-quote" aria-label="退款预览">
          <h3>{{ quote.label }}</h3><p class="muted">{{ quote.responsibility_label }} · {{ stageLabels[quote.stage] }} · {{ formatDateTime(quote.occurred_at) }}</p>
          <el-table :data="context.components" size="small"><el-table-column prop="label" label="费用" /><el-table-column label="实付"><template #default="scope">{{ formatMoney(scope.row.paid) }}</template></el-table-column><el-table-column label="剩余可退"><template #default="scope">{{ formatMoney(scope.row.remaining) }}</template></el-table-column><el-table-column label="本次退款"><template #default="scope">{{ formatMoney(quote.component_refunds[scope.row.key as RefundComponent]) }}</template></el-table-column></el-table>
          <div class="quote-total"><span>本次退款 <strong>{{ formatMoney(quote.refund_amount) }}</strong></span><span>剩余待核账 {{ formatMoney(quote.remaining_amount) }}</span></div>
          <p class="muted">退回余额 {{ formatMoney(quote.routes.wallet) }} · 原外部支付渠道 {{ formatMoney(quote.routes.external) }}。审核通过不代表到账，剩余款不自动分账。</p>
          <el-alert v-if="needsSupervisor" title="本方案需主管审核；提交只转交审批，不发起退款" type="warning" :closable="false" />
        </section>
      </template>
    </div>
    <template #footer><el-button :disabled="saving" @click="emit('close')">暂不处理</el-button><el-button :disabled="loading || !context?.can_preview" :loading="saving" @click="previewRefund">预览退款方案</el-button><el-button v-if="quote" type="primary" :disabled="!context?.can_approve" :loading="saving" @click="submit">{{ needsSupervisor ? '提交主管审核' : '确认裁定' }}</el-button></template>
  </el-dialog>
</template>

<style scoped>
.fulfillment-refund{min-height:120px;max-height:calc(85vh - 160px);overflow-y:auto;padding-right:4px}.muted{color:var(--muted);font-size:13px;line-height:1.7;overflow-wrap:anywhere}.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.facts div{display:flex;flex-direction:column;gap:5px}.facts span{font-size:12px;color:var(--muted)}.facts strong{font-size:13px;font-weight:500}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.el-date-editor,.el-input-number{width:100%}.el-checkbox{height:auto;min-height:36px;white-space:normal;margin:10px 0}.refund-quote{margin-top:20px;padding:16px;border:1px solid var(--line);border-radius:8px;background:#f7fafa}.refund-quote h3{margin:0;font-size:15px}.quote-total{display:flex;justify-content:space-between;gap:12px;margin-top:16px;font-variant-numeric:tabular-nums}.quote-total strong{color:var(--brand)}
</style>
