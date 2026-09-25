<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminInvitationRecord } from '../types'

const props = defineProps<{ preview: boolean }>()
const loading = ref(false)
const rows = ref<AdminInvitationRecord[]>([])
const filters = reactive({ search: '', status: '' as '' | 'registered' | 'first_order_rewarded' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const demoRows: AdminInvitationRecord[] = [
  { public_id: 'demo-1', inviter_public_id: '', inviter_name: '李女士', inviter_phone_masked: '188****6621', invitee_public_id: '', invitee_name: '小林', invitee_phone_masked: '139****1028', status: 'first_order_rewarded', registration_rewarded: true, first_order_rewarded: true, registered_at: '2026-09-14T09:20:00+08:00', first_order_completed_at: '2026-09-18T16:30:00+08:00', order_no: 'DZYA202609180001' },
  { public_id: 'demo-2', inviter_public_id: '', inviter_name: '李女士', inviter_phone_masked: '188****6621', invitee_public_id: '', invitee_name: '陈先生', invitee_phone_masked: '136****2815', status: 'registered', registration_rewarded: true, first_order_rewarded: false, registered_at: '2026-09-15T12:05:00+08:00', first_order_completed_at: null, order_no: '' },
]
const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
async function load(reset = false) {
  if (reset) pagination.page = 1
  loading.value = true
  try {
    if (props.preview) {
      rows.value = demoRows.filter((item) => !filters.status || item.status === filters.status)
      pagination.total = rows.value.length
    } else {
      const result = await adminApi.invitationRecords({ search: filters.search.trim(), status: filters.status, page: pagination.page, page_size: pagination.pageSize })
      rows.value = result.items
      Object.assign(pagination, { page: result.pagination.page, pageSize: result.pagination.page_size, total: result.pagination.total })
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '邀请记录加载失败') }
  finally { loading.value = false }
}
function reset() { filters.search = ''; filters.status = ''; void load(true) }
onMounted(() => load())
</script>

<template>
  <div class="page records-page">
    <header class="page-heading"><div><h1>邀请记录</h1><p>查看有效注册、注册奖励和首单完成奖励，记录永久保留。</p></div><el-button :icon="Refresh" @click="load()">刷新</el-button></header>
    <section class="filter-card"><el-input v-model="filters.search" :prefix-icon="Search" clearable placeholder="邀请人或新用户昵称 / 手机号" @keyup.enter="load(true)" /><el-select v-model="filters.status" clearable placeholder="全部进度"><el-option label="已注册，待首单" value="registered" /><el-option label="首单奖励已发放" value="first_order_rewarded" /></el-select><div><el-button type="primary" :icon="Search" @click="load(true)">查询</el-button><el-button @click="reset">重置</el-button></div></section>
    <section class="table-card" v-loading="loading"><el-table :data="rows" height="calc(100vh - 330px)" empty-text="没有符合条件的邀请记录"><el-table-column label="邀请人" min-width="160"><template #default="{ row }"><div class="user-cell"><b>{{ row.inviter_name }}</b><span>{{ row.inviter_phone_masked }}</span></div></template></el-table-column><el-table-column label="新用户" min-width="160"><template #default="{ row }"><div class="user-cell"><b>{{ row.invitee_name }}</b><span>{{ row.invitee_phone_masked }}</span></div></template></el-table-column><el-table-column label="注册奖励" width="110"><template #default="{ row }"><el-tag :type="row.registration_rewarded ? 'success' : 'info'">{{ row.registration_rewarded ? '已发放' : '未发放' }}</el-tag></template></el-table-column><el-table-column label="首单奖励" width="130"><template #default="{ row }"><el-tag :type="row.first_order_rewarded ? 'success' : 'warning'">{{ row.first_order_rewarded ? '已发放' : '待完成首单' }}</el-tag></template></el-table-column><el-table-column label="注册时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.registered_at) }}</template></el-table-column><el-table-column label="首单完成时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.first_order_completed_at) }}</template></el-table-column><el-table-column prop="order_no" label="首单订单号" min-width="180"><template #default="{ row }">{{ row.order_no || '—' }}</template></el-table-column></el-table><footer><span>共 {{ pagination.total }} 条</span><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :page-sizes="[20,50,100]" layout="sizes, prev, pager, next" :total="pagination.total" @current-change="load()" @size-change="load(true)" /></footer></section>
  </div>
</template>

<style scoped>
.records-page{min-height:calc(100vh - 76px)}.page-heading{margin-bottom:14px}.filter-card{display:grid;grid-template-columns:minmax(260px,1fr) 180px auto;gap:10px;margin-bottom:14px;padding:16px;border:1px solid var(--line);border-radius:10px;background:#fff}.table-card{overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff}.user-cell{display:flex;flex-direction:column;gap:4px}.user-cell b{font-size:13px}.user-cell span{color:var(--muted);font-size:11px}.table-card footer{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:900px){.filter-card{grid-template-columns:1fr}}
</style>
