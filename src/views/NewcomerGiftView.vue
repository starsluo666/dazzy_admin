<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminCouponTemplate, GrowthCampaignConfig } from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const loading = ref(false)
const saving = ref(false)
const templates = ref<AdminCouponTemplate[]>([])
const config = ref<GrowthCampaignConfig | null>(null)
const form = reactive({ enabled: false, templateIds: [] as string[] })
const demoTemplates: AdminCouponTemplate[] = [
  { public_id: 'demo-15', name: '新人无门槛券', description: '订单原价任意金额可用', face_amount: 1500, min_order_amount: 0, valid_days: 30, is_active: true, issued_count: 18, created_at: '', updated_at: '' },
  { public_id: 'demo-20', name: '新人满减券', description: '达人服务订单可用', face_amount: 2000, min_order_amount: 9900, valid_days: 30, is_active: true, issued_count: 12, created_at: '', updated_at: '' },
  { public_id: 'demo-50', name: '新人进阶满减券', description: '达人服务订单可用', face_amount: 5000, min_order_amount: 19900, valid_days: 30, is_active: true, issued_count: 6, created_at: '', updated_at: '' },
]
const selectedTemplates = computed(() => form.templateIds
  .map((id) => templates.value.find((item) => item.public_id === id))
  .filter((item): item is AdminCouponTemplate => Boolean(item)))
const formatMoney = (amount: number) => `¥${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`

function applyConfig(value: GrowthCampaignConfig) {
  config.value = value
  form.enabled = value.newcomer_gift_enabled
  form.templateIds = value.newcomer_gift_templates.map((item) => item.public_id)
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      templates.value = demoTemplates
      applyConfig({ newcomer_gift_enabled: true, invitation_enabled: true, newcomer_gift_templates: demoTemplates, registration_reward_template: demoTemplates[0], first_order_reward_template: demoTemplates[2], updated_at: new Date().toISOString() })
    } else {
      const [templateResult, configResult] = await Promise.all([adminApi.couponTemplates(), adminApi.growthConfig()])
      templates.value = templateResult.items.filter((item) => item.is_active)
      applyConfig(configResult)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '新人礼包配置加载失败')
  } finally { loading.value = false }
}

async function save() {
  if (!props.canManage) return
  if (form.enabled && !form.templateIds.length) return ElMessage.warning('启用前至少选择一张优惠券')
  saving.value = true
  try {
    if (props.preview) {
      ElMessage.success('预览模式：配置校验通过')
    } else {
      applyConfig(await adminApi.updateGrowthConfig({
        newcomer_gift_enabled: form.enabled,
        newcomer_gift_template_public_ids: form.templateIds,
      }))
      ElMessage.success('新人礼包配置已保存')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '新人礼包配置保存失败')
  } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page growth-page" v-loading="loading">
    <header class="page-heading">
      <div><h1>新人礼包</h1><p>为通过邀请注册的新用户自动发放多张优惠券，金额、门槛和有效期继承优惠券模板。</p></div>
      <el-button type="primary" :loading="saving" :disabled="!canManage" @click="save">保存配置</el-button>
    </header>

    <section class="config-grid">
      <div class="config-card">
        <div class="card-heading"><div><h2>礼包规则</h2><p>注册成功后自动到账，每位有效新用户仅发放一次。</p></div><el-switch v-model="form.enabled" :disabled="!canManage" active-text="已启用" inactive-text="已停用" /></div>
        <el-form label-position="top">
          <el-form-item label="礼包优惠券（最多 10 张）" required>
            <el-select v-model="form.templateIds" multiple filterable collapse-tags :max-collapse-tags="3" :disabled="!canManage" placeholder="请选择启用中的优惠券模板">
              <el-option v-for="item in templates" :key="item.public_id" :value="item.public_id" :label="`${item.name} · ${formatMoney(item.face_amount)}`" />
            </el-select>
          </el-form-item>
        </el-form>
        <el-alert type="info" :closable="false" show-icon title="礼包仅发给通过有效邀请链接首次注册的账号；已有账号再次登录不会重复领取。" />
      </div>

      <aside class="preview-card">
        <span class="preview-label">用户端预览</span>
        <div class="gift-preview">
          <small>新人专属礼包</small><strong>{{ selectedTemplates.length }} 张优惠券</strong><p>注册成功自动放入账户</p>
        </div>
        <div v-if="selectedTemplates.length" class="coupon-list">
          <div v-for="item in selectedTemplates" :key="item.public_id" class="coupon-row"><i>{{ item.min_order_amount ? '满减' : '无门槛' }}</i><div><b>{{ item.name }} · {{ formatMoney(item.face_amount) }}</b><span>{{ item.min_order_amount ? `订单原价大于 ${formatMoney(item.min_order_amount)} 可用` : '订单原价任意金额可用' }} · {{ item.valid_days }} 天有效</span></div></div>
        </div>
        <el-empty v-else :image-size="70" description="选择优惠券后显示礼包预览" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.growth-page{min-height:calc(100vh - 76px)}.page-heading{margin-bottom:18px}.config-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,.8fr);gap:18px}.config-card,.preview-card{padding:22px;border:1px solid var(--line);border-radius:12px;background:#fff}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.card-heading h2{margin:0 0 6px;font-size:17px}.card-heading p,.page-heading p{margin:0;color:var(--muted)}.el-select{width:100%}.preview-card{align-self:start;background:linear-gradient(160deg,#f8f7ff,#fff)}.preview-label{color:var(--muted);font-size:12px}.gift-preview{margin:14px 0;padding:28px 24px;border-radius:16px;color:#fff;background:linear-gradient(135deg,#755be8,#5140ca)}.gift-preview small,.gift-preview strong,.gift-preview p{display:block}.gift-preview strong{margin-top:6px;font-size:28px}.gift-preview p{margin:5px 0 0;color:#e7e2ff}.coupon-list{display:flex;flex-direction:column}.coupon-row{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}.coupon-row:last-child{border-bottom:0}.coupon-row i{display:flex;width:48px;height:48px;align-items:center;justify-content:center;border-radius:12px;color:#fff;background:#19b8bd;font-size:12px;font-style:normal}.coupon-row div{display:flex;min-width:0;flex-direction:column;gap:4px}.coupon-row b{font-size:13px}.coupon-row span{overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1000px){.config-grid{grid-template-columns:1fr}}
</style>
