<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, Document, Refresh, Search } from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import type { AdminAuditLog } from '../types'

const rows = ref<AdminAuditLog[]>([]), loading = ref(false), page = ref(1), total = ref(0)
const search = ref(''), action = ref(''), targetType = ref(''), selected = ref<AdminAuditLog | null>(null)
const pageSize = 20
const actionOptions = [
  { value: '', label: '全部操作' },
  { value: 'system.', label: '系统管理' },
  { value: 'operations.', label: '运营配置' },
  { value: 'provider.', label: '达人管理' },
  { value: 'activity.', label: '活动管理' },
  { value: 'order.', label: '订单与售后' },
  { value: 'user.', label: '用户管理' },
  { value: 'service_category.', label: '服务分类' },
]
const targetOptions = [
  { value: '', label: '全部对象' },
  { value: 'admin_role', label: '后台角色' },
  { value: 'organization_member', label: '后台账号' },
  { value: 'operation_setting', label: '运营配置' },
  { value: 'provider', label: '达人资料' },
  { value: 'provider_order', label: '达人订单' },
  { value: 'user', label: '用户资料' },
]
const actionNames: Record<string, string> = {
  'system.role.create': '创建后台角色', 'system.role.update': '更新后台角色', 'system.role.delete': '删除后台角色',
  'system.member.create': '添加后台账号', 'system.member.update': '更新后台账号',
  'system.task.retry': '重试失败任务',
  'operations.platform.update': '更新平台参数', 'operations.provider_ordering.update': '更新接单规则',
  'provider.application.approve': '审核达人入驻', 'provider.credit.adjust': '调整达人信用分',
  'order.support_note.add': '添加订单跟进', 'order.after_sales.approve': '审核退款售后',
}
const targetNames: Record<string, string> = Object.fromEntries(targetOptions.filter((item) => item.value).map((item) => [item.value, item.label]))
const selectedChanges = computed(() => {
  if (!selected.value) return [] as Array<{ key: string; before: unknown; after: unknown }>
  const keys = new Set([...Object.keys(selected.value.before || {}), ...Object.keys(selected.value.after || {})])
  return [...keys].map((key) => ({ key, before: selected.value!.before?.[key], after: selected.value!.after?.[key] }))
    .filter((item) => JSON.stringify(item.before) !== JSON.stringify(item.after))
})
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function pretty(value: Record<string, unknown>) { return JSON.stringify(value, null, 2) }
function actionLabel(value: string) { return actionNames[value] || value.split('.').slice(-1)[0] || '操作记录' }
function targetLabel(value: string) { return targetNames[value] || value }
async function load() { loading.value = true; try { const data = await adminApi.auditLogs({ search: search.value.trim(), action: action.value.trim(), target_type: targetType.value.trim(), page: page.value, page_size: pageSize }); rows.value = data.items; total.value = data.pagination.total } catch (error) { ElMessage.error(error instanceof Error ? error.message : '审计日志加载失败') } finally { loading.value = false } }
function reset() { search.value = ''; action.value = ''; targetType.value = ''; page.value = 1; load() }
onMounted(load)
</script>

<template>
  <div class="page audit-page">
    <header class="page-heading"><div><h1>操作审计</h1><p>追踪后台高风险操作，记录操作人、目标对象与变更前后数据</p></div><el-button :icon="Refresh" :loading="loading" @click="load">刷新日志</el-button></header>
    <section class="audit-panel">
      <header class="audit-filters"><el-input v-model="search" :prefix-icon="Search" clearable placeholder="操作人 / 操作 / 目标 ID" @keyup.enter="page = 1; load()" /><el-select v-model="action" clearable filterable allow-create placeholder="业务模块 / 操作前缀"><el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-select v-model="targetType" clearable filterable placeholder="目标对象"><el-option v-for="item in targetOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-button @click="reset">重置</el-button><el-button type="primary" @click="page = 1; load()">查询</el-button></header>
      <el-table v-loading="loading" :data="rows" height="calc(100vh - 280px)" empty-text="暂无审计记录" @row-click="selected = $event">
        <el-table-column label="时间" width="178"><template #default="scope">{{ formatDate(scope.row.created_at) }}</template></el-table-column>
        <el-table-column prop="actor_name" label="操作人" width="120" />
        <el-table-column label="操作" min-width="220"><template #default="scope"><div class="action-cell"><strong>{{ actionLabel(scope.row.action) }}</strong><small>{{ scope.row.action }}</small></div></template></el-table-column>
        <el-table-column label="目标对象" min-width="190"><template #default="scope"><el-tag size="small" effect="plain">{{ targetLabel(scope.row.target_type) }}</el-tag><small class="target-id">{{ scope.row.target_id }}</small></template></el-table-column>
        <el-table-column prop="organization_name" label="组织" width="140" />
        <el-table-column label="详情" width="78"><template #default="scope"><el-button link type="primary" @click.stop="selected = scope.row">查看</el-button></template></el-table-column>
      </el-table>
      <footer class="audit-footer"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="pageSize" @current-change="load" /></footer>
    </section>
    <el-drawer v-model="selected" size="560px" :with-header="false"><div v-if="selected" class="audit-drawer"><header><div><h2>审计详情</h2><p>{{ actionLabel(selected.action) }} · {{ formatDate(selected.created_at) }}</p></div><button aria-label="关闭" @click="selected = null"><el-icon><Close /></el-icon></button></header><section><div class="meta-grid"><span>操作人<strong>{{ selected.actor_name }}</strong></span><span>时间<strong>{{ formatDate(selected.created_at) }}</strong></span><span>对象类型<strong>{{ targetLabel(selected.target_type) }}</strong></span><span>目标 ID<strong>{{ selected.target_id }}</strong></span></div><h3><el-icon><Document /></el-icon> 变更摘要 <small>共 {{ selectedChanges.length }} 项</small></h3><div v-if="selectedChanges.length" class="change-list"><article v-for="change in selectedChanges" :key="change.key"><strong>{{ change.key }}</strong><span>{{ JSON.stringify(change.before) || '—' }} <b>→</b> {{ JSON.stringify(change.after) || '—' }}</span></article></div><el-empty v-else :image-size="46" description="无字段变更" /><h3><el-icon><Document /></el-icon> 原始数据</h3><pre>{{ pretty(selected.after) }}</pre></section></div></el-drawer>
  </div>
</template>

<style scoped>
.audit-page{min-height:calc(100vh - 76px)}.audit-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.audit-filters{display:grid;grid-template-columns:minmax(260px,1.5fr) 185px 160px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.target-id{display:block;margin-top:4px;color:var(--muted);font-size:11px}.action-cell{display:flex;flex-direction:column;gap:3px}.action-cell strong{font-size:13px}.action-cell small{color:var(--muted);font-size:11px}.audit-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.audit-drawer{min-height:100%;background:#f7f9fb}.audit-drawer>header{display:flex;align-items:center;gap:12px;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.audit-drawer>header div{margin-right:auto}.audit-drawer h2{margin:0;font-size:20px}.audit-drawer header p{margin:5px 0 0;color:var(--muted);font-size:12px}.audit-drawer header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.audit-drawer section{padding:20px}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;border-radius:8px;background:#fff}.meta-grid span{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:12px}.meta-grid strong{color:#172033;font-size:13px;word-break:break-all}.audit-drawer h3{display:flex;align-items:center;gap:7px;margin:20px 0 10px;font-size:14px}.audit-drawer h3 .el-icon{color:var(--brand)}.audit-drawer h3 small{margin-left:auto;color:var(--muted);font-size:11px;font-weight:400}.change-list{display:flex;flex-direction:column;gap:8px}.change-list article{display:flex;flex-direction:column;gap:6px;padding:11px 12px;border:1px solid #e5eaed;border-radius:7px;background:#fff}.change-list article strong{color:#5a6572;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}.change-list article span{color:#283442;font-size:12px;line-height:1.5;word-break:break-word}.change-list article b{margin:0 4px;color:var(--brand)}pre{overflow:auto;margin:0;padding:14px;border:1px solid #e5eaed;border-radius:7px;color:#3d4855;background:#fff;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}@media(max-width:1100px){.audit-filters{grid-template-columns:1fr 1fr 1fr 68px 68px}}
</style>
