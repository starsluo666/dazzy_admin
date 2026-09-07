<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Close,
  Connection,
  Loading,
  Refresh,
  RefreshRight,
  Search,
  Timer,
  Warning,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatDateTime } from '../utils/format'
import type {
  AdminScheduledTask,
  ScheduledTaskStatus,
  ScheduledTaskSummary,
  ScheduledTaskType,
} from '../types'

const props = defineProps<{ preview: boolean; canRetry: boolean }>()
const emit = defineEmits<{ openOrder: [orderNo: string]; openAudit: [] }>()

const rows = ref<AdminScheduledTask[]>([])
const selected = ref<AdminScheduledTask | null>(null)
const summary = ref<ScheduledTaskSummary>({
  total: 0, pending: 0, running: 0, succeeded_today: 0, failed: 0, overdue: 0,
})
const taskTypes = ref<Array<{ value: ScheduledTaskType; label: string }>>([
  { value: 'provider_order_payment_expiry', label: '达人订单支付超时' },
  { value: 'provider_acceptance_timeout', label: '达人接单超时' },
  { value: 'provider_order_confirmation_timeout', label: '达人订单确认超时' },
  { value: 'provider_order_settlement', label: '达人订单资金结算' },
  { value: 'provider_order_refund', label: '达人订单退款' },
  { value: 'activity_publish_payment_expiry', label: '活动发布支付超时' },
  { value: 'activity_participation_payment_expiry', label: '活动报名支付超时' },
  { value: 'activity_participation_refund', label: '活动报名退款' },
  { value: 'activity_formation_deadline', label: '活动成局截止' },
  { value: 'activity_start', label: '活动开始' },
  { value: 'activity_completion', label: '活动结束' },
  { value: 'activity_settlement', label: '活动资金结算' },
])
const statuses = ref<Array<{ value: ScheduledTaskStatus; label: string }>>([
  { value: 'pending', label: '待执行' },
  { value: 'running', label: '执行中' },
  { value: 'succeeded', label: '执行成功' },
  { value: 'failed', label: '执行失败' },
  { value: 'cancelled', label: '已取消' },
])
const taskType = ref<ScheduledTaskType | ''>('')
const statusFilter = ref<ScheduledTaskStatus | ''>('')
const search = ref('')
const overdueOnly = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const drawerVisible = ref(false)
const retryingId = ref('')

const summaryCards = computed(() => [
  { key: 'pending', label: '待执行', value: summary.value.pending, icon: Timer, tone: 'blue' },
  { key: 'running', label: '执行中', value: summary.value.running, icon: Loading, tone: 'cyan' },
  { key: 'succeeded', label: '今日成功', value: summary.value.succeeded_today, icon: CircleCheck, tone: 'green' },
  { key: 'failed', label: '执行失败', value: summary.value.failed, icon: Warning, tone: 'red' },
  { key: 'overdue', label: '已超时', value: summary.value.overdue, icon: Warning, tone: 'orange' },
])

function demoTask(
  id: string,
  type: ScheduledTaskType,
  taskStatus: ScheduledTaskStatus,
  orderNo: string,
  minutesOffset: number,
  businessType = 'provider_order',
  payload: Record<string, unknown> = { order_no: orderNo },
): AdminScheduledTask {
  const scheduled = new Date(Date.now() + minutesOffset * 60000).toISOString()
  const finished = ['succeeded', 'failed', 'cancelled'].includes(taskStatus)
    ? new Date().toISOString()
    : null
  return {
    public_id: id,
    task_type: type,
    task_type_label: taskTypes.value.find((item) => item.value === type)?.label || type,
    business_type: businessType,
    business_key: orderNo,
    status: taskStatus,
    status_label: statuses.value.find((item) => item.value === taskStatus)?.label || taskStatus,
    scheduled_at: scheduled,
    available_at: scheduled,
    attempt_count: taskStatus === 'failed' ? 3 : taskStatus === 'pending' ? 0 : 1,
    max_attempts: 3,
    started_at: taskStatus === 'running' ? new Date().toISOString() : null,
    finished_at: finished,
    last_error: taskStatus === 'failed' ? 'DatabaseError: connection temporarily unavailable' : '',
    payload,
    result: taskStatus === 'succeeded' ? { action: 'cancelled', source: 'task_worker' } : {},
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function demoRows() {
  return [
    demoTask('10000000-0000-0000-0000-000000000001', 'provider_order_payment_expiry', 'pending', 'DZY202609010001', 8),
    demoTask('10000000-0000-0000-0000-000000000002', 'provider_acceptance_timeout', 'running', 'DZY202609010002', -1),
    demoTask('10000000-0000-0000-0000-000000000003', 'provider_order_payment_expiry', 'succeeded', 'DZY202609010003', -15),
    demoTask('10000000-0000-0000-0000-000000000004', 'provider_acceptance_timeout', 'failed', 'DZY202609010004', -10),
    demoTask('10000000-0000-0000-0000-000000000005', 'provider_order_confirmation_timeout', 'pending', 'DZY202609010005', 60),
    demoTask('10000000-0000-0000-0000-000000000006', 'activity_formation_deadline', 'pending', '23', 120, 'activity', { activity_id: 23, activity_title: '邯郸周边轻徒步交友' }),
    demoTask('10000000-0000-0000-0000-000000000007', 'activity_participation_payment_expiry', 'succeeded', 'APO202609010001', -8, 'activity_participation', { activity_id: 23, activity_title: '邯郸周边轻徒步交友', payment_order_no: 'APO202609010001' }),
  ]
}

function filteredDemoRows() {
  let items = demoRows()
  if (taskType.value) items = items.filter((item) => item.task_type === taskType.value)
  if (statusFilter.value) items = items.filter((item) => item.status === statusFilter.value)
  if (search.value.trim()) {
    const keyword = search.value.trim().toLowerCase()
    items = items.filter((item) => item.business_key.toLowerCase().includes(keyword))
  }
  return items
}

function formatJson(value: Record<string, unknown>) {
  return Object.keys(value).length ? JSON.stringify(value, null, 2) : '暂无数据'
}

function businessLabel(task: AdminScheduledTask) {
  if (task.business_type === 'activity') {
    return `${String(task.payload.activity_title || '活动')} · #${task.business_key}`
  }
  if (task.business_type === 'activity_participation') {
    return `${String(task.payload.activity_title || '活动报名')} · ${task.business_key}`
  }
  return task.business_key
}

function statusType(status: ScheduledTaskStatus) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'primary'
  if (status === 'pending') return 'warning'
  return 'info'
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      const all = demoRows()
      rows.value = filteredDemoRows()
      total.value = rows.value.length
      summary.value = {
        total: all.length,
        pending: all.filter((item) => item.status === 'pending').length,
        running: all.filter((item) => item.status === 'running').length,
        succeeded_today: all.filter((item) => item.status === 'succeeded').length,
        failed: all.filter((item) => item.status === 'failed').length,
        overdue: 1,
      }
      return
    }
    const data = await adminApi.scheduledTasks({
      task_type: taskType.value,
      status: statusFilter.value,
      search: search.value.trim(),
      overdue: overdueOnly.value || undefined,
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
    taskTypes.value = data.task_types
    statuses.value = data.statuses
  } catch (error) {
    rows.value = []
    total.value = 0
    ElMessage.error(error instanceof Error ? error.message : '任务中心加载失败')
  } finally {
    loading.value = false
  }
}

function applyStatus(status: ScheduledTaskStatus | '') {
  statusFilter.value = status
  overdueOnly.value = false
  page.value = 1
  load()
}

function selectSummaryCard(key: string) {
  if (key === 'overdue') {
    statusFilter.value = ''
    overdueOnly.value = true
    page.value = 1
    load()
    return
  }
  applyStatus(key === 'succeeded' ? 'succeeded' : key as ScheduledTaskStatus)
}

function resetFilters() {
  taskType.value = ''
  statusFilter.value = ''
  search.value = ''
  overdueOnly.value = false
  page.value = 1
  load()
}

async function openDetail(row: AdminScheduledTask) {
  selected.value = row
  drawerVisible.value = true
  if (props.preview) return
  detailLoading.value = true
  try {
    selected.value = await adminApi.scheduledTask(row.public_id)
  } catch (error) {
    drawerVisible.value = false
    ElMessage.error(error instanceof Error ? error.message : '任务详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

async function retryTask(task: AdminScheduledTask) {
  if (!props.canRetry || retryingId.value) return
  try {
    await ElMessageBox.confirm(
      `确认重新执行“${task.task_type_label}”吗？重试仍会校验关联业务当前状态，不会强制覆盖业务状态。`,
      '重试失败任务',
      { confirmButtonText: '确认重试', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  retryingId.value = task.public_id
  try {
    const updated = props.preview
      ? { ...task, status: 'pending' as const, status_label: '待执行', attempt_count: 0, last_error: '' }
      : await adminApi.retryScheduledTask(task.public_id)
    rows.value = rows.value.map((item) => item.public_id === updated.public_id ? updated : item)
    if (selected.value?.public_id === updated.public_id) selected.value = updated
    if (props.preview) {
      summary.value.failed = Math.max(0, summary.value.failed - 1)
      summary.value.pending += 1
    }
    ElMessage.success('任务已进入待执行队列，操作已写入审计日志')
    if (!props.preview) await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '任务重试失败')
  } finally {
    retryingId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="page task-center-page">
    <header class="page-heading task-heading">
      <div>
        <h1>任务中心</h1>
        <p>监控订单与活动自动流转任务；失败任务可人工重试，所有操作均保留审计记录</p>
      </div>
      <div class="heading-actions">
        <el-button @click="emit('openAudit')">操作审计</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
      </div>
    </header>

    <section class="task-summary" aria-label="系统任务概况">
      <button
        v-for="card in summaryCards"
        :key="card.key"
        :class="{ active: card.key === 'overdue' ? overdueOnly : statusFilter === card.key }"
        @click="selectSummaryCard(card.key)"
      >
        <el-icon :class="[card.tone, { spinning: card.key === 'running' && card.value > 0 }]">
          <component :is="card.icon" />
        </el-icon>
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </button>
    </section>

    <section class="task-panel">
      <header class="task-filters">
        <el-input
          v-model="search"
          clearable
          :prefix-icon="Search"
          placeholder="订单号 / 活动 / 业务标识"
          @keyup.enter="page = 1; load()"
        />
        <el-select v-model="taskType" clearable placeholder="任务类型">
          <el-option v-for="item in taskTypes" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="statusFilter" clearable placeholder="任务状态">
          <el-option v-for="item in statuses" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
      </header>

      <el-table
        v-loading="loading"
        :data="rows"
        height="calc(100vh - 370px)"
        empty-text="当前筛选条件下没有任务"
        row-class-name="task-row"
        @row-click="openDetail"
      >
        <el-table-column label="任务 / 关联业务" min-width="230">
          <template #default="scope">
            <div class="task-identity">
              <strong>{{ scope.row.task_type_label }}</strong>
              <button
                v-if="scope.row.business_type === 'provider_order'"
                class="business-link"
                @click.stop="emit('openOrder', scope.row.business_key)"
              ><el-icon><Connection /></el-icon>{{ scope.row.business_key }}</button>
              <span v-else>{{ businessLabel(scope.row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="108">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)" effect="plain">{{ scope.row.status_label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划执行时间" width="178">
          <template #default="scope">{{ formatDateTime(scope.row.scheduled_at) }}</template>
        </el-table-column>
        <el-table-column label="执行次数" width="92" align="center">
          <template #default="scope">{{ scope.row.attempt_count }} / {{ scope.row.max_attempts }}</template>
        </el-table-column>
        <el-table-column label="最近执行" width="178">
          <template #default="scope">{{ formatDateTime(scope.row.started_at || scope.row.finished_at) }}</template>
        </el-table-column>
        <el-table-column label="最近结果" min-width="190" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.last_error" class="error-copy">{{ scope.row.last_error }}</span>
            <span v-else class="result-copy">{{ scope.row.status === 'succeeded' ? '业务状态已安全推进' : scope.row.status === 'cancelled' ? '业务状态变化，无需执行' : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="138" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click.stop="openDetail(scope.row)">详情</el-button>
            <el-button
              v-if="scope.row.status === 'failed' && canRetry"
              link
              type="danger"
              :icon="RefreshRight"
              :loading="retryingId === scope.row.public_id"
              @click.stop="retryTask(scope.row)"
            >重试</el-button>
          </template>
        </el-table-column>
      </el-table>

      <footer class="task-footer">
        <span>共 {{ total }} 条任务</span>
        <el-pagination
          v-model:current-page="page"
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          @current-change="load"
        />
      </footer>
    </section>

    <el-drawer v-model="drawerVisible" size="560px" :with-header="false" destroy-on-close>
      <div v-if="selected" v-loading="detailLoading" class="task-drawer">
        <header>
          <div><h2>任务详情</h2><p>{{ selected.public_id }}</p></div>
          <el-tag :type="statusType(selected.status)" effect="plain">{{ selected.status_label }}</el-tag>
          <button aria-label="关闭任务详情" @click="drawerVisible = false"><el-icon><Close /></el-icon></button>
        </header>

        <el-alert
          v-if="selected.status === 'failed'"
          class="task-alert"
          type="error"
          :closable="false"
          show-icon
          title="任务执行失败"
          description="请先核查错误和关联业务状态；人工重试不会绕过业务状态校验。"
        />

        <section class="task-detail-grid">
          <div><span>任务类型</span><strong>{{ selected.task_type_label }}</strong></div>
          <div><span>关联业务</span><strong>{{ businessLabel(selected) }}</strong></div>
          <div><span>计划执行</span><strong>{{ formatDateTime(selected.scheduled_at) }}</strong></div>
          <div><span>下次执行</span><strong>{{ formatDateTime(selected.available_at) }}</strong></div>
          <div><span>最近开始</span><strong>{{ formatDateTime(selected.started_at) }}</strong></div>
          <div><span>完成时间</span><strong>{{ formatDateTime(selected.finished_at) }}</strong></div>
          <div><span>执行次数</span><strong>{{ selected.attempt_count }} / {{ selected.max_attempts }}</strong></div>
          <div><span>创建时间</span><strong>{{ formatDateTime(selected.created_at) }}</strong></div>
        </section>

        <section v-if="selected.last_error" class="task-detail-section error-section">
          <h3>最近错误</h3>
          <pre>{{ selected.last_error }}</pre>
        </section>
        <section class="task-detail-section">
          <h3>任务参数</h3>
          <pre>{{ formatJson(selected.payload) }}</pre>
        </section>
        <section class="task-detail-section">
          <h3>执行结果</h3>
          <pre>{{ formatJson(selected.result) }}</pre>
        </section>

        <footer>
          <el-button
            v-if="selected.business_type === 'provider_order'"
            @click="emit('openOrder', selected.business_key)"
          >查看关联订单</el-button>
          <el-button
            v-if="selected.status === 'failed' && canRetry"
            type="danger"
            :icon="RefreshRight"
            :loading="retryingId === selected.public_id"
            @click="retryTask(selected)"
          >重试任务</el-button>
        </footer>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.task-center-page{min-height:calc(100vh - 76px)}.task-heading{margin-bottom:16px}.heading-actions{display:flex;gap:8px}.task-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.task-summary button{display:grid;grid-template-columns:46px 1fr;grid-template-rows:auto auto;align-items:center;min-height:84px;padding:14px 16px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease}.task-summary button:hover,.task-summary button.active{border-color:#8bdadd;box-shadow:0 7px 22px rgba(29,72,87,.08)}.task-summary button:focus-visible{outline:3px solid rgba(8,184,189,.2);outline-offset:2px}.task-summary .el-icon{grid-row:1/3;width:38px;height:38px;border-radius:10px;font-size:20px}.task-summary .blue{color:#2679e9;background:#e9f1ff}.task-summary .cyan{color:#069ca2;background:#e4f8f8}.task-summary .green{color:#078d76;background:#e6f7f1}.task-summary .red{color:#d9485f;background:#fff0f2}.task-summary .orange{color:#e0712f;background:#fff1e8}.task-summary span{color:var(--muted);font-size:12px}.task-summary strong{font-size:25px}.task-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.task-filters{display:grid;grid-template-columns:minmax(240px,1.5fr) 210px 150px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.task-identity{display:flex;flex-direction:column;gap:5px}.task-identity strong{font-size:13px}.task-identity>span{color:var(--muted);font-size:12px}.business-link{display:inline-flex;align-items:center;align-self:flex-start;gap:4px;padding:0;border:0;color:#078f94;background:transparent;font-size:12px}.business-link:hover{text-decoration:underline}.error-copy{color:#c73f51;font-size:12px}.result-copy{color:var(--muted);font-size:12px}.task-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.task-drawer{min-height:100%;padding-bottom:92px;background:#f7f9fb}.task-drawer>header{position:sticky;z-index:3;top:0;display:flex;align-items:center;gap:12px;height:76px;padding:0 22px;border-bottom:1px solid var(--line);background:#fff}.task-drawer>header>div{min-width:0;margin-right:auto}.task-drawer>header h2{margin:0;font-size:20px}.task-drawer>header p{overflow:hidden;margin:5px 0 0;color:var(--muted);font-size:11px;text-overflow:ellipsis}.task-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.task-drawer>header button:hover{background:#f0f4f5}.task-alert{margin:16px 18px 0;width:auto}.task-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 18px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.task-detail-grid div{display:flex;min-width:0;flex-direction:column;gap:5px}.task-detail-grid span{color:var(--muted);font-size:11px}.task-detail-grid strong{overflow:hidden;font-size:13px;text-overflow:ellipsis}.task-detail-section{margin:12px 18px 0;padding:17px;border:1px solid var(--line);border-radius:8px;background:#fff}.task-detail-section h3{margin:0 0 11px;font-size:14px}.task-detail-section pre{overflow:auto;max-height:180px;margin:0;padding:12px;border-radius:6px;color:#3c4654;background:#f4f7f8;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.error-section{border-color:#f2cbd2}.error-section pre{color:#a93447;background:#fff5f6}.task-drawer>footer{position:fixed;right:0;bottom:0;z-index:4;display:flex;justify-content:flex-end;gap:9px;width:560px;height:72px;padding:0 18px;border-top:1px solid var(--line);background:#fff}:deep(.task-row){cursor:pointer}:deep(.el-drawer__body){padding:0}:deep(.el-table__row:hover td){background:#f2fbfb!important}.spinning{animation:task-spin 1.2s linear infinite}@keyframes task-spin{to{transform:rotate(360deg)}}@media(max-width:1360px){.task-summary{gap:8px}.task-summary button{padding:12px}.task-filters{grid-template-columns:minmax(210px,1fr) 190px 135px 66px 66px}}@media(prefers-reduced-motion:reduce){.spinning{animation:none}.task-summary button{transition:none}}
</style>
