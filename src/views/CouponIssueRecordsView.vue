<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import type { AdminCoupon, AdminCouponQuery, AdminCouponTemplate } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'

const props = defineProps<{ preview: boolean; canIssue: boolean }>()

const loading = ref(false)
const rows = ref<AdminCoupon[]>([])
const templates = ref<AdminCouponTemplate[]>([])
const dateRange = ref<[string, string] | null>(null)
const filters = reactive({
  search: '',
  templateId: '',
  status: '' as AdminCouponQuery['status'],
  source: '' as AdminCouponQuery['source'],
  issuedBy: '',
})
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const statusLabels: Record<string, string> = {
  available: '可用', reserved: '订单占用中', used: '已使用', expired: '已过期', revoked: '已撤销',
}
const sourceLabels: Record<string, string> = {
  report_reward: '举报有奖', customer_service: '客服补偿', manual: '人工发放',
  newcomer_gift: '新人礼包', invite_registration: '邀请注册奖励', invite_first_order: '邀请首单奖励',
}
const demoTemplates: AdminCouponTemplate[] = [
  { public_id: 'demo-new-user', name: '新用户立减券', description: '达人服务订单可用', face_amount: 2000, min_order_amount: 10000, valid_days: 365, is_active: true, issued_count: 18, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { public_id: 'demo-care', name: '回访关怀券', description: '客服回访补偿使用', face_amount: 1000, min_order_amount: 5000, valid_days: 90, is_active: false, issued_count: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]
const demoRows: AdminCoupon[] = [
  { public_id: 'demo-coupon-1', template_public_id: 'demo-new-user', template_name: '新用户立减券', user_public_id: 'demo-user-1', user_name: '李女士', user_phone_masked: '188****6621', face_amount: 2000, min_order_amount: 10000, expires_at: '2027-09-25T10:00:00+08:00', status: 'available', source: 'manual', issued_by: '客服小乐', revoked_by: null, revoked_at: null, revoke_reason: '', created_at: '2026-09-25T10:00:00+08:00' },
  { public_id: 'demo-coupon-2', template_public_id: 'demo-care', template_name: '回访关怀券', user_public_id: 'demo-user-2', user_name: '张先生', user_phone_masked: '151****0701', face_amount: 1000, min_order_amount: 5000, expires_at: '2026-12-24T14:30:00+08:00', status: 'used', source: 'customer_service', issued_by: '运营管理员', revoked_by: null, revoked_at: null, revoke_reason: '', created_at: '2026-09-25T14:30:00+08:00' },
]

function query(): AdminCouponQuery {
  return {
    search: filters.search.trim(),
    template_public_id: filters.templateId,
    status: filters.status,
    source: filters.source,
    issued_by_search: filters.issuedBy.trim(),
    created_from: dateRange.value?.[0],
    created_to: dateRange.value?.[1],
    page: pagination.page,
    page_size: pagination.pageSize,
  }
}

function previewRows() {
  const keyword = filters.search.trim().toLowerCase()
  return demoRows.filter((item) => (
    (!keyword || item.user_name.toLowerCase().includes(keyword) || item.user_phone_masked.includes(keyword))
    && (!filters.templateId || item.template_public_id === filters.templateId)
    && (!filters.status || item.status === filters.status)
    && (!filters.source || item.source === filters.source)
    && (!filters.issuedBy.trim() || (item.issued_by || '').includes(filters.issuedBy.trim()))
  ))
}

async function loadRecords(resetPage = false) {
  if (resetPage) pagination.page = 1
  loading.value = true
  try {
    if (props.preview) {
      const result = previewRows()
      pagination.total = result.length
      rows.value = result.slice(
        (pagination.page - 1) * pagination.pageSize,
        pagination.page * pagination.pageSize,
      )
      return
    }
    const data = await adminApi.coupons(query())
    rows.value = data.items
    Object.assign(pagination, {
      page: data.pagination.page,
      pageSize: data.pagination.page_size,
      total: data.pagination.total,
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '优惠券发放记录加载失败')
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  try {
    templates.value = props.preview ? demoTemplates : (await adminApi.couponTemplates()).items
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '优惠券模板加载失败')
  }
}

function resetFilters() {
  Object.assign(filters, { search: '', templateId: '', status: '', source: '', issuedBy: '' })
  dateRange.value = null
  void loadRecords(true)
}

async function revoke(item: AdminCoupon) {
  if (!props.canIssue || item.status !== 'available') return
  try {
    const result = await ElMessageBox.prompt(
      '撤销后用户将无法继续使用该优惠券，操作会通知用户并写入审计。',
      '撤销优惠券',
      { inputPlaceholder: '请输入撤销原因', inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字', type: 'warning' },
    )
    if (props.preview) {
      item.status = 'revoked'
      item.revoke_reason = result.value.trim()
      item.revoked_at = new Date().toISOString()
    } else {
      await adminApi.revokeCoupon(item.public_id, result.value.trim())
    }
    ElMessage.success('优惠券已撤销')
    await loadRecords()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '优惠券撤销失败')
    }
  }
}

function statusType(status: string) {
  if (status === 'available') return 'success'
  if (status === 'reserved') return 'warning'
  if (status === 'revoked') return 'danger'
  return 'info'
}

onMounted(() => {
  void Promise.all([loadTemplates(), loadRecords()])
})
</script>

<template>
  <div class="page records-page">
    <header class="page-heading">
      <div><h1>优惠券发放记录</h1><p>查询优惠券发放、使用和撤销记录，历史数据永久保留。</p></div>
      <el-button :icon="Refresh" @click="loadRecords()">刷新</el-button>
    </header>

    <section class="filter-card">
      <el-input v-model="filters.search" :prefix-icon="Search" clearable placeholder="用户昵称或手机号" @keyup.enter="loadRecords(true)" />
      <el-select v-model="filters.templateId" clearable filterable placeholder="全部优惠券模板">
        <el-option v-for="item in templates" :key="item.public_id" :label="item.name" :value="item.public_id" />
      </el-select>
      <el-select v-model="filters.status" clearable placeholder="全部状态">
        <el-option v-for="(label, value) in statusLabels" :key="value" :label="label" :value="value" />
      </el-select>
      <el-select v-model="filters.source" clearable placeholder="全部来源">
        <el-option v-for="(label, value) in sourceLabels" :key="value" :label="label" :value="value" />
      </el-select>
      <el-input v-model="filters.issuedBy" clearable placeholder="发放人昵称或手机号" @keyup.enter="loadRecords(true)" />
      <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="发放开始日期" end-placeholder="发放结束日期" />
      <div class="filter-actions"><el-button type="primary" :icon="Search" @click="loadRecords(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div>
    </section>

    <section class="records-card" v-loading="loading">
      <el-table :data="rows" empty-text="没有符合条件的优惠券发放记录" height="calc(100vh - 340px)">
        <el-table-column label="用户" min-width="150"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.user_name || '未设置昵称' }}</strong><span>{{ row.user_phone_masked }}</span></div></template></el-table-column>
        <el-table-column label="优惠券" min-width="190"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.template_name }}</strong><span>{{ formatMoney(row.face_amount) }} · 订单金额大于 {{ formatMoney(row.min_order_amount) }} 可用</span></div></template></el-table-column>
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabels[row.status] || row.status }}</el-tag></template></el-table-column>
        <el-table-column label="来源" width="105"><template #default="{ row }">{{ sourceLabels[row.source] || row.source }}</template></el-table-column>
        <el-table-column label="发放时间" min-width="165"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="有效期至" min-width="165"><template #default="{ row }">{{ formatDateTime(row.expires_at) }}</template></el-table-column>
        <el-table-column label="发放人" min-width="110"><template #default="{ row }">{{ row.issued_by || '系统' }}</template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-tooltip :disabled="row.status === 'available'" content="只有未使用且未过期的优惠券可以撤销"><span><el-button link type="danger" :disabled="!canIssue || row.status !== 'available'" @click="revoke(row)">撤销</el-button></span></el-tooltip></template></el-table-column>
      </el-table>
      <footer class="pagination-bar">
        <span>共 {{ pagination.total }} 条记录</span>
        <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :page-sizes="[20, 50, 100]" layout="sizes, prev, pager, next" :total="pagination.total" @current-change="loadRecords()" @size-change="loadRecords(true)" />
      </footer>
    </section>
  </div>
</template>

<style scoped>
.records-page{min-height:calc(100vh - 76px)}.page-heading{margin-bottom:14px}.filter-card{display:grid;grid-template-columns:minmax(190px,1fr) minmax(170px,1fr) 130px 130px minmax(170px,1fr) minmax(280px,1.5fr) auto;gap:10px;margin-bottom:14px;padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff}.filter-actions{display:flex}.records-card{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.primary-cell{display:flex;min-width:0;flex-direction:column;gap:5px}.primary-cell strong{font-size:13px}.primary-cell span{overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.pagination-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:1500px){.filter-card{grid-template-columns:repeat(3,minmax(180px,1fr))}.filter-actions{justify-content:flex-end}}@media(max-width:980px){.filter-card{grid-template-columns:1fr}.filter-actions{justify-content:flex-start}}
</style>
