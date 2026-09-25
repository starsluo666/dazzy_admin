<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

import { adminApi } from '../services/api'
import type { AdminCouponTemplate, AdminCouponTemplateMutation } from '../types'
import { formatMoney } from '../utils/format'

const props = defineProps<{ preview: boolean; canManage: boolean; canIssue: boolean }>()
type UserOption = { public_id: string; nickname: string; phone_masked: string }

const templates = ref<AdminCouponTemplate[]>([])
const users = ref<UserOption[]>([])
const selectedUser = ref('')
const loading = ref(false)
const userSearching = ref(false)
const saving = ref(false)
const issuing = ref(false)
const editorVisible = ref(false)
const issueDialogVisible = ref(false)
const editing = ref<AdminCouponTemplate | null>(null)
const issueTemplate = ref<AdminCouponTemplate | null>(null)
const form = reactive({
  name: '', description: '', faceYuan: 20, thresholdYuan: 100, validDays: 365, isActive: true,
})

const selectedUserInfo = computed(() => users.value.find((item) => item.public_id === selectedUser.value))
const demoTemplates: AdminCouponTemplate[] = [
  { public_id: 'demo-new-user', name: '新用户立减券', description: '达人服务订单可用', face_amount: 2000, min_order_amount: 10000, valid_days: 365, is_active: true, issued_count: 18, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { public_id: 'demo-return', name: '回访关怀券', description: '客服回访补偿使用', face_amount: 1000, min_order_amount: 5000, valid_days: 90, is_active: false, issued_count: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

async function load() {
  loading.value = true
  try {
    templates.value = props.preview
      ? structuredClone(demoTemplates)
      : (await adminApi.couponTemplates()).items
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '优惠券模板加载失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    name: '', description: '', faceYuan: 20, thresholdYuan: 100, validDays: 365, isActive: true,
  })
}

function openEditor(item?: AdminCouponTemplate, duplicate = false) {
  if (!props.canManage) return
  resetForm()
  editing.value = item && !duplicate ? item : null
  if (item) {
    Object.assign(form, {
      name: duplicate ? `${item.name}副本` : item.name,
      description: item.description,
      faceYuan: item.face_amount / 100,
      thresholdYuan: item.min_order_amount / 100,
      validDays: item.valid_days,
      isActive: duplicate ? false : item.is_active,
    })
  }
  editorVisible.value = true
}

function mutationPayload(): AdminCouponTemplateMutation | null {
  const name = form.name.trim()
  if (!name) { ElMessage.warning('请填写优惠券名称'); return null }
  if (form.faceYuan <= 0 || form.faceYuan > 1000) { ElMessage.warning('面额必须在 0.01–1000 元之间'); return null }
  if (form.thresholdYuan < 0 || form.thresholdYuan > 100000) { ElMessage.warning('使用门槛必须在 0–100000 元之间'); return null }
  if (form.validDays < 1 || form.validDays > 3650) { ElMessage.warning('有效期必须在 1–3650 天之间'); return null }
  return {
    name,
    description: form.description.trim(),
    face_amount: Math.round(form.faceYuan * 100),
    min_order_amount: Math.round(form.thresholdYuan * 100),
    valid_days: form.validDays,
    is_active: form.isActive,
  }
}

async function saveTemplate() {
  const payload = mutationPayload()
  if (!payload || saving.value) return
  saving.value = true
  try {
    if (props.preview) {
      if (editing.value) Object.assign(editing.value, payload, { updated_at: new Date().toISOString() })
      else templates.value.unshift({ public_id: `demo-${Date.now()}`, issued_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload })
    } else if (editing.value) {
      await adminApi.updateCouponTemplate(editing.value.public_id, payload)
    } else {
      await adminApi.createCouponTemplate(payload)
    }
    editorVisible.value = false
    ElMessage.success(editing.value ? '优惠券模板已更新' : '优惠券模板已创建')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '优惠券模板保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleTemplate(item: AdminCouponTemplate) {
  if (!props.canManage) return
  try {
    await ElMessageBox.confirm(
      `确认${item.is_active ? '停用' : '启用'}“${item.name}”？${item.is_active ? '停用后不可继续发放，已发出的优惠券不受影响。' : ''}`,
      '模板状态',
      { type: 'warning' },
    )
    if (props.preview) item.is_active = !item.is_active
    else await adminApi.updateCouponTemplate(item.public_id, { is_active: !item.is_active })
    ElMessage.success('模板状态已更新')
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function removeTemplate(item: AdminCouponTemplate) {
  if (!props.canManage || item.issued_count) return
  try {
    await ElMessageBox.confirm(`确认删除从未发放过的模板“${item.name}”？删除后不可恢复。`, '删除模板', { type: 'warning' })
    if (props.preview) templates.value = templates.value.filter((entry) => entry.public_id !== item.public_id)
    else await adminApi.deleteCouponTemplate(item.public_id)
    ElMessage.success('优惠券模板已删除')
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '模板删除失败')
  }
}

function openIssue(item: AdminCouponTemplate) {
  if (!props.canIssue || !item.is_active) return
  issueTemplate.value = item
  users.value = []
  selectedUser.value = ''
  userSearching.value = false
  issueDialogVisible.value = true
}

let userSearchRequest = 0

async function findUsers(value: string) {
  const keyword = value.trim()
  const requestId = ++userSearchRequest
  if (!keyword) {
    users.value = []
    userSearching.value = false
    return
  }
  if (props.preview) {
    users.value = [{ public_id: 'demo-user', nickname: '体验用户', phone_masked: '188****6621' }]
    userSearching.value = false
    return
  }
  userSearching.value = true
  try {
    const data = await adminApi.couponUsers(keyword)
    if (requestId === userSearchRequest) users.value = data.users
  } catch (error) {
    if (requestId === userSearchRequest) {
      users.value = []
      ElMessage.error(error instanceof Error ? error.message : '用户查询失败')
    }
  } finally {
    if (requestId === userSearchRequest) userSearching.value = false
  }
}

async function issue() {
  if (!props.canIssue || !selectedUser.value || !issueTemplate.value || issuing.value || props.preview) return
  const user = selectedUserInfo.value
  issuing.value = true
  try {
    await ElMessageBox.confirm(
      `确认向 ${user?.nickname || user?.phone_masked || '该用户'} 发放一张“${issueTemplate.value.name}”？`,
      '确认发放优惠券',
      { type: 'warning' },
    )
    await adminApi.issueCoupon(selectedUser.value, issueTemplate.value.public_id)
    issueDialogVisible.value = false
    ElMessage.success('优惠券已发放，用户将收到通知')
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '优惠券发放失败')
  } finally {
    issuing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page coupon-page" v-loading="loading">
    <header class="page-heading">
      <div><h1>优惠券管理</h1><p>配置优惠券模板，并从指定模板向用户发放优惠券。</p></div>
      <div class="heading-actions"><el-button :icon="Refresh" @click="load">刷新</el-button><el-button v-if="canManage" type="primary" :icon="Plus" @click="openEditor()">新增优惠券</el-button></div>
    </header>

    <section class="coupon-panel">
      <div class="panel-heading"><div><h2>优惠券模板</h2><p>已发放模板不可删除，可停用以阻止继续发放。</p></div></div>
      <el-table :data="templates" empty-text="暂无优惠券模板" height="calc(100vh - 250px)">
        <el-table-column label="模板" min-width="220"><template #default="{ row }"><div class="primary-cell"><strong>{{ row.name }}</strong><span>{{ row.description || '达人服务订单可用' }}</span></div></template></el-table-column>
        <el-table-column label="面额" width="110"><template #default="{ row }"><strong class="money">{{ formatMoney(row.face_amount) }}</strong></template></el-table-column>
        <el-table-column label="使用门槛" min-width="165"><template #default="{ row }">订单金额大于 {{ formatMoney(row.min_order_amount) }}</template></el-table-column>
        <el-table-column label="有效期" width="120"><template #default="{ row }">领取后 {{ row.valid_days }} 天</template></el-table-column>
        <el-table-column label="已发放" width="95"><template #default="{ row }">{{ row.issued_count }} 张</template></el-table-column>
        <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-tooltip :disabled="row.is_active" content="停用模板不能发放"><span><el-button link type="primary" :disabled="!canIssue || !row.is_active" @click="openIssue(row)">发放</el-button></span></el-tooltip>
            <el-button link type="primary" :disabled="!canManage" @click="openEditor(row)">编辑</el-button>
            <el-button link :disabled="!canManage" @click="openEditor(row, true)">复制</el-button>
            <el-button link :type="row.is_active ? 'warning' : 'success'" :disabled="!canManage" @click="toggleTemplate(row)">{{ row.is_active ? '停用' : '启用' }}</el-button>
            <el-tooltip :disabled="!row.issued_count" content="已有发放记录，只能停用"><span><el-button link type="danger" :disabled="!canManage || Boolean(row.issued_count)" @click="removeTemplate(row)">删除</el-button></span></el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="editorVisible" :title="editing ? '编辑优惠券模板' : '新增优惠券模板'" width="620px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="优惠券名称" required><el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：新用户立减券" /></el-form-item>
        <el-form-item label="使用说明"><el-input v-model="form.description" maxlength="255" show-word-limit placeholder="例如：达人服务订单可用" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="面额" required><el-input-number v-model="form.faceYuan" :min="0.01" :max="1000" :precision="2" /><span class="unit">元</span></el-form-item>
          <el-form-item label="订单使用门槛" required><el-input-number v-model="form.thresholdYuan" :min="0" :max="100000" :precision="2" /><span class="unit">元以上</span></el-form-item>
          <el-form-item label="领取后有效期" required><el-input-number v-model="form.validDays" :min="1" :max="3650" /><span class="unit">天</span></el-form-item>
          <el-form-item label="模板状态"><el-switch v-model="form.isActive" inline-prompt active-text="启用" inactive-text="停用" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="editorVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTemplate">保存模板</el-button></template>
    </el-dialog>

    <el-dialog v-model="issueDialogVisible" title="发放优惠券" width="560px" destroy-on-close>
      <div v-if="issueTemplate" class="issue-summary">
        <div><span>当前优惠券</span><strong>{{ issueTemplate.name }}</strong></div>
        <div class="issue-amount">{{ formatMoney(issueTemplate.face_amount) }}</div>
        <p>订单金额大于 {{ formatMoney(issueTemplate.min_order_amount) }} 可用 · 领取后 {{ issueTemplate.valid_days }} 天有效</p>
      </div>
      <el-form label-position="top">
        <el-form-item label="接收用户" required>
          <el-select
            v-model="selectedUser"
            class="user-search-select"
            filterable
            remote
            clearable
            reserve-keyword
            :remote-method="findUsers"
            :loading="userSearching"
            placeholder="请输入用户完整手机号搜索"
            no-data-text="没有找到匹配用户"
          >
            <el-option v-for="user in users" :key="user.public_id" :label="`${user.nickname || '未设置昵称'} · ${user.phone_masked}`" :value="user.public_id">
              <div class="user-option"><strong>{{ user.nickname || '未设置昵称' }}</strong><span>{{ user.phone_masked }}</span></div>
            </el-option>
          </el-select>
          <div class="field-hint">查询结果仅展示脱敏手机号，发放前请再次核对用户。</div>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="issueDialogVisible = false">取消</el-button><el-button type="primary" :loading="issuing" :disabled="!selectedUser || preview" @click="issue">确认发放</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.coupon-page{min-height:calc(100vh - 76px)}.page-heading{margin-bottom:14px}.heading-actions{display:flex;gap:8px}.coupon-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.panel-heading{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}.panel-heading h2{margin:0;font-size:16px}.panel-heading p{margin:5px 0 0;color:var(--muted);font-size:11px}.primary-cell{display:flex;min-width:0;flex-direction:column;gap:5px}.primary-cell strong{font-size:13px}.primary-cell span{overflow:hidden;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.money{color:#e56835}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.form-grid :deep(.el-input-number){width:calc(100% - 58px)}.unit{margin-left:8px;color:var(--muted);font-size:12px}.issue-summary{position:relative;margin-bottom:20px;padding:18px;border:1px solid #bdebed;border-radius:10px;background:linear-gradient(135deg,#effcfc,#f7ffff)}.issue-summary>div:first-child{display:flex;flex-direction:column;gap:6px}.issue-summary span{color:var(--muted);font-size:12px}.issue-summary strong{font-size:18px}.issue-summary p{margin:14px 0 0;color:#60717a;font-size:12px}.issue-amount{position:absolute;top:18px;right:18px;color:#e56835;font-size:24px;font-weight:800}.user-search-select{width:100%}.user-option{display:flex;align-items:center;justify-content:space-between;gap:24px}.user-option strong{font-size:13px}.user-option span{color:var(--muted);font-size:12px}.field-hint{margin-top:7px;color:var(--muted);font-size:11px}@media(max-width:900px){.form-grid{grid-template-columns:1fr}}
</style>
