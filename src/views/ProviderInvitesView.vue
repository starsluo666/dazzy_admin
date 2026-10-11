<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { InviteConfig, InviteSource, InviteReward, RewardAction } from '../types/providerInvites'

const props = defineProps<{ preview: boolean; canManage: boolean; canReview: boolean; canPay: boolean }>()
const tab = ref('rewards'), loading = ref(false), busy = ref(false), loaded = ref(false)
const config = ref<InviteConfig>({ enabled: false, store_reward_amount: 0, provider_reward_amount: 0, revision: 0 })
const sources = ref<InviteSource[]>([]), rewards = ref<InviteReward[]>([])
const sourcePage = ref(1), rewardPage = ref(1), sourceTotal = ref(0), rewardTotal = ref(0)
const filters = reactive({ status: '', kind: '', search: '' })
const sourceSearch = ref(''), sourceName = ref(''), createOpen = ref(false)
const qr = ref<InviteSource | null>(null), qrOpen = ref(false)
const selected = ref<InviteReward | null>(null), actionOpen = ref(false)
const action = reactive({ action: 'approve' as RewardAction['action'], note: '', transfer_reference: '', paid_at: '', confirmed: false })
const summary = ref<Array<{ status: string; count: number; amount: number }>>([])
const money = (value: number) => `¥${(value / 100).toFixed(2)}`
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
const statuses: Record<string, string> = { pending: '待财务审核', approved: '待人工打款', rejected: '审核不通过', paid: '已人工打款' }
const applications: Record<string, string> = { draft: '草稿', pending: '入驻待初审', approved: '入驻初审通过', rejected: '入驻被驳回', suspended: '资格已暂停' }
const storeYuan = computed({ get: () => config.value.store_reward_amount / 100, set: v => { config.value.store_reward_amount = Math.round(v * 100) } })
const providerYuan = computed({ get: () => config.value.provider_reward_amount / 100, set: v => { config.value.provider_reward_amount = Math.round(v * 100) } })
function fail(e: unknown) { ElMessage.error(e instanceof Error ? e.message : '操作失败') }
function writable() { if (props.preview) { ElMessage.info('预览模式不会保存或打款'); return false } return true }
async function loadRewards(reset = false) {
  if (reset) rewardPage.value = 1
  if (props.preview) return
  const params: Record<string, string | number> = { page: rewardPage.value, search: filters.search }
  if (filters.status) params.status = filters.status
  if (filters.kind) params.kind = filters.kind
  const result = await adminApi.providerInviteRewards(params)
  rewards.value = result.items; rewardTotal.value = result.pagination.total; summary.value = result.summary
}
async function loadSources(reset = false) {
  if (reset) sourcePage.value = 1
  if (props.preview) return
  const result = await adminApi.providerInviteSources({ page: sourcePage.value, search: sourceSearch.value })
  sources.value = result.items; sourceTotal.value = result.pagination.total
}
async function reload() {
  loading.value = true
  try {
    if (!props.preview) config.value = await adminApi.providerInviteConfig()
    await Promise.all([loadRewards(), loadSources()]); loaded.value = true
  } catch (e) { fail(e) } finally { loading.value = false }
}
async function queryRewards(reset = false) { loading.value = true; try { await loadRewards(reset) } catch (e) { fail(e) } finally { loading.value = false } }
async function querySources(reset = false) { loading.value = true; try { await loadSources(reset) } catch (e) { fail(e) } finally { loading.value = false } }
async function saveConfig() {
  if (!writable() || busy.value) return
  try {
    await ElMessageBox.confirm('新金额只对之后成功注册并提交入驻意向的新账号生效，历史奖励不变。是否保存？', '保存邀请规则')
    busy.value = true; config.value = await adminApi.saveProviderInviteConfig(config.value); ElMessage.success('规则已保存')
  } catch (e) { if (e !== 'cancel' && e !== 'close') fail(e) } finally { busy.value = false }
}
async function createSource() {
  if (!writable() || busy.value) return
  busy.value = true
  try { await adminApi.createProviderInviteSource(sourceName.value); createOpen.value = false; sourceName.value = ''; await loadSources(true); ElMessage.success('门店邀请已创建') }
  catch (e) { fail(e) } finally { busy.value = false }
}
async function toggleSource(source: InviteSource) {
  if (!writable() || busy.value) return
  try {
    await ElMessageBox.confirm(`${source.active ? '停用后新注册不能使用此邀请，已产生奖励仍保留。' : '恢复此邀请链接？'}`, '确认邀请状态')
    busy.value = true; await adminApi.updateProviderInviteSource({ ...source, active: !source.active }); await loadSources()
  } catch (e) { if (e !== 'cancel' && e !== 'close') fail(e) } finally { busy.value = false }
}
async function showQr(source: InviteSource) { try { qr.value = await adminApi.providerInviteQr(source.public_id); qrOpen.value = true } catch (e) { fail(e) } }
async function copyUrl(source: InviteSource) { try { await navigator.clipboard.writeText(source.invite_url); ElMessage.success('邀请链接已复制') } catch { ElMessage.warning('复制失败，请在二维码弹窗中手动复制链接') } }
function openAction(row: InviteReward, kind: RewardAction['action']) {
  selected.value = row; Object.assign(action, { action: kind, note: '', transfer_reference: '', paid_at: '', confirmed: false }); actionOpen.value = true
}
async function submitAction() {
  if (!selected.value || !writable() || busy.value) return
  if (!action.confirmed || action.note.trim().length < 2) { ElMessage.warning('请填写核验说明并勾选确认'); return }
  if (action.action === 'paid' && (!action.paid_at || !action.transfer_reference.trim())) { ElMessage.warning('请填写实际打款时间及流水号'); return }
  busy.value = true
  try {
    await adminApi.providerInviteRewardAction(selected.value.public_id, { ...action, revision: selected.value.revision,
      ...(action.action === 'paid' ? { paid_at: new Date(action.paid_at).toISOString() } : { paid_at: undefined }) })
    actionOpen.value = false; await loadRewards(); ElMessage.success('处理结果已记录')
  } catch (e) { fail(e) } finally { busy.value = false }
}
onMounted(reload)
</script>

<template>
  <div class="page invite-admin" v-loading="loading">
    <header class="page-heading"><div><h1>达人邀请</h1><p>门店与达人推荐新伙伴，注册与入驻意向提交成功后记一次奖励。</p></div><el-button @click="reload">刷新</el-button></header>
    <el-alert title="奖励独立核算，不进入订单余额。财务核验后线下打款，再登记结果；任何按钮都不会自动转账。" type="info" :closable="false" show-icon />
    <el-tabs v-model="tab">
      <el-tab-pane label="奖励台账" name="rewards">
        <div class="summary"><div v-for="state in ['pending', 'approved', 'paid', 'rejected']" :key="state" class="metric"><span>{{ statuses[state] }}</span><b>{{ money(summary.find(s => s.status === state)?.amount || 0) }}</b><small>{{ summary.find(s => s.status === state)?.count || 0 }} 笔 · 当前筛选</small></div></div>
        <div class="filters"><el-input v-model="filters.search" placeholder="邀请人 / 邀请码 / 新人手机号 / 姓名" clearable @keyup.enter="queryRewards(true)" /><el-select v-model="filters.kind" clearable placeholder="全部来源"><el-option label="门店" value="store" /><el-option label="达人" value="provider" /></el-select><el-select v-model="filters.status" clearable placeholder="全部状态"><el-option v-for="(label, key) in statuses" :key="key" :label="label" :value="key" /></el-select><el-button type="primary" @click="queryRewards(true)">查询</el-button></div>
        <el-table :data="rewards" empty-text="暂无邀请奖励"><el-table-column label="邀请来源" min-width="165"><template #default="{ row }"><b>{{ row.source_name_snapshot }}</b><div class="muted">{{ row.source.kind === 'store' ? '门店' : '达人' }} · {{ row.code_snapshot }}</div></template></el-table-column><el-table-column label="入驻新人" min-width="180"><template #default="{ row }"><b>{{ row.real_name }}</b><div class="muted">{{ row.invitee_phone_masked }} · {{ row.service_city_name }}</div><div class="muted">{{ applications[row.application_status] || row.application_status }}</div></template></el-table-column><el-table-column label="奖励" width="100"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column><el-table-column prop="status_label" label="财务状态" width="130" /><el-table-column label="登记时间" min-width="170"><template #default="{ row }">{{ date(row.created_at) }}</template></el-table-column><el-table-column label="操作" width="220" fixed="right"><template #default="{ row }"><el-button v-if="canReview && row.status === 'pending'" link type="primary" :disabled="busy" @click="openAction(row, 'approve')">审核通过</el-button><el-button v-if="canReview && row.status === 'pending'" link type="danger" :disabled="busy" @click="openAction(row, 'reject')">不通过</el-button><el-button v-if="canPay && row.status === 'approved'" link type="primary" :disabled="busy" @click="openAction(row, 'paid')">登记已打款</el-button><el-popover trigger="click" width="340"><template #reference><el-button link>记录</el-button></template><p>审核说明：{{ row.review_note || '—' }}</p><p>审核时间：{{ date(row.reviewed_at) }}</p><p>打款时间：{{ date(row.paid_at) }}</p><p>流水号：{{ row.transfer_reference || '—' }}</p><p>打款说明：{{ row.payout_note || '—' }}</p></el-popover></template></el-table-column></el-table>
        <el-pagination v-model:current-page="rewardPage" :page-size="20" :total="rewardTotal" layout="total, prev, pager, next" @current-change="queryRewards()" />
      </el-tab-pane>
      <el-tab-pane label="邀请来源 / 门店二维码" name="sources">
        <div class="filters"><el-input v-model="sourceSearch" clearable placeholder="门店 / 达人名称或邀请码" @keyup.enter="querySources(true)" /><el-button @click="querySources(true)">查询</el-button><el-button v-if="canManage" type="primary" @click="createOpen = true">新增门店邀请</el-button></div>
        <el-table :data="sources"><el-table-column prop="name" label="名称" min-width="180" /><el-table-column label="来源" width="100"><template #default="{ row }">{{ row.kind === 'store' ? '门店' : '达人' }}</template></el-table-column><el-table-column prop="code" label="邀请码" min-width="150" /><el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '停用' }}</el-tag></template></el-table-column><el-table-column label="操作" min-width="260"><template #default="{ row }"><el-button link type="primary" @click="showQr(row)">二维码</el-button><el-button link @click="copyUrl(row)">复制链接</el-button><el-button v-if="canManage" link :disabled="busy" @click="toggleSource(row)">{{ row.active ? '停用' : '启用' }}</el-button></template></el-table-column></el-table>
        <el-pagination v-model:current-page="sourcePage" :page-size="20" :total="sourceTotal" layout="total, prev, pager, next" @current-change="querySources()" />
      </el-tab-pane>
      <el-tab-pane label="奖励规则" name="config">
        <el-form class="config" label-position="top" :disabled="!canManage || busy || !loaded"><el-form-item label="开放达人邀请注册"><el-switch v-model="config.enabled" /></el-form-item><el-form-item label="门店每邀请一位的奖励（元）"><el-input-number v-model="storeYuan" :min="0" :max="10000" :precision="2" /></el-form-item><el-form-item label="达人每邀请一位的奖励（元）"><el-input-number v-model="providerYuan" :min="0" :max="10000" :precision="2" /></el-form-item><p class="muted">只奖励新手机号账号，须同时完整提交入驻意向。金额按注册时规则留存，后续调价不改变历史奖励；暂停活动不撤销已产生的奖励。</p><el-button v-if="canManage" type="primary" :loading="busy" @click="saveConfig">保存规则</el-button></el-form>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="createOpen" title="新增门店邀请" width="440px"><el-form label-position="top"><el-form-item label="门店公开名称"><el-input v-model="sourceName" maxlength="80" placeholder="将在邀请注册页展示" /></el-form-item><p class="muted">邀请码自动生成，归属不可更换。合作协议与收款信息由财务线下核验，不在公开页面展示。</p></el-form><template #footer><el-button @click="createOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="createSource">创建邀请</el-button></template></el-dialog>
    <el-dialog v-model="qrOpen" title="邀请二维码" width="440px"><div v-if="qr" class="qr"><h3>{{ qr.name }}</h3><img :src="qr.qr_data" width="240" height="240" alt="扫码注册并提交达人入驻意向" /><p>扫码注册成为达人</p><p class="muted">用户端 H5 专属邀请页 · 不是微信小程序码</p><el-input :model-value="qr.invite_url" readonly /><a :href="qr.qr_data" :download="`乐搭伴-${qr.code}.png`">下载二维码</a></div></el-dialog>
    <el-dialog v-model="actionOpen" :title="action.action === 'paid' ? '登记人工打款结果' : '财务审核邀请奖励'" width="520px" :close-on-click-modal="false" :before-close="(done: () => void) => { if (!busy) done() }"><template v-if="selected"><el-alert :title="`${selected.source_name_snapshot} · ${money(selected.amount)} · ${selected.real_name}（${selected.invitee_phone_masked}）`" :closable="false" /><el-form label-position="top" :disabled="busy"><el-form-item v-if="action.action === 'paid'" label="转账流水号（每笔奖励独立转账，不可重复登记）"><el-input v-model="action.transfer_reference" maxlength="100" /></el-form-item><el-form-item v-if="action.action === 'paid'" label="实际打款时间"><el-date-picker v-model="action.paid_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item><el-form-item :label="action.action === 'paid' ? '收款人核验及打款说明（不要填写完整银行卡号）' : '核验说明 / 不通过原因'"><el-input v-model="action.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item><el-checkbox v-model="action.confirmed">{{ action.action === 'paid' ? '已线下转账并核对收款人、金额、流水；本操作不发起转账' : action.action === 'approve' ? '已核验为真实新注册及入驻意向，奖励归属和金额无误' : '已核实不符合奖励条件并填写原因' }}</el-checkbox></el-form></template><template #footer><el-button :disabled="busy" @click="actionOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="submitAction">{{ action.action === 'paid' ? '确认登记已打款' : action.action === 'approve' ? '审核通过' : '审核不通过' }}</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.invite-admin{min-width:0}.page-heading{margin-bottom:16px}.el-tabs{margin-top:20px}.filters{display:flex;gap:10px;margin:16px 0}.filters .el-input{max-width:360px}.filters .el-select{width:160px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.metric{border:1px solid var(--line);border-radius:12px;background:#fff;padding:18px;display:flex;flex-direction:column;gap:8px}.metric span,.metric small,.muted{color:var(--muted);font-size:12px;line-height:1.8}.metric b{font-size:23px;font-variant-numeric:tabular-nums}.config{max-width:620px;background:white;padding:24px;border-radius:14px}.el-pagination{margin:18px 0;justify-content:flex-end}.qr{text-align:center}.qr img{display:block;margin:auto}.qr a{display:inline-block;padding:16px;color:#08787e}.el-form{margin-top:20px}.el-checkbox{height:auto;white-space:normal}:deep(.el-checkbox__label){white-space:normal;line-height:1.8}@media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}.filters{flex-wrap:wrap}}
</style>
