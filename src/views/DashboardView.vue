<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatLongDate, formatMoney } from '../utils/format'
import { providerReviewModeForTodo, type ProviderReviewMode } from '../utils/providerReviews'
import { useOperationsWork } from '../composables/operationsWork'
import { workGroups, waitLabel, type WorkTarget } from '../utils/operationsWork'

type TrendDays = 7 | 30
type TrendPoint = { date: string; transaction_amount: number; order_count: number }

const props = defineProps<{ preview: boolean }>()
const emit = defineEmits<{ reviewProvider: [mode: ProviderReviewMode]; reviewActivity: []; openWork: [target: WorkTarget] }>()
const work = useOperationsWork()
const liveTodos = computed(() => work.summary.value?.todos.filter(todo => todo.count > 0) || [])
const metrics = ref<Record<string, number | null>>({})
const todos = ref<Array<{ key: string; label: string; count: number; priority: string }>>([])
const trendDays = ref<TrendDays>(7)
const trendPoints = ref<TrendPoint[]>([])
const loading = ref(false)
const demoMetrics = {
  today_new_users: 128,
  pending_providers: 24,
  active_orders: 316,
  pending_activities: 18,
  week_transaction_amount: 8642000,
}
const demoAmounts = [420000, 690000, 440000, 850000, 910000, 620000, 880000]
const demoOrders = [18, 24, 12, 29, 34, 21, 36]

const dateLabel = formatLongDate(new Date())
const cards = computed(() => [
  { label: '今日新增用户', value: metrics.value.today_new_users ?? '—', trend: props.preview ? '+12.6% ↗' : '实时数据', tone: 'cyan', icon: '人' },
  { label: '达人审核待办', value: props.preview ? metrics.value.pending_providers ?? 0 : (work.summary.value?.todos.filter(todo => todo.group === 'review' && todo.key.startsWith('provider_')).reduce((sum, todo) => sum + todo.count, 0) ?? 0), trend: props.preview ? '较昨日 +6' : '实时待办', tone: 'orange', icon: '审' },
  { label: '进行中订单', value: metrics.value.active_orders ?? 0, trend: props.preview ? '+8.2% ↗' : '实时数据', tone: 'blue', icon: '单' },
  { label: '近7日交易额', value: formatMoney(metrics.value.week_transaction_amount), trend: props.preview ? '+15.3% ↗' : '已支付订单', tone: 'orange', icon: '¥' },
])

function demoTrend(days: TrendDays): TrendPoint[] {
  const today = new Date()
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - index - 1))
    const patternIndex = index % demoAmounts.length
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      transaction_amount: demoAmounts[patternIndex],
      order_count: demoOrders[patternIndex],
    }
  })
}

const hasTrendData = computed(() => trendPoints.value.some(
  (point) => point.transaction_amount > 0 || point.order_count > 0,
))
const chartPoints = computed(() => {
  const count = trendPoints.value.length
  const transactionMax = Math.max(...trendPoints.value.map((point) => point.transaction_amount), 1)
  const orderMax = Math.max(...trendPoints.value.map((point) => point.order_count), 1)
  return trendPoints.value.map((point, index) => {
    const x = count <= 1 ? 60 : 60 + (570 * index) / (count - 1)
    return {
      ...point,
      x,
      transactionY: 185 - (145 * point.transaction_amount) / transactionMax,
      orderY: 185 - (145 * point.order_count) / orderMax,
    }
  })
})
const transactionLine = computed(() => chartPoints.value.map(
  (point) => `${point.x.toFixed(1)},${point.transactionY.toFixed(1)}`,
).join(' '))
const orderLine = computed(() => chartPoints.value.map(
  (point) => `${point.x.toFixed(1)},${point.orderY.toFixed(1)}`,
).join(' '))
const axisPoints = computed(() => {
  const step = Math.max(1, Math.ceil(chartPoints.value.length / 7))
  return chartPoints.value.filter((_, index, points) => index % step === 0 || index === points.length - 1)
})

function formatAxisDate(date: string) {
  return date.slice(5).replace('-', '/')
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      metrics.value = demoMetrics
      trendPoints.value = demoTrend(trendDays.value)
      todos.value = [
        { key: 'provider_application_review', label: '达人入驻初审', count: 6, priority: 'high' },
        { key: 'provider_onboarding_review', label: '达人开通审核', count: 10, priority: 'high' },
        { key: 'provider_profile_review', label: '达人资料变更审核', count: 5, priority: 'high' },
        { key: 'provider_service_review', label: '达人服务变更审核', count: 3, priority: 'high' },
        { key: 'activity_review', label: '活动发布审核', count: 18, priority: 'medium' },
      ]
      return
    }
    const data = await adminApi.overview(trendDays.value)
    metrics.value = data.metrics
    trendPoints.value = data.trend.points
    todos.value = data.todos
    await work.refresh()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '运营数据加载失败')
  } finally {
    loading.value = false
  }
}

async function selectTrendDays(days: TrendDays) {
  if (trendDays.value === days) return
  trendDays.value = days
  await load()
}

onMounted(load)

function handleTodo(key: string) {
  const mode = providerReviewModeForTodo(key)
  if (mode) emit('reviewProvider', mode)
  if (key === 'activity_review') emit('reviewActivity')
}

function openPendingProviderReview() {
  const todo = todos.value.find(item => item.count > 0 && providerReviewModeForTodo(item.key))
  emit('reviewProvider', todo ? providerReviewModeForTodo(todo.key)! : 'application')
}
</script>

<template>
  <div v-loading="loading" class="page dashboard-page">
    <div class="page-heading">
      <div><h1>运营总览</h1><p>{{ dateLabel }} · 平台实时运营数据</p></div>
      <div>
        <el-button :icon="Download" disabled>导出数据</el-button>
        <el-button type="primary" :icon="Refresh" @click="load">刷新数据</el-button>
      </div>
    </div>

    <div class="alert-bar review-alert">
      <span v-if="!preview">当前有 {{ work.summary.value?.total || 0 }} 项待处理，其中 {{ work.summary.value?.overdue_count || 0 }} 项超时。待办每 30 秒自动更新。</span>
      <span v-else>当前有 {{ metrics.pending_providers || 0 }} 条达人审核、{{ metrics.pending_activities || 0 }} 条活动审核待处理</span>
      <div v-if="preview" class="review-alert-actions">
        <el-button link type="primary" @click="openPendingProviderReview">处理达人审核</el-button>
        <el-button link type="primary" @click="emit('reviewActivity')">处理活动审核</el-button>
      </div>
    </div>

    <section class="metric-grid">
      <article v-for="card in cards" :key="card.label">
        <i :class="card.tone">{{ card.icon }}</i>
        <div><span>{{ card.label }}</span><strong>{{ card.value }}</strong><em :class="card.tone">{{ card.trend }}</em></div>
        <b v-if="preview" class="spark">⌁⌁⌁</b>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="data-panel trend-panel">
        <header>
          <h2>交易与订单趋势</h2>
          <div class="range-switch" aria-label="趋势时间范围">
            <button :class="{ active: trendDays === 7 }" @click="selectTrendDays(7)">近7天</button>
            <button :class="{ active: trendDays === 30 }" @click="selectTrendDays(30)">近30天</button>
          </div>
        </header>
        <div class="legend"><i />交易额（元）　 <i class="blue" />订单量（单）</div>
        <div class="chart-wrap">
          <svg viewBox="0 0 680 230" role="img" aria-label="交易与订单趋势折线图">
            <g class="grid-lines"><path d="M60 40H650M60 88H650M60 136H650M60 185H650" /></g>
            <polyline v-if="chartPoints.length" class="line cyan-line" :points="transactionLine" />
            <polyline v-if="chartPoints.length" class="line blue-line" :points="orderLine" />
            <g v-if="trendDays === 7" class="chart-dots">
              <template v-for="point in chartPoints" :key="point.date">
                <circle class="cyan-dot" :cx="point.x" :cy="point.transactionY" r="4">
                  <title>{{ point.date }} 交易额 {{ formatMoney(point.transaction_amount) }}</title>
                </circle>
                <circle class="blue-dot" :cx="point.x" :cy="point.orderY" r="4">
                  <title>{{ point.date }} 订单量 {{ point.order_count }} 单</title>
                </circle>
              </template>
            </g>
            <g class="axis">
              <text v-for="point in axisPoints" :key="point.date" :x="point.x" y="215">{{ formatAxisDate(point.date) }}</text>
            </g>
          </svg>
          <p v-if="!hasTrendData" class="trend-empty">所选时间范围内暂无订单数据</p>
        </div>
      </article>
      <article class="data-panel todo-panel">
        <header><h2>实时待办</h2><span v-if="work.summary.value" class="work-updated">更新于 {{ new Date(work.summary.value.updated_at).toLocaleTimeString('zh-CN', { hour12: false }) }}</span></header>
        <el-alert v-if="work.error.value" :title="work.error.value" type="warning" :closable="false" />
        <template v-if="!preview">
          <section v-for="group in workGroups" :key="group.key" class="work-group">
            <h3 v-if="liveTodos.some(todo => todo.group === group.key)">{{ group.label }}</h3>
            <button v-for="todo in liveTodos.filter(item => item.group === group.key)" :key="todo.key" class="work-row" @click="emit('openWork', todo.target)">
              <span class="work-copy"><b>{{ todo.label }}</b><small>最长等待 {{ waitLabel(todo.oldest_at) }}<template v-if="todo.overdue_count"> · {{ todo.overdue_count }} 项超时</template></small></span>
              <strong :class="{ overdue: todo.overdue_count > 0 }">{{ todo.count }}</strong><span class="work-action">去处理 ›</span>
            </button>
          </section>
          <p v-if="!liveTodos.length" class="empty-overview">{{ work.summary.value ? '当前没有待处理事项' : '正在获取待办…' }}</p>
          <p class="work-footnote">数量按待办事项统计，同一订单可能涉及不同事项。超时仅用于提醒，不改变退款或扣分规则。</p>
        </template>
        <button v-for="todo in preview ? todos : []" :key="todo.key" @click="handleTodo(todo.key)">
          <i>审</i><span>{{ todo.label }}</span><strong>{{ todo.count }}</strong>
          <em :class="todo.priority">{{ todo.priority === 'high' ? '高' : '中' }}</em><b>去处理 ›</b>
        </button>
        <p v-if="preview && !todos.length" class="empty-overview">当前没有待处理事项</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.work-updated,.work-footnote{color:#758392;font-size:12px}.work-footnote{line-height:1.7;margin:18px 0 0}.work-group h3{font-size:12px;letter-spacing:.04em;color:#7a8793;margin:20px 0 4px}.todo-panel .work-row{display:flex;gap:14px;width:100%;align-items:center;text-align:left;min-height:68px;border:0;border-bottom:1px solid #edf0f3;background:transparent;padding:10px 0;cursor:pointer}.work-copy{display:flex!important;flex:1;min-width:0;flex-direction:column;gap:6px}.work-copy b{font-size:14px;font-weight:600;color:#243446}.work-copy small{font-size:12px;color:#738291}.work-row>strong{font-size:22px;font-variant-numeric:tabular-nums;color:#263a49}.work-row>strong.overdue{color:#d55a3d}.work-action{font-size:12px;color:var(--brand)}.work-row:focus-visible{outline:2px solid var(--brand);outline-offset:3px}.work-row:active{background:#f1fafa}
.review-alert { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.work-group{padding:0 18px}.todo-panel .work-row{height:auto}.todo-panel .work-row>span{margin-left:0}.todo-panel .work-row>strong{margin-left:0;font-weight:600}.work-footnote{padding:0 18px 14px}
.review-alert > span { margin: 0; }
.review-alert-actions { display: flex; gap: 12px; }
.range-switch {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 6px;
  background: #f3f6f7;
}
.range-switch button {
  padding: 4px 10px;
  border: 0;
  border-radius: 4px;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
}
.range-switch button.active {
  color: var(--brand);
  background: #fff;
  box-shadow: 0 1px 4px rgba(31, 61, 70, .12);
}
.chart-wrap {
  position: relative;
}
.chart-dots circle {
  stroke-width: 2;
  stroke: #fff;
}
.cyan-dot {
  fill: #08b6ba;
}
.blue-dot {
  fill: #2679e9;
}
.trend-empty {
  position: absolute;
  inset: 82px 0 auto;
  color: var(--muted);
  text-align: center;
}
.empty-overview {
  padding: 42px 20px;
  color: var(--muted);
  text-align: center;
}
</style>
