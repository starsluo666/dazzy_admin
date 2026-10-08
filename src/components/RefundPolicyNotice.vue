<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '../services/api'
import { formatMoney } from '../utils/format'
import type { RefundContext, RefundPolicy } from '../utils/refunds'
const props = defineProps<{ preview: boolean; kind: 'provider' | 'activity'; reference?: string }>()
const policy = ref<RefundPolicy | null>(null)
const balance = ref<RefundContext | null>(null)
const error = ref('')
onMounted(async () => {
  if (props.preview) return
  try {
    if (props.reference) { balance.value = await adminApi.refundContext(props.kind, props.reference); policy.value = balance.value.policy }
    else policy.value = await adminApi.refundPolicy()
  }
  catch { error.value = '额度预览暂不可用，提交时仍由服务端校验。' }
})
</script>

<template>
  <div class="refund-policy" role="status">
    <template v-if="balance">
      <strong>实付 {{ formatMoney(balance.paid) }} · 已退 {{ formatMoney(balance.refunded) }}</strong>
      <strong>退款占用 {{ formatMoney(balance.occupied) }} · 剩余可退 {{ formatMoney(balance.remaining) }}</strong>
      <span>{{ balance.notice }}</span>
    </template>
    <template v-if="policy?.supervisor">当前为主管审核权限；仍受可退金额、结算及分账状态限制。</template>
    <template v-else-if="policy">
      <strong>单订单累计上限 {{ formatMoney(policy.single_limit) }} · 今日剩余额度 {{ formatMoney(policy.daily_remaining) }}</strong>
      <span>今日已审批 {{ formatMoney(policy.daily_used) }} / {{ formatMoney(policy.daily_limit) }}；两类订单合并，按北京时间自然日计算，失败及处理中退款仍占额度。额度为 0 或超额只转主管，不退款。</span>
    </template>
    <template v-else>{{ preview ? '预览模式不产生真实退款。' : error || '正在读取审批额度…' }}</template>
  </div>
</template>

<style scoped>
.refund-policy{display:flex;flex-direction:column;gap:6px;margin:12px 0;padding:12px 14px;border:1px solid #dfe7e9;border-radius:8px;background:#f7fafb;color:#52616d;font-size:12px;line-height:1.6}.refund-policy strong{color:#213341}
</style>
