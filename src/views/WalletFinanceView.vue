<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminRechargeOrder, AdminWallet, RechargeCampaign, RechargeDiscountTier } from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const active = ref<'wallets' | 'orders' | 'config'>('wallets')
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const status = ref('')
const wallets = ref<AdminWallet[]>([])
const orders = ref<AdminRechargeOrder[]>([])
const total = ref(0)
const page = ref(1)
const form = reactive<RechargeCampaign>({
  is_enabled: false,
  unit_face_amount: 100000,
  max_quantity_per_order: 10,
  rules_text: '',
  tiers: [],
  updated_at: '',
})

const demoWallets: AdminWallet[] = [
  { user_public_id: 'demo', nickname: '林小雨', phone: '13800000000', available_balance: 185000, frozen_balance: 32000, total_balance: 217000, updated_at: new Date().toISOString() },
]
const demoOrders: AdminRechargeOrder[] = [
  { order_no: 'WRODEMO202609250001', nickname: '林小雨', phone: '13800000000', quantity: 2, credited_amount: 200000, discount_amount: 20000, payable_amount: 180000, status: 'paid', status_label: '已入账', paid_at: new Date().toISOString(), created_at: new Date().toISOString() },
]

function money(value: number) { return `¥${(value / 100).toFixed(2)}` }
function rateLabel(value: number) { return `${(value / 1000).toFixed(value % 1000 ? 2 : 1)} 折` }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }

function applyConfig(value: RechargeCampaign) {
  Object.assign(form, value, { tiers: value.tiers.map((item) => ({ ...item })) })
}

async function loadConfig() {
  if (props.preview) {
    applyConfig({ ...form, is_enabled: true, rules_text: '充值余额仅限平台消费，不可提现；退款按订单原支付构成退回。', tiers: [{ min_quantity: 1, discount_rate_bps: 9800 }, { min_quantity: 2, discount_rate_bps: 9500 }, { min_quantity: 5, discount_rate_bps: 9000 }] })
    return
  }
  try {
    applyConfig(await adminApi.rechargeCampaign())
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '充值配置加载失败')
  }
}

async function loadRows() {
  loading.value = true
  try {
    if (props.preview) {
      wallets.value = demoWallets
      orders.value = demoOrders
      total.value = 1
      return
    }
    if (active.value === 'wallets') {
      const data = await adminApi.wallets({ search: search.value, page: page.value, page_size: 20 })
      wallets.value = data.items
      total.value = data.pagination.total
    } else if (active.value === 'orders') {
      const data = await adminApi.rechargeOrders({ search: search.value, status: status.value, page: page.value, page_size: 20 })
      orders.value = data.items
      total.value = data.pagination.total
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败')
  } finally { loading.value = false }
}

async function searchRows() {
  page.value = 1
  await loadRows()
}

async function switchTab(value: 'wallets' | 'orders' | 'config') {
  active.value = value
  search.value = ''
  status.value = ''
  page.value = 1
  if (value === 'config') await loadConfig()
  else await loadRows()
}

function addTier() {
  const next = Math.min((form.tiers.at(-1)?.min_quantity || 0) + 1, form.max_quantity_per_order)
  form.tiers.push({ min_quantity: next, discount_rate_bps: 10000 })
}
function removeTier(index: number) { form.tiers.splice(index, 1) }

async function saveConfig() {
  if (!props.canManage) return ElMessage.warning('当前账号没有充值配置权限')
  saving.value = true
  try {
    const payload = {
      is_enabled: form.is_enabled,
      unit_face_amount: 100000,
      max_quantity_per_order: form.max_quantity_per_order,
      rules_text: form.rules_text,
      tiers: form.tiers.map<RechargeDiscountTier>((item) => ({ min_quantity: Number(item.min_quantity), discount_rate_bps: Number(item.discount_rate_bps) })),
    }
    if (props.preview) applyConfig({ ...form, ...payload, updated_at: new Date().toISOString() })
    else applyConfig(await adminApi.updateRechargeCampaign(payload))
    ElMessage.success('充值配置已保存，仅影响新创建的充值单')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally { saving.value = false }
}

onMounted(loadRows)
</script>

<template>
  <section class="wallet-finance">
    <header class="page-head">
      <div><h1>余额与充值</h1><p>查看用户钱包、充值订单，并配置按购买张数生效的充值折扣</p></div>
      <el-tag type="info" effect="plain">每张固定面值 {{ money(100000) }}</el-tag>
    </header>

    <el-tabs :model-value="active" class="finance-tabs" @tab-change="switchTab($event as 'wallets' | 'orders' | 'config')">
      <el-tab-pane label="用户钱包" name="wallets" />
      <el-tab-pane label="充值订单" name="orders" />
      <el-tab-pane label="充值配置" name="config" />
    </el-tabs>

    <template v-if="active !== 'config'">
      <div class="toolbar">
        <el-input v-model="search" clearable placeholder="搜索手机号、昵称或充值单号" @keyup.enter="searchRows" />
        <el-select v-if="active === 'orders'" v-model="status" clearable placeholder="全部状态">
          <el-option label="待支付" value="pending_payment" /><el-option label="已入账" value="paid" /><el-option label="已关闭" value="closed" />
        </el-select>
        <el-button type="primary" @click="searchRows">查询</el-button>
      </div>
      <el-card shadow="never">
        <el-table v-if="active === 'wallets'" v-loading="loading" :data="wallets">
          <el-table-column label="用户" min-width="180"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.nickname || '未设置昵称' }}</strong><span>{{ row.phone }}</span></div></template></el-table-column>
          <el-table-column label="可用余额" min-width="130"><template #default="{ row }"><strong class="amount">{{ money(row.available_balance) }}</strong></template></el-table-column>
          <el-table-column label="支付冻结" min-width="130"><template #default="{ row }">{{ money(row.frozen_balance) }}</template></el-table-column>
          <el-table-column label="总余额" min-width="130"><template #default="{ row }">{{ money(row.total_balance) }}</template></el-table-column>
          <el-table-column label="更新时间" min-width="180"><template #default="{ row }">{{ formatTime(row.updated_at) }}</template></el-table-column>
        </el-table>
        <el-table v-else v-loading="loading" :data="orders">
          <el-table-column label="充值单 / 用户" min-width="230"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.order_no }}</strong><span>{{ row.nickname || '未设置昵称' }} · {{ row.phone }}</span></div></template></el-table-column>
          <el-table-column label="购买" min-width="110"><template #default="{ row }">{{ row.quantity }} 张</template></el-table-column>
          <el-table-column label="面值到账" min-width="130"><template #default="{ row }"><strong>{{ money(row.credited_amount) }}</strong></template></el-table-column>
          <el-table-column label="优惠 / 实付" min-width="160"><template #default="{ row }"><div class="primary-cell"><strong class="amount">{{ money(row.payable_amount) }}</strong><span>优惠 {{ money(row.discount_amount) }}</span></div></template></el-table-column>
          <el-table-column label="状态" min-width="110"><template #default="{ row }"><el-tag :type="row.status === 'paid' ? 'success' : row.status === 'closed' ? 'info' : 'warning'">{{ row.status_label }}</el-tag></template></el-table-column>
          <el-table-column label="创建时间" min-width="180"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
        </el-table>
        <el-pagination v-if="total > 20" v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next, total" @current-change="loadRows" />
      </el-card>
    </template>

    <template v-else>
      <div class="config-grid">
        <el-card shadow="never">
          <template #header><div class="card-title"><strong>基础规则</strong><el-switch v-model="form.is_enabled" active-text="开放充值" :disabled="!canManage" /></div></template>
          <el-form label-position="top">
            <el-form-item label="单张面值"><el-input-number :model-value="1000" :disabled="true" :precision="2" /><p>当前业务规则固定为每张 1000 元，购买多张时按档位计算实付。</p></el-form-item>
            <el-form-item label="单次最多购买"><el-input-number v-model="form.max_quantity_per_order" :min="1" :max="99" :disabled="!canManage" /><span class="suffix">张</span></el-form-item>
            <el-form-item label="用户端说明"><el-input v-model="form.rules_text" type="textarea" :rows="3" maxlength="500" show-word-limit :disabled="!canManage" /></el-form-item>
          </el-form>
        </el-card>
        <el-card shadow="never">
          <template #header><div class="card-title"><div><strong>张数折扣</strong><small>匹配不高于购买张数的最高档位</small></div><el-button v-if="canManage" text type="primary" @click="addTier">新增档位</el-button></div></template>
          <div v-if="!form.tiers.length" class="empty-tiers">未配置时按原价充值</div>
          <div v-for="(tier, index) in form.tiers" :key="index" class="tier-row">
            <span>购买满</span><el-input-number v-model="tier.min_quantity" :min="1" :max="form.max_quantity_per_order" :disabled="!canManage" /><span>张，按</span><el-input-number v-model="tier.discount_rate_bps" :min="1" :max="10000" :step="100" :disabled="!canManage" /><strong>{{ rateLabel(tier.discount_rate_bps) }}</strong><el-button v-if="canManage" text type="danger" @click="removeTier(index)">删除</el-button>
          </div>
          <div class="example">示例：购买 2 张、配置 9.5 折，余额到账 {{ money(200000) }}，外部实付 {{ money(190000) }}。</div>
        </el-card>
      </div>
      <div class="save-bar"><span>折扣和面值会写入订单快照，修改配置不会影响历史充值单。</span><el-button type="primary" :loading="saving" :disabled="!canManage" @click="saveConfig">保存配置</el-button></div>
    </template>
  </section>
</template>

<style scoped>
.wallet-finance{display:flex;flex-direction:column;gap:18px}.page-head,.card-title,.toolbar,.save-bar{display:flex;align-items:center;justify-content:space-between;gap:16px}.page-head h1{margin:0;color:#17252b;font-size:24px}.page-head p{margin:7px 0 0;color:#7d8c93}.finance-tabs{padding:0 20px;border:1px solid #e4eaed;border-radius:14px;background:#fff}.toolbar{justify-content:flex-start}.toolbar .el-input{max-width:360px}.toolbar .el-select{width:160px}.primary-cell{display:flex;flex-direction:column;gap:5px}.primary-cell span,.card-title small{color:#8a989f;font-size:12px}.amount{color:#0aaeb5}.config-grid{display:grid;grid-template-columns:minmax(360px,.8fr) minmax(520px,1.2fr);gap:18px}.card-title>div{display:flex;flex-direction:column;gap:4px}.el-form-item p{margin:8px 0 0;color:#95a0a5;font-size:12px}.suffix{margin-left:8px}.tier-row{display:grid;grid-template-columns:auto 120px auto 150px 70px auto;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid #eef1f2}.tier-row strong{color:#0aaeb5}.empty-tiers{padding:30px;text-align:center;color:#9aa6ab}.example{margin-top:18px;padding:14px 16px;border-radius:10px;color:#5e777d;background:#eefafa}.save-bar{padding:16px 20px;border:1px solid #dce7e9;border-radius:12px;background:#fff}.save-bar span{color:#74868c;font-size:13px}@media(max-width:1000px){.config-grid{grid-template-columns:1fr}.tier-row{grid-template-columns:auto 100px auto 130px 60px auto}}
</style>
