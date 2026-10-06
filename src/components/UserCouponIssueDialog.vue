<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminCouponTemplate } from '../types'
import { formatMoney } from '../utils/format'

const props = defineProps<{
  modelValue: boolean
  user: { public_id: string; nickname: string; phone_masked: string; account_status: string } | null
  canIssue: boolean
  preview: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; issued: [] }>()
const templates = ref<AdminCouponTemplate[]>([])
const templateId = ref('')
const requestId = ref('')
const busy = ref(false)
const loading = ref(false)
const selected = computed(() => templates.value.find(item => item.public_id === templateId.value))
watch(templateId, () => { requestId.value = crypto.randomUUID() })
watch(() => props.modelValue, async visible => {
  if (!visible) return
  templateId.value = ''
  requestId.value = crypto.randomUUID()
  templates.value = []
  if (props.preview || !props.canIssue) return
  loading.value = true
  try { templates.value = (await adminApi.couponTemplates()).items.filter(item => item.is_active) }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '优惠券加载失败') }
  finally { loading.value = false }
})
async function issue() {
  if (busy.value || props.preview || !props.canIssue || !props.user || !selected.value || props.user.account_status !== 'active') return
  const user = props.user, template = selected.value, key = requestId.value
  busy.value = true
  try {
    await ElMessageBox.confirm(`向 ${user.nickname}（${user.phone_masked}）发放一张「${template.name}」，面额 ${formatMoney(template.face_amount)}，确认吗？`, '确认发放优惠券', { type: 'warning', confirmButtonText: '确认发放', cancelButtonText: '取消' })
    await adminApi.issueCoupon(user.public_id, template.public_id, key)
    ElMessage.success('优惠券已发放，用户将收到通知')
    emit('issued')
    emit('update:modelValue', false)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '发放失败，请重试')
  } finally { busy.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="发放优惠券" width="520px" :close-on-click-modal="!busy" :show-close="!busy" :close-on-press-escape="!busy" @update:model-value="!busy && emit('update:modelValue', $event)">
    <div v-loading="loading">
      <p>发放对象：{{ user?.nickname }} · {{ user?.phone_masked }}</p>
      <el-select v-model="templateId" filterable placeholder="选择启用中的优惠券" :disabled="busy || preview" style="width:100%">
        <el-option v-for="item in templates" :key="item.public_id" :value="item.public_id" :label="`${item.name} · ${formatMoney(item.face_amount)}`" />
      </el-select>
      <div v-if="selected" class="coupon-summary"><strong>{{ selected.name }} · {{ formatMoney(selected.face_amount) }}</strong><p>订单金额大于 {{ formatMoney(selected.min_order_amount) }} 可用 · 领取后 {{ selected.valid_days }} 天有效</p><p>{{ selected.description || '仅限达人服务订单使用' }}</p></div>
      <p v-else-if="!loading && !templates.length">暂无可发放优惠券，请先在优惠券管理中创建并启用模板。</p>
    </div>
    <template #footer><el-button :disabled="busy" @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="busy" :disabled="!selected || loading || preview || !canIssue" @click="issue">发放一张</el-button></template>
  </el-dialog>
</template>

<style scoped>
.coupon-summary{margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:10px;background:#f3fbfb}.coupon-summary p{color:var(--muted);font-size:13px;line-height:1.6}
</style>
