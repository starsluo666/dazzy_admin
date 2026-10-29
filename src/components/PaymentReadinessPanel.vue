<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDateTime, formatMoney } from '../utils/format'
import type { PaymentReadiness } from '../utils/financeRecovery'

const props = defineProps<{ report: PaymentReadiness | null; loading: boolean; preview: boolean }>()
defineEmits<{ openJobs: [] }>()
const expanded = ref<string[]>([])
const labels = { configured: '本地配置齐全', incomplete: '待补配置', disabled: '未启用' }
const summary = computed(() => ({
  configured: props.report?.groups.filter(group => group.state === 'configured').length || 0,
  incomplete: props.report?.groups.filter(group => group.state === 'incomplete').length || 0,
  disabled: props.report?.groups.filter(group => group.state === 'disabled').length || 0,
  jobAlerts: props.report?.jobs.filter(job => job.alert).length || 0,
}))
watch(() => props.report, report => {
  expanded.value = report?.groups.filter(group => group.state === 'incomplete').map(group => group.key) || []
})
</script>

<template>
  <div v-loading="loading" class="readiness-panel">
    <template v-if="report">
      <div class="report-heading">
        <div><h2>资金上线检查</h2><p>检测时间：{{ formatDateTime(report.checked_at) }} · {{ report.environment }}</p></div>
        <el-tag type="info">只读检查</el-tag>
      </div>
      <el-alert type="info" :closable="false" show-icon title="配置齐全表示已通过本地检查。渠道权限、实际手续费和资金到账仍需核实。" />
      <p class="scope-note">配置来自当前 API 服务；任务状态来自实际运行记录。刷新页面仅更新检查结果。</p>
      <div class="readiness-summary" aria-label="资金配置检查汇总">
        <article><span>本地配置齐全</span><strong>{{ summary.configured }}<small> / {{ report.groups.length }}</small></strong></article>
        <article><span>待补配置</span><strong :class="{ attention: summary.incomplete }">{{ summary.incomplete }}</strong></article>
        <article><span>未启用</span><strong>{{ summary.disabled }}</strong></article>
        <article><span>异常任务</span><strong :class="{ attention: summary.jobAlerts }">{{ summary.jobAlerts }}</strong></article>
      </div>
      <el-collapse v-model="expanded" class="configuration-groups">
        <el-collapse-item v-for="group in report.groups" :key="group.key" :name="group.key">
          <template #title>
            <div class="group-heading">
              <strong>{{ group.label }}</strong>
              <span class="group-status">
                <span v-if="group.limit_cents != null" class="limit">单笔上限 {{ formatMoney(group.limit_cents) }}</span>
                <el-tag :type="group.state === 'incomplete' ? 'warning' : group.state === 'disabled' ? 'info' : 'success'">{{ labels[group.state] }}</el-tag>
              </span>
            </div>
          </template>
          <div class="switch-line">功能开关：{{ group.enabled ? '已启用' : '未启用' }}<code>{{ group.switch }}</code></div>
          <ul class="configuration-checks">
            <li v-for="check in group.checks" :key="check.key">
              <div class="check-copy"><strong>{{ check.label }}</strong><code v-if="check.key.startsWith('HUIFU_')">{{ check.key }}</code><p v-if="!check.ok">{{ check.help }}</p></div>
              <el-tag size="small" :type="check.ok ? 'success' : 'warning'">{{ check.ok ? '通过' : '待核对' }}</el-tag>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>
      <div class="task-overview">
        <div><h3>任务运行情况</h3><p>{{ summary.jobAlerts ? `有 ${summary.jobAlerts} 项任务需要检查，请查看任务巡检。` : '当前未报告异常任务；未启用和等待首次运行的任务不计入异常数。' }}</p></div>
        <el-button @click="$emit('openJobs')">查看任务巡检</el-button>
      </div>
      <div class="manual-checks">
        <h3>上线前需人工验收</h3><p class="scope-note">以下项目需结合汇付确认、真实交易和银行凭证验收，本页不记录验收结论。</p>
        <ul><li v-for="check in report.manual_checks" :key="check.key"><strong>{{ check.label }}</strong><p>{{ check.description }}</p></li></ul>
      </div>
    </template>
    <el-empty v-else :description="preview ? '登录全平台财务账号后查看实际检查结果' : loading ? '正在检查本地配置' : '未加载检查结果，请刷新重试'" />
  </div>
</template>

<style scoped>
.readiness-panel { margin-top: 4px; }
.report-heading, .group-heading, .group-status, .task-overview { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.report-heading { margin-bottom: 16px; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 0; font-size: 15px; }
.report-heading p, .scope-note, .task-overview p, .manual-checks p { margin: 8px 0 0; color: #728095; font-size: 13px; line-height: 1.7; }
.readiness-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
.readiness-summary article { padding: 16px; border: 1px solid #e3e9ed; border-radius: 8px; }
.readiness-summary span { display: block; color: #728095; font-size: 13px; }
.readiness-summary strong { display: block; margin-top: 8px; color: #172033; font-size: 25px; }
.readiness-summary small { color: #728095; font-size: 13px; font-weight: 400; }
.readiness-summary .attention { color: #b46c1c; }
.group-heading { flex: 1; padding: 8px 16px 8px 0; line-height: 1.6; }
.group-heading strong { font-size: 14px; }
.group-status { flex-shrink: 0; gap: 10px; }
.limit { color: #728095; font-size: 12px; }
.switch-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 12px 0; }
code { color: #728095; font-size: 11px; overflow-wrap: anywhere; }
.configuration-checks, .manual-checks ul { margin: 0; padding: 0; list-style: none; }
.configuration-checks li { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #f0f2f5; }
.check-copy { min-width: 0; }
.check-copy strong { font-size: 13px; }
.check-copy code { display: block; margin-top: 4px; }
.check-copy p { margin: 5px 0 0; color: #9b6727; font-size: 12px; line-height: 1.6; }
.task-overview { margin-top: 22px; padding: 18px; border: 1px solid #e3e9ed; border-radius: 8px; }
.manual-checks { margin-top: 24px; }
.manual-checks li { margin-top: 14px; padding: 14px 16px; border-left: 3px solid #d9e4ea; background: #f8fafb; }
.manual-checks li strong { font-size: 13px; }
@media (max-width: 900px) {
  .readiness-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .group-heading, .task-overview { align-items: flex-start; flex-direction: column; gap: 8px; }
  .group-status { flex-wrap: wrap; }
  .configuration-groups :deep(.el-collapse-item__header) { height: auto; min-height: 48px; }
}
</style>
