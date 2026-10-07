<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bell, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElNotification } from 'element-plus'
import { adminApi } from '../services/api'
import { useOperationsWork } from '../composables/operationsWork'
import { unseenWork, waitLabel, type WorkItem, type WorkTarget } from '../utils/operationsWork'

const props = defineProps<{ preview: boolean }>()
const emit = defineEmits<{ openWork: [target: WorkTarget] }>()
const work = useOperationsWork()
const summary = work.summary
const open = ref(false)
const queue = ref('')
const items = ref<WorkItem[]>([])
const page = ref(1)
const total = ref(0)
const unreadOnly = ref(false)
const loading = ref(false)
const itemError = ref('')
const reading = ref('')
const available = computed(() => summary.value?.todos.filter(todo => todo.count > 0) || [])
let timer: number | undefined
let sequence = 0
let disposed = false
let seen = new Set<string>()
let storageKey = ''

async function loadItems() {
  const own = ++sequence
  if (!open.value || !queue.value || props.preview) {
    items.value = []; total.value = 0; loading.value = false; itemError.value = ''; return
  }
  loading.value = true
  itemError.value = ''
  try {
    const data = await adminApi.workItems(queue.value, page.value, unreadOnly.value)
    if (own !== sequence || disposed) return
    items.value = data.items
    total.value = data.total
  } catch {
    if (own === sequence && !disposed) { items.value = []; total.value = 0; itemError.value = '提醒加载失败，请重试' }
  } finally { if (own === sequence && !disposed) loading.value = false }
}
async function refresh() {
  if (props.preview || document.hidden || disposed) return
  await work.refresh()
  if (open.value && !loading.value) await loadItems()
}
watch(summary, value => {
  if (!value) { seen.clear(); storageKey = ''; return }
  const nextKey = `dazzy-work-seen:${value.viewer}`
  if (storageKey !== nextKey) {
    storageKey = nextKey
    try { seen = new Set(JSON.parse(sessionStorage.getItem(storageKey) || '[]')) } catch { seen = new Set() }
  }
  const fresh = unseenWork(value.todos, seen)
  for (const todo of value.todos) for (const signal of todo.signals) seen.add(signal)
  seen = new Set([...seen].slice(-2000))
  try { sessionStorage.setItem(storageKey, JSON.stringify([...seen])) } catch { /* Storage is optional. */ }
  if (fresh.length && !props.preview) ElNotification({
    title: '有待办需要处理', message: fresh.map(todo => `${todo.label} ${todo.count} 项`).join('；'),
    type: fresh.some(todo => todo.priority === 'high') ? 'warning' : 'info', duration: 6000,
    onClick: () => { queue.value = fresh[0]!.key; open.value = true },
  })
  if (!available.value.some(todo => todo.key === queue.value)) queue.value = available.value[0]?.key || ''
})
watch([open, queue, unreadOnly], () => { page.value = 1; void loadItems() })
watch(page, () => { void loadItems() })
async function markRead(item: WorkItem) {
  if (reading.value) return
  reading.value = item.object_id
  try {
    await adminApi.readWorkItem(item)
    await refresh()
  } catch {
    ElMessage.warning('提醒可能已更新或处理，请刷新查看')
    await refresh()
  } finally { reading.value = '' }
}
function handle(item: WorkItem) { open.value = false; emit('openWork', item.target) }
function pageVisible() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh()
  timer = window.setInterval(refresh, 30_000)
  document.addEventListener('visibilitychange', pageVisible)
  window.addEventListener('focus', pageVisible)
})
onBeforeUnmount(() => {
  disposed = true; sequence++
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange', pageVisible)
  window.removeEventListener('focus', pageVisible)
  work.clear()
})
</script>

<template>
  <el-badge :value="summary?.unread_count || 0" :hidden="!summary?.unread_count" :max="99">
    <button class="inbox-trigger" aria-label="打开运营待办通知" @click="open = true"><el-icon><Bell /></el-icon></button>
  </el-badge>
  <el-drawer v-model="open" title="运营待办通知" size="480px" class="operations-inbox">
    <div class="inbox-summary"><strong>{{ summary?.total || 0 }} 项待处理</strong><span>{{ summary?.unread_count || 0 }} 条未读 · {{ summary?.overdue_count || 0 }} 项超时</span></div>
    <p class="inbox-help">已读不等于已处理。业务处理完成后自动移除；新进展会重新提醒。</p>
    <el-alert v-if="work.error.value" :title="work.error.value" type="warning" :closable="false" />
    <div class="inbox-controls">
      <el-select v-model="queue" aria-label="待办分类" placeholder="暂无待办"><el-option v-for="todo in available" :key="todo.key" :label="`${todo.label}（${todo.count}）`" :value="todo.key" /></el-select>
      <el-button :icon="Refresh" aria-label="刷新待办通知" @click="refresh" />
    </div>
    <el-checkbox v-model="unreadOnly">只看未读</el-checkbox>
    <p v-if="itemError" role="alert">{{ itemError }} <el-button link @click="loadItems">重试</el-button></p>
    <div v-loading="loading" class="inbox-items">
      <article v-for="item in items" :key="`${item.queue}:${item.object_id}:${item.event_version}`" :class="{ unread: !item.read }">
        <div class="inbox-item-head"><strong>{{ item.title }}</strong><el-tag v-if="item.overdue" type="danger" size="small">超时</el-tag><span v-else>{{ item.read ? '已读' : '未读' }}</span></div>
        <p class="inbox-reference">{{ item.reference }}</p>
        <div class="inbox-item-foot"><span>等待 {{ waitLabel(item.created_at) }}</span><el-button v-if="!item.read" link :loading="reading === item.object_id" @click="markRead(item)">标为已读</el-button><el-button type="primary" plain size="small" @click="handle(item)">去处理</el-button></div>
      </article>
      <el-empty v-if="!loading && !items.length && !itemError" :description="unreadOnly ? '当前分类没有未读提醒' : '当前没有待处理事项'" />
    </div>
    <el-pagination v-if="total > 20" v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next" />
    <p class="inbox-help">提醒按当前权限与城市范围展示，每 30 秒更新。短信、微信接口已预留但未接通；离开后台后不推送手机消息。</p>
  </el-drawer>
</template>

<style scoped>
.inbox-trigger{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:10px;color:#627180;background:transparent;cursor:pointer;font-size:21px}
.inbox-trigger:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
.inbox-trigger:active{transform:scale(.97)}
.inbox-summary{display:flex;justify-content:space-between;gap:12px;align-items:center}.inbox-summary strong{font-size:19px}.inbox-summary span,.inbox-help{font-size:12px;color:#687887;line-height:1.8}
.inbox-controls{display:flex;gap:8px;margin:18px 0 6px}.inbox-controls .el-select{flex:1;min-width:0}
.inbox-items{min-height:180px}.inbox-items article{border:1px solid #e5eaed;border-radius:12px;padding:16px;margin:12px 0}.inbox-items article.unread{background:#f4fbfb;border-color:#cdebec}
.inbox-item-head,.inbox-item-foot{display:flex;align-items:center;gap:10px}.inbox-item-head strong{flex:1;font-size:14px}.inbox-item-head>span,.inbox-item-foot>span{font-size:12px;color:#687887}.inbox-item-foot>span{margin-right:auto}.inbox-reference{font-size:13px;overflow-wrap:anywhere;color:#42556a}
@media(hover:hover) and (pointer:fine){.inbox-trigger:hover{background:#e9f7f7;color:var(--brand)}}
@media(prefers-reduced-motion:reduce){.inbox-trigger:active{transform:none}}
</style>
