<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import type { AdminUserInvitations } from '../types'
import { formatDateTime } from '../utils/format'

const props = defineProps<{ userId: string; preview: boolean }>()
const emit = defineEmits<{ 'open-user': [publicId: string] }>()
const expanded = ref(false)
const contentId = useId()
const dateRange = ref<[string, string] | null>(null)
const page = ref(1)
const pageSize = 10
const data = ref<AdminUserInvitations | null>(null)
const loading = ref(false)
const error = ref('')
let requestVersion = 0
const period = computed(() => data.value?.filters.date_from
  ? `${data.value.filters.date_from} 至 ${data.value.filters.date_to}` : '全部日期')

async function load() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  data.value = null
  try {
    if (props.preview) return
    const result = await adminApi.userInvitations(props.userId, {
      date_from: dateRange.value?.[0], date_to: dateRange.value?.[1],
      page: page.value, page_size: pageSize,
    })
    if (version === requestVersion) data.value = result
  } catch (reason) {
    if (version === requestVersion) error.value = reason instanceof Error ? reason.message : '邀请数据加载失败，请重试'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function filterChanged() {
  page.value = 1
  void load()
}
function toggleExpanded() {
  expanded.value = !expanded.value
  if (expanded.value && !data.value && !loading.value) void load()
}
watch(() => props.userId, () => {
  requestVersion++
  expanded.value = false
  data.value = null
  loading.value = false
  error.value = ''
  dateRange.value = null
  page.value = 1
}, { immediate: true })
onBeforeUnmount(() => { requestVersion++ })
</script>

<template>
  <section class="invitation-panel" aria-labelledby="invitation-heading" :aria-busy="loading">
    <header class="panel-heading">
      <h3 id="invitation-heading">
        <button type="button" class="panel-toggle" :aria-expanded="expanded" :aria-controls="contentId" @click="toggleExpanded">
          <span>邀请关系与下单统计</span>
          <span class="toggle-action">{{ expanded ? '收起' : '展开' }}<el-icon><ArrowUp v-if="expanded" /><ArrowDown v-else /></el-icon></span>
        </button>
      </h3>
    </header>
    <p v-if="!expanded" class="collapsed-note">查看邀请人、直接邀请用户及达人订单统计</p>
    <div :id="contentId" :hidden="!expanded">
      <template v-if="expanded">
        <p class="scope-note">仅统计直接邀请用户的已支付达人订单，排除未支付、已取消及全额退款订单；部分退款但未取消的订单仍计入。</p>
        <div v-if="preview" class="scope-note">预览模式不读取真实邀请数据。</div>
        <template v-else>
          <label class="filter-label">下单日期（北京时间）</label>
          <div class="date-filter">
            <el-date-picker
              v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
              start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至"
              aria-label="下单日期范围" clearable @change="filterChanged"
            />
            <el-button :disabled="loading" @click="load">刷新</el-button>
          </div>
          <p class="filter-note">按订单创建时间筛选，清空日期查看全部；未下单用户保留并显示 0 单。</p>
          <div v-if="error" class="load-error" role="alert">
            <span>{{ error }}</span><el-button link type="primary" @click="load">重试</el-button>
          </div>
          <el-skeleton v-else-if="loading" :rows="4" class="panel-loading" />
          <template v-else-if="data">
            <div class="inviter-row">
              <span>邀请人</span>
              <div v-if="data.inviter" class="inviter-info">
                <el-button link type="primary" @click="emit('open-user', data.inviter.public_id)">{{ data.inviter.nickname }}</el-button>
                <span>{{ data.inviter.phone_masked }}</span>
              </div>
              <strong v-else>{{ data.inviter_restricted ? '邀请人不在当前可查看范围' : '无邀请人' }}</strong>
            </div>
            <p v-if="data.data_scope === 'cities'" class="scope-note">仅展示当前账号有权限查看的用户及城市内订单，合计不包含范围外数据。</p>
            <div class="list-heading"><strong>直接邀请用户</strong><span>{{ data.summary.invitee_count }} 人</span></div>
            <el-table :data="data.items" row-key="public_id" :max-height="360" empty-text="暂无直接邀请用户" class="invitee-table">
              <el-table-column label="用户" min-width="130">
                <template #default="{ row }">
                  <div class="invitee-person">
                    <el-button link type="primary" @click="emit('open-user', row.public_id)">{{ row.nickname }}</el-button>
                    <span>{{ row.phone_masked }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="最近下单时间" min-width="158">
                <template #default="{ row }"><span class="order-time">{{ formatDateTime(row.latest_order_at, '暂无有效订单') }}</span></template>
              </el-table-column>
              <el-table-column prop="order_count" label="订单数" width="75" align="right" fixed="right" />
            </el-table>
            <p class="filter-note">最近下单时间仅指筛选范围内的有效订单，按时间从近到远排列。</p>
            <el-pagination
              v-if="data.pagination.total > pageSize" v-model:current-page="page"
              :page-size="pageSize" :total="data.pagination.total" :pager-count="5"
              layout="prev, pager, next" prev-text="上一页" next-text="下一页" small @current-change="load"
            />
            <footer class="invitation-total" aria-live="polite">
              <div><strong>全部邀请用户订单合计</strong><span>{{ period }} · {{ data.summary.ordering_user_count }} 人下单 · 跨全部分页</span></div>
              <div class="total-value"><b>{{ data.summary.order_count }}</b><span>单</span></div>
            </footer>
          </template>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped>
.invitation-panel { margin: 14px 20px 0; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.panel-heading, .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.panel-heading h3 { width: 100%; margin: 0; font-size: 15px; }
.panel-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 32px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.panel-toggle:focus-visible { outline: 2px solid #087f83; outline-offset: 4px; border-radius: 4px; }
.toggle-action { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; color: #087f83; font-size: 12px; font-weight: 500; }
.panel-toggle:active .toggle-action { transform: scale(.97); }
.collapsed-note { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.scope-note, .filter-note { margin: 10px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.filter-note { font-size: 11px; }
.filter-label { display: block; margin-bottom: 7px; font-size: 12px; }
.date-filter { display: flex; gap: 8px; align-items: center; }
.date-filter :deep(.el-date-editor) { flex: 1; width: 0; min-width: 0; }
.date-filter :deep(.el-range-input) { min-width: 0; font-size: 12px; }
.inviter-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 10px 12px; border-radius: 6px; background: #f4f9fa; font-size: 12px; }
.inviter-row > span, .inviter-info > span, .invitee-person > span { color: var(--muted); }
.inviter-info { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 4px 10px; min-width: 0; }
.inviter-info .el-button, .invitee-person .el-button { height: auto; white-space: normal; overflow-wrap: anywhere; text-align: left; }
.list-heading { margin: 18px 0 8px; font-size: 13px; }
.list-heading > span { color: var(--muted); font-size: 12px; }
.invitee-person { display: flex; flex-direction: column; align-items: start; gap: 4px; font-size: 12px; }
.order-time { font-size: 12px; font-variant-numeric: tabular-nums; }
.invitation-total { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 14px; border: 1px solid #cceeee; border-radius: 8px; background: #f0fbfb; }
.invitation-total > div:first-child { display: flex; flex-direction: column; gap: 6px; }
.invitation-total strong { font-size: 13px; }
.invitation-total span { color: #55777a; font-size: 11px; line-height: 1.6; }
.total-value { display: flex; align-items: baseline; gap: 4px; flex-shrink: 0; }
.total-value b { color: #087f83; font-size: 26px; font-variant-numeric: tabular-nums; }
.load-error { display: flex; align-items: center; gap: 12px; padding: 16px 0; font-size: 13px; color: #b34235; }
.panel-loading { padding: 12px 0; }
@media (max-width: 400px) { .invitation-panel { margin: 14px 12px 0; padding: 12px; } .date-filter { flex-wrap: wrap; } .date-filter :deep(.el-date-editor) { flex-basis: 100%; } }
</style>
