<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { ReceivingWithdrawalSetting } from '../types'
import { formatDateTime } from '../utils/format'
import { accountLabels, emptyReceivingForm, feeLabels, normalizeReceivingForm, receivingFormError, receivingSummary } from '../utils/receivingSettings'

defineProps<{ canViewAudit: boolean }>()
defineEmits<{ openAudit: [] }>()
const saved = ref<ReceivingWithdrawalSetting | null>(null)
const form = reactive(emptyReceivingForm())
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const confirmVisible = ref(false)
const confirmed = ref(false)
const reason = ref('')
const sourceNames = { admin: '后台表单', environment: '服务器环境变量', unconfigured: '尚未配置' }
const primaryFees = ['fix_amt', 'fee_rate'] as const
const weekdayFees = ['weekday_fix_amt', 'weekday_fee_rate'] as const
const dirty = computed(() => Boolean(saved.value && JSON.stringify(normalizeReceivingForm(form)) !== JSON.stringify(saved.value.form)))
const summary = computed(() => receivingSummary(form))
const missingCount = computed(() => saved.value?.checks.filter((item) => !item.ok).length ?? 0)

async function confirmDiscard() {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('尚有未保存的费用修改，是否放弃？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return true
  } catch { return false }
}

async function load() {
  if (loading.value || saving.value || !(await confirmDiscard())) return
  loading.value = true
  loadError.value = ''
  try {
    saved.value = await adminApi.receivingWithdrawalSetting()
    Object.assign(form, saved.value.form)
    saveError.value = ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '配置加载失败，请重试'
  } finally { loading.value = false }
}

function prepareSave() {
  if (!saved.value || loading.value || loadError.value || saving.value) return
  const error = receivingFormError(form)
  if (error) { ElMessage.warning(error); return }
  confirmed.value = false
  reason.value = ''
  saveError.value = ''
  confirmVisible.value = true
}

async function save() {
  if (!saved.value || saving.value || !confirmed.value || !reason.value.trim()) return
  const error = receivingFormError(form)
  if (error) { saveError.value = error; return }
  saving.value = true
  saveError.value = ''
  try {
    saved.value = await adminApi.updateReceivingWithdrawalSetting({
      ...normalizeReceivingForm(form), revision: saved.value.revision,
      confirmed: true, reason: reason.value.trim(),
    })
    Object.assign(form, saved.value.form)
    confirmVisible.value = false
    ElMessage.success('配置已保存；未向汇付提交开户或修改已有账户')
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失败，请重试'
  } finally { saving.value = false }
}

// Admin pages are selected by App.vue, not rendered under a router-view.
const removeNavigationGuard = useRouter().beforeEach(async () => !saving.value && await confirmDiscard())
onBeforeUnmount(removeNavigationGuard)
onMounted(load)
</script>

<template>
  <div class="page receiving-settings" v-loading="loading">
    <header class="page-heading">
      <div><h1>收款与提现配置</h1><p>达人分账先入余额，由达人主动申请提现至本人银行卡</p></div>
      <div class="heading-actions">
        <el-button v-if="canViewAudit" @click="$emit('openAudit')">操作记录</el-button>
        <el-button :disabled="loading || saving" @click="load">重新加载</el-button>
        <el-button type="primary" :disabled="!saved || loading || !!loadError" :loading="saving" @click="prepareSave">保存配置</el-button>
      </div>
    </header>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false" />
    <template v-if="saved">
      <el-alert title="保存仅发布后续开户使用的提现规则，不会自动开户、绑卡、提现或修改已有汇付账户。" type="info" show-icon :closable="false" />
      <div class="settings-layout">
        <section class="settings-panel">
          <header class="panel-heading"><h2>提现规则</h2><el-tag effect="plain">来源：{{ sourceNames[saved.source] }}</el-tag></header>
          <p class="hint" v-if="saved.source === 'environment'">当前沿用服务器配置。首次保存后以本表单为准，不再读取旧提现 JSON。</p>
          <el-form label-position="top" :disabled="saving || loading || !!loadError" @submit.prevent="prepareSave">
            <el-form-item label="到账周期" required>
              <el-select v-model="form.cash_type" placeholder="请选择已与汇付确认的周期" aria-label="到账周期">
                <el-option label="T1 · 下一工作日到账" value="T1" />
                <el-option label="D1 · 下一自然日到账" value="D1" />
              </el-select>
              <p class="hint">到账时间以渠道处理结果为准，不代表提交后立即到账。</p>
            </el-form-item>

            <div class="section-heading"><h3>{{ form.cash_type === 'D1' ? '节假日提现费用' : '提现费用' }}</h3><span>至少填写一项</span></div>
            <div class="fee-grid">
              <el-form-item v-for="key in primaryFees" :key="key" :label="feeLabels[key]">
                <el-input v-model="form[key]" :aria-label="feeLabels[key]" inputmode="decimal" placeholder="按汇付确认值填写" clearable>
                  <template #append>{{ key.includes('rate') ? '%' : '元 / 笔' }}</template>
                </el-input>
              </el-form-item>
            </div>
            <p class="hint fee-hint">两项都填时相加收取。费率填写 0.05 表示 0.05%，不是 5%；免手续费请明确填 0，留空不等于免费。</p>

            <div v-if="form.cash_type === 'D1' || form.weekday_fix_amt !== null || form.weekday_fee_rate !== null" class="weekday-section">
              <div class="section-heading"><h3>D1 工作日费用</h3><span>选填</span></div>
              <div class="fee-grid">
                <el-form-item v-for="key in weekdayFees" :key="key" :label="feeLabels[key]">
                  <el-input v-model="form[key]" :aria-label="feeLabels[key]" inputmode="decimal" placeholder="留空沿用渠道节假日配置" clearable>
                    <template #append>{{ key.includes('rate') ? '%' : '元 / 笔' }}</template>
                  </el-input>
                </el-form-item>
              </div>
              <p class="hint">未填写时按渠道节假日费用配置计算。切换 T1 时，请清空工作日两项费用。</p>
            </div>

            <div class="section-heading"><h3>手续费承担</h3><el-tag type="success" effect="light">平台承担 · 外扣</el-tag></div>
            <p class="hint">使用服务器配置的平台商户，不从达人提现本金中扣费。</p>
            <el-form-item label="平台扣费账户类型" required>
              <el-select v-model="form.out_fee_acct_type" placeholder="请选择汇付已确认可扣费的账户" aria-label="平台扣费账户类型">
                <el-option v-for="(label, value) in accountLabels" :key="value" :label="`${label}（${value}）`" :value="value" />
              </el-select>
              <p class="hint">这是平台在汇付的账户类型，不是达人银行卡；请确保账户已开通且余额充足。</p>
            </el-form-item>
          </el-form>
          <footer class="panel-footer">
            <span>{{ saved.updated_at ? `最近保存 ${formatDateTime(saved.updated_at)} · ${saved.updated_by}` : '尚未在后台发布配置' }}</span>
            <el-tag v-if="dirty" type="warning" size="small">有未保存修改</el-tag>
          </footer>
        </section>

        <aside class="settings-panel status-panel">
          <header class="panel-heading"><h2>开户条件检查</h2><el-tag :type="saved.onboarding_ready ? 'success' : 'warning'">{{ saved.onboarding_ready ? '本地校验通过' : `${missingCount} 项待处理` }}</el-tag></header>
          <p class="hint">商户号、上级号、回调地址、密钥和开户开关仍由服务器管理；此处不显示密钥内容。</p>
          <ul class="check-list">
            <li v-for="item in saved.checks" :key="item.key">
              <div><strong>{{ item.label }}</strong><small v-if="!item.ok">{{ item.message }}</small></div>
              <el-tag size="small" :type="item.ok ? 'success' : 'warning'" effect="light">{{ item.ok ? '已满足' : '待处理' }}</el-tag>
            </li>
          </ul>
          <p class="hint">仅检查已保存配置，不发起网络请求；通过不代表汇付已批准开户或已验证通知可达。</p>
          <div class="withdrawal-status"><strong>实际提现开关</strong><el-tag :type="saved.withdrawal_enabled ? 'success' : 'info'">{{ saved.withdrawal_enabled ? '已开启' : '未开启' }}</el-tag></div>
          <p class="hint">提现开关与开户独立，白名单、限额、账户及余额核验仍按现有流程执行；保存本表单不会开启提现。</p>
        </aside>
      </div>
    </template>

    <el-dialog v-model="confirmVisible" title="确认发布提现规则" width="560px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
      <el-alert title="仅用于后续新建的开户配置请求；已有申请保留原快照，已开通账户不会同步更改。" type="warning" show-icon :closable="false" />
      <dl class="confirm-summary"><div v-for="item in summary" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
      <el-form label-position="top" :disabled="saving">
        <el-form-item label="变更说明（记录到操作审计）" required><el-input v-model="reason" aria-label="变更说明" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="填写本次配置的原因或费率确认依据" /></el-form-item>
        <el-checkbox v-model="confirmed">已与汇付核实费用及平台扣费账户，理解本次生效范围</el-checkbox>
      </el-form>
      <el-alert v-if="saveError" class="save-error" :title="saveError" type="error" show-icon :closable="false" />
      <template #footer><el-button :disabled="saving" @click="confirmVisible = false">返回修改</el-button><el-button type="primary" :loading="saving" :disabled="!confirmed || !reason.trim()" @click="save">确认保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.receiving-settings { display: flex; flex-direction: column; gap: 18px; }
.page-heading { margin-bottom: 0; gap: 16px; flex-wrap: wrap; }
.heading-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.heading-actions .el-button + .el-button { margin-left: 0; }
.settings-layout { display: grid; grid-template-columns: minmax(380px, 1.2fr) minmax(320px, 1fr); gap: 20px; align-items: start; }
.settings-panel { min-width: 0; padding: 24px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.panel-heading, .section-heading, .panel-footer, .withdrawal-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.panel-heading { margin-bottom: 16px; flex-wrap: wrap; }
.panel-heading h2 { margin: 0; font-size: 17px; }
.section-heading { margin: 24px 0 16px; }
.section-heading h3 { margin: 0; font-size: 14px; }
.section-heading span, .panel-footer { font-size: 12px; color: var(--muted); }
.hint { margin: 8px 0 16px; color: var(--muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.el-form-item .hint { margin-bottom: 0; }
.fee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fee-grid .el-form-item { min-width: 0; margin-bottom: 8px; }
.fee-hint { margin-top: 0; }
.weekday-section { padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.panel-footer { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.check-list { padding: 0; margin: 0; list-style: none; }
.check-list li { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.check-list strong, .withdrawal-status strong { font-size: 13px; font-weight: 500; }
.check-list small { display: block; margin-top: 6px; font-size: 12px; color: #9a5a0c; line-height: 1.6; overflow-wrap: anywhere; }
.check-list .el-tag { flex-shrink: 0; }
.withdrawal-status { margin-top: 20px; }
.confirm-summary { margin: 20px 0; }
.confirm-summary div { display: flex; justify-content: space-between; gap: 18px; padding: 9px 0; font-size: 13px; border-bottom: 1px solid var(--line); }
.confirm-summary dt { color: var(--muted); }
.confirm-summary dd { margin: 0; text-align: right; }
.save-error { margin-top: 16px; }
:deep(.el-checkbox) { white-space: normal; height: auto; align-items: flex-start; }
:deep(.el-checkbox__label) { white-space: normal; line-height: 1.5; }
@media (max-width: 1120px) { .settings-layout { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .fee-grid { grid-template-columns: 1fr; gap: 8px; } .settings-panel { padding: 18px; } }
</style>
