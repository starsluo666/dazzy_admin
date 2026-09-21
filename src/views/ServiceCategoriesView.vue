<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  CircleClose,
  Grid,
  Plus,
  Refresh,
  Search,
  Service,
} from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import { formatDateTime } from '../utils/format'
import type {
  AdminServiceCategory,
  AdminServiceCategoryMutation,
  AdminServiceCategorySummary,
} from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()

const rows = ref<AdminServiceCategory[]>([])
const summary = ref<AdminServiceCategorySummary>({ total: 0, active: 0, inactive: 0, active_services: 0 })
const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref<AdminServiceCategory | null>(null)
const form = reactive<AdminServiceCategoryMutation>({
  name: '', slug: '', icon_object_key: '', city_codes: [], sort_order: 0, is_active: true,
  platform_commission_rate: 20,
  hourly_min_price_amount: 50, hourly_max_price_amount: 500,
  per_session_min_price_amount: 100, per_session_max_price_amount: 1000,
})

const cityOptions = [
  { value: '130400', label: '邯郸市 · 130400' },
  { value: '110100', label: '北京市 · 110100' },
  { value: '310100', label: '上海市 · 310100' },
  { value: '440100', label: '广州市 · 440100' },
  { value: '440300', label: '深圳市 · 440300' },
]

const demoCategories: AdminServiceCategory[] = [
  demoCategory(1, '棋牌', 'mahjong', 10, 31, 24, []),
  demoCategory(2, '桌球', 'billiards', 20, 26, 19, ['130400', '110100']),
  demoCategory(3, '电竞', 'esports', 30, 18, 15, []),
  demoCategory(4, '密室', 'escape-room', 40, 12, 10, ['130400']),
  demoCategory(5, '桌游', 'board-games', 50, 24, 18, []),
  demoCategory(6, '爬山', 'hiking', 60, 9, 8, ['130400', '110100']),
  demoCategory(7, '商务', 'business', 70, 18, 14, [], false),
]

function demoCategory(
  id: number,
  name: string,
  slug: string,
  sortOrder: number,
  serviceCount: number,
  providerCount: number,
  cityCodes: string[],
  active = true,
): AdminServiceCategory {
  const now = new Date(Date.now() - id * 86400000).toISOString()
  return {
    id, name, slug, icon_object_key: '', icon_url: null, city_codes: cityCodes,
    sort_order: sortOrder, is_active: active, service_count: serviceCount,
    platform_commission_rate: '20.00',
    hourly_min_price_amount: 5000, hourly_max_price_amount: 50000,
    per_session_min_price_amount: 10000, per_session_max_price_amount: 100000,
    active_service_count: active ? serviceCount : 0, provider_count: providerCount,
    created_at: now, updated_at: now,
  }
}

const summaryCards = computed(() => [
  { key: 'all', label: '全部分类', value: summary.value.total, icon: Grid, tone: 'blue' },
  { key: 'active', label: '已启用', value: summary.value.active, icon: CircleCheck, tone: 'cyan' },
  { key: 'inactive', label: '已停用', value: summary.value.inactive, icon: CircleClose, tone: 'orange' },
  { key: 'services', label: '上架服务', value: summary.value.active_services, icon: Service, tone: 'purple' },
])

function filteredDemoRows() {
  const keyword = search.value.trim().toLowerCase()
  return demoCategories.filter((item) => {
    const matchedKeyword = !keyword || `${item.name} ${item.slug}`.toLowerCase().includes(keyword)
    const matchedStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' ? item.is_active : !item.is_active)
    return matchedKeyword && matchedStatus
  })
}

function computeDemoSummary() {
  const keyword = search.value.trim().toLowerCase()
  const items = demoCategories.filter((item) => !keyword || `${item.name} ${item.slug}`.toLowerCase().includes(keyword))
  return {
    total: items.length,
    active: items.filter((item) => item.is_active).length,
    inactive: items.filter((item) => !item.is_active).length,
    active_services: items.reduce((sum, item) => sum + item.active_service_count, 0),
  }
}

async function load() {
  loading.value = true
  try {
    if (props.preview) {
      rows.value = filteredDemoRows()
      total.value = rows.value.length
      summary.value = computeDemoSummary()
      return
    }
    const data = await adminApi.serviceCategories({
      search: search.value.trim(), status: statusFilter.value, page: page.value, page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '分类数据加载失败')
  } finally {
    loading.value = false
  }
}

function resetForm(category?: AdminServiceCategory) {
  editing.value = category || null
  Object.assign(form, category ? {
    name: category.name,
    slug: category.slug,
    icon_object_key: category.icon_object_key,
    city_codes: [...category.city_codes],
    sort_order: category.sort_order,
    is_active: category.is_active,
    platform_commission_rate: Number(category.platform_commission_rate),
    hourly_min_price_amount: category.hourly_min_price_amount / 100,
    hourly_max_price_amount: category.hourly_max_price_amount / 100,
    per_session_min_price_amount: category.per_session_min_price_amount / 100,
    per_session_max_price_amount: category.per_session_max_price_amount / 100,
  } : {
    name: '', slug: '', icon_object_key: '', city_codes: [], sort_order: 0, is_active: true,
    platform_commission_rate: 20,
    hourly_min_price_amount: 50, hourly_max_price_amount: 500,
    per_session_min_price_amount: 100, per_session_max_price_amount: 1000,
  })
}

function openEditor(category?: AdminServiceCategory) {
  if (!props.canManage) return
  resetForm(category)
  dialogVisible.value = true
}

function resetFilters() {
  search.value = ''
  statusFilter.value = 'all'
  page.value = 1
  load()
}

function selectSummary(key: string) {
  if (key === 'services') return
  statusFilter.value = key as 'all' | 'active' | 'inactive'
  page.value = 1
  load()
}

function cityLabel(code: string) {
  return cityOptions.find((item) => item.value === code)?.label.split(' · ')[0] || code
}

async function save() {
  const name = form.name.trim()
  const slug = form.slug.trim().toLowerCase()
  if (!name) return ElMessage.warning('请输入分类名称')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return ElMessage.warning('分类标识仅支持小写字母、数字和连字符')
  if (form.hourly_min_price_amount > form.hourly_max_price_amount) return ElMessage.warning('按小时最高价不能低于最低价')
  if (form.per_session_min_price_amount > form.per_session_max_price_amount) return ElMessage.warning('按次最高价不能低于最低价')
  saving.value = true
  const payload: AdminServiceCategoryMutation = {
    ...form,
    name,
    slug,
    icon_object_key: form.icon_object_key.trim(),
    city_codes: [...new Set(form.city_codes.map((item) => item.trim()).filter(Boolean))],
    hourly_min_price_amount: Math.round(form.hourly_min_price_amount * 100),
    hourly_max_price_amount: Math.round(form.hourly_max_price_amount * 100),
    per_session_min_price_amount: Math.round(form.per_session_min_price_amount * 100),
    per_session_max_price_amount: Math.round(form.per_session_max_price_amount * 100),
  }
  try {
    if (props.preview) {
      const previewPayload = {
        ...payload,
        platform_commission_rate: payload.platform_commission_rate.toFixed(2),
      }
      if (editing.value) {
        const index = demoCategories.findIndex((item) => item.id === editing.value?.id)
        if (index >= 0) demoCategories[index] = { ...demoCategories[index], ...previewPayload, updated_at: new Date().toISOString() }
      } else {
        demoCategories.push({
          id: Math.max(...demoCategories.map((item) => item.id), 0) + 1,
          ...previewPayload,
          icon_url: null,
          service_count: 0,
          active_service_count: 0,
          provider_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    } else if (editing.value) {
      await adminApi.updateServiceCategory(editing.value.id, payload)
    } else {
      await adminApi.createServiceCategory(payload)
    }
    dialogVisible.value = false
    ElMessage.success(editing.value ? '分类已更新，操作已记录' : '分类已创建，操作已记录')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '分类保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(category: AdminServiceCategory) {
  if (!props.canManage) return
  const next = !category.is_active
  const extra = !next && category.active_service_count
    ? `，当前仍有 ${category.active_service_count} 个上架服务，停用后达人将不能再选择此分类`
    : ''
  try {
    await ElMessageBox.confirm(
      `确认${next ? '启用' : '停用'}“${category.name}”${extra}？`,
      `${next ? '启用' : '停用'}分类`,
      { type: next ? 'info' : 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
    )
    if (props.preview) {
      const source = demoCategories.find((item) => item.id === category.id)
      if (source) {
        source.is_active = next
        source.active_service_count = next ? source.service_count : 0
        source.updated_at = new Date().toISOString()
      }
    } else {
      await adminApi.updateServiceCategory(category.id, { is_active: next })
    }
    ElMessage.success(`分类已${next ? '启用' : '停用'}，操作已记录`)
    await load()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="page category-page">
    <header class="page-heading category-heading">
      <div><h1>服务分类</h1><p>统一维护达人可发布的服务类型、展示城市与前台排序</p></div>
      <div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openEditor()">新增分类</el-button>
      </div>
    </header>

    <section class="category-summary">
      <button v-for="item in summaryCards" :key="item.key" :class="{ static: item.key === 'services' }" @click="selectSummary(item.key)">
        <el-icon :class="item.tone"><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
        <small v-if="item.key !== 'services'">查看</small><small v-else>当前有效</small>
      </button>
    </section>

    <section class="category-panel">
      <div class="category-filters">
        <el-input v-model="search" clearable placeholder="搜索分类名称或标识" :prefix-icon="Search" @keyup.enter="page = 1; load()" />
        <el-select v-model="statusFilter" @change="page = 1; load()">
          <el-option label="全部状态" value="all" />
          <el-option label="已启用" value="active" />
          <el-option label="已停用" value="inactive" />
        </el-select>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" height="calc(100vh - 386px)" empty-text="暂无符合条件的服务分类">
        <el-table-column label="排序" prop="sort_order" width="78" align="center" />
        <el-table-column label="分类" min-width="210">
          <template #default="{ row }">
            <div class="category-name">
              <el-image v-if="row.icon_url" :src="row.icon_url" fit="cover" />
              <span v-else>{{ row.name.slice(0, 1) }}</span>
              <div><strong>{{ row.name }}</strong><small>{{ row.slug }}</small></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="展示城市" min-width="220">
          <template #default="{ row }">
            <div v-if="row.city_codes.length" class="city-tags">
              <el-tag v-for="code in row.city_codes.slice(0, 3)" :key="code" effect="plain" size="small">{{ cityLabel(code) }}</el-tag>
              <span v-if="row.city_codes.length > 3">+{{ row.city_codes.length - 3 }}</span>
            </div>
            <span v-else class="all-city">全部城市</span>
          </template>
        </el-table-column>
        <el-table-column label="关联数据" min-width="170">
          <template #default="{ row }">
            <div class="relation-count"><strong>{{ row.active_service_count }} / {{ row.service_count }}</strong><span>上架 / 全部服务</span></div>
            <div class="relation-count provider-count"><strong>{{ row.provider_count }}</strong><span>位达人</span></div>
          </template>
        </el-table-column>
        <el-table-column label="平台抽成" width="110" align="center">
          <template #default="{ row }"><strong>{{ Number(row.platform_commission_rate).toFixed(2) }}%</strong></template>
        </el-table-column>
        <el-table-column label="价格区间" min-width="190">
          <template #default="{ row }">
            <div class="price-copy">按小时 ¥{{ row.hourly_min_price_amount / 100 }}–{{ row.hourly_max_price_amount / 100 }}</div>
            <div class="price-copy">按次 ¥{{ row.per_session_min_price_amount / 100 }}–{{ row.per_session_max_price_amount / 100 }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'" effect="light">{{ row.is_active ? '已启用' : '已停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="最近更新" min-width="170">
          <template #default="{ row }"><span class="updated-at">{{ formatDateTime(row.updated_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="!canManage" @click="openEditor(row)">编辑</el-button>
            <el-button link :type="row.is_active ? 'danger' : 'success'" :disabled="!canManage" @click="toggleStatus(row)">{{ row.is_active ? '停用' : '启用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <footer class="category-footer">
        <span>共 {{ total }} 个分类 · 空城市范围表示全平台展示</span>
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load" />
      </footer>
    </section>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑服务分类' : '新增服务分类'" width="580px" destroy-on-close>
      <el-form label-position="top" class="category-form">
        <div class="form-grid">
          <el-form-item label="分类名称" required><el-input v-model="form.name" maxlength="30" placeholder="例如：桌球" /></el-form-item>
          <el-form-item label="分类标识" required>
            <el-input v-model="form.slug" :disabled="Boolean(editing?.service_count)" maxlength="40" placeholder="例如：billiards" />
            <small v-if="editing?.service_count" class="form-tip">已有服务关联，标识不可修改</small>
          </el-form-item>
        </div>
        <div class="form-grid compact-grid">
          <el-form-item label="前台排序"><el-input-number v-model="form.sort_order" :min="0" :max="9999" controls-position="right" /></el-form-item>
          <el-form-item label="平台抽成比例"><el-input-number v-model="form.platform_commission_rate" :min="0" :max="100" :step="0.5" :precision="2" controls-position="right" /></el-form-item>
        </div>
        <div class="form-grid compact-grid">
          <el-form-item label="按小时价格区间（元）" required>
            <div class="price-range"><el-input-number v-model="form.hourly_min_price_amount" :min="0.01" :precision="2" /><span>至</span><el-input-number v-model="form.hourly_max_price_amount" :min="0.01" :precision="2" /></div>
          </el-form-item>
          <el-form-item label="按次价格区间（元）" required>
            <div class="price-range"><el-input-number v-model="form.per_session_min_price_amount" :min="0.01" :precision="2" /><span>至</span><el-input-number v-model="form.per_session_max_price_amount" :min="0.01" :precision="2" /></div>
          </el-form-item>
        </div>
        <el-form-item label="启用状态"><el-switch v-model="form.is_active" inline-prompt active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item label="展示城市">
          <el-select v-model="form.city_codes" multiple filterable allow-create default-first-option collapse-tags :max-collapse-tags="3" placeholder="留空表示全部城市">
            <el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value" />
          </el-select>
          <small class="form-tip">可直接输入城市行政区划编码；留空时面向全部城市展示</small>
        </el-form-item>
        <el-form-item label="图标资源键">
          <el-input v-model="form.icon_object_key" maxlength="512" placeholder="可选，例如 public/category-icons/billiards.webp" />
          <small class="form-tip">用于用户端分类图标；未配置时前台使用默认图标</small>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存分类</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.category-page{min-height:calc(100vh - 76px)}.category-heading{margin-bottom:18px}.category-heading>div:last-child{display:flex;gap:8px}.category-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.category-summary button{position:relative;display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto auto;align-items:center;min-height:88px;padding:14px 15px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.category-summary button:not(.static):hover{border-color:#9cdfe0;box-shadow:0 8px 24px rgba(29,72,87,.08);transform:translateY(-1px)}.category-summary button:focus-visible{outline:3px solid rgba(8,184,189,.22);outline-offset:2px}.category-summary .el-icon{grid-row:1/3;width:40px;height:40px;border-radius:11px;font-size:21px}.category-summary .blue{color:#2679e9!important;background:#e9f1ff}.category-summary .cyan{color:#00aeb4!important;background:#e4f8f8}.category-summary .orange{color:#e97825!important;background:#fff0e6}.category-summary .purple{color:#7b61cf;background:#f0edff}.category-summary span{color:var(--muted);font-size:12px}.category-summary strong{font-size:25px}.category-summary small{position:absolute;right:14px;bottom:14px;color:#a0a7b0}.category-summary button.static{cursor:default}.category-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.category-filters{display:grid;grid-template-columns:minmax(260px,1fr) 140px 68px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.category-name{display:flex;align-items:center;gap:11px}.category-name>.el-image,.category-name>span{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:10px}.category-name>span{color:#078f94;background:#e4f8f8;font-size:16px;font-weight:750}.category-name>div{display:flex;flex-direction:column;gap:4px}.category-name strong{font-size:13px}.category-name small,.updated-at{color:var(--muted);font-size:11px}.city-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.city-tags>span{color:var(--muted);font-size:11px}.all-city{color:#078f94;font-size:12px}.relation-count{display:inline-flex;flex-direction:column;gap:3px;min-width:82px}.relation-count strong{font-size:13px}.relation-count span,.price-copy{color:var(--muted);font-size:10px}.price-copy+ .price-copy{margin-top:5px}.provider-count{min-width:auto;padding-left:12px;border-left:1px solid #e8ecef}.category-footer{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 18px;color:var(--muted);font-size:13px}.category-form{margin-top:8px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.compact-grid{grid-template-columns:1fr 1fr}.price-range{display:flex;align-items:center;gap:6px}.price-range span{color:var(--muted);font-size:12px}.category-form .el-select,.category-form .el-input-number{width:100%}.form-tip{display:block;margin-top:6px;color:#8a929d;font-size:11px;line-height:1.5}:deep(.el-table__row:hover td){background:#f2fbfb!important}@media(max-width:1280px){.category-filters{grid-template-columns:minmax(220px,1fr) 125px 64px 64px}.category-summary small{display:none}}@media(prefers-reduced-motion:reduce){.category-summary button{transition:none}.category-summary button:hover{transform:none}}
</style>
