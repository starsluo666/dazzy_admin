<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminCouponTemplate, GrowthCampaignConfig } from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const loading = ref(false), saving = ref(false)
const templates = ref<AdminCouponTemplate[]>([])
const form = reactive({ enabled: false, registrationTemplateId: '', firstOrderTemplateId: '' })
const formatMoney = (amount: number) => `¥${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`
const selectedRegistration = computed(() => templates.value.find((item) => item.public_id === form.registrationTemplateId))
const selectedFirstOrder = computed(() => templates.value.find((item) => item.public_id === form.firstOrderTemplateId))
const demoTemplates: AdminCouponTemplate[] = [
  { public_id: 'demo-register', name: '好友注册奖励券', description: '', face_amount: 1500, min_order_amount: 0, valid_days: 30, is_active: true, issued_count: 18, created_at: '', updated_at: '' },
  { public_id: 'demo-order', name: '好友首单大额券', description: '', face_amount: 5000, min_order_amount: 19900, valid_days: 30, is_active: true, issued_count: 6, created_at: '', updated_at: '' },
]
function applyConfig(value: GrowthCampaignConfig) {
  form.enabled = value.invitation_enabled
  form.registrationTemplateId = value.registration_reward_template?.public_id || ''
  form.firstOrderTemplateId = value.first_order_reward_template?.public_id || ''
}
async function load() {
  loading.value = true
  try {
    if (props.preview) {
      templates.value = demoTemplates
      applyConfig({ newcomer_gift_enabled: true, invitation_enabled: true, newcomer_gift_templates: [], registration_reward_template: demoTemplates[0], first_order_reward_template: demoTemplates[1], updated_at: new Date().toISOString() })
    } else {
      const [templateResult, configResult] = await Promise.all([adminApi.couponTemplates(), adminApi.growthConfig()])
      templates.value = templateResult.items.filter((item) => item.is_active)
      applyConfig(configResult)
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '邀请规则加载失败') }
  finally { loading.value = false }
}
async function save() {
  if (!props.canManage) return
  if (form.enabled && (!form.registrationTemplateId || !form.firstOrderTemplateId)) return ElMessage.warning('启用前请完整配置两阶段奖励')
  saving.value = true
  try {
    if (props.preview) ElMessage.success('预览模式：配置校验通过')
    else {
      applyConfig(await adminApi.updateGrowthConfig({ invitation_enabled: form.enabled, registration_reward_template_public_id: form.registrationTemplateId || null, first_order_reward_template_public_id: form.firstOrderTemplateId || null }))
      ElMessage.success('邀请奖励规则已保存')
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '邀请规则保存失败') }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page rules-page" v-loading="loading">
    <header class="page-heading"><div><h1>邀请奖励</h1><p>采用“有效注册 + 首单完成”双阶段奖励，优惠券实际规则由模板统一维护。</p></div><el-button type="primary" :loading="saving" :disabled="!canManage" @click="save">保存配置</el-button></header>
    <section class="rule-card">
      <div class="rule-top"><div><h2>活动状态</h2><p>停用后不再接受新的邀请关系，历史记录和已发放优惠券不受影响。</p></div><el-switch v-model="form.enabled" :disabled="!canManage" active-text="已启用" inactive-text="已停用" /></div>
      <div class="timeline">
        <article><span>01</span><div><h3>好友有效注册</h3><p>首次创建账号、完成手机号校验并绑定唯一邀请人。</p><el-select v-model="form.registrationTemplateId" filterable clearable :disabled="!canManage" placeholder="选择邀请人注册奖励券"><el-option v-for="item in templates" :key="item.public_id" :value="item.public_id" :label="`${item.name} · ${formatMoney(item.face_amount)}`" /></el-select><div v-if="selectedRegistration" class="selection">邀请人获得 {{ formatMoney(selectedRegistration.face_amount) }} · {{ selectedRegistration.min_order_amount ? `满 ${formatMoney(selectedRegistration.min_order_amount) } 可用` : '无门槛' }}</div></div></article>
        <article><span>02</span><div><h3>新用户完成首单</h3><p>首笔达人服务订单进入已完成状态后，仅发放一次奖励。</p><el-select v-model="form.firstOrderTemplateId" filterable clearable :disabled="!canManage" placeholder="选择邀请人首单奖励券"><el-option v-for="item in templates" :key="item.public_id" :value="item.public_id" :label="`${item.name} · ${formatMoney(item.face_amount)}`" /></el-select><div v-if="selectedFirstOrder" class="selection">邀请人再得 {{ formatMoney(selectedFirstOrder.face_amount) }} · {{ selectedFirstOrder.min_order_amount ? `满 ${formatMoney(selectedFirstOrder.min_order_amount)} 可用` : '无门槛' }}</div></div></article>
      </div>
      <el-alert type="warning" :closable="false" show-icon title="同一新用户只能绑定一名邀请人；已有账号、重复注册、自邀和已停用账号均不计为有效邀请。" />
    </section>
  </div>
</template>

<style scoped>
.rules-page{min-height:calc(100vh - 76px)}.page-heading{margin-bottom:18px}.rule-card{padding:24px;border:1px solid var(--line);border-radius:12px;background:#fff}.rule-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line)}.rule-top h2{margin:0 0 6px;font-size:17px}.rule-top p,.page-heading p{margin:0;color:var(--muted)}.timeline{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}.timeline article{display:grid;grid-template-columns:42px 1fr;gap:14px;padding:20px;border:1px solid var(--line);border-radius:12px;background:#fafbfc}.timeline article>span{display:flex;width:38px;height:38px;align-items:center;justify-content:center;border-radius:12px;color:#fff;background:#16b7bd;font-size:12px;font-weight:700}.timeline h3{margin:2px 0 6px;font-size:15px}.timeline p{min-height:36px;margin:0 0 16px;color:var(--muted);font-size:12px}.el-select{width:100%}.selection{margin-top:12px;padding:10px 12px;border-radius:8px;color:#146e72;background:#eafafa;font-size:12px}@media(max-width:900px){.timeline{grid-template-columns:1fr}}
</style>
