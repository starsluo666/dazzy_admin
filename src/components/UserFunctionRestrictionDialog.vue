<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminUser, UserRestrictedFunction } from '../types'

const props = defineProps<{ modelValue: boolean; user: AdminUser | null; canManage: boolean; preview: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; updated: [user: AdminUser] }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const action = ref<'restrict' | 'restore'>('restrict')
const selected = ref<UserRestrictedFunction[]>([])
const reason = ref('')
const saving = ref(false)
const target = ref<AdminUser | null>(null)
const options: { value: UserRestrictedFunction; label: string; description: string }[] = [
  { value: 'provider_order', label: '达人下单', description: '限制创建新的达人服务订单' },
  { value: 'activity_publish', label: '发布活动', description: '限制创建活动和发起发布支付' },
  { value: 'review', label: '评价／评论', description: '限制提交订单评价' },
]
const current = computed(() => target.value?.function_restrictions || [])
const isRestricted = (value: UserRestrictedFunction) => current.value.some(item => item.function === value)
const disabled = (value: UserRestrictedFunction) => action.value === 'restrict' ? isRestricted(value) : !isRestricted(value)
watch(action, () => { selected.value = [] })
watch(() => props.modelValue, value => {
  if (!value) return
  target.value = props.user
  action.value = 'restrict'
  selected.value = []
  reason.value = ''
})

async function submit() {
  if (!target.value || !props.canManage || saving.value) return
  if (!selected.value.length) { ElMessage.warning('请选择要操作的功能'); return }
  if (reason.value.trim().length < 2) { ElMessage.warning('请填写明确的操作原因'); return }
  saving.value = true
  const user = target.value
  const functions = [...selected.value]
  const operation = action.value
  const operationReason = reason.value.trim()
  try {
    let updated: AdminUser
    if (props.preview) {
      const remaining = (user.function_restrictions || []).filter(item => !functions.includes(item.function))
      updated = { ...user, function_restrictions: operation === 'restore' ? remaining : [
        ...remaining, ...functions.map(value => ({ function: value,
          function_label: options.find(item => item.value === value)!.label,
          reason: operationReason, restricted_at: new Date().toISOString(), restricted_by_name: '运营管理员',
        })),
      ] }
    } else {
      updated = await adminApi.changeUserFunctions(user.public_id, operation, functions, operationReason)
    }
    emit('updated', updated)
    visible.value = false
    ElMessage.success(operation === 'restrict' ? '功能限制已生效' : '所选功能限制已解除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败，请重试')
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog v-model="visible" title="管理功能限制" width="520px" append-to-body :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <p class="restriction-intro">功能限制不影响登录、浏览和已有订单的履约、售后；限制持续生效，直至手动解除。</p>
    <el-alert v-if="target?.account_status === 'restricted'" type="warning" :closable="false" title="此用户仍有旧版账号限制，恢复账号后才可登录，功能限制会继续保留。" />
    <el-alert v-else-if="target?.account_status === 'suspended'" type="warning" :closable="false" title="此用户当前已封禁。恢复账号后，功能限制会继续保留。" />
    <el-form label-position="top" :disabled="saving" class="restriction-form">
      <el-form-item label="操作方式"><el-radio-group v-model="action"><el-radio-button value="restrict">添加限制</el-radio-button><el-radio-button value="restore">解除限制</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="功能（可多选）">
        <el-checkbox-group v-model="selected" class="restriction-options">
          <el-checkbox v-for="option in options" :key="option.value" :value="option.value" :disabled="disabled(option.value)">
            <span>{{ option.label }}{{ isRestricted(option.value) ? '（已限制）' : '' }}</span><small>{{ option.description }}</small>
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="操作原因"><el-input v-model="reason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="请填写限制依据或解除原因" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!canManage" @click="submit">确认提交</el-button></template>
  </el-dialog>
</template>

<style scoped>
.restriction-intro{margin:0 0 16px;color:var(--muted);line-height:1.7;font-size:13px}
.restriction-form{margin-top:18px}.restriction-options{display:flex;flex-direction:column;gap:10px;width:100%}
.restriction-options .el-checkbox{height:auto;margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:6px}
.restriction-options small{display:block;margin-top:4px;color:var(--muted);font-size:12px;white-space:normal}
</style>
