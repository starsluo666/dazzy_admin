<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { KeywordRule, KeywordRuleInput, KeywordRuleScope } from '../utils/contentReviews'

const props = defineProps<{ canManage: boolean }>()
const emit = defineEmits<{ close: [] }>()
const scopes: Record<KeywordRuleScope, string> = { both: '昵称和评价', nickname: '仅昵称', review: '仅评价文字' }
const rows = ref<KeywordRule[]>([])
const page = ref(1), total = ref(0), search = ref('')
const loading = ref(false), saving = ref(false), error = ref(''), saveError = ref('')
const editing = ref<number | undefined>()
const form = ref<KeywordRuleInput | null>(null)
let loadId = 0

async function load() {
  const own = ++loadId
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.contentKeywordRules(page.value, search.value.trim())
    if (own !== loadId) return
    rows.value = result.items
    total.value = result.pagination.total
  } catch (cause) {
    if (own === loadId) error.value = cause instanceof Error ? cause.message : '规则加载失败'
  } finally { if (own === loadId) loading.value = false }
}

function openForm(rule?: KeywordRule) {
  if (!props.canManage || saving.value) return
  editing.value = rule?.id
  form.value = rule ? { keyword: rule.keyword, scope: rule.scope, label: rule.label, enabled: rule.enabled }
    : { keyword: '', scope: 'both', label: '', enabled: true }
  saveError.value = ''
}

async function save() {
  if (!form.value?.keyword.trim() || !props.canManage || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await adminApi.saveContentKeywordRule({ ...form.value, keyword: form.value.keyword.trim(), label: form.value.label.trim() }, editing.value)
    form.value = null
    ElMessage.success('规则已保存，对新提交的内容生效')
    await load()
  } catch (cause) { saveError.value = cause instanceof Error ? cause.message : '规则保存失败' }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <el-dialog :model-value="true" title="本地词库" width="min(780px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="!$event && emit('close')">
    <p class="description">规则对新提交的昵称或评价文字生效。命中会标记给客服核实，不会直接驳回或处理已发布内容。</p>
    <div class="toolbar"><el-input v-model="search" clearable maxlength="60" placeholder="搜索关键词或说明" @keyup.enter="page = 1; load()" /><el-button @click="page = 1; load()">查询</el-button><el-button v-if="canManage" type="primary" :disabled="saving" @click="openForm()">新增规则</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="暂无自定义规则">
      <el-table-column label="关键词" prop="keyword" min-width="138" show-overflow-tooltip />
      <el-table-column label="作用范围" width="115"><template #default="{ row }">{{ scopes[row.scope as KeywordRuleScope] }}</template></el-table-column>
      <el-table-column label="说明" prop="label" min-width="128" show-overflow-tooltip />
      <el-table-column label="状态" width="86"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
      <el-table-column v-if="canManage" label="操作" width="84"><template #default="{ row }"><el-button type="primary" link :disabled="saving" @click="openForm(row)">编辑</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-if="total > 20" v-model:current-page="page" :total="total" :page-size="20" layout="prev, pager, next" @current-change="load" />
    <div v-if="form" class="editor">
      <h3>{{ editing ? '编辑规则' : '新增规则' }}</h3>
      <el-alert v-if="saveError" :title="saveError" type="error" :closable="false" />
      <el-form label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="关键词" required><el-input v-model="form.keyword" maxlength="60" placeholder="例如：私下转账" /></el-form-item>
        <el-form-item label="作用范围"><el-select v-model="form.scope"><el-option v-for="(label, scope) in scopes" :key="scope" :label="label" :value="scope" /></el-select></el-form-item>
        <el-form-item label="规则说明（选填）"><el-input v-model="form.label" maxlength="40" placeholder="例如：疑似引导线下交易" /></el-form-item>
        <el-form-item label="启用规则"><el-switch v-model="form.enabled" aria-label="启用规则" /></el-form-item>
        <el-button :disabled="saving" @click="form = null">取消</el-button><el-button type="primary" :loading="saving" :disabled="!form.keyword.trim()" native-type="submit">保存规则</el-button>
      </el-form>
    </div>
  </el-dialog>
</template>

<style scoped>
.description{margin:0 0 14px;color:#667085;line-height:1.6}.toolbar{display:flex;gap:8px;margin-bottom:12px}.toolbar .el-input{max-width:280px}.editor{border-top:1px solid #e5eaf0;margin-top:18px;padding-top:12px}.editor h3{margin:0 0 12px}.el-pagination{margin-top:12px;justify-content:flex-end}
</style>
