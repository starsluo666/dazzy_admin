<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AssetPicker from '../components/AssetPicker.vue'
import { adminApi } from '../services/api'
import type { AdminAsset, AdminCouponCampaign, CouponCampaignInput, CouponCampaignRule, CouponCampaignClaim } from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean; canUseAssets: boolean; canUploadAssets: boolean }>()
const items = ref<AdminCouponCampaign[]>([])
const templates = ref<Array<CouponCampaignRule & { public_id: string }>>([])
const loading = ref(false)
const saving = ref(false)
const acting = ref('')
const error = ref('')
const page = ref(1)
const total = ref(0)
const editor = ref(false)
const picker = ref(false)
const selected = ref<AdminCouponCampaign | null>(null)
const bannerUrl = ref('')
const form = reactive<CouponCampaignInput>({ name: '', banner_id: '', template_public_id: '', starts_at: '', ends_at: '', stock: 100, sort_order: 0 })
const rule = computed(() => selected.value?.published_at ? selected.value.coupon : templates.value.find(t => t.public_id === form.template_public_id))
const stateLabels: Record<string, string> = { draft: '草稿', offline: '已下架', active: '领取中', upcoming: '未开始', ended: '已结束', exhausted: '已领完' }
const records = ref<CouponCampaignClaim[]>([])
const recordCampaign = ref<AdminCouponCampaign | null>(null)
const recordPage = ref(1)
const recordTotal = ref(0)
const recordLoading = ref(false)
const recordError = ref('')
let loadVersion = 0
let recordVersion = 0
const money = (value: number) => (value / 100).toFixed(2).replace(/\.00$/, '')
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试'

async function load() {
  const version = ++loadVersion
  if (props.preview) return
  loading.value = true; error.value = ''
  try {
    const data = await adminApi.couponCampaigns(page.value)
    if (version !== loadVersion) return
    items.value = data.items; templates.value = data.templates; total.value = data.pagination.total
  } catch (e) { if (version === loadVersion) error.value = message(e) }
  finally { if (version === loadVersion) loading.value = false }
}
function edit(item: AdminCouponCampaign | null) {
  selected.value = item
  bannerUrl.value = item?.banner_url || ''
  Object.assign(form, { name: item?.name || '', banner_id: item?.banner_id || '', template_public_id: item?.template_public_id || '', starts_at: item?.starts_at || '', ends_at: item?.ends_at || '', stock: item?.stock || 100, sort_order: item?.sort_order || 0, revision: item?.revision })
  editor.value = true
}
function selectAsset(asset: AdminAsset | null) { form.banner_id = asset?.id || ''; bannerUrl.value = asset?.url || '' }
async function save() {
  if (saving.value || props.preview || !props.canManage) return
  if (!form.name.trim() || !form.banner_id || !form.template_public_id || !form.starts_at || !form.ends_at) { ElMessage.warning('请填写名称、图片、优惠券和领取时间'); return }
  if (new Date(form.ends_at) <= new Date(form.starts_at)) { ElMessage.warning('结束时间必须晚于开始时间'); return }
  saving.value = true
  try {
    await adminApi.saveCouponCampaign(selected.value?.public_id || null, { ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() })
    editor.value = false
    ElMessage.success(selected.value ? '活动已保存' : '草稿已保存，确认后可上架')
    await load()
  } catch (e) { ElMessage.error(message(e)) }
  finally { saving.value = false }
}
async function changeStatus(item: AdminCouponCampaign) {
  if (acting.value || props.preview || !props.canManage) return
  const action = item.status === 'published' ? 'offline' : 'publish'
  try {
    await ElMessageBox.confirm(action === 'publish' ? `确认上架「${item.name}」？活动面向全平台用户，每人限领一张，剩余库存 ${item.remaining_count} 张。首次上架将锁定券规则。` : '下架后首页不再展示，停止新领取，已领取的优惠券不受影响。', action === 'publish' ? '确认上架' : '确认下架', { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' })
  } catch { return }
  acting.value = item.public_id
  try { await adminApi.couponCampaignAction(item.public_id, action, item.revision); ElMessage.success('活动状态已更新'); await load() }
  catch (e) { ElMessage.error(message(e)); await load() }
  finally { acting.value = '' }
}
function showRecords(item: AdminCouponCampaign) { recordCampaign.value = item; recordPage.value = 1; void loadRecords() }
async function loadRecords() {
  const version = ++recordVersion
  if (!recordCampaign.value || props.preview) return
  recordLoading.value = true; recordError.value = ''
  try {
    const data = await adminApi.couponCampaignClaims(recordCampaign.value.public_id, recordPage.value)
    if (version !== recordVersion) return
    records.value = data.items; recordTotal.value = data.pagination.total
  } catch (e) { if (version === recordVersion) recordError.value = message(e) }
  finally { if (version === recordVersion) recordLoading.value = false }
}
function closeRecords() { recordVersion++; recordCampaign.value = null; records.value = []; recordTotal.value = 0; recordLoading.value = false }
onMounted(load)
onBeforeUnmount(() => { loadVersion++; recordVersion++ })
</script>

<template>
  <section class="campaign-page">
    <header class="campaign-header"><div><h1>领券活动</h1><p>把活动放到首页，让用户主动领取好礼。</p></div><el-button v-if="canManage" type="primary" :disabled="preview" @click="edit(null)">新建领券活动</el-button></header>
    <el-alert v-if="preview" title="预览模式不读取或修改真实活动" :closable="false" />
    <div class="campaign-guidance">首页展示图片轮播，领取按钮叠在图片上。按排序展示最多 20 场可领取活动，数字越小越靠前。每人每场限领一次，优惠券规则在首次上架时锁定。</div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="load">重新加载</el-button></el-alert>
    <el-table v-loading="loading" :data="items" class="campaign-table" empty-text="还没有领券活动，先创建一个草稿吧">
      <el-table-column label="活动" min-width="250"><template #default="{ row }"><div class="campaign-cell"><img :src="row.banner_url" alt="活动图片" /><div><strong>{{ row.name }}</strong><small>{{ row.coupon.name }} · ¥{{ money(row.coupon.face_amount) }}</small></div></div></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.state === 'active' ? 'success' : 'info'">{{ stateLabels[row.state] || row.state }}</el-tag></template></el-table-column>
      <el-table-column label="领取时间" min-width="180"><template #default="{ row }"><small>{{ date(row.starts_at) }}<br />至 {{ date(row.ends_at) }}</small></template></el-table-column>
      <el-table-column label="已领 / 库存" width="112"><template #default="{ row }">{{ row.issued_count }} / {{ row.stock }}</template></el-table-column>
      <el-table-column prop="used_count" label="已使用" width="76" />
      <el-table-column prop="sort_order" label="排序" width="66" />
      <el-table-column label="操作" width="215" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="edit(row)">{{ canManage ? '编辑 / 预览' : '查看' }}</el-button><el-button link @click="showRecords(row)">领取记录</el-button><el-button v-if="canManage" link :loading="acting === row.public_id" :disabled="!!acting" @click="changeStatus(row)">{{ row.status === 'published' ? '下架' : '上架' }}</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="total, prev, pager, next" class="campaign-pagination" @current-change="load" />

    <el-drawer v-model="editor" :title="selected ? '活动配置与预览' : '新建领券活动'" size="min(940px, 96vw)" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" destroy-on-close>
      <div class="campaign-editor">
        <el-form label-position="top" :disabled="saving || !canManage" class="campaign-form">
          <el-alert v-if="selected?.status === 'published'" title="当前活动已上架，保存修改后立即生效。" type="info" :closable="false" class="editor-notice" />
          <el-form-item label="活动名称"><el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：周末搭伴好礼" /></el-form-item>
          <el-form-item label="活动图片"><el-button :disabled="!canUseAssets" @click="picker = true">{{ form.banner_id ? '更换图片' : '从素材库选择图片' }}</el-button><p class="field-help">建议 1080 × 616，左下角留出按钮空间。金额和文案请设计在图片内，不另设白色信息栏。</p></el-form-item>
          <el-form-item label="优惠券"><el-select v-model="form.template_public_id" :disabled="!!selected?.published_at" placeholder="选择优惠券模板" class="full-width"><el-option v-if="selected?.published_at" :value="selected.template_public_id" :label="selected.coupon.name" /><template v-else><el-option v-for="t in templates" :key="t.public_id" :value="t.public_id" :label="`${t.name} · ¥${money(t.face_amount)}`" /></template></el-select><p class="field-help">{{ selected?.published_at ? '首次发布时的券规则已锁定；需要换券请新建活动。停用模板不会停止本活动，请用下架操作。' : '请选择已启用的模板；模板可在营销管理 → 优惠券管理中创建。' }}</p></el-form-item>
          <el-form-item label="开始领取时间"><el-date-picker v-model="form.starts_at" type="datetime" placeholder="请选择开始时间" class="full-width" /></el-form-item>
          <el-form-item label="结束领取时间"><el-date-picker v-model="form.ends_at" type="datetime" placeholder="请选择结束时间" class="full-width" /></el-form-item>
          <div class="campaign-grid"><el-form-item label="总库存（张）"><el-input-number v-model="form.stock" :min="Math.max(1, selected?.issued_count || 0)" :max="1000000" :precision="0" /></el-form-item><el-form-item label="排序（越小越靠前）"><el-input-number v-model="form.sort_order" :min="0" :max="9999" :precision="0" /></el-form-item></div>
          <p class="field-help">每个用户每场限领一张；已领券被使用、过期或撤销后也不能重复领取。只有领取才会发券，不会全员自动发放。</p>
        </el-form>
        <aside class="campaign-preview"><span class="preview-label">首页效果预览</span><div class="preview-banner"><img v-if="bannerUrl" :src="bannerUrl" alt="首页活动预览" /><div v-else class="preview-placeholder">选择一张活动图片</div><span class="preview-cta">领取好礼 ›</span></div><div class="preview-dots"><i class="active" /><i /><i /></div><span class="preview-label">点击图片后 · 领券弹层</span><div class="preview-sheet"><h3>{{ form.name || '活动名称' }}</h3><template v-if="rule"><div class="preview-coupon"><b>¥{{ money(rule.face_amount) }}</b><span>{{ rule.name }}<small>订单原价超过 ¥{{ money(rule.min_order_amount) }} 可用</small></span></div><p>领取后 {{ rule.valid_days }} 天内有效 · 每人限领 1 张</p><p>{{ rule.description || '达人服务订单可用，每笔订单限用一张。' }}</p></template><div class="preview-submit">立即领取</div></div><p class="field-help">示意预览，不会实际领取或发券。首页支持左右滑动，不自动弹出领取窗口。</p></aside>
      </div>
      <template #footer><el-button :disabled="saving" @click="editor = false">关闭</el-button><el-button v-if="canManage" type="primary" :loading="saving" :disabled="preview" @click="save">{{ selected ? '保存修改' : '保存草稿' }}</el-button></template>
    </el-drawer>
    <AssetPicker v-model="picker" kind="image" :selected-id="form.banner_id || null" :can-upload="canUploadAssets" :preview="preview" @select="selectAsset" />
    <el-dialog :model-value="!!recordCampaign" :title="`${recordCampaign?.name || ''} · 领取记录`" width="min(820px, 96vw)" @close="closeRecords">
      <el-alert v-if="recordError" :title="recordError" type="error" :closable="false"><el-button link @click="loadRecords">重试</el-button></el-alert>
      <el-table v-loading="recordLoading" :data="records" empty-text="暂无领取记录"><el-table-column prop="nickname" label="用户" /><el-table-column prop="phone_masked" label="手机号" /><el-table-column label="领取时间" min-width="170"><template #default="{ row }">{{ date(row.claimed_at) }}</template></el-table-column><el-table-column label="券状态"><template #default="{ row }">{{ ({ available: '未使用', used: '已使用', expired: '已过期', revoked: '已撤销', reserved: '订单占用中' } as Record<string, string>)[row.coupon.status] || row.coupon.status }}</template></el-table-column></el-table>
      <el-pagination v-model:current-page="recordPage" :page-size="20" :total="recordTotal" layout="total, prev, pager, next" class="campaign-pagination" @current-change="loadRecords" />
    </el-dialog>
  </section>
</template>

<style scoped>
.campaign-page{padding:24px;max-width:1600px;margin:auto}.campaign-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}.campaign-header h1{font-size:24px;margin:0 0 8px;letter-spacing:-.5px}.campaign-header p,.field-help{font-size:12px;color:#75848b;line-height:1.7;margin:6px 0}.campaign-guidance{padding:16px 20px;background:#e8f7f6;border:1px solid #d5efed;color:#33676b;border-radius:14px;margin-bottom:20px;font-size:13px;line-height:1.7}.campaign-table{border-radius:14px}.campaign-cell{display:flex;align-items:center;gap:12px;padding:10px 0}.campaign-cell img{width:96px;height:55px;object-fit:cover;border-radius:8px;background:#eef5f5}.campaign-cell strong{display:block;font-weight:600}.campaign-cell small{display:block;color:#7d8b91;margin-top:4px}.campaign-pagination{justify-content:flex-end;margin-top:20px}.campaign-editor{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:32px}.full-width{width:100%!important}.campaign-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.campaign-grid .el-input-number{width:100%}.campaign-preview{padding:18px;background:#f1f6f6;border-radius:20px;align-self:start}.preview-label{display:block;color:#6b8284;font-size:12px;margin-bottom:12px}.preview-banner{position:relative;aspect-ratio:1080/616;overflow:hidden;border-radius:16px;background:#e0ecec}.preview-banner img{width:100%;height:100%;object-fit:cover}.preview-placeholder{height:100%;display:grid;place-items:center;color:#71898b;font-size:13px}.preview-cta{position:absolute;bottom:16px;left:16px;background:#fff;color:#086a70;padding:12px 20px;border-radius:24px;font-size:14px;font-weight:600;box-shadow:0 3px 12px #092e3212}.preview-dots{display:flex;gap:5px;justify-content:center;margin:12px 0 28px}.preview-dots i{width:5px;height:5px;background:#c9dcdc;border-radius:9px}.preview-dots .active{width:16px;background:#0ab8bd}.preview-sheet{background:white;padding:20px;border-radius:20px}.preview-sheet h3{margin:0 0 18px;font-size:18px}.preview-sheet p{font-size:12px;line-height:1.7;color:#75848b;white-space:pre-wrap}.preview-coupon{display:flex;align-items:center;gap:12px}.preview-coupon b{font-size:32px;color:#ea622d}.preview-coupon span{font-size:14px;font-weight:600}.preview-coupon small{display:block;font-size:11px;color:#75848b;margin-top:6px;font-weight:400}.preview-submit{margin-top:18px;padding:12px;text-align:center;border-radius:12px;background:#087b80;color:white;font-size:14px;font-weight:600}@media(max-width:760px){.campaign-editor{grid-template-columns:1fr}.campaign-page{padding:12px}.campaign-preview{max-width:360px;width:100%;box-sizing:border-box}.campaign-header{align-items:flex-start}}
</style>
