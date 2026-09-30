<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import type { AdminAsset } from '../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const items = ref<AdminAsset[]>([])
const loading = ref(false)
const pendingUploads = ref(0)
const uploading = computed(() => pendingUploads.value > 0)
const search = ref('')
const kind = ref<'all' | 'icon' | 'image'>('all')
const uploadKind = ref<'icon' | 'image'>('icon')
const status = ref<'active' | 'trash'>('active')
const page = ref(1)
const total = ref(0)
const selectedIds = ref<string[]>([])
const pageSize = 24
let loadVersion = 0
const hasSelection = computed(() => selectedIds.value.length > 0)

async function load() {
  const version = ++loadVersion
  selectedIds.value = []
  if (props.preview) { items.value = []; total.value = 0; return }
  loading.value = true
  try {
    const result = await adminApi.assets({ kind: kind.value, status: status.value, search: search.value.trim(), page: page.value, page_size: pageSize })
    if (version !== loadVersion) return
    items.value = result.items
    total.value = result.pagination.total
  } catch (error) {
    if (version === loadVersion) ElMessage.error(error instanceof Error ? error.message : '素材加载失败')
  } finally { if (version === loadVersion) loading.value = false }
}

function query() { page.value = 1; void load() }

async function upload(options: UploadRequestOptions) {
  const submittedKind = uploadKind.value
  pendingUploads.value++
  try {
    await adminApi.uploadAsset(options.file, submittedKind)
    status.value = 'active'
    kind.value = submittedKind
    search.value = ''
    page.value = 1
    await load()
    ElMessage.success('素材已上传')
    options.onSuccess({})
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    ElMessage.error(message)
    options.onError(Object.assign(new Error(message), { status: 0, method: 'POST', url: '' }))
  } finally { pendingUploads.value-- }
}

function toggleSelection(id: string, checked: boolean | string | number) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((value) => value !== id)
}

async function trash(ids: string[]) {
  if (!ids.length || !props.canManage) return
  try {
    await ElMessageBox.confirm(`将 ${ids.length} 张未使用的素材移入回收站？可随时恢复。`, '确认移入回收站', { type: 'warning' })
    if (props.preview) return
    const result = await adminApi.trashAssets(ids)
    if (result.blocked.length) ElMessage.warning(`${result.blocked.length} 张素材正在被引用，已保留`)
    if (result.deleted.length) ElMessage.success(`${result.deleted.length} 张素材已移入回收站`)
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function restore(id: string) {
  try {
    if (!props.preview) await adminApi.restoreAsset(id)
    ElMessage.success('素材已恢复')
    await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '恢复失败') }
}

function referencesText(asset: AdminAsset) {
  return asset.references.map((item) => `${item.type === 'service_category' ? '服务分类' : '活动标签'}：${item.name}`).join('；')
}

onMounted(load)
</script>

<template>
  <div class="page assets-page">
    <header class="page-heading assets-heading">
      <div><h1>素材库</h1><p>管理运营上传的公开素材；用户头像、认证与订单证据不会出现在这里</p></div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </header>
    <section class="asset-panel">
      <div class="asset-toolbar">
        <el-segmented v-model="status" :options="[{ label: '可用素材', value: 'active' }, { label: '回收站', value: 'trash' }]" @change="query" />
        <el-select v-model="kind" style="width:120px" @change="query"><el-option label="全部素材" value="all"/><el-option label="图标" value="icon"/><el-option label="图片" value="image"/></el-select>
        <el-input v-model="search" clearable placeholder="搜索文件名" :prefix-icon="Search" @keyup.enter="query" />
        <el-button @click="query">查询</el-button>
        <template v-if="status === 'active' && canManage">
          <el-select v-model="uploadKind" style="width:100px"><el-option label="图标" value="icon"/><el-option label="图片" value="image"/></el-select>
          <el-upload v-if="!preview" :show-file-list="false" accept="image/jpeg,image/png,image/webp" :http-request="upload" multiple><el-button type="primary" :icon="Plus" :loading="uploading">上传素材</el-button></el-upload>
          <el-button v-else type="primary" :icon="Plus" disabled>上传素材</el-button>
        </template>
      </div>
      <div v-if="status === 'active' && canManage" class="selection-bar">
        <span>已选 {{ selectedIds.length }} 张 · 被引用的素材不能删除</span>
        <el-button type="danger" plain :icon="Delete" :disabled="!hasSelection" @click="trash(selectedIds)">批量移入回收站</el-button>
      </div>
      <div v-loading="loading" class="asset-grid">
        <article v-for="asset in items" :key="asset.id" class="asset-card">
          <div class="asset-preview"><img :src="asset.url" :alt="asset.name" loading="lazy"/><el-checkbox v-if="status === 'active' && canManage" :model-value="selectedIds.includes(asset.id)" :disabled="asset.reference_count > 0" @change="toggleSelection(asset.id, $event)" /></div>
          <div class="asset-meta"><strong :title="asset.name">{{ asset.name }}</strong><small>{{ asset.kind === 'icon' ? '图标' : '图片' }} · {{ asset.size_bytes == null ? '大小未知' : `${Math.ceil(asset.size_bytes / 1024)} KB` }}</small></div>
          <div class="asset-footer"><el-tooltip v-if="asset.reference_count" :content="referencesText(asset)" placement="top"><span class="used">被 {{ asset.reference_count }} 处引用</span></el-tooltip><span v-else class="unused">未使用</span><el-button v-if="status === 'active'" link type="danger" :disabled="!canManage || asset.reference_count > 0" @click="trash([asset.id])">删除</el-button><el-button v-else link type="primary" :disabled="!canManage" @click="restore(asset.id)">恢复</el-button></div>
        </article>
        <el-empty v-if="!loading && !items.length" :description="status === 'trash' ? '回收站为空' : '暂无素材，上传后即可在分类设置中选择'" />
      </div>
      <footer class="asset-pagination"><span>共 {{ total }} 张素材</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></footer>
    </section>
  </div>
</template>

<style scoped>
.assets-page{min-height:calc(100vh - 76px)}.assets-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.asset-panel{overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff}.asset-toolbar{display:flex;align-items:center;gap:9px;padding:16px;border-bottom:1px solid var(--line)}.asset-toolbar .el-input{flex:1;max-width:360px}.selection-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--line);color:#708087;font-size:12px}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:15px;min-height:240px;padding:18px}.asset-grid .el-empty{grid-column:1/-1}.asset-card{min-width:0;overflow:hidden;border:1px solid #e3e9ec;border-radius:10px;background:#fff}.asset-preview{position:relative;display:grid;place-items:center;height:152px;background:#f5f8f9}.asset-preview img{max-width:100%;max-height:100%;object-fit:contain}.asset-preview .el-checkbox{position:absolute;top:9px;left:10px;margin:0;padding:5px;border-radius:6px;background:#fff}.asset-meta{display:flex;flex-direction:column;gap:5px;padding:12px 12px 8px}.asset-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.asset-meta small{color:#819097;font-size:11px}.asset-footer{display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:0 12px 8px}.asset-footer span{font-size:11px}.used{color:#ba6d22}.unused{color:#8a979b}.asset-pagination{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-top:1px solid var(--line);color:#718188;font-size:12px}@media(max-width:850px){.asset-toolbar{flex-wrap:wrap}.asset-toolbar .el-input{max-width:none}}@media(prefers-reduced-motion:reduce){.asset-card{transition:none}}
</style>
