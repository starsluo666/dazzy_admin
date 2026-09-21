<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'

import { adminApi } from '../../services/api'
import type { AdminActivityCategory, AdminActivityCategoryMutation, AdminActivityCategorySummary } from '../../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const rows = ref<AdminActivityCategory[]>([])
const summary = ref<AdminActivityCategorySummary>({ total: 0, active: 0, inactive: 0, active_activities: 0 })
const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref<AdminActivityCategory | null>(null)
const form = reactive<AdminActivityCategoryMutation>({
  name: '', slug: '', icon_object_key: '', city_codes: [], min_capacity: 2,
  max_capacity: 100, min_aa_principal_amount: 1, max_aa_principal_amount: 10000000,
  content_guidance: '', sort_order: 0, is_active: true,
})
const cityOptions = [
  { value: '130400', label: '邯郸市 · 130400' },
  { value: '110100', label: '北京市 · 110100' },
  { value: '310100', label: '上海市 · 310100' },
  { value: '440100', label: '广州市 · 440100' },
]

function demo(id: number, name: string, slug: string, count: number, active = true): AdminActivityCategory {
  return {
    id, name, slug, icon_object_key: '', icon_url: null, city_codes: id < 3 ? ['130400'] : [],
    min_capacity: 2, max_capacity: id === 4 ? 20 : 100,
    min_aa_principal_amount: 100, max_aa_principal_amount: id === 4 ? 50000 : 200000,
    content_guidance: '活动介绍须说明流程、适合人群、费用范围及集合要求。',
    sort_order: id * 10, is_active: active, activity_count: count,
    active_activity_count: active ? Math.min(count, 12) : 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
}
const demoRows = ref([
  demo(1, '桌球', 'billiards', 32), demo(2, '棋牌', 'board-games', 26),
  demo(3, '电竞', 'esports', 18), demo(4, '爬山', 'hiking', 9),
  demo(5, '商务', 'business', 5, false),
])

function filteredDemo() {
  const keyword = search.value.trim().toLowerCase()
  return demoRows.value.filter((item) => {
    const statusMatch = statusFilter.value === 'all' || item.is_active === (statusFilter.value === 'active')
    return statusMatch && (!keyword || `${item.name} ${item.slug}`.toLowerCase().includes(keyword))
  })
}
function demoSummary(): AdminActivityCategorySummary {
  return {
    total: demoRows.value.length, active: demoRows.value.filter((item) => item.is_active).length,
    inactive: demoRows.value.filter((item) => !item.is_active).length,
    active_activities: demoRows.value.reduce((sum, item) => sum + item.active_activity_count, 0),
  }
}
async function load() {
  loading.value = true
  try {
    if (props.preview) {
      rows.value = filteredDemo(); summary.value = demoSummary(); return
    }
    const data = await adminApi.activityCategories({ search: search.value.trim(), status: statusFilter.value, page_size: 50 })
    rows.value = data.items; summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '活动标签加载失败')
  } finally { loading.value = false }
}
function resetForm(item?: AdminActivityCategory) {
  editing.value = item || null
  Object.assign(form, item ? {
    name: item.name, slug: item.slug, icon_object_key: item.icon_object_key,
    city_codes: [...item.city_codes], min_capacity: item.min_capacity,
    max_capacity: item.max_capacity, min_aa_principal_amount: item.min_aa_principal_amount,
    max_aa_principal_amount: item.max_aa_principal_amount, content_guidance: item.content_guidance,
    sort_order: item.sort_order, is_active: item.is_active,
  } : {
    name: '', slug: '', icon_object_key: '', city_codes: [], min_capacity: 2,
    max_capacity: 100, min_aa_principal_amount: 1, max_aa_principal_amount: 10000000,
    content_guidance: '', sort_order: 0, is_active: true,
  })
}
function openEditor(item?: AdminActivityCategory) { if (props.canManage) { resetForm(item); dialogVisible.value = true } }
async function save() {
  if (!form.name.trim()) return ElMessage.warning('请输入分类名称')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) return ElMessage.warning('分类标识仅支持小写字母、数字和连字符')
  const payload: AdminActivityCategoryMutation = {
    ...form, name: form.name.trim(), slug: form.slug.trim().toLowerCase(),
    icon_object_key: form.icon_object_key.trim(), content_guidance: form.content_guidance.trim(),
    city_codes: [...new Set(form.city_codes)],
  }
  saving.value = true
  try {
    if (props.preview) {
      if (editing.value) Object.assign(demoRows.value.find((item) => item.id === editing.value?.id)!, payload, { updated_at: new Date().toISOString() })
      else demoRows.value.push({ id: Math.max(...demoRows.value.map((item) => item.id)) + 1, ...payload, icon_url: null, activity_count: 0, active_activity_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    } else if (editing.value) await adminApi.updateActivityCategory(editing.value.id, payload)
    else await adminApi.createActivityCategory(payload)
    dialogVisible.value = false; ElMessage.success(editing.value ? '活动标签已更新' : '活动标签已创建'); await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') }
  finally { saving.value = false }
}
async function toggle(item: AdminActivityCategory) {
  if (!props.canManage) return
  try {
    await ElMessageBox.confirm(`确认${item.is_active ? '停用' : '启用'}“${item.name}”？已发布活动不受影响。`, '标签状态', { type: 'warning' })
    if (props.preview) { item.is_active = !item.is_active; item.updated_at = new Date().toISOString() }
    else await adminApi.updateActivityCategory(item.id, { is_active: !item.is_active })
    ElMessage.success('分类状态已更新'); await load()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '更新失败') }
}
function cityLabel(code: string) { return cityOptions.find((item) => item.value === code)?.label.split(' · ')[0] || code }
onMounted(load)
</script>

<template>
  <section class="category-wrap">
    <div class="category-toolbar">
      <div><strong>活动标签配置</strong><span>独立于达人服务分类，用于活动发布、搜索与筛选</span></div>
      <div><el-button :icon="Refresh" @click="load">刷新</el-button><el-button v-if="canManage" type="primary" :icon="Plus" @click="openEditor()">新增标签</el-button></div>
    </div>
    <div class="mini-summary"><span>全部 <b>{{ summary.total }}</b></span><span>已启用 <b>{{ summary.active }}</b></span><span>已停用 <b>{{ summary.inactive }}</b></span><span>活跃活动 <b>{{ summary.active_activities }}</b></span></div>
    <div class="filters"><el-input v-model="search" clearable :prefix-icon="Search" placeholder="搜索标签名称或标识" @keyup.enter="load"/><el-select v-model="statusFilter" @change="load"><el-option label="全部状态" value="all"/><el-option label="已启用" value="active"/><el-option label="已停用" value="inactive"/></el-select><el-button type="primary" @click="load">查询</el-button></div>
    <el-table v-loading="loading" :data="rows" height="calc(100vh - 360px)" empty-text="暂无活动标签">
      <el-table-column label="排序" prop="sort_order" width="72" align="center"/>
      <el-table-column label="标签" min-width="210"><template #default="{ row }"><div class="name"><span>{{ row.name.slice(0,1) }}</span><div><strong>{{ row.name }}</strong><small>{{ row.slug }}</small></div></div></template></el-table-column>
      <el-table-column label="展示城市" min-width="170"><template #default="{ row }"><div class="cities"><el-tag v-for="code in row.city_codes" :key="code" size="small" effect="plain">{{ cityLabel(code) }}</el-tag><span v-if="!row.city_codes.length">全部城市</span></div></template></el-table-column>
      <el-table-column label="关联活动" width="110"><template #default="{ row }"><strong>{{ row.active_activity_count }}</strong><small> / {{ row.activity_count }}</small></template></el-table-column>
      <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="140" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="!canManage" @click="openEditor(row)">编辑</el-button><el-button link :type="row.is_active ? 'danger' : 'success'" :disabled="!canManage" @click="toggle(row)">{{ row.is_active ? '停用' : '启用' }}</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑活动标签' : '新增活动标签'" width="620px" destroy-on-close>
      <el-form label-position="top" class="form">
        <div class="grid"><el-form-item label="标签名称" required><el-input v-model="form.name" maxlength="30"/></el-form-item><el-form-item label="标签标识" required><el-input v-model="form.slug" :disabled="Boolean(editing?.activity_count)"/></el-form-item></div>
        <el-form-item label="展示城市"><el-select v-model="form.city_codes" multiple collapse-tags placeholder="留空表示全部城市"><el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value"/></el-select></el-form-item>
        <el-form-item label="图标对象键"><el-input v-model="form.icon_object_key" placeholder="可选，用于客户端标签图标"/></el-form-item>
        <div class="grid"><el-form-item label="前台排序"><el-input-number v-model="form.sort_order" :min="0" :max="9999"/></el-form-item><el-form-item label="启用状态"><el-switch v-model="form.is_active" inline-prompt active-text="启用" inactive-text="停用"/></el-form-item></div>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存标签</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.category-wrap{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.category-toolbar{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;border-bottom:1px solid var(--line)}.category-toolbar>div{display:flex;align-items:center;gap:8px}.category-toolbar>div:first-child{flex-direction:column;align-items:flex-start;gap:3px}.category-toolbar strong{font-size:15px}.category-toolbar span{color:var(--muted);font-size:11px}.mini-summary{display:flex;gap:30px;padding:13px 18px;color:var(--muted);background:#f8fafb;font-size:12px}.mini-summary b{margin-left:6px;color:#172033;font-size:16px}.filters{display:grid;grid-template-columns:minmax(260px,1fr) 150px 70px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.name{display:flex;align-items:center;gap:10px}.name>span{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;color:#078f94;background:#e4f8f8;font-weight:750}.name>div,.limits{display:flex;flex-direction:column;gap:4px}.name small,.limits span,.category-wrap td small{color:var(--muted);font-size:10px}.limits strong{font-size:12px}.cities{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.cities>span{color:#078f94;font-size:11px}.form .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form .el-select,.form .el-input-number{width:100%}.range{display:grid;grid-template-columns:1fr 22px 1fr;align-items:center;width:100%;text-align:center}.range span{color:var(--muted);font-size:11px}
</style>
