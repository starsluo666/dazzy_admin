<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import { useOperationsWork } from '../composables/operationsWork'
import { financeWorkQueues, type FinanceWorkItem } from '../utils/operationsWork'
import { formatMoney, formatDateTime } from '../utils/format'

const props = defineProps<{ preview: boolean }>()
const route = useRoute()
const work = useOperationsWork()
const initialQueue = typeof route.query.todo === 'string' ? route.query.todo : ''
const queue = ref(financeWorkQueues.find(item => item.key === initialQueue)?.key || 'distribution_attention')
const search = ref(typeof route.query.search === 'string' ? route.query.search : '')
const page = ref(1)
const total = ref(0)
const rows = ref<FinanceWorkItem[]>([])
const loading = ref(false)
const error = ref('')
const selected = ref<FinanceWorkItem | null>(null)
const drawer = ref(false)
let sequence = 0
async function load() {
  const own = ++sequence
  loading.value = true
  error.value = ''
  try {
    if (props.preview) { rows.value = []; total.value = 0; return }
    const data = await adminApi.financeWork({ queue: queue.value, search: search.value.trim(), page: page.value,
      work_id: queue.value === initialQueue && typeof route.query.work_id === 'string' ? route.query.work_id : undefined })
    if (own !== sequence) return
    rows.value = data.items; total.value = data.total
    // Refreshing is read-only and never calls the channel or retries a money request.
    void work.refresh()
  } catch (cause) {
    if (own === sequence) { rows.value = []; total.value = 0; error.value = cause instanceof Error ? cause.message : '核查记录加载失败' }
  } finally { if (own === sequence) loading.value = false }
}
function select(item: FinanceWorkItem) { selected.value = item; drawer.value = true }
watch(queue, () => { search.value = ''; page.value = 1; drawer.value = false; void load() })
onMounted(load)
</script>

<template>
  <section class="finance-work">
    <header><div><h1>资金异常核查</h1><p>分账、提现和收入流水分开核实，保留原交易记录。</p></div><el-button :icon="Refresh" :loading="loading" @click="load">刷新本地记录</el-button></header>
    <el-alert type="warning" :closable="false" show-icon title="本页只读，不发起渠道查询或资金操作。结果待核实不等于失败；禁止通过新建分账、重复提现或直接改成功来处理异常。" />
    <div class="work-controls">
      <el-select v-model="queue" aria-label="资金异常类型"><el-option v-for="item in financeWorkQueues" :key="item.key" :label="item.label" :value="item.key" /></el-select>
      <el-input v-model="search" :prefix-icon="Search" clearable placeholder="搜索流水号 / 订单号；余额核账可搜索达人名称" @keyup.enter="page = 1; load()" />
      <el-button type="primary" @click="page = 1; load()">查询</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="当前没有需要核查的记录" @row-click="select">
      <el-table-column label="业务记录" min-width="230"><template #default="{ row }"><strong>{{ row.reference }}</strong><div class="muted">{{ row.order_no }}</div></template></el-table-column>
      <el-table-column label="达人" min-width="140" prop="provider_name" />
      <el-table-column :label="queue === 'income_reconciliation' ? '当前可用余额' : '达人金额'" min-width="120"><template #default="{ row }">{{ row.amount == null ? '待核实' : formatMoney(row.amount) }}</template></el-table-column>
      <el-table-column label="本地记录状态" min-width="180"><template #default="{ row }"><el-tag type="warning">{{ row.status_label }}</el-tag></template></el-table-column>
      <el-table-column label="最近核验 / 查询时间" min-width="175"><template #default="{ row }">{{ formatDateTime(row.last_queried_at) }}</template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click.stop="select(row)">核查详情</el-button></template></el-table-column>
    </el-table>
    <footer><span>共 {{ total }} 条 · 实际处理后自动移出待办</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" /></footer>
    <p class="muted">本地核账只检查已保存的渠道状态、账户冻结、余额汇总及关键入账流水，不代替汇付账单或银行到账对账。超时阈值仅用于提醒，不决定交易失败。</p>
    <el-drawer v-model="drawer" title="资金核查详情" size="520px">
      <template v-if="selected">
        <h2>{{ selected.provider_name }}</h2><p class="reference">{{ selected.reference }}</p>
        <el-alert :title="selected.reason" type="warning" :closable="false" show-icon />
        <el-table v-if="selected.checks.length" :data="selected.checks" class="balance-checks">
          <el-table-column prop="label" label="核对项" />
          <el-table-column label="账户汇总"><template #default="{ row }">{{ formatMoney(row.actual) }}</template></el-table-column>
          <el-table-column label="收入流水合计"><template #default="{ row }"><span :class="{ mismatch: row.actual !== row.expected }">{{ formatMoney(row.expected) }}</span></template></el-table-column>
        </el-table>
        <h3>核查步骤</h3>
        <ol><li>使用原流水核对渠道结果、金额、费用及实际到账情况。</li><li>对比平台分账、提现及收入流水，保留处理依据。</li><li>由财务按既有受控流程处理；本页不提供重发、补账或解除冻结按钮。</li></ol>
        <p class="muted">关闭详情或标为已读不会解除资金冻结，也不会删除异常。证据冲突须人工核账，不能仅凭一次正常查询消除。</p>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.finance-work{padding:28px}.finance-work header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}.finance-work h1{margin:0;font-size:24px}.finance-work header p,.muted{color:#728095;font-size:13px;line-height:1.7}.work-controls{display:flex;gap:12px;margin:20px 0}.work-controls .el-select{width:250px;flex-shrink:0}.work-controls .el-input{max-width:480px}.finance-work footer{display:flex;justify-content:space-between;align-items:center;padding:18px 0;color:#728095;font-size:13px}.reference{overflow-wrap:anywhere}.balance-checks{margin-top:24px}.mismatch{color:#c84040;font-weight:600}ol{padding-left:22px;line-height:2;font-size:14px}
</style>
