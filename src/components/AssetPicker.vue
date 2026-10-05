<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import type { AdminAsset } from '../types'

const props = defineProps<{
  modelValue: boolean
  selectedId: string | null
  canUpload: boolean
  preview?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [asset: AdminAsset | null]
}>()
const items = ref<AdminAsset[]>([])
const search = ref('')
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const uploading = ref(false)
let loadVersion = 0
let selectionVersion = 0

async function load() {
  const version = ++loadVersion
  if (props.preview) { items.value = []; total.value = 0; return }
  loading.value = true
  try {
    const result = await adminApi.assets({ kind: 'icon', status: 'active', search: search.value.trim(), page: page.value, page_size: 24 })
    if (version !== loadVersion) return
    items.value = result.items
    total.value = result.pagination.total
  } catch (error) {
    if (version === loadVersion) ElMessage.error(error instanceof Error ? error.message : '图标加载失败')
  } finally { if (version === loadVersion) loading.value = false }
}

async function upload(options: UploadRequestOptions) {
  const version = selectionVersion
  uploading.value = true
  try {
    const asset = await adminApi.uploadAsset(options.file, 'icon')
    options.onSuccess(asset)
    if (!props.modelValue || version !== selectionVersion) return
    search.value = ''
    page.value = 1
    emit('select', asset)
    emit('update:modelValue', false)
    ElMessage.success('图标已上传并选中')
  } catch (error) {
    const message = error instanceof Error ? error.message : '图标上传失败'
    ElMessage.error(message)
    options.onError(Object.assign(new Error(message), { status: 0, method: 'POST', url: '' }))
  } finally { uploading.value = false }
}

watch(() => props.modelValue, (open) => {
  selectionVersion++
  if (open) { page.value = 1; void load() }
  else { loadVersion++; loading.value = false }
}, { flush: 'sync' })

onBeforeUnmount(() => { selectionVersion++; loadVersion++ })
</script>

<template>
  <el-dialog :model-value="modelValue" title="选择图标" width="720px" append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div class="picker-toolbar">
      <el-input v-model="search" clearable placeholder="搜索素材文件名" :prefix-icon="Search" @keyup.enter="page = 1; load()" />
      <el-button @click="page = 1; load()">搜索</el-button>
      <el-upload v-if="canUpload && !preview" :disabled="uploading" :show-file-list="false" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" :http-request="upload">
        <el-button type="primary" :loading="uploading" :icon="Plus">上传新图标</el-button>
      </el-upload>
    </div>
    <p class="picker-help">选择后保存分类即可生效。支持 JPG、PNG、WebP、HEIC/HEIF；苹果照片会自动转换，当前没有合适的图片可直接上传。</p>
    <div v-loading="loading" class="picker-grid">
      <button v-for="asset in items" :key="asset.id" type="button" class="picker-item" :class="{ selected: selectedId === asset.id }" @click="emit('select', asset); emit('update:modelValue', false)">
        <img :src="asset.url" :alt="asset.name" />
        <span :title="asset.name">{{ asset.name }}</span>
        <small v-if="selectedId === asset.id">当前使用</small>
      </button>
      <el-empty v-if="!loading && !items.length" :description="preview ? '预览模式不显示真实素材' : '暂无图标，上传一张即可使用'" />
    </div>
    <div class="picker-footer">
      <el-button @click="emit('select', null); emit('update:modelValue', false)">不使用图标</el-button>
      <el-pagination v-model:current-page="page" :page-size="24" :total="total" layout="prev, pager, next" @current-change="load" />
    </div>
  </el-dialog>
</template>

<style scoped>
.picker-toolbar{display:flex;align-items:center;gap:8px}.picker-toolbar .el-input{flex:1}.picker-help{margin:10px 0 16px;color:#74848b;font-size:12px}.picker-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;min-height:170px;max-height:430px;overflow:auto}.picker-grid .el-empty{grid-column:1/-1}.picker-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;padding:12px;border:1px solid #e4eaed;border-radius:10px;background:#fff;cursor:pointer;transition:border-color .16s ease-out,transform .16s ease-out}.picker-item:hover,.picker-item.selected{border-color:#0aaeb5}.picker-item:active{transform:scale(.97)}.picker-item:focus-visible{outline:3px solid #9be8e9;outline-offset:2px}.picker-item img{width:100%;height:96px;object-fit:contain;border-radius:8px;background:#f6f9fa}.picker-item span{overflow:hidden;width:100%;text-overflow:ellipsis;white-space:nowrap;color:#23343a;font-size:12px}.picker-item small{position:absolute;top:8px;right:8px;padding:3px 6px;border-radius:5px;color:#087b80;background:#e6f8f8;font-size:10px}.picker-footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px}@media(max-width:680px){.picker-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){.picker-item{transition:none}}
</style>
